/**
 * @fileoverview Configuration settings for ArtifactsMMO API client.
 * @module config
 */

// Ensure env-loader runs when this module is loaded.
// It modifies the global process.env object.
require('./env-loader');

// Note: db also requires env-loader, but the flag prevents multiple loads.
const db = require('./db');

/**
 * Returns the configuration object, reading environment variables dynamically.
 * Ensures that the latest values from process.env (potentially overridden by env-loader) are used.
 * @returns {Object} Configuration object
 * @throws {Error} If required environment variables are not set
 */
function getConfig() {
  const character = (() => {
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
  })();

  const token = process.env.ARTIFACTS_API_TOKEN || '';

  // Validate that token is set
  if (!token && process.env.NODE_ENV !== 'test') {
    throw new Error('FATAL: ARTIFACTS_API_TOKEN environment variable is not set.');
  }

  return {
    server: 'https://api.artifactsmmo.com',
    token: token || (process.env.NODE_ENV === 'test' ? 'test_token' : ''), // Use test token only if needed
    character: character,
  };
}


/**
 * Module exports
 * @exports getConfig
 */
module.exports = getConfig;
