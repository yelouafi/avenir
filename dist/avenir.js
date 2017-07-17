(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? factory(exports)
    : typeof define === "function" && define.amd
      ? define(["exports"], factory)
      : factory((global.Avenir = {}));
})(this, function(exports) {
  "use strict";

  var PENDING$2 = "PENDING";
  var RESOLVED$1 = "RESOLVED";
  var REJECTED$2 = "REJECTED";
  var CANCELLED$2 = "CANCELLED";

  var E_FUN_ARG = "argument is not a function";

  var isDev = "development" === "development";

  var isFunc = function isFunc(x) {
    return typeof x === "function";
  };

  var noop = function noop() {};

  var raise = function raise(e) {
    throw e;
  };

  var append = function append(xs, x) {
    var ys = xs.slice();
    ys.push(x);
    return ys;
  };

  var LOG_NOTHING = 0;
  var LOG_ERRORS = 1;
  var LOG_WARNINGS = 2;
  var LOG_INFOS = 3;

  var logLevel = isDev ? LOG_WARNINGS : LOG_ERRORS;

  var logger = {
    disable: function disable() {
      return (logLevel = LOG_NOTHING);
    },
    enableInfos: function enableInfos() {
      return (logLevel = LOG_INFOS);
    },
    enableWarnings: function enableWarnings() {
      return (logLevel = LOG_WARNINGS);
    },

    info: function info(message) {
      /* eslint-disable no-console */
      if (logLevel >= LOG_INFOS) console.info(message);
    },
    warn: function warn(message) {
      /* eslint-disable no-console */
      if (logLevel >= LOG_WARNINGS) console.warn(message);
    },
    error: function error(err) {
      /* eslint-disable no-console */
      if (logLevel >= LOG_ERRORS) {
        console.error(err && err.message ? err.message : err);
      }
    }
  };

  var assert = function assert(cond, msg) {
    if (!cond) {
      var err = new TypeError(msg);
      logger.error(err);
      throw err;
    }
  };

  var assertFunc = function assertFunc(arg) {
    assert(isFunc(arg), E_FUN_ARG);
  };

  var classCallCheck = function(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  };

  var createClass = (function() {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function(Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })();

  var PENDING$1 = PENDING$2;
  var RESOLVED = RESOLVED$1;
  var REJECTED$1 = REJECTED$2;
  var CANCELLED$1 = CANCELLED$2;

  function fxor(fut) {
    var ok = void 0;
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

  var assertFut = function assertFut(arg) {
    return assert(arg instanceof Future, "argument is not a Future");
  };

  var Future = (function() {
    /**
   * Creates a Future that will get its outcome using the provided
   * {@link executor} function.
   *
   * Future's executors are invoked synchrously (immediately).
   *
   * @param {executor} executor
   *
   * @returns {Future}
   */
    function Future(executor) {
      var _this = this;

      classCallCheck(this, Future);

      assertFunc(executor);

      this._joiners = new Set();
      this._status = PENDING$1;

      var once = fxor(this);
      var onResolve = function onResolve(value) {
        return _this._force(RESOLVED, value);
      };
      var onReject = function onReject(error) {
        return _this._force(REJECTED$1, error);
      };
      var onCancel = function onCancel(reason) {
        return _this._force(CANCELLED$1, reason);
      };

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

    Future.prototype.subscribe = function subscribe() {
      var onSuccess =
        arguments.length > 0 && arguments[0] !== undefined
          ? arguments[0]
          : noop;

      var _this2 = this;

      var onError =
        arguments.length > 1 && arguments[1] !== undefined
          ? arguments[1]
          : noop;
      var onCancel =
        arguments.length > 2 && arguments[2] !== undefined
          ? arguments[2]
          : noop;

      assertFunc(onSuccess);
      assertFunc(onError);
      assertFunc(onCancel);

      if (this._status === PENDING$1) {
        var sub = {
          onSuccess: onSuccess,
          onError: onError,
          onCancel: onCancel
        };
        this._joiners.add(sub);
        return function() {
          _this2._joiners && _this2._joiners.delete(sub);
        };
      } else {
        this._notify(onSuccess, onError, onCancel);
        return noop;
      }
    };

    /**
   * Returns a new Future that will complete with the same outcome as the input
   * Future.
   *
   * Cancelling this Future will not cancel the original Future.
   */

    Future.prototype.fork = function fork() {
      var _this3 = this;

      return new Future(function(resolve, reject, cancel) {
        return _this3.subscribe(resolve, reject, cancel);
      });
    };

    /**
   * Cancels the Future with provided reason. Cancellation *forces* the outcome
   * of this Future into a Cancelled state.
   *
   * Cancellation will be notified to all subscribers that have provided an
   * `onCancel` callback.
   *
   * @param {*} reason
   */

    Future.prototype.cancel = function cancel(reason) {
      if (this._status !== PENDING$1) return;
      this._dispose && this._dispose(reason);
      this._force(CANCELLED$1, reason);
    };

    /**
   * Chain a callback that will be invoked when this Future completes. The
   * appropriate callback will be invoked (if provided) depending on the type
   * of the completion (success, error or cancellation).
   *
   * If the invoked callback returns a Future then the result Future will adopt
   * its outcome. Returning a non Future value is the same as returning
   * `Future.resolve(value)`.
   *
   * If the appropriate callback is omitted then the result Future will adopt
   * the same outcome of this Future.
   *
   * Cancelling the result Future will not cancel this Future or the one
   * eventually returned from a callback. That is, the cancellation will only
   * affect the outcome of the result Future. If you want to cancel the root
   * Futures as well, you must combine your sequence in a Task using
   * {@link Task#then}
   *
   * @param {Function} onResolve
   * @param {Function} onReject
   * @param {Function} onCancel
   *
   * @returns @Future
   */

    Future.prototype.then = function then(onResolve, onReject, onCancel) {
      var _this4 = this;

      onResolve && assertFunc(onResolve);
      onReject && assertFunc(onReject);
      onCancel && assertFunc(onCancel);

      return new Future(function(resolve, reject, cancel) {
        var unsubscribe1 = void 0,
          unsubscribe2 = void 0;

        var handler = function handler(k) {
          return function(v) {
            var fut = k(v);
            if (fut instanceof Future)
              unsubscribe2 = fut.subscribe(resolve, reject, cancel);
            else resolve(fut);
          };
        };

        unsubscribe1 = _this4.subscribe(
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
    };

    /**
   * Runs a race between 2 Futures. The result Future will resolve/reject with
   * the first resolved/rejected Future. Otherwise it will be cancelled with the
   * latest cancelled Future.
   *
   * Cancelling the result Future will not cancel the 2 input futures. That is,
   * the cancellation will only affect the outcome of the result Future. If you
   * want to cancel also the input futures you should combine then in a single
   * {@link Task} using {@Task#orElse}
   *
   * @param {Future} f2
   *
   * @returns {Future}
   */

    Future.prototype.orElse = function orElse(f2) {
      assertFut(f2);

      var f1 = this;

      if (f1._status === RESOLVED || f1._status === REJECTED$1) return f1;
      if (f1._status === CANCELLED$1 || f2._status !== PENDING$1) return f2;

      return new Future(function(resolve, reject, cancel) {
        function onResolve(v) {
          dispose();
          resolve(v);
        }

        function onReject(e) {
          dispose();
          reject(e);
        }

        function onCancel(r) {
          if (f1._status === CANCELLED$1 && f2._status === CANCELLED$1) {
            cancel(r);
            dispose();
          }
        }

        var unsubscribe1 = f1.subscribe(onResolve, onReject, onCancel);
        var unsubscribe2 = f2.subscribe(onResolve, onReject, onCancel);

        function dispose() {
          unsubscribe1 && unsubscribe1();
          unsubscribe2 && unsubscribe2();
        }

        return dispose;
      });
    };

    /**
   * Creates a Future that is resolved with the provided value
   *
   * @param {*} value
   *
   * @returns {Future}
   */
    Future.of = function of(value) {
      return new Future(function(resolve) {
        return resolve(value);
      });
    };

    /** Same as {@link Future.of} */

    Future.resolve = function resolve(a) {
      return Future.of(a);
    };

    /**
   * Creates a Future that is rejected with the provided error
   *
   * @param {*} error
   *
   * @returns {Future}
   */

    Future.reject = function reject(error) {
      return new Future(function(_, reject) {
        return reject(error);
      });
    };

    /**
   * Creates a Future that is cancelled with the provided reason
   *
   * @param {*} reason
   *
   * @returns {Future}
   */

    Future.cancel = function cancel(reason) {
      return new Future(function(_, __, cancel) {
        return cancel(reason);
      });
    };

    /** Creates a Future that never completes */

    Future.empty = function empty() {
      return ZERO;
    };

    Future.zipw = function zipw(f, f1, f2) {
      assertFunc(f);
      assertFut(f1);
      assertFut(f2);

      if (f1._status === RESOLVED && f2._status === RESOLVED) {
        return Future.resolve(f(f1._value, f2._value));
      }
      if (f1._status === REJECTED$1 || f1._status === CANCELLED$1) {
        return f1;
      }
      if (f2._status === REJECTED$1 || f2._status === CANCELLED$1) {
        return f2;
      }

      return new Future(function(resolve, reject, cancel) {
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

        var unsubscribe1 = f1.subscribe(onResolve, onReject, onCancel);
        var unsubscribe2 = f2.subscribe(onResolve, onReject, onCancel);

        return dispose;
      });
    };

    /**
   * Returns a Future that will resolve with an Array containing the values of
   * all resolved Tasks. Othewise it will be rejected/cancelled with the first
   * rejected/cancelled input Future.
   *
   * Cancelling the result Future will not cancel the input Futures. Cancellation
   * will only affect the outcome of the result Future. If you want to cancel
   * also the input Futures you must combine them in a single {@link Task} using
   * {@link Task.all}
   *
   * @param {Future[]} futures
   *
   * @returns {Future}
   */

    Future.all = function all(futures) {
      futures.forEach(assertFut);
      return futures.reduce(appendF, Future.resolve([]));
    };

    Future.race2 = function race2(f1, f2) {
      assertFut(f1);
      assertFut(f2);

      return f1.orElse(f2);
    };

    /**
   * Runs a race between the input Futures. Returns a Future that will
   * resolve/reject with the first resolved/rejected Future. Otherwise, it will be
   * cancelled with the latest cancelled Future.
   *
   * Cancellation of the result Future will only affect its own outcome. If you
   * want to cancel also the input Futures you must combine the futures in a
   * single Task using {@link Task.race}
   */

    Future.race = function race(futures) {
      assert(futures && futures.length, "argument must be a non empty array");
      futures.forEach(assertFut);
      return futures.reduce(Future.race2);
    };

    Future.lift2 = function lift2(f) {
      return function(f1, f2) {
        return Future.zipw(f, f1, f2);
      };
    };

    Future.defer = function defer() {
      var resolve = void 0,
        reject = void 0,
        cancel = void 0;
      var future = new Future(function(res, rej, can) {
        resolve = res;
        reject = rej;
        cancel = can;
      });
      return {
        future: future,
        resolve: resolve,
        reject: reject,
        cancel: cancel
      };
    };

    Future.prototype._notify = function _notify(onResolve, onReject, onCancel) {
      var status$$1 = this._status;
      var value = this._value;

      if (status$$1 === RESOLVED) {
        onResolve(value);
      } else if (status$$1 === REJECTED$1) {
        onReject(value);
      } else if (status$$1 === CANCELLED$1) {
        onCancel(value);
      }
    };

    Future.prototype._force = function _force(status$$1, value) {
      var _this5 = this;

      if (this._status !== PENDING$1) return;
      this._status = status$$1;
      this._value = value;
      var joiners = this._joiners;
      this._joiners = null;
      joiners.forEach(function(_ref) {
        var onSuccess = _ref.onSuccess,
          onError = _ref.onError,
          onCancel = _ref.onCancel;
        return _this5._notify(onSuccess, onError, onCancel);
      });
    };

    Future.prototype._complete = function _complete(v) {
      this._force(RESOLVED, v);
    };

    Future.prototype._abort = function _abort(e) {
      this._force(REJECTED$1, e);
    };

    createClass(Future, [
      {
        key: "status",
        get: function get$$1() {
          return this._status;
        }
      },
      {
        key: "value",
        get: function get$$1() {
          return this._value;
        }
      }
    ]);
    return Future;
  })();

  var appendF = Future.lift2(append);
  var ZERO = new Future(function() {});

  var PENDING = PENDING$2;
  var REJECTED = REJECTED$2;
  var CANCELLED = CANCELLED$2;

  var assertTask = function assertTask(arg) {
    return assert(arg instanceof Task, "argument is not a Task");
  };

  var Task = (function() {
    /**
   * Creates a Task from a function that returns a Future.
   *
   * @param {Function} getFuture - A function which returns a {@link Future}
   */
    function Task(getFuture) {
      classCallCheck(this, Task);

      this.fork = getFuture;
    }

    /**
   * Starts executing the Task. No side effect will take place until this method
   * is invoked. Returns a {@link Future} representing the outcome of the Task.
   *
   * A started task can be cancelled by invoking {@link Future#cancel} on the
   * returned Future. Cancelling a Task will cancel the the currently executing
   * step and will skip all subsequent steps.
   *
   * @param {Function} [onSuccess] - callback invoked if the Task has succeded
   * @param {Function} [onError] - callback invoked if the Task has aborted. If
   * not provided an Exception will be thrown
   * @param {Function} [onCancel] - callback invoked if the Task was cancelled
   *
   * @returns {Future}
   */

    Task.prototype.run = function run() {
      var onSuccess =
        arguments.length > 0 && arguments[0] !== undefined
          ? arguments[0]
          : noop;
      var onError =
        arguments.length > 1 && arguments[1] !== undefined
          ? arguments[1]
          : raise;
      var onCancel =
        arguments.length > 2 && arguments[2] !== undefined
          ? arguments[2]
          : noop;

      assertFunc(onSuccess);
      assertFunc(onError);
      assertFunc(onCancel);

      var fut = this.fork();
      fut.subscribe(onSuccess, onError, onCancel);
      return fut;
    };

    /**
   * Run a race between the 2 proivded Tasks. Returns a new Task that will
   *
   *  - resolve with the value of the first resolved input Task
   *  - reject with the error of the first rejected input Task. The other Task
   *    will be cancelled.
   *  - If the 2 input Tasks are cancelled, the Task wil be cancelled with reason
   *    of the last cancelled Task.
   *
   * @param {Task} task - a Task that this task will be raced against
   *
   * @returns {Task}
   */

    Task.prototype.orElse = function orElse(task) {
      var _this = this;

      assertTask(task);

      if (this === EMPTY_TASK) return task;
      if (task === EMPTY_TASK) return this;

      return new Task(function() {
        var f1 = _this.fork();
        if (f1.status !== PENDING) return f1;
        var f2 = task.fork();
        var resultF = f1.orElse(f2);
        resultF.subscribe(cancel, cancel, function(r) {
          return cancel(null, r);
        });
        return resultF;

        function cancel(_, reason) {
          f1.cancel(reason);
          f2.cancel(reason);
        }
      });
    };

    /**
   * Chains a callback that will run after this Task completes. Each of the 3
   * chained callbacks can return another Task to execute further actions.
   * returning a non Task value from a callback has the same effect as returning
   * `Task.resolve(value)`.
   *
   * Note that unlike {@link Task#run}, this method doesn't start the execution
   * of the Task. All it does is to construct a new Task that, when started,
   * will run in sequence the two tasks (this Task and the one returned by the
   * invoked callback).
   *
   * The current Task will invoke the appropriate callback corresponding
   * to the type of its outcome (success, error or cancellation). Each callback
   * is optional. In case the corresponding callback was not provided, the final
   * outcome will be the same as the first Task.
   *
   * Cancelling the result Task will cancel the current step in the chain and
   * skip the execution of the Tasks in the subsequent step(s).
   *
   * This method returns a new Task that will complete with the same outcome
   * as the second Task returned from the appropriate callback.
   *
   * @param {Function} [onSuccess] - callback invoked if the Task has succeded
   * @param {Function} [onError] - callback invoked if the Task has aborted. If
   * @param {Function} [onCancel] - callback invoked if the Task was cancelled
   *
   * @returns {Task}
   */

    Task.prototype.then = function then(onSuccess, onError, onCancel) {
      var _this2 = this;

      onSuccess && assertFunc(onSuccess);
      onError && assertFunc(onError);
      onCancel && assertFunc(onCancel);

      if (this === EMPTY_TASK) return EMPTY_TASK;

      return new Task(function() {
        var fut1 = void 0,
          fut2 = void 0;

        var handler = function handler(k) {
          return function(v) {
            var result = k(v);
            if (result instanceof Task) {
              fut2 = result.fork();
              return fut2;
            } else return result;
          };
        };

        if (onSuccess) onSuccess = handler(onSuccess);
        if (onError) onError = handler(onError);
        if (onCancel) onCancel = handler(onCancel);

        fut1 = _this2.fork();
        var resultF = fut1.then(onSuccess, onError, onCancel);
        resultF.subscribe(undefined, cancel, function(r) {
          return cancel(null, r);
        });
        return resultF;

        function cancel(_, reason) {
          fut1.cancel(reason);
          fut2 && fut2.cancel(reason);
        }
      });
    };

    /**
   * a helper method to debug Tasks. It will log the outcome of the Task in the
   * console. All log messages will be prefixed withe provided string.
   *
   * This method returns a {@link Future} that represent the outcome of the Task.
   *
   * @param {string} prefix - used to prefix logged messages
   *
   * @returns {Future}
   */

    Task.prototype.log = function log(prefix) {
      /* eslint-disable no-console */
      return this.run(
        function(v) {
          return console.log(prefix, ": resolved with ", v);
        },
        function(e) {
          return console.error(prefix, ": rejected with ", e);
        },
        function(r) {
          return console.log(prefix, ": cancelled with ", r);
        }
      );
    };

    /**
   * Returns a Task that will always resolve with the provided value
   *
   * @param {*} value
   *
   * @returns {Task}
   */

    Task.of = function of(value) {
      return Task.from(function(k) {
        return k(value);
      });
    };

    /** Same as {@link Task.of} **/

    Task.resolve = function resolve(value) {
      return Task.from(function(k) {
        return k(value);
      });
    };

    /**
   * Returns a Task that will always reject with the provided value
   *
   * @param {*} error
   *
   * @returns {Task}
   */

    Task.reject = function reject(error) {
      return Task.from(function(_, ke) {
        return ke(error);
      });
    };

    /**
   * Returns a Task that will always be cancelled with the provided value
   *
   * @param {*} reason
   *
   * @returns {Task}
   */

    Task.cancel = function cancel(reason) {
      return Task.from(function(_, __, kc) {
        return kc(reason);
      });
    };

    /**
   * Creates a Task that, when started, will get its outcome using the provided
   * executor function.
   *
   * Each time the Task is started using {@link Task.run}, the executor function
   * will be invoked with 3 callbacks: resolve, reject and cancel. The executor
   * function must invoke the appropriate callback to notify the Task's outcome.
   *
   * Task's executors are invoked synchrously (immediately).
   *
   * @param {executor} executor
   *
   * @returns {Task}
   */

    Task.from = function from(executor) {
      assertFunc(executor);

      return new Task(function() {
        return new Future(executor);
      });
    };

    /**
   * Creates a Task that will be complete with the same outcome as the provided
   * Future.
   *
   * Note that cancelling the execution of the returned task will not cancel
   * the original Future.
   *
   * @oaram {Future} future
   *
   * @returns {Task}
   */

    Task.join = function join(future) {
      return new Task(function() {
        return future.fork();
      });
    };

    /**
    Returns a Task that does nothing. An empty task doesn't have an outcome.
     In particular an empty task has the following properties (≅ means the 2 tasks
    behave in similar ways)
     emptyTask.orElse(anotherTask)         ≅ anotherTask
    anotherTask.orElse(emptyTask)         ≅ anotherTask
    emptyTask.then(_ => anotherTask)      ≅ emptyTask
    anotherTask.then(_ => emptyTask)      ≅ emptyTask
    Task.zipw(f, emptyTask, anotherTask)  ≅ emptyTask
    Task.zipw(f, anotherTask, emptyTask)  ≅ emptyTask
     @returns {Task}
  **/

    Task.empty = function empty() {
      return EMPTY_TASK;
    };

    /** Same as `task1.orElse(task2)` */

    Task.race2 = function race2(task1, task2) {
      assertTask(task1);
      assertTask(task2);

      return task1.orElse(task2);
    };

    /**
   * Runs a race between all the provided Tasks. This is the same as
   *
   * `task1.orElse(task2)......orElse(taskN)`
   *
   * The Task will resolve/reject with the first resolved/rejected Task. In either
   * case the other Tasks are automatically cancelled. If all the Tasks
   * are cancelled, the result Task will be cancelled with the last
   * cancellation's result.
   *
   * Cancelling the result Task will cancel all other Tasks.
   *
   * @param {Task[]} tasks
   *
   * @returns {Task}
   */

    Task.race = function race(tasks) {
      tasks.forEach(assertTask);

      return tasks.reduce(Task.race2, EMPTY_TASK);
    };

    /**
   * Combine the resolved outcomes of 2 input Tasks using the provided function.
   *
   * If one of the input Tasks is rejected/cancelled, then the result Task
   * will be rejected/cancelled a well. The other Task will also be automatically
   * cancelled.
   *
   * Cancelling the result Task will cancel the 2 input Tasks (if still pending)
   *
   * @param {Function} f - Used to combine the resolved values of the 2 tasks
   * @param {Task} task1
   * @param {Task} task2
   *
   * @returns {Task}
   */

    Task.zipw = function zipw(f, task1, task2) {
      assertFunc(f);
      assertTask(task1);
      assertTask(task2);

      if (task1 === EMPTY_TASK || task2 === EMPTY_TASK) return EMPTY_TASK;

      return new Task(function() {
        var f1 = task1.fork();
        if (f1.status === CANCELLED || f1.status === REJECTED) return f1;
        var f2 = task2.fork();
        var resultF = Future.zipw(f, f1, f2);
        resultF.subscribe(cancel, cancel, function(r) {
          return cancel(null, r);
        });
        return resultF;

        function cancel(_, reason) {
          f1.cancel(reason);
          f2.cancel(reason);
        }
      });
    };

    /**
   * Returns a Task that will resolve with Array of all values if all input tasks
   * are resolved. If any input Task is rejected/cancelled, the result Task will
   * also be rejected/cancelled. In either case all Tasks that are still
   * pending will be automatically cancelled.
   *
   * Cancelling the result Task will cancel all input Tasks (if pending)
   *
   * @param {Task[]} tasks
   *
   * @returns {Task}
   */

    Task.all = function all(tasks) {
      tasks.forEach(assertTask);

      return tasks.reduce(appendT, Task.of([]));
    };

    /**
   * Transform the input values into Tasks using the provided function and
   * returns that combines the values of all created Tasks using {@link Task.all}
   *
   * @param {Function} f - A function that takes a value and returns a Task
   * @param {object[]} values - An array of values
   *
   * @returns {Task}
   */

    Task.traverse = function traverse(f, values) {
      assertFunc(f);

      return Task.all(values.then(f));
    };

    /**
   * Pass the input Tasks trough an async predicate (a function that returns a Task
   * of a Boolean). The result Task will resolve with the first value that pass
   * the async test.
   *
   * @param {Function} p - A function that takes a value and returnd Task of a Boolean
   * @param {Task[]} tasks
   *
   * @retursn Task
   */

    Task.detect = function detect(p, tasks) {
      assertFunc(p);

      return Task.race(
        tasks.map(function(t) {
          return t.then(function(v) {
            return p(v).then(function(b) {
              return b ? Task.of(v) : EMPTY_TASK;
            });
          });
        })
      );
    };

    /**
   * Returns a Task that will applies the provided function to the resolved values
   * of the input Tasks. The Task will be rejected/cancelled if any of the input
   * Tasks is rejected/cancelled and the other Tasks will be cancelled if still
   * pending.
   *
   * @param {Function} f
   * @param {Task[]} tasks
   * @param {object} ctx - If provided, will be used as a `this` for the function
   *
   * @returnd Task
   */

    Task.apply = function apply(f, tasks, ctx) {
      assertFunc(f);

      return Task.all(tasks).map(function(values) {
        return f.apply(ctx, values);
      });
    };

    Task.lift2 = function lift2(f) {
      assertFunc(f);

      return function(c1, c2) {
        return Task.zipw(f, c1, c2);
      };
    };

    /**
   * Transforms a function that acts on plain values to a function that acts on
   * Tasks. This is the same as `Task.apply.bind(undefined, f)`
   *
   * @params {Function} f
   */

    Task.lift = function lift(f) {
      assertFunc(f);

      return function() {
        for (
          var _len = arguments.length, tasks = Array(_len), _key = 0;
          _key < _len;
          _key++
        ) {
          tasks[_key] = arguments[_key];
        }

        return Task.apply(f, tasks);
      };
    };

    Task.do = function _do(gf) {
      return new Task(function() {
        var g = gf();
        return next();

        function next(a, isErr) {
          try {
            var _ref = isErr ? g.throw(a) : g.next(a),
              value = _ref.value,
              done = _ref.done;

            if (done) {
              return Future.of(value);
            }
            return value.fork().then(
              function(v) {
                //console.log('next', a)
                return next(v);
              },
              function(e) {
                //console.log('next err', a)
                return next(e, true);
              },
              function(r) {
                g.return(r);
                return Future.cancel(r);
              }
            );
          } catch (e) {
            return Future.reject(e);
          }
        }
      });
    };

    return Task;
  })();

  var appendT = Task.lift2(append);
  var EMPTY_TASK = new Task(Future.empty);

  /**
 * This function is used to execute the an action for a given {@link Task} or
 * {@link Future}, and then notifies the appropriate provided callbac (success,
 * error or cancellation).
 *
 * If the executor returns a function, it will be invoked when the Task/Future
 * is cancelled. This is useful to run cleanup code.
 *
 * @callback executor
 * @param {Function} resolve - Invoke this callback to resolve the Task/Future
 * @param {Function} reject - Invoke this callback to reject the Task/Future
 * @param {Function} cancel - Invoke this callback to cancel the Task/Future
 *
 * @returns {Function} a function that is invoked when the Task/Future is cancelled.
 */

  var delayF = (exports.delayF = function delay(ms, v) {
    return new Future(function(res) {
      var tid = setTimeout(function() {
        return res(v);
      }, ms);
      return function() {
        clearTimeout(tid);
      };
    });
  });

  function delay(ms, val) {
    return new Task(function() {
      return delayF(ms, val);
    });
  }

  exports.Task = Task;
  exports.Future = Future;
  exports.delay = delay;

  Object.defineProperty(exports, "__esModule", { value: true });
});
