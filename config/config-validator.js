/**
 * @fileoverview Configuration validation for ArtifactsMMO Client
 * @module config-validator
 */

const Joi = require('joi');
const config = require('./config');

const schema = Joi.object({
  port: Joi.number().port().required(),
  // Default character is now optional in the config object itself (comes from env),
  // but we still validate its format if present using optional().
  // If required, add .required() here instead of .optional().
  defaultCharacter: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).optional(),
  taskCleanupDays: Joi.number().integer().min(1).required(),
  processTTL: Joi.number().integer().min(1000).required(), // Added validation for processTTL (in ms)
  dbPool: Joi.object({
    min: Joi.number().min(1).max(20).required(),
    max: Joi.number().min(2).max(100).required(),
    idleTimeoutMillis: Joi.number().min(1000).required()
  }).required(),
  security: Joi.object({
    contentSecurityPolicy: Joi.object({
      directives: Joi.object().required()
    }).required()
  }).required(),
  rateLimiting: Joi.object({
    windowMs: Joi.number().integer().min(1000).required(), // Require windowMs as positive integer (ms)
    maxRequests: Joi.number().integer().min(1).required() // Require maxRequests as positive integer
  }).required(),
  validation: Joi.object({
    scripts: Joi.array().items(Joi.string()).required() // Require scripts as an array of strings
  }).required()
});

/**
 * Validate the application configuration
 * @throws {Error} If configuration is invalid
 */
function checkConfig() {
  const { error } = schema.validate(config);
  if (error) {
    throw new Error(`Config validation error: ${error.details[0].message}`);
  }
}

module.exports = {
  checkConfig
};
