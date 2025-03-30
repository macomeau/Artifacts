/**
 * @fileoverview Centralized configuration for the ArtifactsMMO Client
 * @module config
 */

// Ensure DEFAULT_CHARACTER is loaded from environment
const defaultCharacter = process.env.DEFAULT_CHARACTER;
if (!defaultCharacter && process.env.NODE_ENV !== 'test') {
  // Allow tests to run without it, but require it otherwise
  console.warn('WARN: DEFAULT_CHARACTER environment variable is not set. GUI fallbacks may not work as expected.');
  // Consider throwing an error if a default is strictly required:
  // throw new Error('FATAL: DEFAULT_CHARACTER environment variable is required.');
}

module.exports = {
  port: process.env.GUI_PORT || 3000,
  // Use environment variable, fallback to undefined if not set
  defaultCharacter: defaultCharacter || undefined,
  taskCleanupDays: 7,
  processTTL: 5 * 60 * 1000, // 5 minutes
  security: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  },
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100
  },
  validation: {
    scripts: [
      'copper-mining-loop',
      'iron-mining-loop',
      'woodcutting-loop',
      'fishing-loop',
      'combat-loop'
    ]
  },
  dbPool: {
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000
  }
};
