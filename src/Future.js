const { assert, assertFunc, noop, append } = require("./utils");
const {
  Status: { PENDING, RESOLVED, REJECTED, CANCELLED }
} = require("./constants");

function fxor(fut) {
  let ok;
  return function once(f, msg) {
    return function invokeOnce(a) {
      if (!ok) {
        ok = true;
        return f(a);
      }
      if (msg) {
        throw new TypeError(
          msg + ". Status: " + fut._status + ", value :" + fut._value
        );
      }
    };
  };
}

const assertFut = arg =>
  assert(arg instanceof Future, "argument is not a Future");

/** @class */
class Future {
  /**
   * Creates a Future that will get its outcome using the provided
   * {@link executor} function.
   *
   * Future's executors are invoked synchrously (immediately).
   *
   * @param {executor} executor
   *
   * @returns Future
   */
  constructor(executor) {
    assertFunc(executor);

    this._joiners = new Set();
    this._status = PENDING;

    const once = fxor(this);
    const onResolve = v => this._force(RESOLVED, v);
    const onReject = e => this._force(REJECTED, e);
    const onCancel = r => this.cancel(r);

    this._dispose = executor(once(onResolve), once(onReject), once(onCancel));
  }

  /**
   * Attach callbacks to be invoked once the Future is resolved/rejected/cancelled.
   *
   * Returns a function that can be used to cancel the subscription.
   *
   * @param {Function} [onSuccess] - callback invoked if the Future has succeded
   * @param {Function} [onError] - callback invoked if the Future has aborted. If
   * @param {Function} [onCancel] - callback invoked if the Future was cancelled
   *
   * @returns {Function} a function that can be used to cancel the subscription.
  */
  subscribe(onSuccess, onError = noop, onCancel = noop) {
    assertFunc(onSuccess);
    assertFunc(onError);
    assertFunc(onCancel);

    if (this._status === PENDING) {
      const j = {
        onSuccess,
        onError,
        onCancel
      };
      this._joiners.add(j);
      return () => this._joiners.delete(j);
    } else {
      this._notify(onSuccess, onError, onCancel);
      return noop;
    }
  }

  /**
   * Returns a new Future that will complete with the same outcome as the input
   * Future.
   *
   * Cancelling this Future will not cancel the original Future.
   */
  fork() {
    return new Future((k, ke, kc) => this.subscribe(k, ke, kc));
  }

  /**
   * Cancels the Future with provided reason. Cancellation *forces* the outcome
   * of this Future into a Cancelled state.
   *
   * Cancellation will be notified to all subscribers that have provided an
   * `onCancel` callback.
   *
   * @param {*} reason
   */
  cancel(reason) {
    if (this._status !== PENDING) return;
    this._dispose && this._dispose(reason);
    this._force(CANCELLED, reason);
  }

  then(f, fe, fc) {
    f && assertFunc(f);
    fe && assertFunc(fe);
    fc && assertFunc(fc);

    return new Future((res, rej, can) => {
      let curF = this;
      const handler = k => v => {
        curF = k(v);
        if (curF instanceof Future) curF.subscribe(res, rej, can);
        else res(curF);
      };

      this.subscribe(
        f ? handler(f) : res,
        fe ? handler(fe) : rej,
        fc ? handler(fc) : can
      );

      function dispose(reason) {
        curF.cancel(reason);
      }
      return dispose;
    });
  }

  orElse(f2) {
    assertFut(f2);

    if (this._status === CANCELLED) return f2;
    if (f2._status === CANCELLED) return this;

    return new Future((res, rej, can) => {
      const handler = (fut, k) => x => {
        fut.cancel("orElse");
        k(x);
      };

      const cancelHandler = fut => r => {
        if (fut.status === CANCELLED) can(r);
      };

      this.subscribe(handler(f2, res), handler(f2, rej), cancelHandler(f2));
      f2.subscribe(handler(this, res), handler(this, rej), cancelHandler(this));

      return reason => {
        this.cancel(reason);
        f2.cancel(reason);
      };
    });
  }

  get status() {
    return this._status;
  }

  get value() {
    return this._value;
  }

  static of(a) {
    return new Future(resolve => resolve(a));
  }

  static resolve(a) {
    return Future.of(a);
  }

  static reject(a) {
    return new Future((_, reject) => reject(a));
  }

  static cancel(a) {
    return new Future((_, __, cancel) => cancel(a));
  }

  static empty() {
    return ZERO;
  }

  static zipw(f, f1, f2) {
    assertFunc(f);
    assertFut(f1);
    assertFut(f2);

    if (f1._status === RESOLVED && f2._status === RESOLVED) {
      return Future.resolve(f(f1._value, f2._value));
    }

    return new Future((res, rej, can) => {
      function tryResolve() {
        if (f1._status === RESOLVED && f2._status === RESOLVED) {
          res(f(f1._value, f2._value));
        }
      }

      const abort = fut => e => {
        rej(e);
        if (fut._status === PENDING) {
          fut.cancel("zipw");
        }
      };

      function dispose(reason) {
        can(reason);
        f1.cancel(reason);
        f2.cancel(reason);
      }

      f1.subscribe(tryResolve, abort(f2), dispose);
      f2.subscribe(tryResolve, abort(f1), dispose);

      return dispose;
    });
  }

  static all(fs) {
    fs.forEach(assertFut);
    return fs.reduce(appendF, Future.resolve([]));
  }

  static race2(f1, f2) {
    assertFut(f1);
    assertFut(f2);

    return f1.orElse(f2);
  }

  static race(fs) {
    fs.forEach(assertFut);
    return fs.reduce(Future.race2, Future.empty());
  }

  static lift2(f) {
    return (f1, f2) => Future.zipw(f, f1, f2);
  }

  static defer() {
    let resolve, reject, cancel;
    const future = new Future((res, rej, can) => {
      resolve = res;
      reject = rej;
      cancel = can;
    });
    return {
      future,
      resolve,
      reject,
      cancel
    };
  }

  _notify(k, ke, kc) {
    const status = this._status;
    const value = this._value;

    if (status === RESOLVED) {
      k(value);
    } else if (status === REJECTED) {
      ke(value);
    } else if (status === CANCELLED) {
      kc(value);
    }
  }

  _force(status, value) {
    if (this._status !== PENDING) return;
    this._status = status;
    this._value = value;
    const joiners = this._joiners;
    this._joiners = null;
    joiners.forEach(({ onSuccess, onError, onCancel }) =>
      this._notify(onSuccess, onError, onCancel)
    );
  }

  _complete(v) {
    this._force(RESOLVED, v);
  }

  _abort(e) {
    this._force(REJECTED, e);
  }
}

const appendF = Future.lift2(append);
const ZERO = Future.cancel("ZERO");

module.exports = Future;
