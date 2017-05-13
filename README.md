# avenir

Lightweight async library based on lazy futures. Inspired by [folktale's Data.Task](https://github.com/folktale/data.task)

The library provides `Tasks` for writing asynchronous code with JavaScript in
Node and the Browser.

Unlike Promises, the standard async abstraction, Tasks are _lazy_ and _cancellable_.

Unlike Data.Task you can join results from other running Tasks which provides the
same multiple-consumer model of promises (attaching multiple thenables).

However, Tasks provides a strict ownership model of the control flow : The runner
of the  Task can cancel the running Task but the joiners of the running Task can not
cancel it, they only can unsubscribe from its outcome. This simplifies cancellation
semantics and avoids non trivial solutions provided by other multi-consumer solutions
(like reference counting).

### Tasks are Lazy

When you create and combine Tasks using various methods (`then`, `all`, `race`),
The executor of the Task is not started which means no side effect takes place at this
moment. To effectively start a Task, you must invoke its `run` method

```js
// Nothing happens here
const sumTask =
    delay(1000, 10).then(x =>
    delay(1000, 20).then(y =>
     x + y
    ))

// Execution starts from here
const future = sumTask.run(onSuccess, onError, onCancel)
```

### Tasks are Cancellable

After a Task has been started, it can be cancelled using the returned Future

```js
// using Generator syntax
const sumTask = Task.do(function*() {
    const x = yield delay(1000, 10)
    const y = yield delay(1000, 20)
    return x + y
})

// Execution starts from here
const future = sumTask.run(onSuccess, onError, onCancel)

// ... after some time
future.cancel('some reason')
```

### Tasks are Joinable

A task can join the result of another started Task

```js
const loginTask = Task.do(function*() {
  // ...
})

// fork run the task and returns the future of the Task
const loginFuture = loginTask.fork()

// The owner of the future can cancel it
cancelLoginButton.addEventListener(() => loginFuture.cancel('by user'))


// An auxiliary task
const fetchTask = Task.do(function*() {
  /*
    wait for login to complete.
    Rejection/cancellation of loginFuture will reject/cancel fetchTask
  */
  yield Task.join(loginFuture)
  // ... continue here
})
```

# Documentation

[API Docs](https://yelouafi.github.io/avenir/)
