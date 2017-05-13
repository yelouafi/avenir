const Future = require("./Future");
const { assert, assertFunc, append, noop, raise } = require("./utils");
const { Status: { PENDING, REJECTED, CANCELLED } } = require("./constants");

const assertTask = arg => assert(arg instanceof Task, "argument is not a Task");

/** @class */
class Task {
  /**
   * Creates a Task from a function that returns a Future.
   *
   * @param {Function} getFuture - A function which returns a {@link Future}
   */
  constructor(getFuture) {
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
  run(onSuccess = noop, onError = raise, onCancel = noop) {
    assertFunc(onSuccess);
    assertFunc(onError);
    assertFunc(onCancel);

    const fut = this.fork();
    fut.subscribe(onSuccess, onError, onCancel);
    return fut;
  }

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
  orElse(task) {
    assertTask(task);

    if (this === EMPTY_TASK) return task;
    if (task === EMPTY_TASK) return this;

    return new Task(() => {
      const f1 = this.fork();
      if (f1.status !== PENDING) return f1;
      const f2 = task.fork();
      const resultF = f1.orElse(f2);
      resultF.subscribe(cancel, cancel, r => cancel(null, r));
      return resultF;

      function cancel(_, reason) {
        f1.cancel(reason);
        f2.cancel(reason);
      }
    });
  }

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
  then(onSuccess, onError, onCancel) {
    onSuccess && assertFunc(onSuccess);
    onError && assertFunc(onError);
    onCancel && assertFunc(onCancel);

    if (this === EMPTY_TASK) return EMPTY_TASK;

    return new Task(() => {
      let fut1, fut2;

      const handler = k => v => {
        const result = k(v);
        if (result instanceof Task) {
          fut2 = result.fork();
          return fut2;
        } else return result;
      };

      if (onSuccess) onSuccess = handler(onSuccess);
      if (onError) onError = handler(onError);
      if (onCancel) onCancel = handler(onCancel);

      fut1 = this.fork();
      const resultF = fut1.then(onSuccess, onError, onCancel);
      resultF.subscribe(undefined, cancel, r => cancel(null, r));
      return resultF;

      function cancel(_, reason) {
        fut1.cancel(reason);
        fut2 && fut2.cancel(reason);
      }
    });
  }

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
  log(prefix) {
    /* eslint-disable no-console */
    return this.run(
      v => console.log(prefix, ": resolved with ", v),
      e => console.error(prefix, ": rejected with ", e),
      r => console.log(prefix, ": cancelled with ", r)
    );
  }

  /**
   * Returns a Task that will always resolve with the provided value
   *
   * @param {*} value
   *
   * @returns {Task}
   */
  static of(value) {
    return Task.from(k => k(value));
  }

  /** Same as {@link Task.of} **/
  static resolve(value) {
    return Task.from(k => k(value));
  }

  /**
   * Returns a Task that will always reject with the provided value
   *
   * @param {*} error
   *
   * @returns {Task}
   */
  static reject(error) {
    return Task.from((_, ke) => ke(error));
  }

  /**
   * Returns a Task that will always be cancelled with the provided value
   *
   * @param {*} reason
   *
   * @returns {Task}
   */
  static cancel(reason) {
    return Task.from((_, __, kc) => kc(reason));
  }

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
   * @returns Task
   */
  static from(executor) {
    assertFunc(executor);

    return new Task(() => new Future(executor));
  }

  /**
   * Creates a Task that will be complete with the same outcome as the provided
   * Future.
   *
   * Note that cancelling the execution of the returned task will not cancel
   * the original Future.
   *
   * @oaram {Future} future
   *
   * @returns Task
   */
  static join(future) {
    return new Task(() => future.fork());
  }

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

    @returns Task
  **/
  static empty() {
    return EMPTY_TASK;
  }

  /** Same as {@link Task#orElse} task1.orElse(task2) **/
  static race2(task1, task2) {
    assertTask(task1);
    assertTask(task2);

    return task1.orElse(task2);
  }

  /**
   * Runs a race between all the provided Tasks. This is the same as
   *
   * task1.orElse(task2)......orElse(taskN)
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
   * @returns Task
   */
  static race(tasks) {
    tasks.forEach(assertTask);

    return tasks.reduce(Task.race2, EMPTY_TASK);
  }

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
   * @param {task1} Task
   * @param {task2} Task
   *
   * @returns Task
   */
  static zipw(f, task1, task2) {
    assertFunc(f);
    assertTask(task1);
    assertTask(task2);

    if (task1 === EMPTY_TASK || task2 === EMPTY_TASK) return EMPTY_TASK;

    return new Task(() => {
      const f1 = task1.fork();
      if (f1.status === CANCELLED || f1.status === REJECTED) return f1;
      const f2 = task2.fork();
      const resultF = Future.zipw(f, f1, f2);
      resultF.subscribe(cancel, cancel, r => cancel(null, r));
      return resultF;

      function cancel(_, reason) {
        f1.cancel(reason);
        f2.cancel(reason);
      }
    });
  }

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
   * @returns Task
   */
  static all(tasks) {
    tasks.forEach(assertTask);

    return tasks.reduce(appendT, Task.of([]));
  }

  /**
   * Transform the input values into Tasks using the provided function and
   * returns that combines the values of all created Tasks using {@link Task.all}
   *
   * @param {Function} f - A function that takes a value and returns a Task
   * @param {*[]} values - An array of values
   *
   * @returns Task
   */
  static traverse(f, values) {
    assertFunc(f);

    return Task.all(values.then(f));
  }

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
  static detect(p, tasks) {
    assertFunc(p);

    return Task.race(
      tasks.map(t => t.then(v => p(v).then(b => (b ? Task.of(v) : EMPTY_TASK))))
    );
  }

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
  static apply(f, tasks, ctx) {
    assertFunc(f);

    return Task.all(tasks).map(values => f.apply(ctx, values));
  }

  static lift2(f) {
    assertFunc(f);

    return (c1, c2) => Task.zipw(f, c1, c2);
  }

  /**
   * Transforms a function that acts on plain values to a function that acts on
   * Tasks. This is the same as `Task.apply.bind(undefined, f)`
   */
  static lift(f) {
    assertFunc(f);

    return (...tasks) => Task.apply(f, tasks);
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

/**
 * This function is used to execute the an action for a given {@link Task} or
 * {@link Future}, and then notifies the appropriate provided callbac (success,
 * error or cancellation)
 *
 * @callback executor
 * @param {Function} resolve - Invoke this callback to resolve the Task/Future
 * @param {Function} reject - Invoke this callback to reject the Task/Future
 * @param {Function} cancel - Invoke this callback to cancel the Task/Future
 */
