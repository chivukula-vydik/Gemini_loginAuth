// Wrap an async Express handler so rejected promises are forwarded to the
// error-handling middleware instead of becoming an unhandled rejection
// (which, on modern Node, would crash the process).
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
