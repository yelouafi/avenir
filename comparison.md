
## Comparison with TC39 cancellable promises


> the following section is on how Tasks tries to solve some of the issues with former Task based TC39 proposal. 
> Points listed in a random order here. Needs rewrite.

Basically avenir Task build on [proposal-cancelable-promises/issues/2](https://github.com/tc39/proposal-cancelable-promises/issues/2).
But unlike the proposal which evolves in a highly constrained environment (backward compatibility, consensus ...). The
library doesnt aim to be a compatible Promise implementation. Instead we start from scratch taking different design decisions
and tradeoffs (mainly simplicity and ergonomics).

In the following I use the term Promise to makes explanations simpler. But the library has its own Promise implementation called Future.

- Task is not a sublcass of Promise but wraps a lazy Promise chain for which it's the only owner. Thus it can describe an atomic operation and gives clearer meaning to cancellation. IMHO ref counting for handling cases like [this one](https://github.com/tc39/proposal-cancelable-promises/blob/19b48e28d768d84cff8c2b69f61f710376eb9394/Subclass%20Brainstorming.md#canceling-derived-tasks) is not the best way (because a Promise is multicast and we can chain further operations *after* the refcount reaches 0).

- Task executes/propagates synchronously hence no race conditions like [tc39/proposal-cancelable-promises/issues/8](https://github.com/tc39/proposal-cancelable-promises/issues/8). (reentrance issues due to synchronous execution/propagation are handled by spec. guards. It's way simpler to handle reentrance than correctly implement cancellation with async shcduling)

- Task doesn't flatten nested Promises so clearer meaning of what to expect from  [tc39/proposal-cancelable-promises/issues/8](https://github.com/tc39/proposal-cancelable-promises/issues/8) or also [from this example](https://github.com/tc39/proposal-cancelable-promises/blob/19b48e28d768d84cff8c2b69f61f710376eb9394/Subclass%20Brainstorming.md#cancelation-vs-resolution). A Promise is completed simply when it's not in PENDING state. Thus examples like this

```js
const task = new Task(resolve => {
  resolve(new Promise(() => {}));

  return cancelAction;
});
task.cancel();
```

are not legitimate because we can not call the `resolve` capability with another Promise (In fact we can but the inner
Promise is passed to chained callbacks as a normal value).


## comparison with folktale
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
