/**
 * @fileoverview API client for ArtifactsMMO game server interactions
 * @module API
 */

const { sleep } = require('./utils');
const config = require('./config');
const db = require('./db');

/**
 * Sanitizes a character name to ensure it meets API requirements
 * @param {string} characterName - The character name to sanitize
 * @returns {string} - Sanitized character name that meets API pattern ^[a-zA-Z0-9_-]+$
 */
function sanitizeCharacterName(characterName) {
  if (!characterName) return config.character;
  
  // Remove any characters that aren't alphanumeric, underscore, or hyphen
  const sanitized = String(characterName).replace(/[^a-zA-Z0-9_-]/g, '');
  
  // If sanitization removed all characters, return default from config
  return sanitized || config.character;
}

/**
 * Makes an API request to the ArtifactsMMO server
 * @async
 * @param {string} endpoint - The API endpoint (without leading slash)
 * @param {string} [method='GET'] - HTTP method
 * @param {Object} [body=null] - Optional request body
 * @returns {Promise<Object>} API response data
 * @throws {Error} For network errors or non-2xx responses
 */
async function makeApiRequest(endpoint, method, body = null, characterName = null) {
  // Get character name, sanitize it, and ensure it meets API requirements
  const charName = sanitizeCharacterName(characterName || config.character);

  // Construct URL safely
  let url;
  if (endpoint) {
    url = `${config.server}/my/${encodeURIComponent(charName)}/${endpoint}`;
  } else {
    // If no endpoint is provided, just get the character details
    url = `${config.server}/my/${encodeURIComponent(charName)}`;
  }
  
  // Prepare request options
  const options = {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${config.token}`
    }
  };

  // Add body if provided
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  // --- Debug Logging ---
  console.log(`[API Request] Method: ${options.method}`);
  console.log(`[API Request] URL: ${url}`);
  // Mask token for security in logs
  const maskedHeaders = { ...options.headers };
  if (maskedHeaders.Authorization) {
    maskedHeaders.Authorization = `${maskedHeaders.Authorization.substring(0, 10)}...`; // Show "Bearer ..."
  }
  console.log(`[API Request] Headers: ${JSON.stringify(maskedHeaders)}`);
  if (options.body) {
    console.log(`[API Request] Body: ${options.body}`);
  }
  // --- End Debug Logging ---

  try {
    // Make the request
    const response = await fetch(url, options);

    // Check if the response is OK
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    // Parse the JSON response
    const data = await response.json();
    
    // Log successful request to database with enhanced coordinate handling
    // Use character coordinates directly from API response or try to get from nested data structure
    const coordX = data.character?.x || data.data?.character?.x || 0;
    const coordY = data.character?.y || data.data?.character?.y || 0;
    
    await db.query(
      `INSERT INTO action_logs(character, action_type, coordinates, result)
       VALUES ($1, $2, point($3,$4), $5)`,
      [
        charName,
        endpoint,
        coordX,
        coordY,
        data
      ]
    );
    
    // Return the data property if it exists, otherwise the whole response
    return {
      ...data,
      character: data.data?.character || data.character || null
    };
  } catch (error) {
    // Log the error for debugging
    console.error('API request failed:', error.message);
    
    // Get current position if possible
    const currentDetails = await getCharacterDetails(charName).catch(() => null);
    
    // Log error to database with enhanced coordinate handling
    // Extract coordinates safely from character details
    const coordX = currentDetails?.x || currentDetails?.character?.x || 
                 currentDetails?.data?.character?.x || 0;
    const coordY = currentDetails?.y || currentDetails?.character?.y || 
                 currentDetails?.data?.character?.y || 0;
    
    await db.query(
      `INSERT INTO action_logs(character, action_type, error, coordinates)
       VALUES ($1, $2, $3, point($4,$5))`,
      [
        charName,
        endpoint,
        error.message,
        coordX,
        coordY
      ]
    );
    
    // Re-throw the error for the caller to handle
    throw error;
  }
}

/**
 * Move the character to specified coordinates
 * @async
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Movement result
 * @throws {Error} For invalid coordinates or movement failures
 */
async function moveCharacter(x, y, characterName) {
  // Validate coordinates
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error('X and Y must be numbers');
  }
  
  // Sanitize the character name
  const charName = sanitizeCharacterName(characterName || config.character);
  console.log(`Moving character ${charName} to coordinates (${x}, ${y})...`);
  return makeApiRequest('action/move', 'POST', { x, y, character: charName }, charName);
}

/**
 * Initiate a fight action
 * @async
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Fight result
 * @throws {Error} For fight failures or if character is in cooldown
 */
async function fightAction(characterName) {
  const charName = sanitizeCharacterName(characterName || config.character);
  console.log(`Initiating fight action for character: ${charName}`);
  return makeApiRequest('action/fight', 'POST', { character: charName }, charName);
}

/**
 * Perform a gathering action
 * @async
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Gathering result
 * @throws {Error} For gathering failures or inventory full
 */
async function gatheringAction(characterName) {
  const charName = sanitizeCharacterName(characterName || config.character);
  console.log(`Initiating gathering action for character: ${charName}`);
  return makeApiRequest('action/gathering', 'POST', { character: charName }, charName);
}

/**
 * Perform a mining action
 * @async
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Mining result
 * @throws {Error} For mining failures or inventory full
 */
async function miningAction(characterName) {
  const charName = sanitizeCharacterName(characterName || config.character);
  console.log(`Initiating mining action for character: ${charName}`);
  // Assuming the endpoint is 'action/mining', adjust if different
  return makeApiRequest('action/mining', 'POST', { character: charName }, charName);
}

/**
 * Perform a rest action to recover HP
 * @async
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Rest result with updated character HP
 * @throws {Error} For rest failures or if character is in cooldown
 */
async function restAction(characterName) {
  const charName = sanitizeCharacterName(characterName || config.character);
  console.log(`Initiating rest action for character: ${charName}`);
  return makeApiRequest('action/rest', 'POST', { character: charName }, charName);
}

/**
 * Executes an action repeatedly with cooldown handling
 * @param {Function} actionFn - The action function to execute
 * @param {Function} onSuccess - Callback for successful execution
 * @param {Function} onError - Callback for error handling
 * @param {number} maxAttempts - Maximum number of attempts (0 for infinite)
 * @returns {Promise<void>}
 */
async function executeWithCooldown(actionFn, onSuccess, onError, maxAttempts = 0) {
  let attempts = 0;
  
  async function executeAction() {
    attempts++;
    
    try {
      const result = await actionFn();
      
      if (onSuccess) {
        // Wrap success handler in try/catch to prevent unhandled rejections
        try {
          await onSuccess(result);
        } catch (successError) {
          console.error('Error in success handler:', successError.message);
        }
      }

      // Handle cooldown scheduling
      const cooldownSeconds = result?.cooldown?.total_seconds || 1;
      console.log(`Scheduling next action in ${cooldownSeconds}s...`);
      
      if (maxAttempts === 0 || attempts < maxAttempts) {
        setTimeout(executeAction, cooldownSeconds * 1000);
      }
    } catch (error) {
      if (onError) {
        const errorResult = await onError(error, attempts);
        
        if (typeof errorResult === 'object') {
          if (errorResult.continueExecution && (maxAttempts === 0 || attempts < maxAttempts)) {
            setTimeout(executeAction, errorResult.retryDelay || 5000);
          }
        } else if (errorResult === true && (maxAttempts === 0 || attempts < maxAttempts)) {
          setTimeout(executeAction, 5000);
        }
      }
    }
  }
  
  // Start the execution loop
  await executeAction();
}

/**
 * Perform gathering actions in a loop with cooldown handling
 * @param {number} maxAttempts - Maximum number of attempts (0 for infinite)
 * @param {Function} onSuccess - Optional callback for successful gathering
 * @param {Function} onError - Optional callback for error handling
 * @returns {Promise<void>}
 */
async function gatheringLoopAction(maxAttempts = 0, onSuccess, onError) {
  return executeWithCooldown(
    gatheringAction,
    onSuccess || ((result) => {
      console.log('Gathering successful:');
      console.log(result);
    }),
    onError || ((error, attempts) => {
      console.error(`Gathering attempt ${attempts} failed:`, error.message);
      
      // If the error contains "inventory is full" or "no resource", stop the loop
      if (error.message.includes('inventory is full') || 
          error.message.includes('No resource on this map') ||
          error.message.includes('Resource not found')) {
        console.log('Stopping gathering loop due to resource or inventory limitation.');
        return false;
      }
      
      // Continue for other errors
      return true;
    }),
    maxAttempts
  );
}

/**
 * @typedef {Object} CraftingRequest
 * @property {string} code - Crafting recipe code
 * @property {number} quantity - Quantity to craft
 * @property {string} [character] - Character name
 */

/**
 * Perform a crafting action
 * @async
 * @param {string} code - Crafting recipe code
 * @param {number} quantity - Quantity to craft
 * @param {string} [material] - Required material code
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Crafting result
 * @throws {Error} For invalid parameters or crafting failures
 */
async function craftingAction(code = 'ITEM', quantity = 1, material, characterName) {
  if (!code) {
    throw new Error('Crafting recipe code is required');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  const charName = characterName || config.character;
  return makeApiRequest('action/crafting', 'POST', { 
    code: code,
    quantity: quantity,
    character: charName
  });
}

/**
 * Perform a smelting action (similar to crafting)
 * @async
 * @param {string} code - Recipe code for the item to smelt (e.g., 'MITHRIL_BAR')
 * @param {number} quantity - Quantity to smelt
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<Object>} Smelting result
 * @throws {Error} For invalid parameters or smelting failures
 */
async function smeltingAction(code, quantity = 1, characterName) {
  if (!code) {
    throw new Error('Smelting recipe code is required');
  }

  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }

  const charName = sanitizeCharacterName(characterName || config.character);
  console.log(`Initiating smelting action for character: ${charName}, Code: ${code}, Qty: ${quantity}`);
  // Assuming the endpoint is 'action/smelting', adjust if different
  return makeApiRequest('action/smelting', 'POST', {
    code: code,
    quantity: quantity,
    character: charName
  }, charName);
}


/**
 * Unequip an item from a specific slot
 * @async
 * @param {string} slot - The equipment slot to unequip (e.g., 'weapon', 'helmet', etc.)
 * @returns {Promise<Object>} Unequip result with updated inventory
 * @throws {Error} For invalid slot or if character is in cooldown
 */
async function unequipAction(slot) {
  if (!slot) {
    throw new Error('Equipment slot is required for unequipping');
  }
  
  return makeApiRequest('action/unequip', 'POST', { slot });
}

/**
 * Equip an item to a specific slot
 * @async
 * @param {string} code - The item code to equip
 * @param {string} slot - The equipment slot (e.g., 'weapon', 'helmet', etc.)
 * @param {number} [quantity=1] - The quantity to equip
 * @returns {Promise<Object>} Equip result with updated inventory and equipment
 * @throws {Error} For invalid parameters or if character is in cooldown
 */
async function equipAction(code, slot, quantity = 1) {
  if (!code) {
    throw new Error('Item code is required for equipping');
  }
  
  if (!slot) {
    throw new Error('Equipment slot is required for equipping');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  return makeApiRequest('action/equip', 'POST', { 
    code,
    slot,
    quantity
  });
}

/**
 * Perform fight actions in a loop with cooldown handling and resting between fights
 * @param {number} maxAttempts - Maximum number of attempts (0 for infinite)
 * @param {Function} onSuccess - Optional callback for successful fighting
 * @param {Function} onError - Optional callback for error handling
 * @returns {Promise<void>}
 */
async function fightLoopAction(maxAttempts = 0, onSuccess, onError) {
  let isFighting = true; // Toggle between fight and rest
  let attempts = 0;
  
  // Create a wrapper function that alternates between fight and rest
  const alternatingAction = async () => {
    attempts++;
    
    if (isFighting) {
      // Perform fight action
      const result = await fightAction();
      isFighting = false; // Next action will be rest
      return result;
    } else {
      // Perform rest action
      const result = await restAction();
      isFighting = true; // Next action will be fight
      return result;
    }
  };
  
  return executeWithCooldown(
    alternatingAction,
    onSuccess || ((result) => {
      // isFighting has already been toggled by the time we get here,
      // so it represents the NEXT action, not the current one
      if (!isFighting) {
        console.log('Fight successful:');
      } else {
        console.log('Rest successful:');
      }
      console.log(result);
    }),
    onError || ((error, attemptCount) => {
      console.error(`Action attempt ${attemptCount} failed:`, error.message);
      
      // If the error contains specific messages that should stop the loop
      if (error.message.includes('character is dead')) {
        console.log('Stopping fight loop due to character death.');
        return false;
      }
      
      // Handle "Monster not found" error
      if (error.message.includes('Monster not found')) {
        console.log('No monsters found on this map. You may need to move to a different location.');
        console.log('Continuing with rest action...');
        // Continue with the loop, which will alternate to rest action
        return true;
      }
      
      // Handle cooldown errors more gracefully
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Waiting for cooldown: ${cooldownSeconds.toFixed(1)} seconds...`);
        // Return true to continue, but the executeWithCooldown function will handle the retry timing
        return {
          continueExecution: true,
          retryDelay: cooldownSeconds * 1000 // Convert to milliseconds
        };
      }
      
      // Continue for other errors with default retry delay
      return true;
    }),
    maxAttempts
  );
}

