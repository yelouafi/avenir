
avenir differs from folktale's Data.Task in some points

- avenir Tasks notify their callbacks synchronously. Data.Task callbacks are invoked
asynchronously using Node scheduling utils (`nextTick`, `setImmediate`) or `setTimeout` in the browser.

- In avenir we can attach Cancellation callbacks and transform cancelled Futures or Tasks into
successeful operations.

- In Data.Task running a Task returns a [TaskExecution](http://origamitower.github.io/folktale/en/folktale.data.task._task-execution._taskexecution.html)
object which has the cancel capability and from which you can extract a Future.
In avenir, running a Task returns directly a [Future](https://yelouafi.github.io/avenir/Future.html).
You can use the Future to wait or cancel the running Task. But you can also restrict
other parts of the code from cancelling the task by using [Future#fork](https://preview.c9users.io/yelouafi/uncertain/docs/Future.html#fork).
