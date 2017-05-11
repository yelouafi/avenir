const test = require("tape");
const Future = require("../src/Future");
const Task = require("../src/Task");
const { noop, logger, append } = require("../src/utils");

test("Task.resolve", assert => {
  const f = Task.resolve("val").fork();

  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val");
  assert.end();
});

test("Task.reject", assert => {
  const f = Task.reject("err").fork();

  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.end();
});

test("Task.cancel", assert => {
  const f = Task.cancel("reason").fork();

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.end();
});

test("Task.orElse", assert => {
  let t1, t2, f, d1, d2;

  t1 = Task.empty();
  t2 = Task.resolve(1);
  f = t1.orElse(t2).fork();
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, 1);

  t1 = Task.reject("err");
  t2 = Task.resolve(1);
  f = t1.orElse(t2).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  t1 = Task.cancel("reason");
  t2 = Task.reject("err");
  f = t1.orElse(t2).fork();
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  t1 = Task.from(noop);
  t2 = Task.reject("err");
  f = t1.orElse(t2).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  t1 = new Task(() => {
    d1 = Future.defer();
    return d1.future;
  });
  t2 = new Task(() => {
    d2 = Future.defer();
    return d2.future;
  });

  f = t1.orElse(t2).fork();
  assert.equal(f.status, Future.PENDING);
  d1.resolve(1);
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, 1);
  assert.equal(d2.future.status, Future.CANCELLED);

  d1 = null;
  d2 = null;
  f = t1.orElse(t2).fork();
  d1.reject("err1");
  d2.resolve("val2");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err1");
  assert.equal(d2.future.status, Future.CANCELLED);

  d1 = null;
  d2 = null;
  f = t1.orElse(t2).fork();
  d2.resolve("val2");
  d1.reject("err1");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val2");
  assert.equal(d1.future.status, Future.CANCELLED);

  d1 = null;
  d2 = null;
  f = t1.orElse(t2).fork();
  d1.cancel("reason1");
  d2.cancel("reason2");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason2");

  d1 = null;
  d2 = null;
  f = Task.resolve("val1").orElse(t2).fork();
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val1");
  assert.equal(d1, null, "should not start 2nd Task if 1st already completed");

  assert.end();
});

test("Task.zipw", assert => {
  let fn = (v1, v2) => v1 + "-" + v2;
  let t1, t2, f, d1, d2;

  let te = Task.empty();
  let tres = Task.resolve("val");
  let trej = Task.reject("err");
  let tcan = Task.cancel("reason");

  assert.equal(Task.zipw(fn, te, tres), Task.empty());
  assert.equal(Task.zipw(fn, trej, te), Task.empty());

  f = Task.zipw(fn, tres, trej).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Task.zipw(fn, trej, tres).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Task.zipw(fn, Task.reject("err1"), trej).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err1");

  f = Task.zipw(fn, tcan, tres).fork();
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  f = Task.zipw(fn, trej, tcan).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Task.zipw(fn, tres, Task.resolve("val2")).fork();
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val-val2");

  t1 = new Task(() => {
    d1 = Future.defer();
    return d1.future;
  });
  t2 = new Task(() => {
    d2 = Future.defer();
    return d2.future;
  });

  f = Task.zipw(fn, t1, t2).fork();
  assert.equal(f.status, Future.PENDING);
  d1.resolve("val1");
  assert.equal(f.status, Future.PENDING);
  d2.resolve("val2");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val1-val2");

  d1 = null;
  d2 = null;
  f = Task.zipw(fn, t1, t2).fork();
  d1.reject("err1");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err1");
  assert.equal(d2.future.status, Future.CANCELLED);

  d1 = null;
  d2 = null;
  f = Task.zipw(fn, t1, t2).fork();
  d2.reject("err1");
  d1.reject("err2");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err1");
  assert.equal(d1.future.status, Future.CANCELLED);

  d1 = null;
  d2 = null;
  f = Task.zipw(fn, trej, t2).fork();
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.equal(d2, null);

  assert.end();
});
