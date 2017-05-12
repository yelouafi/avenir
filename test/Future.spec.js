const test = require("tape");
const Future = require("../src/Future");
const { logger } = require("../src/utils");

logger.disable();

test("Future.resolve", assert => {
  const f = Future.resolve("val");

  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val");
  assert.end();
});

test("Future.reject", assert => {
  const f = Future.reject("err");

  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.end();
});

test("Future.cancel", assert => {
  const f = Future.cancel("reason");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.end();
});

test("Future executor.resolve", assert => {
  let resolve;
  const f = new Future(res => {
    resolve = res;
  });
  assert.equal(f.status, Future.PENDING);
  resolve("val");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val");
  assert.end();
});

test("Future executor.reject", assert => {
  let reject;
  const f = new Future((_, rej) => {
    reject = rej;
  });
  assert.equal(f.status, Future.PENDING);
  reject("err");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.end();
});

test("Future executor.cancel", assert => {
  let cancel;
  const f = new Future((_, __, can) => {
    cancel = can;
  });
  assert.equal(f.status, Future.PENDING);
  cancel("reason");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.end();
});

test("Future cancel -> resolve", assert => {
  let resolve;
  const f = new Future(res => {
    resolve = res;
  });
  assert.equal(f.status, Future.PENDING);
  f.cancel("reason");
  resolve("val");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.end();
});

test("Future cancel -> reject", assert => {
  let reject;
  const f = new Future((_, rej) => {
    reject = rej;
  });
  f.cancel("reason");
  reject("err");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.end();
});

test("Future cancel -> cancel", assert => {
  const f = new Future(() => {});
  assert.equal(f.status, Future.PENDING);
  f.cancel("reason");
  f.cancel("another reason");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.end();
});

test("Future resolve -> cancel", assert => {
  let resolve;
  const f = new Future(res => {
    resolve = res;
  });
  resolve("val");
  f.cancel("reason");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val");
  assert.end();
});

test("Future resolve -> reject", assert => {
  let resolve, reject;
  const f = new Future((res, rej) => {
    resolve = res;
    reject = rej;
  });
  resolve("val");
  reject("err");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val");
  assert.end();
});

test("Future resolve -> resolve", assert => {
  let resolve;
  const f = new Future(res => {
    resolve = res;
  });
  resolve("val1");
  resolve("val2");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val1");
  assert.end();
});

test("Future reject -> cancel", assert => {
  let reject;
  const f = new Future((_, rej) => {
    reject = rej;
  });
  reject("err");
  f.cancel("reason");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.end();
});

test("Future reject -> resolve", assert => {
  let resolve, reject;
  const f = new Future((res, rej) => {
    resolve = res;
    reject = rej;
  });
  reject("err");
  resolve("val");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.end();
});

test("Future reject -> reject", assert => {
  let reject;
  const f = new Future((_, rej) => {
    reject = rej;
  });
  reject("err1");
  reject("err2");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err1");
  assert.end();
});

test("Future.subscribe -> resolve", assert => {
  assert.plan(1);
  let f = Future.resolve("val");
  f.subscribe(
    v => assert.equal(v, "val"),
    _ => assert.fail("should call onSuccess handler"),
    _ => assert.fail("should call onSuccess handler")
  );
});

test("Future.subscribe -> reject", assert => {
  assert.plan(1);
  let f = Future.reject("err");
  f.subscribe(
    _ => assert.fail("should call onError handler"),
    e => assert.equal(e, "err"),
    _ => assert.fail("should call onError handler")
  );
});

test("Future.subscribe -> cancel", assert => {
  assert.plan(1);
  let f = Future.cancel("reason");
  f.subscribe(
    _ => assert.fail("should call onCancel handler"),
    _ => assert.fail("should call onCancel handler"),
    r => assert.equal(r, "reason")
  );
});

test("Future subscribe (resolve)", assert => {
  let resolve;
  const f = new Future(res => {
    resolve = res;
  });
  let rval;
  f.subscribe(
    v => (rval = v),
    _ => assert.fail("should call onSuccess handler"),
    _ => assert.fail("should call onSuccess handler")
  );
  assert.equal(rval, undefined);
  resolve("val");
  assert.equal(rval, "val");
  let rval1;
  f.subscribe(
    v => (rval1 = v),
    _ => assert.fail("should call onSuccess handler"),
    _ => assert.fail("should call onSuccess handler")
  );
  assert.equal(rval1, "val");
  assert.end();
});

