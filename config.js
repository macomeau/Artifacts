/**
 * @fileoverview Configuration settings for ArtifactsMMO API client.
 * @module config
 */

// Load environment variables first, ensuring env-loader is initialized
const envLoader = require('./env-loader');
// Reload env variables to ensure we get the latest from any custom env file
envLoader.loadEnv();

const db = require('./db');

/**
 * Configuration object for ArtifactsMMO API
 * @type {Object}
 * @property {string} server - API server URL
 * @property {string} token - API authentication token from environment variables
 * @property {string} character - Character name to use for API requests
 * @throws {Error} If required environment variables are not set
 */
const config = {
  server: 'https://api.artifactsmmo.com',
  // Load token from environment variables
  token: process.env.ARTIFACTS_API_TOKEN || '',
  // Character name can be set via environment variable, with various fallbacks
  character: (() => {
    // For test environment
    if (process.env.NODE_ENV === 'test') {
      return 'test_character';
    }
    
    // Check environment variable
    const charName = process.env.control_character;
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
    
    // If no character name found from env or args, return undefined
    // The calling script or validation should handle this case.
    console.warn('WARN: No character name specified via environment variable (control_character) or command line argument.');
    console.warn('TIP: To specify a character, either:');
    console.warn('  1. Set the control_character environment variable');
    console.warn('  2. Pass the character name as the first command line argument');
    return undefined; // Explicitly return undefined
  })(),
};

// Validate that token is set
if (!config.token) {
  if (process.env.NODE_ENV === 'test') {
    config.token = 'test_token'; // Keep test token for convenience
  } else {
    // Throw an error if the token is not set in non-test environments
    throw new Error('FATAL: ARTIFACTS_API_TOKEN environment variable is not set.');
  }
}

/**
 * Module exports
 * @exports config
 */
module.exports = config;
