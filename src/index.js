import Task from "./Task";
import Future from "./Future";

function delayF(ms, v) {
  return new Future(res => {
    const tid = setTimeout(() => res(v), ms);
    return () => {
      clearTimeout(tid);
    };
  });
}

function delay(ms, val) {
  return new Task(() => delayF(ms, val));
}

export { Task, Future, delay, delayF };
