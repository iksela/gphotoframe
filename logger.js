const originalLog = console.log;
const originalError = console.error;

function getTimestamp() {
    return new Date().toISOString();
}

function patch() {
    console.log = function (...args) {
        originalLog(`[${getTimestamp()}]`, ...args);
    };
    console.error = function (...args) {
        originalError(`[${getTimestamp()}]`, ...args);
    };
}

module.exports = { patch };