/**
 * Get character details directly without triggering cooldown
 * @async
 * @param {string} [characterName] - The character name to get details for
 * @returns {Promise<Object>} Character details including inventory, stats, and position
 * @throws {Error} For API errors or if character doesn't exist
 */
async function getCharacterDetails(characterName) {
  try {
    // Use the public API endpoint to get character details without triggering cooldown
    const charName = sanitizeCharacterName(characterName || config.character);
    console.log(`Getting character details for: ${charName}`);
    const url = `${config.server}/characters/${encodeURIComponent(charName)}`;
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };
    
    const response = await fetch(url, options);
    
    // Check if the response is OK
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
    
    // Parse the JSON response
    const data = await response.json();
    
    // Return the data property if it exists, otherwise the whole response
    return data.data || data;
  } catch (error) {
    console.error('Failed to get character details:', error.message);
    throw error;
  }
}

/**
 * Get character status by performing a rest action
 * @returns {Promise<Object>} - Character status
 * @deprecated Use getCharacterDetails() instead to avoid triggering cooldown
 */
async function getCharacterStatus() {
  try {
    // Use rest action to get character status
    const result = await restAction();
    return result.character || null;
  } catch (error) {
    // Handle cooldown errors internally if needed
    const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
    if (cooldownMatch) {
      const cooldownSeconds = parseFloat(cooldownMatch[1]);
      console.log(`Character in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds before getting status...`);
      
      // Wait for the cooldown
      await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
      
      // Try again after cooldown
      const result = await restAction();
      return result.character || null;
    }
    
    // For other errors, log and rethrow
    console.error('Failed to get character status:', error.message);
    throw error;
  }
}

