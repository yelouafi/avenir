
const { Task, delay } = require("../src")

const logResolve = prefix => v => console.log(prefix, ': resolved with ', v)
const logReject  = prefix => e =>console.error(prefix, ': rejected with ', e)
const logCancel = prefix => r => console.log(prefix, ': cancelled with ', r)

/**
 * First we define the Task steps
 */
const sum = (
  delay(1000, 10).then(x =>
  delay(1000, 20).then(y =>
    Task.of(x + y)
  ))
)

/**
 * Note that until no we're not executed anything yet. W're just composed the
 * steps of our computation
 *
 * To start we use task.run(onSuccess, onError, onCancel) to effectively
 * start the execution
 */

sum.run(
  logResolve('sum'),
  logReject('sum'),
  logCancel('sum')
)


/**
 * if any task's step aborts, the whole task aborts
 */
const sumErr = (
  delay(1000, 10).then(x =>
  delay(1000, 20).then(y =>
  /**
   * task will fail here
   */
  Task.reject('sum error').then(_ =>
    Task.of(x + y)
  )))
)

/**
 * We can use a helper log method
 * task.log(prefix) will run the task and log the outcome using the prefix
 * string provided
 */
sumErr.log('sumErr')


/** If any atsk's step is cancelled, the whole task is cancelled
 * (with step's cancel reason).
 *
 * Note here we're cancelling from inside using the Task.cancel(reason) method
 */
const sumCancel = (
  delay(1000, 10).then(x =>
  delay(1000, 20).then(y =>
  Task.cancel('sum cancel reason').then(_ =>
    /**
     * task will skip this step, since it was cancelled before reaching it
     */
    Task.of(x + y)
  )))
)

sumCancel.log('sumCancel')


/**
 * let's use generators using Task.do
 * Inside the generator, you can yield Task instance
 */
const sumCancelGen = Task.do(function*() {
  const x = yield delay(1000, 10)
  const y = yield delay(1000, 20)
  yield Task.cancel('*sum cancel')
  return x + y
})

/**
 * remainder, until no we're not executing anything
 * this the call that kicks off everything
 */
sumCancelGen.log('*sumCancel')

/**
 * let's see hpw do we cancel from the outside
 * First we define our task
 */
const sumCancelGen2 = Task.do(function*() {
  const x = yield delay(1000, 10)
  const y = yield delay(1000, 20)
  return x + y
})

/**
 * task.run (also task.log) returns a `Future` instance
 */
const future = sumCancelGen2.log('*sumCancel')

/**
 * We can use future.cancel(reason) method to cancel the whole task
 * the task will then skip all the subsequent steps
 */
setTimeout(() => future.cancel('*outside cancellation'), 1500)

