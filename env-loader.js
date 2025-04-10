/**
 * @fileoverview Shared environment variable loader that supports custom .env files
 * @module env-loader
 */

const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

let envLoaded = false; // Flag to prevent multiple executions

/**
 * Load environment variables from the default .env file and optionally a custom file
 * @returns {Object} The loaded environment variables (primarily modifies global process.env)
 */
function loadEnv() {
  if (envLoaded) {
    // console.log("[EnvLoader] Environment already loaded."); // Optional: uncomment for debugging
    return process.env;
  }

  // 1. Load the default .env file. Do NOT override existing env vars initially.
  dotenv.config();
  console.log("[EnvLoader] Loaded default .env file.");

  // 2. Determine the custom env file path
  let customEnvFile = null;
  // Check environment variable (set by parent process for child scripts)
  if (process.env.CUSTOM_ENV_FILE) {
    customEnvFile = process.env.CUSTOM_ENV_FILE;
    console.log(`[EnvLoader] Using custom env path from CUSTOM_ENV_FILE: ${customEnvFile}`);
  }
  // Check command line args (--env=filename.env) for the main GUI process
  if (!customEnvFile) {
    const envArg = process.argv.find(arg => arg.startsWith('--env='));
    if (envArg) {
      customEnvFile = envArg.split('=')[1];
      console.log(`[EnvLoader] Using custom env path from --env arg: ${customEnvFile}`);
    }
  }

  // 3. Load the custom env file if specified, allowing it to OVERRIDE existing vars
  if (customEnvFile) {
    try {
      const resolvedPath = path.resolve(process.cwd(), customEnvFile);
      if (fs.existsSync(resolvedPath)) {
        console.log(`[EnvLoader] Loading and overriding with custom environment from: ${resolvedPath}`);
        // Use dotenv.config with override option for the custom file
        dotenv.config({ path: resolvedPath, override: true });
      } else {
        console.error(`[EnvLoader] Warning: Custom environment file not found: ${resolvedPath}`);
      }
    } catch (error) {
      console.error(`[EnvLoader] Error loading custom environment file: ${error.message}`);
    }
  } else {
    console.log("[EnvLoader] No custom environment file specified or found. Using default .env values (or existing environment).");
  }

  // Optional: Log key variables after loading to verify correct override
  if (process.env.NODE_ENV !== 'production') {
      console.log(`[EnvLoader] Final ACCOUNT_NAME: ${process.env.ACCOUNT_NAME}`);
      // Log the correct variable and indicate if it's set
      console.log(`[EnvLoader] Final ARTIFACTS_API_TOKEN is ${process.env.ARTIFACTS_API_TOKEN ? 'set' : 'not set'}`);
      console.log(`[EnvLoader] Final DEFAULT_CHARACTER: ${process.env.DEFAULT_CHARACTER}`);
  }

  envLoaded = true; // Set flag after successful load

  // Construct and return an object with the final values, using the correct token variable name
  const finalEnv = {
    ACCOUNT_NAME: process.env.ACCOUNT_NAME,
    API_TOKEN: process.env.ARTIFACTS_API_TOKEN, // Ensure this matches the name in your .env files
    DEFAULT_CHARACTER: process.env.DEFAULT_CHARACTER,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    // Add any other relevant env vars your app uses directly
  };
  return finalEnv;
}

// Load environment variables immediately and export the resulting object
const loadedConfig = loadEnv();

/**
 * Module exports the final loaded configuration object
 * @exports loadedConfig
 */
module.exports = loadedConfig;
