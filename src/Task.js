const Future = require("./Future");
const { assert, assertFunc, append, noop, raise } = require("./utils");

const assertTask = arg => assert(arg instanceof Task, "argument is not a Task");

class Task {
  static resolve(value) {
    return Task.from(k => k(value));
  }

  static reject(err) {
    return Task.from((_, ke) => ke(err));
  }

  static cancel(reason) {
    return Task.from((_, __, kc) => kc(reason));
  }

  static from(cps) {
    assertFunc(cps);

    return new Task(() => new Future(cps));
  }

  constructor(fork) {
    this.fork = fork;
  }

  run(onSuccess = noop, onError = raise, onCancel = noop) {
    assertFunc(onSuccess);
    assertFunc(onError);
    assertFunc(onCancel);

    const fut = this.fork();
    fut.subscribe(onSuccess, onError, onCancel);
    return fut;
  }

  static empty() {
    return EMPTY_TASK;
  }

  orElse(c2) {
    assertTask(c2);

    if (this === EMPTY_TASK) return c2;
    if (c2 === EMPTY_TASK) return this;

    return new Task(() => {
      const f1 = this.fork();
      if (f1.status !== Future.PENDING) return f1;
      return f1.orElse(c2.fork());
    });
  }

  static of(a) {
    return Task.from(k => k(a));
  }

  static zipw(f, c1, c2) {
    assertFunc(f);
    assertTask(c1);
    assertTask(c2);

    if (c1 === EMPTY_TASK || c2 === EMPTY_TASK) return EMPTY_TASK;

    return new Task(() => {
      const f1 = c1.fork();
      if (f1.status === Future.CANCELLED || f1.status === Future.REJECTED)
        return f1;
      return Future.zipw(f, f1, c2.fork());
    });
  }

  then(f, fe, fc) {
    f && assertFunc(f);
    fe && assertFunc(fe);
    fc && assertFunc(fc);

    const handler = k => v => {
      const result = k(v);
      if (result instanceof Task) return result.fork();
      else return result;
    };

    if (f) f = handler(f);
    if (fe) fe = handler(fe);
    if (fc) fc = handler(fc);
    if (this === EMPTY_TASK) return EMPTY_TASK;
    return new Task(() => this.fork().then(f, fe, fc));
  }

  static lift2(f) {
    assertFunc(f);

    return (c1, c2) => Task.zipw(f, c1, c2);
  }

  static lift(f) {
    assertFunc(f);

    return (...cs) => Task.apply(f, cs);
  }

  static race2(c1, c2) {
    assertTask(c1);
    assertTask(c2);

    return c1.orElse(c2);
  }

  static race(cs) {
    cs.forEach(assertTask);

    return cs.reduce(Task.race2, EMPTY_TASK);
  }

  static all(cs) {
    cs.forEach(assertTask);

    return cs.reduce(appendT, Task.of([]));
  }

  static traverse(f, cs) {
    assertFunc(f);

    return Task.all(cs.map(f));
  }

  static detect(p, cs) {
    assertFunc(p);

    return Task.race(
      cs.map(c => c.then(v => p(v).then(b => (b ? Task.of(v) : EMPTY_TASK))))
    );
  }

  static apply(f, cs, ctx) {
    assertFunc(f);

    return Task.all(cs).map(as => f.apply(ctx, as));
  }

  log(prefix) {
    /* eslint-disable no-console */
    return this.run(
      v => console.log(prefix, ": resolved with ", v),
      e => console.error(prefix, ": rejected with ", e),
      r => console.log(prefix, ": cancelled with ", r)
    );
  }

  static do(gf) {
    return new Task(() => {
      const g = gf();
      return next();

      function next(a, isErr) {
        try {
          const { value, done } = isErr ? g.throw(a) : g.next(a);
          if (done) {
            return Future.of(value);
          }
          return value.fork().then(
            v => {
              //console.log('next', a)
              return next(v);
            },
            e => {
              //console.log('next err', a)
              return next(e, true);
            },
            r => {
              g.return(r);
              return Future.cancel(r);
            }
          );
        } catch (e) {
          return Future.reject(e);
        }
      }
    });
  }
}

const appendT = Task.lift2(append);
const EMPTY_TASK = new Task(Future.empty);

module.exports = Task;
