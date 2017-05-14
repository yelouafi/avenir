# avenir

Lightweight async library based on lazy Futures. Inspired by
[folktale's Data.Task](https://github.com/folktale/data.task)

The library provides `Tasks` for writing asynchronous code with JavaScript in
Node and the Browser.



Unlike Promises, Tasks are _lazy_ and _cancellable_.

> the following section is on how Tasks tries to solve some of the issues with former Task based TC39 proposal
> Points listed in a random order here. Needs rewrite.

Basically avenir Task build on [proposal-cancelable-promises/issues/2](https://github.com/tc39/proposal-cancelable-promises/issues/2).
But unlike the proposal which evolves in a highly constrained environment (backward compatibility, consensus ...). The
library doesnt aim to be a compatible Promise implementation. Instead we start from scratch taking different design decisions
and tradeoffs (mainly sacrificing immutability for simplicity and ergonomics).

- Task is not a sublcass of Promise/Future but wraps a lazy Promise/Future chain for which it's the only owner. Thus it can describe an atomic operation and gives clearer meaning to cancellation. IMHO ref counting for handling cases like [this one](https://github.com/tc39/proposal-cancelable-promises/blob/19b48e28d768d84cff8c2b69f61f710376eb9394/Subclass%20Brainstorming.md#canceling-derived-tasks) is not the best way (because a Promise is multicast we can chain further operations after the refcount reaches 0).

- Task execute/propagate synchronously hence no race conditions like [tc39/proposal-cancelable-promises/issues/8](https://github.com/tc39/proposal-cancelable-promises/issues/8). Especially, cancellation propagates synchronously to
avoid race conditions (reentrance issues due to synchronous execution/propagation are handled by spec. guards)

- Task doesn't flatten nested Promise/Future so clearer meaning of what to expect from  [tc39/proposal-cancelable-promises/issues/8](https://github.com/tc39/proposal-cancelable-promises/issues/8) or also [from this example](https://github.com/tc39/proposal-cancelable-promises/blob/19b48e28d768d84cff8c2b69f61f710376eb9394/Subclass%20Brainstorming.md#cancelation-vs-resolution). A promise is completed simply when it's not in PENDING state. Thus examples like this

```js
const task = new Task(resolve => {
  resolve(new Promise(() => {}));

  return cancelAction;
});
task.cancel();
```

are not legitimate because we can not call the `resolve` capability with another Promise. And Promises/Futures returned by
then adopt the state of the Promise/Future returned by the `then` callback.

avenir Tasks differ also in a few point from folktale Data.Task. See [comparisaon](comparison.md).

## Rationale

Consider the following example using Promises

```js
var promiseA = someAsynFn()
var promiseB = promiseA.then(...)
```

Let's suppose that Promises were given builtin cancellation. And that we invoke
`promiseB.cancel()`. The question is how do we interpret the effects of this
cancellation ?

1. Should we only cancel `promiseB` and not touch `promiseA` ?
2. Or should we also cancel `promiseA` ?

In case of (1) then what if the code represented an atomic operation ? In this
case a cancellation means cancelling the whole operation and this implies
cancelling also `promiseA` if it's still pending.

Note that even of we write it inline like this

```js
var promiseB = someAsynFn().then(...)
```

There is no way we can infer the atomicity of the operation because Promises are
immutables and each invocation of `then` returns a new Promise. The new Promise
itself is not aware of how it was derived.

Now if we choose (2) and cancel the whole chain, then imagine there is another
operation that was attached to `promiseA` (or that will be attached in some point
of the future[no pun intended] in our code).

```js
var promiseA = someAsynFn()
var promiseB = promiseA.then(...)
var promiseC = promiseA.then(...)
```

Now if `promiseB.cancel()` triggers cancellation on `promiseA` then this cancellation
will propagate downward and cancel also `promiseC` (because it can not be derived
from a cancelled Promise) but we were only aiming at cancelling `promiseB`
not `promiseC`.

Here we have 2 separate chains `promiseA -> promiseB` and `promiseA -> promiseC`.
Another perspective is to view the operation as a *tree* with `promiseA` as root and
with 2 branches whose leafs are `promiseB` and `promiseC`. So cancelling one branch
should not affect the other branch (however cancelling the root or cancelling
the *whole* tree should propagate to the branches as well).

A possible solution is to maintain some ref. couning in `promisA`. Each time we chain
a `then` operation we increase the counter if `promiseA` and once the derived 
promise is completed (whatever the outcome) we decrese the counter. If the counter
reaches `0` then we cancel `promiseA` since all operations that depend on it
have completed.

But ref. couting can have subtle issues. For example what if *after* `promiseB` and
and `promiseC` aer cancelled - cancelling `promiseA` in the way - we reattach another
`then` operation in some other part of the code ? And I dont mention here issues 
related to race conditions due to async scheduling of chained operations which makes
maintaining the ref. counter error prone. Issues like [this one](https://github.com/tc39/proposal-cancelable-promises/issues/8)
is a simple illustration. And I'd expect more subtle issues to manifest in real world
applications (I've myself experienced many of those issues when implementing [redux-saga](https://github.com/redux-saga/redux-saga)
and I couldn't get rid of them until I dropped async scheduling in sequenced 
operations and made everything synchronous).

So it's clear how we should propagate cancellation up depends on the
situation. But the problem is precisely how do we infer this situation. A Promise, 
once created, lacks the *whole context* in which it is itself composed with other 
Promises to build a control flow. While we can maintain a reference to the parent
promise from which the current promise was derived. We can not know how this
parent promise is used elsewhere and all the other operations that has been or
**will be** derived from it.
 So we can not simply implement a `cancel` method in the Promise prototype because 
we do not have enough information to interpret the meaning of the cancellation.

Another solution is to extract out the cancellation capability into a first
class value. For example we can create some token and then pass it down
to all async operations that construct Promises. The creator of the token can
request the cancellation at any moment. The async operations that have
received the token can then be notified of the cancellation. This is the
solution that was planned to be implemented into the TC39 standard (but was
dropped because of lack of consensus).

We can view the token based solution as an indirect way to describe chained
steps as a whole unit. A created cancel token denote itself the whole operation
and all async functions that receive the token are part of the unit.

Another solution, which IMHO is simpler, more composable and ergonomic is to
make this *whole operation* - the big picture - itself as a first class value
using *Tasks*.

### Tasks are lazy Promises

A Task can be thought of as a *lazy Promise*. For example, the following Promise

```js
const promiseA = new Promise((resolve, reject) = {
  invokeAsyncFunc((err, res) => {
    if(err) reject(err)
    else resolve(res)
  })
})
```

Can be made lazy like this

```js
const lazyPromiseA = () => new Promise((resolve, reject) = {
  invokeAsyncFunc((err, res) => {
    if(err) reject(err)
    else resolve(res)
  })
})
```

The difference is that in the first case the operation is started right after the
Promise creation. While in the second we've only constructed a description of t
he operation.

Now suppose we want to *describe a new operation* that is the chaining of the above
and another one

```js
const lazySequence = () => lazyPromiseA().then(...)
```

So what's the difference ? one may ask.

Well in the case of normal/hot promises, we've seen that we can not interpret

```js
var hotSequence = promiseA.then(...)
```

as a whole operation that includes `promiseA` because this one can be used
elsewhere in another sequence.

However in the case of lazy Promises we do have this knowledge. Precisely because
the operation has not started yet. And simply because we will start it ourselves
as a whole operation.

So Tasks are just this and nothing more. The [Task](https://yelouafi.github.io/avenir/Task.html)
abstraction provided by this library or by 
[folktale's Data.Task](http://origamitower.github.io/folktale/en/folktale.data.task.html) 
just wraps this lazy execution and makes it more composable by providing functions to
describe the control flow (like `then`/`chain`, `all`, `race` ...)

In avenir, you can create a Task with a API similar to Promises using
[Task.from](https://yelouafi.github.io/avenir/Task.html#.from). Note the executor
argument takes also a `cancel` callback. This can be invoked by the executor to
trigger cancellation from the source.

```js
const myTask = Task.from((resolve, reject, cancel) = {
  invokeAsyncFunc((err, res) => {
    if(err) reject(err)
    else resolve(res)
  })
})
```

The executor of the Task is not started at the Task creation. It means no side
effect takes place at this moment yet. To effectively start a Task, you must
invoke its `run` method

```js
// Execution starts from here
myTask.run(onSuccess, onError, onCancel)
```

### Tasks are Cancellable

After a Task has been started, it can be cancelled using the returned [Future](https://yelouafi.github.io/avenir/Future.html)

```js
// Execution starts from here
const future = myTask.run(onSuccess, onError, onCancel)

// ... after some time
future.cancel('some reason')
```

You can use [Task#then](https://yelouafi.github.io/avenir/Task.html#then)
to chain another step

```js
const myWholeTask = myTask.then(...)
```

myWholeTask is a new Task that describes the whole sequence. So when starting it

```js
// Task#fork is the same as Task#run but does not take callbcaks
const future = myWholeTask.fork()
```

Cancelling the returned future will cancel the whole sequence. Due to their lazy
nature, Tasks give an unambiguous meaning to cancellation.

### Tasks are Joinable

Sometimes a Task needs to *join* the result of an already started Task (ie a Future).
This can happen if, for example,  the 2 Tasks are started from 2 unrelated
contexts (like 2 events handlers in separate UIs).

For example suppose we have a login Task that is started when the user clicks on
a UI button

```js
const loginTask = Task.from((resolve, reject, cancel) => {
  api.authorize((err, ok) => {
    // attach a cancellation from the source
    onCancelLoginClick(() => cancel('Login cancelled'))
    if(err) reject(err)
    else resolve(ok)
  })
})


let loginFuture

function loginClickHandler() {
  loginFuture = loginTask.run(onSuccess, onReject, onCancel)
}
```

In another part of the UI, we want to start fetching something but only after the
login succeds. We can use [Task.join](https://yelouafi.github.io/avenir/Task.html#.join)
to wait for loginFuture to finish

```js
// Task.do allows using Generator syntax
const fetchDataTask = Task.do(function*() {
  yield Task.join(loginFuture)
  const data = yield myFetchTask
  return data
})
```

Above, we used the Generator syntax to describe the operation. We wait for loginFuture
to resolve before continuing. If the login task was cancelled (either by invoking
`loginFuture.cancel()` or by the loginTask itself if the user clicks on a CancelLogin
button) then the fetchDataTask will be cancelled as well.

Observe that if we cancel fetchDataTask for some other reason while we're
still waiting for loginFuture

```js
const future = fetchDataTask.fork()

// for some reason later
future.cancel('some reason')

```

Then this will only affect fetchDataTask and not loginTask. Cancelling the result
of `Task.join(loginFuture)` (which is itself a Task) will only unsubscribe from
the result of loginFuture. The loginTask stays unaffected.

# Documentation

[API Docs](https://yelouafi.github.io/avenir/)