/**
 * Recycle items from inventory
 * @async
 * @param {string} code - The item code to recycle
 * @param {number} [quantity=1] - The quantity to recycle
 * @returns {Promise<Object>} Recycling result with updated inventory
 * @throws {Error} For invalid parameters or if character is in cooldown
 */
async function recyclingAction(code, quantity = 1) {
  if (!code) {
    throw new Error('Item code is required for recycling');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  return makeApiRequest('action/recycling', 'POST', { 
    code,
    quantity
  });
}


/**
 * Heal character until health is full
 * @async
 * @param {string} characterName - The name of the character to heal
 * @returns {Promise<Object>} - Character object with full health
 * @throws {Error} If healing fails or character info is unavailable
 */
async function healCharacter(characterName) {
  const charName = sanitizeCharacterName(characterName || config.character);
  let currentCharacter;

  try {
    // Get initial details
    currentCharacter = await getCharacterDetails(charName);
    if (!currentCharacter) {
      throw new Error(`Character information not available for ${charName}`);
    }

    console.log(`[${charName}] Current health: ${currentCharacter.hp}/${currentCharacter.max_hp} (${Math.round(currentCharacter.hp / currentCharacter.max_hp * 100)}%)`);

    // If health is already full, no need to heal
    if (currentCharacter.hp >= currentCharacter.max_hp) {
      console.log(`[${charName}] Health is already full!`);
      return currentCharacter;
    }

    console.log(`[${charName}] Health is not full. Healing...`);

    // Keep healing until health is full
    while (currentCharacter.hp < currentCharacter.max_hp) {
      try {
        // Check for cooldown before healing
        console.log(`[${charName}] Checking for cooldown before healing...`);
        await sleep(1000); // Small delay

        const freshDetails = await getCharacterDetails(charName);
        if (freshDetails.cooldown && freshDetails.cooldown > 0) {
          const now = new Date();
          const expirationDate = new Date(freshDetails.cooldown_expiration);
          const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);

          if (cooldownSeconds > 0) {
            console.log(`[${charName}] Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds before healing...`);
            await sleep(cooldownSeconds * 1000 + 500); // Wait + buffer
          }
        }

        // Perform the rest action
        const result = await restAction(charName);
        const hpBefore = currentCharacter.hp; // Store HP before rest
        currentCharacter = result.character;

        if (!currentCharacter) {
          throw new Error(`[${charName}] Character information not available after rest`);
        }

        console.log(`[${charName}] Health after rest: ${currentCharacter.hp}/${currentCharacter.max_hp} (${Math.round(currentCharacter.hp / currentCharacter.max_hp * 100)}%)`);

        // Log healing action to database
        try {
          await db.query(
            `INSERT INTO action_logs(character, action_type, result, coordinates)
             VALUES ($1, 'heal', $2, point($3,$4))`,
            [
              charName,
              {
                hp_before: hpBefore,
                hp_after: currentCharacter.hp,
                hp_max: currentCharacter.max_hp
              },
              currentCharacter.x || 0,
              currentCharacter.y || 0
            ]
          );
        } catch (dbError) {
          console.error(`[${charName}] Failed to log healing action to database:`, dbError.message);
        }

        // Check if we need to wait for cooldown from the rest action itself
        if (result.cooldown && result.cooldown.total_seconds) {
          const cooldownSeconds = result.cooldown.total_seconds;
          if (cooldownSeconds > 0) {
             console.log(`[${charName}] Cooldown from rest: ${cooldownSeconds} seconds. Waiting...`);
             await sleep(cooldownSeconds * 1000 + 500); // Wait + buffer
          }
        } else {
          // Add a small default delay if no cooldown info is present
          await sleep(1000);
        }

      } catch (error) {
        // Handle cooldown errors specifically from the restAction call
        const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
        if (cooldownMatch) {
          const cooldownSeconds = parseFloat(cooldownMatch[1]);
          console.log(`[${charName}] Waiting for cooldown: ${cooldownSeconds.toFixed(1)} seconds...`);
          await sleep(cooldownSeconds * 1000 + 500); // Wait + buffer
        } else {
          // For other errors during the loop, log and rethrow to stop healing
          console.error(`[${charName}] Error during healing loop:`, error.message);
          throw error;
        }
      }
    } // end while

    console.log(`[${charName}] Health is now full!`);
    return currentCharacter;

  } catch (initialError) {
     console.error(`[${charName}] Failed to initiate healing:`, initialError.message);
     throw initialError; // Rethrow initial error (e.g., getting details)
  }
}

/**
 * Module exports
 * @exports API
 */
module.exports = {
  makeApiRequest,
  moveCharacter,
  fightAction,
  gatheringAction,
  restAction,
  executeWithCooldown,
  gatheringLoopAction,
  fightLoopAction,
  craftingAction,
  miningAction, // Add mining action
  smeltingAction, // Add smelting action
  unequipAction,
  equipAction,
  recyclingAction,
  getCharacterStatus,
  getCharacterDetails,
  healCharacter // Export the new function
};
