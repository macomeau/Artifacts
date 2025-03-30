/**
 * @fileoverview Shared environment variable loader that supports custom .env files
 * @module env-loader
 */

const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

/**
 * Load environment variables from the default .env file and optionally a custom file
 * @returns {Object} The loaded environment variables
 */
function loadEnv() {
  // First load the default .env file
  dotenv.config();
  
  // Check if a custom env file was specified
  let customEnvFile = null;
  
  // Check environment variable (set by parent process)
  if (process.env.CUSTOM_ENV_FILE) {
    customEnvFile = process.env.CUSTOM_ENV_FILE;
  }
  
  // Check command line args (--env=filename.env)
  if (!customEnvFile) {
    const envArg = process.argv.find(arg => arg.startsWith('--env='));
    if (envArg) {
      customEnvFile = envArg.split('=')[1];
    }
  }
  
  // Load the custom env file if specified
  if (customEnvFile) {
    try {
      // Resolve relative paths against the project root
      const resolvedPath = path.resolve(process.cwd(), customEnvFile);
      
      if (fs.existsSync(resolvedPath)) {
        console.log(`Loading custom environment from: ${resolvedPath}`);
        const customEnv = dotenv.parse(fs.readFileSync(resolvedPath));
        
        // Override process.env with values from custom file
        for (const key in customEnv) {
          process.env[key] = customEnv[key];
        }
      } else {
        console.error(`Warning: Custom environment file not found: ${resolvedPath}`);
      }
    } catch (error) {
      console.error(`Error loading custom environment file: ${error.message}`);
    }
  }
  
  return process.env;
}

// Load environment variables immediately when this module is imported
loadEnv();

/**
 * Module exports
 * @exports env-loader
 */
module.exports = {
  loadEnv
};