test("Future subscribe (cancel) ", assert => {
  const f = new Future(() => {});
  let rval;
  f.subscribe(
    _ => assert.fail("should call onCancel handler"),
    _ => assert.fail("should call onCancel handler"),
    r => (rval = r)
  );
  assert.equal(rval, undefined);
  f.cancel("reason");
  assert.equal(rval, "reason");
  let rval1;
  f.subscribe(
    _ => assert.fail("should call onCancel handler"),
    _ => assert.fail("should call onCancel handler"),
    r => (rval1 = r)
  );
  assert.equal(rval1, "reason");

  f.subscribe(
    _ => assert.fail("should not call any handler"),
    _ => assert.fail("should not call any handler")
  );
  assert.end();
});

test("Future.then resolve -> resolve/reject/cancel", assert => {
  const fail = () => assert.fail("should not call handler");
  let resolve;
  let f = new Future(res => {
    resolve = () => res("val");
  });

  let f0 = f.then(undefined, fail, fail);
  assert.equal(f0.status, Future.PENDING);
  resolve();
  assert.equal(f0.status, Future.RESOLVED);
  assert.equal(f0.value, "val");

  let res1;
  let thenResolve = v =>
    new Future(res => {
      res1 = () => res("res-" + v);
    });
  let f1 = f.then(thenResolve, fail, fail);
  assert.equal(f1.status, Future.PENDING);
  res1();
  assert.equal(f1.status, Future.RESOLVED);
  assert.equal(f1.value, "res-val");

  let rej2;
  let thenReject = v =>
    new Future((_, rej) => {
      rej2 = () => rej("err-" + v);
    });
  let f2 = f.then(thenReject, fail, fail);
  assert.equal(f2.status, Future.PENDING);
  rej2();
  assert.equal(f2.status, Future.REJECTED);
  assert.equal(f2.value, "err-val");

  let can3;
  let thenCancel = v =>
    new Future((_, __, can) => {
      can3 = () => can("can-" + v);
    });
  let f3 = f.then(thenCancel, fail, fail);
  assert.equal(f3.status, Future.PENDING);
  can3();
  assert.equal(f3.status, Future.CANCELLED);
  assert.equal(f3.value, "can-val");
  assert.end();
});

test("Future.then reject -> resolve/reject/cancel", assert => {
  const fail = () => assert.fail("should not call handler");
  let reject;
  let f = new Future((_, rej) => {
    reject = () => rej("err");
  });

  let thenResolve = v => "res-" + v;
  let thenReject = v => Future.reject("err-" + v);
  let thenCancel = v => Future.cancel("can-" + v);

  let f0 = f.then(fail, undefined, fail);
  let f1 = f.then(fail, thenResolve, fail);
  let f2 = f.then(fail, thenReject, fail);
  let f3 = f.then(fail, thenCancel, fail);

  reject();

  assert.equal(f0.status, Future.REJECTED);
  assert.equal(f0.value, "err");

  assert.equal(f1.status, Future.RESOLVED);
  assert.equal(f1.value, "res-err");

  assert.equal(f2.status, Future.REJECTED);
  assert.equal(f2.value, "err-err");

  assert.equal(f3.status, Future.CANCELLED);
  assert.equal(f3.value, "can-err");

  assert.end();
});

test("Future.then cancel -> resolve/reject/cancel", assert => {
  const fail = () => assert.fail("should not call handler");
  let f = new Future(() => {});

  let thenResolve = v => "res-" + v;
  let thenReject = v => Future.reject("err-" + v);
  let thenCancel = v => Future.cancel("can-" + v);

  let f0 = f.then(fail, fail);
  let f1 = f.then(fail, fail, thenResolve);
  let f2 = f.then(fail, fail, thenReject);
  let f3 = f.then(fail, fail, thenCancel);

  f.cancel("reason");

  assert.equal(f0.status, Future.CANCELLED);
  assert.equal(f0.value, "reason");

  assert.equal(f1.status, Future.RESOLVED);
  assert.equal(f1.value, "res-reason");

  assert.equal(f2.status, Future.REJECTED);
  assert.equal(f2.value, "err-reason");

  assert.equal(f3.status, Future.CANCELLED);
  assert.equal(f3.value, "can-reason");

  assert.end();
});

test("Future.then downstream cancellation", assert => {
  const fail = () => assert.fail("should not call handler");

  let f = new Future(() => {});

  let f0 = f.then(fail, fail);
  let f1 = f0.then(v => v, fail);
  let f2 = f1.then(fail, v => v);

  f.cancel("reason");

  assert.equal(f0.status, Future.CANCELLED);
  assert.equal(f0.value, "reason");

  assert.equal(f1.status, Future.CANCELLED);
  assert.equal(f1.value, "reason");

  assert.equal(f2.status, Future.CANCELLED);
  assert.equal(f2.value, "reason");

  assert.end();
});

