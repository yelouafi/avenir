const { assert, assertFunc, noop, append } = require("./utils");
const { E_FUN_ARG } = require("./constants");

const fxor = fut => {
  let ok;
  return (f, msg) => {
    return a => {
      if (!ok) {
        ok = true;
        return f(a);
      }
      if (msg) {
        throw new TypeError(msg + " " + fut._status + " " + fut._value);
      }
    };
  };
};

const assertFut = arg =>
  assert(arg instanceof Future, "argument is not a Future");

const PENDING = "PENDING";
const RESOLVED = "RESOLVED";
const REJECTED = "REJECTED";
const CANCELLED = "CANCELLED";

class Future {
  static resolve(a) {
    return new Future(resolve => resolve(a));
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

  log(msg) {
    this._log = this._log || [];
    this._log.push(msg);
  }

  getLog() {
    return this._name + ": " + this._log.join("; ");
  }

  constructor(executor) {
    assertFunc(executor);

    this._joiners = new Set();
    this._status = PENDING;

    const once = fxor(this);

    this._dispose = executor(
      once(v => this._force(RESOLVED, v)),
      once(e => this._force(REJECTED, e)),
      once(r => this.cancel(r))
    );
  }

  get status() {
    return this._status;
  }

  get value() {
    return this._value;
  }

  subscribe(k, ke = noop, kc = noop) {
    assertFunc(k);
    assertFunc(ke);
    assertFunc(kc);

    if (this._status === PENDING) {
      const j = {
        k,
        ke,
        kc
      };
      this._joiners.add(j);
      return () => this._joiners.delete(j);
    } else {
      this._notify(k, ke, kc);
      return noop;
    }
  }

  fork() {
    return new Future((k, ke, kc) => this.subscribe(k, ke, kc));
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
    joiners.forEach(({ k, ke, kc }) => this._notify(k, ke, kc));
  }

  _complete(v) {
    this._force(RESOLVED, v);
  }

  _abort(e) {
    this._force(REJECTED, e);
  }

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

  static zipw(f, f1, f2) {
    assertFunc(f);
    assertFut(f1);
    assertFut(f2);

    if (f1._status === RESOLVED && f2._status === RESOLVED) {
      return Future.resolve(f(f1._value, f2._value));
    }

    return new Future((res, rej, can) => {
      function tryResolve(v) {
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

  static lift2(f) {
    return (f1, f2) => Future.zipw(f, f1, f2);
  }

  static race2(f1, f2) {
    assertFut(f1);
    assertFut(f2);

    return f1.orElse(f2);
  }

  static all(fs) {
    fs.forEach(assertFut);
    return fs.reduce(appendF, Future.resolve([]));
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

  static race(fs) {
    fs.forEach(assertFut);
    return fs.reduce(Future.race2, Future.empty());
  }
}

Future.of = Future.resolve;

Future.PENDING = PENDING;
Future.RESOLVED = RESOLVED;
Future.REJECTED = REJECTED;
Future.CANCELLED = CANCELLED;

const appendF = Future.lift2(append);
const ZERO = Future.cancel("ZERO");

module.exports = Future;
