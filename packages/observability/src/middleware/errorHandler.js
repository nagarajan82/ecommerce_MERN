function createErrorHandler(logger) {
  return function errorHandler(err, req, res, next) {
    const statusCode = Number(err.statusCode || err.status || 500);
    const message = err.message || 'Internal Server Error';

    if (logger && typeof logger.error === 'function') {
      logger.error(`HTTP ${statusCode} - ${message}`, {
        correlationId: req.correlationId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: statusCode,
        error: err
      });
    }

    if (res.headersSent) {
      return next(err);
    }

    const clientResponse = {
      message: statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : message
    };

    if (req.correlationId) {
      clientResponse.correlationId = req.correlationId;
    }

    return res.status(statusCode).json(clientResponse);
  };
}

module.exports = {
  createErrorHandler
};
