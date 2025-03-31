const db = require('./db');
// Import getCharacterDetails here to avoid circular dependency issues if api.js also imports utils.js
// We'll require it inside the function where needed.
// const { getCharacterDetails } = require('./api'); 

/**
 * Promise-based sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse coordinates from string format "(x,y)" to numbers
 * @param {string} coordString - Coordinates in string format "(x,y)"
 * @returns {Object} - Object with x and y properties
 */
function parseCoordinates(coordString) {
  // Remove parentheses and split by comma
  const coordMatch = coordString.match(/\((-?\d+),(-?\d+)\)/);
  
  if (!coordMatch) {
    throw new Error('Invalid coordinate format. Use format "(x,y)" e.g. "(2,0)"');
  }
  
  return {
    x: parseInt(coordMatch[1], 10),
    y: parseInt(coordMatch[2], 10)
  };
}

/**
 * Handle cooldown by checking character details and waiting if necessary
 * @param {string|number} characterNameOrCooldown - Character name or direct cooldown seconds
 * @returns {Promise<void>} - Promise that resolves after cooldown
 */
async function handleCooldown(characterNameOrCooldown) {
  let cooldownSeconds = 0;
  let characterName = null;

  if (typeof characterNameOrCooldown === 'number') {
    cooldownSeconds = characterNameOrCooldown;
  } else if (typeof characterNameOrCooldown === 'string') {
    characterName = characterNameOrCooldown;
    try {
      // Dynamically require api here to avoid potential circular dependencies at module load time
      const { getCharacterDetails } = require('./api'); 
      console.log(`[handleCooldown] Checking details for ${characterName} to determine cooldown...`);
      const details = await getCharacterDetails(characterName);
      
      // Calculate remaining cooldown based on expiration time for accuracy
      if (details.cooldown_expiration) {
        const now = new Date();
        const expirationDate = new Date(details.cooldown_expiration);
        const remainingMs = expirationDate - now;
        cooldownSeconds = Math.max(0, remainingMs / 1000);
      } else {
        // Fallback to cooldown value if expiration is not present
        cooldownSeconds = details.cooldown || 0;
      }
      
      if (cooldownSeconds > 0) {
        console.log(`[handleCooldown] Determined cooldown for ${characterName}: ${cooldownSeconds.toFixed(1)} seconds.`);
      } else {
         console.log(`[handleCooldown] No active cooldown found for ${characterName}.`);
      }
      
    } catch (error) {
      console.error(`[handleCooldown] Failed to get character details for ${characterName}: ${error.message}`);
      // Proceed without waiting if details fail, the action itself might handle cooldown error
      return; 
    }
  } else {
     console.warn(`[handleCooldown] Received invalid argument type: ${typeof characterNameOrCooldown}. Skipping cooldown check.`);
     return; // Don't wait if input is invalid
  }

  if (cooldownSeconds > 0) {
    const waitMs = cooldownSeconds * 1000 + 500; // Add 500ms buffer
    console.log(`[handleCooldown] Waiting ${cooldownSeconds.toFixed(1)} seconds (actual wait: ${waitMs}ms)...`);
    await sleep(waitMs);
  }
}

/**
 * Extract cooldown time from error message
 * @param {Error} error - The error object to parse
 * @returns {number} Cooldown time in seconds, or 0 if not found
 */
function extractCooldownTime(error) {
  if (!error || !error.message) return 0;
  
  // Parse cooldown time from error message
  const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.?\d*) seconds? left/);
  if (cooldownMatch && cooldownMatch[1]) {
    return parseFloat(cooldownMatch[1]);
  }
  
  // Alternative message format
  const altMatch = error.message.match(/cooldown: (\d+\.?\d*)/);
  if (altMatch && altMatch[1]) {
    return parseFloat(altMatch[1]);
  }
  
  // Try to extract from JSON error
  try {
    if (error.message.includes('{')) {
      const jsonStr = error.message.substring(error.message.indexOf('{'));
      const errorJson = JSON.parse(jsonStr);
      
      if (errorJson?.error?.message && typeof errorJson.error.message === 'string') {
        const jsonMsgMatch = errorJson.error.message.match(/Character in cooldown: (\d+\.?\d*) seconds? left/);
        if (jsonMsgMatch && jsonMsgMatch[1]) {
          return parseFloat(jsonMsgMatch[1]);
        }
      }
    }
  } catch (e) {
    // Ignore JSON parsing errors
  }
  
  return 0;
}

/**
 * Check if inventory is full and handle deposit if needed
 * @param {Object} characterDetails - Character details object
 * @returns {boolean} - True if inventory was full and items were deposited
 */
async function checkInventory(characterDetails) {
  if (!characterDetails.inventory || !characterDetails.inventory_max_items) return false;
  
  try {
    // Store inventory snapshot
    await db.query(
      `INSERT INTO inventory_snapshots(character, items)
       VALUES ($1, $2)`,
      [characterDetails.name, JSON.stringify(characterDetails.inventory)]
    );
  } catch (error) {
    console.error('Failed to save inventory snapshot:', error.message);
  }

  // Calculate total number of items in inventory
  const totalItems = characterDetails.inventory.reduce((sum, slot) => {
    return sum + (slot?.quantity || 0);
  }, 0);
  
  return totalItems >= characterDetails.inventory_max_items;
}

/**
 * Execute a function with retry logic and exponential backoff for handling cooldowns and rate limiting
 * @param {Function} fn - The function to execute
 * @param {number} [maxRetries=5] - Maximum number of retry attempts
 * @param {number} [initialDelay=1000] - Initial delay in ms before first retry
 * @param {number} [maxDelay=10000] - Maximum delay in ms between retries
 * @returns {Promise<any>} - Result of the function execution
 */
async function withRetry(fn, maxRetries = 5, initialDelay = 1000, maxDelay = 10000) {
  let retries = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      // Extract cooldown time if present in error message
      const cooldownTime = extractCooldownTime(error);
      
      // If we have a specific cooldown time, use that instead of exponential backoff
      if (cooldownTime > 0) {
        console.log(`Retrying after cooldown: ${cooldownTime} seconds...`);
        await sleep((cooldownTime * 1000) + 500); // Add 500ms buffer
        continue;
      }
      
      // Check if we've exceeded max retries
      if (retries >= maxRetries) {
        throw error; // Rethrow if we've exhausted retries
      }
      
      retries++;
      console.log(`Retry attempt ${retries}/${maxRetries}. Waiting ${delay}ms...`);
      await sleep(delay);
      
      // Exponential backoff with jitter
      delay = Math.min(delay * 1.5 + Math.random() * 1000, maxDelay);
    }
  }
}

module.exports = {
  parseCoordinates,
  handleCooldown,
  extractCooldownTime,
  checkInventory,
  withRetry,
  sleep
};
