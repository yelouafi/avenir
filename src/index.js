const Future = require("./Future");
const Task = require("./Task");

exports.Future = Future;
exports.Task = Task;

const delayF = exports.delayF = function delay(ms, v) {
  return new Future(res => {
    const tid = setTimeout(() => res(v), ms);
    return () => {
      clearTimeout(tid);
    };
  });
};

exports.delay = function delay(ms, val) {
  return new Task(() => delayF(ms, val))
}
