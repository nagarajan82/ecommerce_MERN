const config = require('../config/env');

const VALID_LEVELS = new Set(['error', 'warn', 'info']);

function isValidTimestamp(val) {
  if (typeof val !== 'string' || !val.trim()) return false;
  const time = Date.parse(val);
  return !isNaN(time);
}

function validateEvent(event, index = null) {
  const prefix = index !== null ? `Item [${index}]: ` : '';
  const errors = [];

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return [`${prefix}Log event must be an object`];
  }

  // Required: id
  if (typeof event.id !== 'string' || !event.id.trim()) {
    errors.push(`${prefix}Field 'id' is required and must be a non-empty string`);
  }

  // Required: timestamp
  if (!isValidTimestamp(event.timestamp)) {
    errors.push(`${prefix}Field 'timestamp' is required and must be a valid ISO 8601 timestamp string`);
  }

  // Required: level
  if (typeof event.level !== 'string' || !VALID_LEVELS.has(event.level.toLowerCase())) {
    errors.push(`${prefix}Field 'level' must be one of: ${Array.from(VALID_LEVELS).join(', ')}`);
  }

  // Required: appName
  if (typeof event.appName !== 'string' || !event.appName.trim()) {
    errors.push(`${prefix}Field 'appName' is required and must be a non-empty string`);
  }

  // Required: message
  if (typeof event.message !== 'string') {
    errors.push(`${prefix}Field 'message' is required and must be a string`);
  }

  // Optional: category
  if (event.category !== undefined && typeof event.category !== 'string') {
    errors.push(`${prefix}Field 'category' must be a string if provided`);
  }

  // Optional: environment
  if (event.environment !== undefined && typeof event.environment !== 'string') {
    errors.push(`${prefix}Field 'environment' must be a string if provided`);
  }

  // Optional: metadata
  if (event.metadata !== undefined && (typeof event.metadata !== 'object' || event.metadata === null || Array.isArray(event.metadata))) {
    errors.push(`${prefix}Field 'metadata' must be a plain object if provided`);
  }

  // Optional: duplicateCount
  if (event.duplicateCount !== undefined && (!Number.isInteger(event.duplicateCount) || event.duplicateCount < 1)) {
    errors.push(`${prefix}Field 'duplicateCount' must be a positive integer if provided`);
  }

  return errors;
}

function validateLogPayload(req, res, next) {
  const body = req.body;

  if (!body) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['Request body cannot be empty']
    });
  }

  let rawEvents;
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: ['Batch cannot be empty']
      });
    }
    if (body.length > config.maxBatchSize) {
      return res.status(400).json({
        error: 'Validation failed',
        details: [`Batch size (${body.length}) exceeds maximum limit of ${config.maxBatchSize}`]
      });
    }
    rawEvents = body;
  } else if (typeof body === 'object' && body !== null) {
    rawEvents = [body];
  } else {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['Payload must be a log event object or an array of log events']
    });
  }

  const allErrors = [];
  const normalizedEvents = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const raw = rawEvents[i];
    const itemErrors = validateEvent(raw, Array.isArray(body) ? i : null);
    if (itemErrors.length > 0) {
      allErrors.push(...itemErrors);
    } else {
      normalizedEvents.push({
        id: raw.id.trim(),
        timestamp: raw.timestamp,
        level: raw.level.toLowerCase(),
        category: (raw.category && typeof raw.category === 'string') ? raw.category.trim() : 'application',
        appName: raw.appName.trim(),
        environment: (raw.environment && typeof raw.environment === 'string') ? raw.environment.trim() : (process.env.NODE_ENV || 'development'),
        message: raw.message,
        metadata: (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) ? raw.metadata : {},
        duplicateCount: Number.isInteger(raw.duplicateCount) ? raw.duplicateCount : 1
      });
    }
  }

  if (allErrors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: allErrors
    });
  }

  req.validatedEvents = normalizedEvents;
  next();
}

module.exports = {
  validateLogPayload,
  validateEvent,
  isValidTimestamp
};