test("Future.then upstream cancellation", assert => {
  const fail = () => assert.fail("should not call handler");
  let cancelReason;

  let f = new Future(() => {
    return reason => (cancelReason = "root-" + reason);
  });

  let f0 = f.then(fail, fail);
  let f1 = f0.then(v => v, fail);
  let f2 = f1.then(fail, v => v);

  f2.cancel("reason");

  assert.equal(f1.status, Future.CANCELLED);
  assert.equal(f1.value, "reason");

  assert.equal(f0.status, Future.CANCELLED);
  assert.equal(f0.value, "reason");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  assert.equal(cancelReason, "root-reason");

  assert.end();
});

test("Future.orElse (resolve)", assert => {
  let d1 = Future.defer();
  let d2 = Future.defer();

  let f = d1.future.orElse(d2.future);
  assert.equal(f.status, Future.PENDING);
  d1.resolve("v1");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "v1");

  assert.equal(d2.future.status, Future.CANCELLED);
  assert.equal(d2.future.value, "orElse");

  assert.end();
});

test("Future.orElse (reject)", assert => {
  let d1 = Future.defer();
  let d2 = Future.defer();

  let f = d1.future.orElse(d2.future);
  assert.equal(f.status, Future.PENDING);
  d2.reject("err2");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err2");

  assert.equal(d1.future.status, Future.CANCELLED);
  assert.equal(d1.future.value, "orElse");

  assert.end();
});

test("Future.orElse -> upstream cancellation", assert => {
  let d1 = Future.defer();
  let d2 = Future.defer();

  let f = d1.future.orElse(d2.future);

  f.cancel("reason");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  assert.equal(d1.future.status, Future.CANCELLED);
  assert.equal(d1.future.value, "reason");

  assert.equal(d2.future.status, Future.CANCELLED);
  assert.equal(d2.future.value, "reason");

  assert.end();
});

test("Future.orElse -> downstream cancellation", assert => {
  let d1 = Future.defer();
  let d2 = Future.defer();

  let f = d1.future.orElse(d2.future);

  d1.future.cancel("reason1");
  d2.future.cancel("reason2");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason2");

  assert.end();
});

test("Future.zipw", assert => {
  let fn = (v1, v2) => v1 + "-" + v2;
  let d1, d2, f;
  let fres = Future.resolve("val");
  let frej = Future.reject("err");
  let fcan = Future.cancel("reason");

  // sync resolve + sync resolve = sync resolve
  f = Future.zipw(fn, fres, Future.resolve("val2"));
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val-val2");

  // sync resolve + sync reject = sync reject
  f = Future.zipw(fn, fres, frej);
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  // sync resolve + sync cancel = sync cancel
  f = Future.zipw(fn, fres, fcan);
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  // sync reject + _ = sync reject
  f = Future.zipw(fn, frej, fres);
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Future.zipw(fn, frej, Future.reject("err2"));
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Future.zipw(fn, frej, fcan);
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Future.zipw(fn, frej, new Future(() => {}));
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  // sync cancel + _ = sync cancel
  f = Future.zipw(fn, fcan, fres);
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  f = Future.zipw(fn, fcan, frej);
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  f = Future.zipw(fn, fcan, Future.cancel("reason2"));
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  f = Future.zipw(fn, fcan, new Future(() => {}));
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  // _ + sync reject = sync reject
  f = Future.zipw(fn, fres, frej);
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  f = Future.zipw(fn, new Future(() => {}), frej);
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  // _ + sync cancel = sync cancel
  f = Future.zipw(fn, fres, fcan);
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  f = Future.zipw(fn, new Future(() => {}), fcan);
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  // sync resolve + deferred resolve = deferred resolve
  d1 = Future.defer();
  f = Future.zipw(fn, fres, d1.future);
  assert.equal(f.status, Future.PENDING);
  d1.resolve("a");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "val-a");

  // sync resolve + deferred reject = deferred reject
  d1 = Future.defer();
  f = Future.zipw(fn, fres, d1.future);
  assert.equal(f.status, Future.PENDING);
  d1.reject("err");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  // sync resolve + deferred cancel = deferred cancel
  d1 = Future.defer();
  f = Future.zipw(fn, fres, d1.future);
  assert.equal(f.status, Future.PENDING);
  d1.cancel("reason");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  // deferred resolve + deferred resolve = deferred resolve
  d1 = Future.defer();
  d2 = Future.defer();
  f = Future.zipw(fn, d1.future, d2.future);
  assert.equal(f.status, Future.PENDING);
  d1.resolve("a");
  assert.equal(f.status, Future.PENDING);
  d2.resolve("b");
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, "a-b");

  // deferred resolve + deferred reject = deferred reject
  d1 = Future.defer();
  d2 = Future.defer();
  f = Future.zipw(fn, d1.future, d2.future);
  assert.equal(f.status, Future.PENDING);
  d1.resolve("a");
  assert.equal(f.status, Future.PENDING);
  d2.reject("err");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");

  // deferred resolve + deferred cancel = deferred cancel
  d1 = Future.defer();
  d2 = Future.defer();
  f = Future.zipw(fn, d1.future, d2.future);
  assert.equal(f.status, Future.PENDING);
  d1.resolve("a");
  assert.equal(f.status, Future.PENDING);
  d2.cancel("reason");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  // deferred reject + deferred _ = deferred reject (+ cancel 2nd)
  d1 = Future.defer();
  d2 = Future.defer();
  f = Future.zipw(fn, d1.future, d2.future);
  assert.equal(f.status, Future.PENDING);
  d1.reject("err");
  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.equal(d2.future.status, Future.CANCELLED);

  // deferred cancel + deferred _ = deferred cancel (+ cancel 2nd)
  d1 = Future.defer();
  d2 = Future.defer();
  f = Future.zipw(fn, d1.future, d2.future);
  assert.equal(f.status, Future.PENDING);
  d1.cancel("reason");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.equal(d2.future.status, Future.CANCELLED);

  // deferred + deferred (manual cancel) = deferred cancel
  d1 = Future.defer();
  d2 = Future.defer();
  f = Future.zipw(fn, d1.future, d2.future);
  assert.equal(f.status, Future.PENDING);
  f.cancel("reason");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.equal(d1.future.status, Future.CANCELLED);
  assert.equal(d1.future.value, "reason");
  assert.equal(d2.future.status, Future.CANCELLED);
  assert.equal(d2.future.value, "reason");

  assert.end();
});

