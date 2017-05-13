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
    const onResolve = value => this._force(RESOLVED, value);
    const onReject = error => this._force(REJECTED, error);
    const onCancel = reason => this._force(CANCELLED, reason);

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
  subscribe(onSuccess = noop, onError = noop, onCancel = noop) {
    assertFunc(onSuccess);
    assertFunc(onError);
    assertFunc(onCancel);

    if (this._status === PENDING) {
      const sub = {
        onSuccess,
        onError,
        onCancel
      };
      this._joiners.add(sub);
      return () => {
        this._joiners && this._joiners.delete(sub);
      };
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
    return new Future((resolve, reject, cancel) =>
      this.subscribe(resolve, reject, cancel)
    );
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

  then(onResolve, onReject, onCancel) {
    onResolve && assertFunc(onResolve);
    onReject && assertFunc(onReject);
    onCancel && assertFunc(onCancel);

    return new Future((resolve, reject, cancel) => {
      let unsubscribe1, unsubscribe2;

      const handler = k => v => {
        let fut = k(v);
        if (fut instanceof Future)
          unsubscribe2 = fut.subscribe(resolve, reject, cancel);
        else resolve(fut);
      };

      unsubscribe1 = this.subscribe(
        onResolve ? handler(onResolve) : resolve,
        onReject ? handler(onReject) : reject,
        onCancel ? handler(onCancel) : cancel
      );

      function dispose() {
        unsubscribe1 && unsubscribe1();
        unsubscribe2 && unsubscribe2();
      }
      return dispose;
    });
  }

  orElse(f2) {
    assertFut(f2);

    const f1 = this;

    if (f1._status === RESOLVED || f1._status === REJECTED) return f1;
    if (f1._status === CANCELLED || f2._status !== PENDING) return f2;

    return new Future((resolve, reject, cancel) => {
      function onResolve(v) {
        dispose();
        resolve(v);
      }

      function onReject(e) {
        dispose();
        reject(e);
      }

      function onCancel(r) {
        if (f1._status === CANCELLED && f2._status === CANCELLED) {
          cancel(r);
          dispose();
        }
      }

      let unsubscribe1 = f1.subscribe(onResolve, onReject, onCancel);
      let unsubscribe2 = f2.subscribe(onResolve, onReject, onCancel);

      function dispose() {
        unsubscribe1 && unsubscribe1();
        unsubscribe2 && unsubscribe2();
      }

      return dispose;
    });
  }

  get status() {
    return this._status;
  }

  get value() {
    return this._value;
  }

  /**
   * Creates a Future that is resolved with the provided value
   *
   * @param {*} value
   *
   * @returns Future
   */
  static of(value) {
    return new Future(resolve => resolve(value));
  }

  /** Same as {@link Future.of} */
  static resolve(a) {
    return Future.of(a);
  }

  /**
   * Creates a Future that is rejected with the provided error
   *
   * @param {*} error
   *
   * @returns Future
   */
  static reject(error) {
    return new Future((_, reject) => reject(error));
  }

  /**
   * Creates a Future that is cancelled with the provided reason
   *
   * @param {*} reason
   *
   * @returns Future
   */
  static cancel(reason) {
    return new Future((_, __, cancel) => cancel(reason));
  }

  /** Creates a Future that never completes */
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
    if (f1._status === REJECTED || f1._status === CANCELLED) {
      return f1;
    }
    if (f2._status === REJECTED || f2._status === CANCELLED) {
      return f2;
    }

    return new Future((resolve, reject, cancel) => {
      function onResolve() {
        if (f1._status === RESOLVED && f2._status === RESOLVED) {
          resolve(f(f1._value, f2._value));
        }
      }

      function onReject(e) {
        reject(e);
        dispose();
      }

      function onCancel(r) {
        cancel(r);
        dispose();
      }

      function dispose() {
        unsubscribe1 && unsubscribe1();
        unsubscribe2 && unsubscribe2();
      }

      let unsubscribe1 = f1.subscribe(onResolve, onReject, onCancel);
      let unsubscribe2 = f2.subscribe(onResolve, onReject, onCancel);

      return dispose;
    });
  }

  static all(futures) {
    futures.forEach(assertFut);
    return futures.reduce(appendF, Future.resolve([]));
  }

  static race2(f1, f2) {
    assertFut(f1);
    assertFut(f2);

    return f1.orElse(f2);
  }

  static race(futures) {
    assert(futures && futures.length, "argument must be a non empty array");
    futures.forEach(assertFut);
    return futures.reduce(Future.race2);
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

  _notify(onResolve, onReject, onCancel) {
    const status = this._status;
    const value = this._value;

    if (status === RESOLVED) {
      onResolve(value);
    } else if (status === REJECTED) {
      onReject(value);
    } else if (status === CANCELLED) {
      onCancel(value);
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
const ZERO = new Future(() => {});

module.exports = Future;
