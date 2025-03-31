/**
 * @fileoverview Centralized configuration for the ArtifactsMMO Client
 * @module config
 */

// Ensure the correct environment is loaded before reading process.env!
require('../env-loader'); // Use relative path from config/ to root

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
      'air-boost-potion-loop',
      'ash-harvesting-loop',
      'bass-harvesting-loop',
      'birch-harvesting-loop',
      'coal-mining-loop',
      'combat-loop', // Generic combat loop
      'cook-bass-loop',
      'cook-gudgeon-loop',
      'cook-salmon-loop',
      'cook-shrimp-loop',
      'cook-trout-loop',
      'cook-wolf-meat-loop',
      'copper-bar-crafting-loop',
      'copper-mining-loop',
      'copper-ring-crafting-loop',
      'deadwood-harvesting-loop',
      'fight-loop',
      'fight-loop-with-heal',
      'fishing-loop', // Generic fishing loop
      'gathering-loop',
      'glowstem-harvesting-loop',
      'go-fight-heal-loop',
      'go-gather-loop',
      'gold-mining-loop',
      'gudgeon-harvesting-loop',
      'hardwood-plank-crafting-loop',
      'health-potion-loop',
      'iron-bar-crafting-loop',
      'iron-dagger-crafting-loop',
      'iron-mining-loop',
      'iron-ring-crafting-loop',
      'iron-sword-crafting-loop',
      'leather-boots-crafting-loop',
      'maple-harvesting-loop',
      'minor-health-potion-loop',
      'mithril-mining-loop',
      'nettle-harvesting-loop',
      'salmon-harvesting-loop',
      'shrimp-harvesting-loop',
      'spruce-harvesting-loop',
      'steel-bar-crafting-loop',
      'strange-ore-mining-loop',
      'strange-wood-harvesting-loop',
      'sunflower-harvesting-loop',
      'trout-harvesting-loop',
      'woodcutting-loop' // Generic woodcutting loop
    ]
  },
  dbPool: {
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    max: parseInt(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000
  }
};