test("Future.all -> resolve", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.all(ds.map(d => d.future));

  ds.forEach((d, i) => d.resolve(i));
  assert.equal(f.status, Future.RESOLVED);
  assert.deepEqual(f.value, [0, 1, 2]);
  assert.end();
});

test("Future.all -> reject", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.all(ds.map(d => d.future));

  ds[0].resolve(1);
  ds[1].reject("err");

  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.equal(ds[2].future.status, Future.CANCELLED);
  assert.end();
});

test("Future.all downstream cancellation", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.all(ds.map(d => d.future));

  ds[0].resolve(0);
  ds[1].future.cancel("reason");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");
  assert.equal(ds[2].future.status, Future.CANCELLED);
  assert.end();
});

test("Future.all upstream cancellation", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.all(ds.map(d => d.future));

  f.cancel("reason");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  ds.forEach(d => {
    assert.equal(d.future.status, Future.CANCELLED);
    assert.equal(d.future.value, "reason");
  });

  assert.end();
});

test("Future.race -> resolve", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.race(ds.map(d => d.future));

  ds[1].resolve(1);
  assert.equal(f.status, Future.RESOLVED);
  assert.equal(f.value, 1);

  assert.equal(ds[0].future.status, Future.CANCELLED);
  assert.equal(ds[2].future.status, Future.CANCELLED);
  assert.end();
});

test("Future.race -> reject", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.race(ds.map(d => d.future));

  ds[1].reject("err");

  assert.equal(f.status, Future.REJECTED);
  assert.equal(f.value, "err");
  assert.equal(ds[0].future.status, Future.CANCELLED);
  assert.equal(ds[2].future.status, Future.CANCELLED);
  assert.end();
});

test("Future.race upstream cancellation", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.race(ds.map(d => d.future));

  f.cancel("reason");

  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason");

  ds.forEach(d => {
    assert.equal(d.future.status, Future.CANCELLED);
    assert.equal(d.future.value, "reason");
  });
  assert.end();
});

test("Future.race downstream cancellation", assert => {
  let ds = [Future.defer(), Future.defer(), Future.defer()];

  let f = Future.race(ds.map(d => d.future));

  ds[1].future.cancel("reason1");
  assert.equal(f.status, Future.PENDING);

  ds[0].future.cancel("reason0");
  assert.equal(f.status, Future.PENDING);

  ds[2].future.cancel("reason2");
  assert.equal(f.status, Future.CANCELLED);
  assert.equal(f.value, "reason2");

  assert.end();
});
