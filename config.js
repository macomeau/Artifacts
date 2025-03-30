/**
 * @fileoverview Configuration settings for ArtifactsMMO API client.
 * @module config
 */

// Import the final, loaded configuration object from env-loader
const envConfig = require('./env-loader');

// Note: db also requires env-loader, but the flag prevents multiple loads.
// We don't strictly need db here anymore unless config needs DB values.
// const db = require('./db');

/**
 * Validates and prepares the final configuration object.
 * @throws {Error} If required environment variables are not set in the loaded config
 */
function prepareConfig() {
  // Determine character name logic (can still use process.argv if needed, but prefer envConfig)
  const character = (() => {
    // For test environment
    if (envConfig.NODE_ENV === 'test') {
      return 'test_character';
    }

    // Prefer DEFAULT_CHARACTER from the loaded env config
    if (envConfig.DEFAULT_CHARACTER) {
        return envConfig.DEFAULT_CHARACTER;
    }

    // Fallback: Check environment variable (less ideal now)
    const charName = process.env.control_character; // Keep this for backward compat? Or remove? Let's keep for now.
    if (charName && typeof charName === 'string' && charName.trim() !== '') {
      return charName;
    }
    
    // Check command line arguments for a character name
    // Format: node script.js characterName
    try {
      const scriptArgs = process.argv.slice(2);
      if (scriptArgs.length > 0 && scriptArgs[0].trim() !== '') {
        console.log(`Using character name from command line: ${scriptArgs[0]}`);
        return scriptArgs[0];
      }
    } catch (e) {
      // Ignore errors when accessing process.argv
    }

    // If no character name found, return undefined
    // API functions might handle this or throw errors later.
    console.warn('WARN: No default character name specified in environment files (DEFAULT_CHARACTER).');
    return undefined;
  })();

  const token = envConfig.API_TOKEN || ''; // Use token from loaded config (which is ARTIFACTS_API_TOKEN from process.env)

  // Validate that token is set
  if (!token && envConfig.NODE_ENV !== 'test') {
    throw new Error('FATAL: ARTIFACTS_API_TOKEN environment variable is not set in the loaded environment configuration.');
  }

  // Construct the final config object
  const finalConfig = {
    server: 'https://api.artifactsmmo.com',
    // Use test token only if in test mode AND no token was loaded
    token: token || (envConfig.NODE_ENV === 'test' ? 'test_token' : ''),
    // Use the determined character name
    character: character,
    // Pass through other useful values if needed
    accountName: envConfig.ACCOUNT_NAME,
    nodeEnv: envConfig.NODE_ENV,
  };

  return finalConfig;
}

// Prepare and export the final config object immediately
const config = prepareConfig();

/**
 * Module exports the prepared configuration object
 * @exports config
 */
module.exports = config;
