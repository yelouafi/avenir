const Future = require("./Future");
const Task = require("./task");

exports.Future = Future;
exports.Task = Task;

exports.delay = function delay(ms, v) {
  return new Future(res => {
    const tid = setTimeout(() => res(v), ms);
    return () => {
      clearTimeout(tid);
    };
  });
};
