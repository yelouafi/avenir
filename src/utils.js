import { E_FUN_ARG } from "./constants";

const isDev = process.env.NODE_ENV === "development";

export const isFunc = x => typeof x === "function";
export const isGen = x =>
  x && isFunc(x.next) && isFunc(x.throw) && isFunc(x.return);
export const noop = () => {};
export const ident = x => x;
export const pipe = (f, g) => x => g(f(x));
export const curry2 = f => x => y => f(x, y);
export const raise = e => {
  throw e;
};

export const append = (xs, x) => {
  let ys = xs.slice();
  ys.push(x);
  return ys;
};

const LOG_NOTHING = 0;
const LOG_ERRORS = 1;
const LOG_WARNINGS = 2;
const LOG_INFOS = 3;

var logLevel = isDev ? LOG_WARNINGS : LOG_ERRORS;

export const logger = {
  disable: () => (logLevel = LOG_NOTHING),
  enableInfos: () => (logLevel = LOG_INFOS),
  enableWarnings: () => (logLevel = LOG_WARNINGS),

  info(message) {
    /* eslint-disable no-console */
    if (logLevel >= LOG_INFOS) console.info(message);
  },

  warn(message) {
    /* eslint-disable no-console */
    if (logLevel >= LOG_WARNINGS) console.warn(message);
  },

  error(err) {
    /* eslint-disable no-console */
    if (logLevel >= LOG_ERRORS) {
      console.error(err && err.message ? err.message : err);
    }
  }
};

export const assert = (cond, msg) => {
  if (!cond) {
    const err = new TypeError(msg);
    logger.error(err);
    throw err;
  }
};

export const assertFunc = arg => {
  assert(isFunc(arg), E_FUN_ARG);
};
