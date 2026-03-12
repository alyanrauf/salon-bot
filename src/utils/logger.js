function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(...args) {
    console.log(`[${timestamp()}] INFO`, ...args);
  },
  error(...args) {
    console.error(`[${timestamp()}] ERROR`, ...args);
  },
  warn(...args) {
    console.warn(`[${timestamp()}] WARN`, ...args);
  },
};

module.exports = logger;
