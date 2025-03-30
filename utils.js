const db = require('./db');

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
 * Handle cooldown by waiting the specified time
 * @param {number} cooldownSeconds - Number of seconds to wait
 * @returns {Promise} - Promise that resolves after cooldown
 */
async function handleCooldown(cooldownSeconds) {
  if (cooldownSeconds > 0) {
    console.log(`Waiting ${cooldownSeconds.toFixed(1)} seconds for cooldown...`);
    await sleep(cooldownSeconds * 1000 + 500); // Add 500ms buffer
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
