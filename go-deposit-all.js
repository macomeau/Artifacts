/**
 * @fileoverview Script to move character to bank coordinates and deposit all inventory items.
 * Use node go-deposit-all.js in the terminal to execute the script.
 * @module go-deposit-all
 */

const db = require('./db');
const { moveCharacter, getCharacterDetails, makeApiRequest } = require('./api');
const config = require('./config');

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
 * Deposit all items from inventory into the bank.
 * Handles cooldowns between deposits and logs each deposit operation.
 * @param {string} characterName - The name of the character performing the deposit.
 * @returns {Promise<void>}
 * @throws {Error} If deposit operation fails
 */
async function depositAllItems(characterName) {
  // Validate characterName - Remove fallback to config.character
  if (!characterName || typeof characterName !== 'string' || characterName.trim() === '') {
    const errorMsg = 'DepositAllItems Error: A valid character name must be provided.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log(`[${characterName}] Initiating deposit process.`); // Log with the correct name

  try {
    // Get character details for the specified character
    const characterDetails = await getCharacterDetails(characterName);

    if (!characterDetails || !characterDetails.inventory) {
      console.log('No items to deposit');
      return;
    }
    
    // Filter out empty slots and get items with codes
    const itemsToDeposit = characterDetails.inventory
      .filter(item => item && item.code);
      
    if (itemsToDeposit.length === 0) {
      console.log('No items to deposit');
      return;
    }
    
    // Deposit items one at a time. Cooldowns should be handled by the API call mechanism 
    // or a higher-level retry/wait handler if this function is wrapped.
    console.log(`[${characterName}] Starting deposit loop for ${itemsToDeposit.length} item types.`);
    for (const item of itemsToDeposit) {
      console.log(`[${characterName}] Attempting to deposit item: ${item.code} x${item.quantity || 1}`);
      
      try {
        // Make API request to deposit single item for the specified character
        // Use PUT method instead of POST based on 405 error
        const result = await makeApiRequest('action/bank/deposit', 'PUT', {
          code: item.code,
          quantity: item.quantity || 1,
          character: characterName // Ensure character is passed in body if API requires it
        }, characterName); // Pass characterName to makeApiRequest

        // Cooldown should be handled by makeApiRequest or a wrapper. Remove manual check here.
        
        console.log(`[${characterName}] Successfully deposited ${item.code}`);

        // Log inventory snapshot for the correct character
        await db.query(
          `INSERT INTO inventory_snapshots(character, items)
           VALUES ($1, $2)`,
          [characterName, JSON.stringify(result.inventory || [])] // Use result.inventory from deposit response
        );

        // Log deposit to database for the correct character
        await db.query(
          `INSERT INTO action_logs(character, action_type, result)
           VALUES ($1, 'bank_deposit', $2)`,
          [characterName, {
            item: item.code,
            quantity: item.quantity || 1
          }]
        );

        // Add a small mandatory delay between deposit attempts to avoid overwhelming the API,
        // independent of cooldowns handled by makeApiRequest/wrappers.
        await new Promise(resolve => setTimeout(resolve, 500)); 

      } catch (error) {
        // Error is logged by makeApiRequest. Handle specific deposit errors if needed.
        if (error.message.includes('404')) {
          console.error(`[${characterName}] Failed to deposit ${item.code}: Deposit endpoint not found. Please check if the deposit feature is available.`);
        } else {
          console.error(`[${characterName}] Failed to deposit ${item.code}:`, error.message);
        }

        // Continue with next item even if one fails
        continue;
      }
    }

    console.log(`[${characterName}] Finished depositing all items`);
    return;
  } catch (error) {
    console.error(`[${characterName}] Deposit failed:`, error.message);
    throw error;
  }
}

/**
 * Main function to move to bank coordinates and deposit all inventory items.
 * Handles character movement, cooldown waiting, and initiates the deposit process.
 * @returns {Promise<void>}
 */
async function main() {
  try {
    // Get character name from command line arguments or config
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    if (!characterName) {
      console.error('Error: No character name provided. Please specify a character name.');
      console.error('Usage: node go-deposit-all.js [characterName]');
      process.exit(1);
    }
    
    console.log(`Starting deposit process for character: ${characterName}`);
    const targetCoords = { x: 4, y: 1 };
    
    // Check character's current position and cooldown status
    console.log(`Checking details for character: ${characterName} before moving...`);
    try {
      const characterDetails = await getCharacterDetails(characterName);
      
      // Check if character is already at the destination
      if (characterDetails.x === targetCoords.x && characterDetails.y === targetCoords.y) {
        console.log(`[${characterName}] Already at bank coordinates (${targetCoords.x}, ${targetCoords.y}).`);
      } else {
        // Attempt movement. Cooldowns/retries should be handled within moveCharacter/makeApiRequest or a wrapper.
        console.log(`[${characterName}] Moving to bank coordinates (${targetCoords.x}, ${targetCoords.y})...`);
        try {
          await moveCharacter(targetCoords.x, targetCoords.y, characterName);
          console.log(`[${characterName}] Movement successful.`);
        } catch (error) {
           // moveCharacter -> makeApiRequest already logs the error.
           // Handle specific outcomes if necessary.
          if (error.message.includes('Character already at destination')) {
             console.log(`[${characterName}] Already at destination (confirmed by move attempt).`);
          } else {
             // If movement fails critically (not just cooldown), log and exit.
             console.error(`[${characterName}] Movement failed: ${error.message}. Aborting deposit.`);
             process.exit(1); // Exit if we can't reach the bank
          }
        }
      }
    } catch (error) {
      console.error('Failed to get character details:', error.message);
      console.log('Proceeding with movement without character details check...');
      
      // Attempt to move without character details check
      console.log(`Moving character ${characterName} to coordinates (${targetCoords.x}, ${targetCoords.y})...`);
      try {
        const moveResult = await moveCharacter(targetCoords.x, targetCoords.y, characterName);
        console.log('Movement successful');
      } catch (error) {
        console.error('Movement failed:', error.message);
        process.exit(1);
      }
    }
    
    // Now deposit all items
    console.log(`[${characterName}] Starting deposit of all items...`);
    try {
      // Perform deposit with explicit character name. 
      // depositAllItems itself no longer handles internal cooldown waits.
      await depositAllItems(characterName);
      console.log(`[${characterName}] Deposit process completed.`);
    } catch (error) {
       // Errors during deposit (including cooldowns if not handled by makeApiRequest/wrapper)
       // are logged within depositAllItems or makeApiRequest.
       // Log the final failure here.
       console.error(`[${characterName}] Deposit process failed overall: ${error.message}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Execute the main function if this is the main module
if (require.main === module) {
  main();
}

/**
 * Module exports
 * @exports go-deposit-all
 */
module.exports = {
  /**
   * Function to deposit all items from inventory into the bank
   */
  depositAllItems
};
