# avenir

Lightweight async library based on lazy Futures. Inspired by
[folktale's Data.Task](https://github.com/folktale/data.task)

The library provides `Tasks` for writing asynchronous code with JavaScript in
Node and the Browser.

Unlike Promises, the standard async abstraction, Tasks are _lazy_ and _cancellable_.

Although the model follows Data.Task, avenir adopts some different
[design decision](comparison.md).

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

Now a not-so-dumb answer is that we should choose how to cancel depending on the
situation. But the problem is precisely how do we infer this situation. Promises,
by nature, denote only one step on the operation. A Promise, once created,
lacks the *context* in which it is itself composed with other Promises to build
a control flow. So we can not simply implement a `cancel` method in the Promise
prototype because we do not have enough information to interpret the meaning of
the cancellation.

One possible solution is to extract out the cancellation capability into a first
class value. For example we can create some token and then pass it down
to all async operations that construct Promises. The creator of the token can
request the cancellation at any moment. The async operations that have
received the token can then be notified of the cancellation. This is the
solution that was planned to be implemented into the TC39 standard (but was
dropped because of lack of consensus).

We can view the token based solution as an indirect way to describe chained
steps as a whole unit. A created cancel token denote itself the whole operation
and all async functions that receive the token are part of the unit.

Another solution, which IMHO is simpler, more composable and ergonomic is by
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
describe the control glow (like `then`/`chain`, `all`, `race` ...)

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

Observe that if we cancel fetchDataTask for some other reason while we'reason
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
