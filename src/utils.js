const { ERR_BAD_ARG } = require("./constants");

const nodeEnv = typeof process !== "undefined" && process.env.NODE_ENV;
const isDev = nodeEnv === "development";

const isFunc = (exports.isFunc = x => typeof x === "function");
exports.isGen = x => x && isFunc(x.next) && isFunc(x.throw) && isFunc(x.return);
exports.noop = () => {};
exports.ident = x => x;
exports.pipe = (f, g) => x => g(f(x));
exports.curry2 = f => x => y => f(x, y);
exports.raise = e => {
  throw e;
};

exports.append = (xs, x) => {
  let ys = xs.slice();
  ys.push(x);
  return ys;
};

const LOG_NOTHING = 0;
const LOG_ERRORS = 1;
const LOG_WARNINGS = 2;
const LOG_INFOS = 3;

var logLevel = isDev ? LOG_WARNINGS : LOG_ERRORS;

const logger = (exports.logger = {});

logger.disable = () => (logLevel = LOG_NOTHING);
logger.enableInfos = () => (logLevel = LOG_INFOS);
logger.enableWarnings = () => (logLevel = LOG_WARNINGS);

logger.info = function logInfo(message) {
  /* eslint-disable no-console */
  if (logLevel >= LOG_INFOS) console.info(message);
};

logger.warn = function logWarning(message) {
  /* eslint-disable no-console */
  if (logLevel >= LOG_WARNINGS) console.warn(message);
};

logger.error = function logError(err) {
  /* eslint-disable no-console */
  if (logLevel >= LOG_ERRORS) {
    console.error(err && err.message ? err.message : err);
  }
};

const assert = (exports.assert = (cond, msg) => {
  if (!cond) {
    const err = new TypeError(msg);
    logger.error(err);
    throw err;
  }
});

exports.assertFunc = arg => {
  assert(isFunc(arg), ERR_BAD_ARG);
};
