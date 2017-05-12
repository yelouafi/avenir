exports.E_FUN_ARG = "argument is not a function";
exports.E_BAD_SEQUENCE = "trying to complete an alreay completed Future";

const PENDING = "PENDING";
const RESOLVED = "RESOLVED";
const REJECTED = "REJECTED";
const CANCELLED = "CANCELLED";

exports.Status = {
  PENDING,
  RESOLVED,
  REJECTED,
  CANCELLED
};
