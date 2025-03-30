/**
 * @fileoverview Script to create a loop that withdraws materials from bank,
 * crafts iron rings at the jewelcrafter, and deposits them back to bank.
 * @module iron-ring-crafting-loop
 */

const { moveCharacter, getCharacterDetails, makeApiRequest, craftingAction, recyclingAction, executeWithCooldown } = require('./api'); // Added recyclingAction
const config = require('./config');
const db = require('./db');

// Materials needed for iron rings
const REQUIRED_MATERIALS = [
  { code: 'iron', quantity: 60 }, // 6 iron per ring, crafting 10 rings
  { code: 'feather', quantity: 20 } // 2 feathers per ring, crafting 10 rings
];

// Jewelcrafter coordinates
const JEWELCRAFTER_COORDS = { x: 1, y: 3 };
// Bank coordinates
const BANK_COORDS = { x: 4, y: 1 };
// Iron ring recipe code and quantity
const IRON_RING_CODE = 'iron_ring';
const IRON_RING_QUANTITY = 10;

/**
 * Withdraw a specific item from the bank
 * @async
 * @param {string} code - The item code to withdraw
 * @param {number} quantity - The quantity to withdraw
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<Object>} Withdrawal result with updated bank and inventory
 * @throws {Error} For invalid parameters or if character is in cooldown
 */
async function withdrawFromBank(code, quantity, characterName = config.character) {
  if (!code) {
    throw new Error('Item code is required for bank withdrawal');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  console.log(`Withdrawing ${quantity} x ${code} from bank...`);
  return makeApiRequest('action/bank/withdraw', 'POST', { 
    code: code,
    quantity: quantity,
    character: characterName
  }, characterName);
}

/**
 * Wait for cooldown to expire
 * @async
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<void>}
 */
async function waitForCooldown(characterName = config.character) {
  try {
    const freshDetails = await getCharacterDetails(characterName);
    
    if (freshDetails.cooldown && freshDetails.cooldown > 0) {
      const now = new Date();
      const expirationDate = new Date(freshDetails.cooldown_expiration);
      const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
      
      if (cooldownSeconds > 0) {
        console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
      }
    }
  } catch (error) {
    console.error('Failed to check cooldown:', error.message);
  }
}

/**
 * Move to specific coordinates and handle cooldown
 * @async
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<void>}
 */
async function moveToLocation(x, y, characterName = config.character) {
  try {
    // Check current position
    const characterDetails = await getCharacterDetails(characterName);
    
    // Check if already at target coordinates
    if (characterDetails.x === x && characterDetails.y === y) {
      console.log(`Character is already at coordinates (${x}, ${y}).`);
      return;
    }
    
    // Wait for any cooldown
    await waitForCooldown(characterName);
    
    // Move to target coordinates
    console.log(`Moving to coordinates (${x}, ${y})...`);
    await moveCharacter(x, y, characterName);
    console.log(`Successfully moved to (${x}, ${y}).`);
  } catch (error) {
    // Handle cooldown errors
    const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
    if (cooldownMatch) {
      const cooldownSeconds = parseFloat(cooldownMatch[1]);
      console.log(`Movement in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
      
      // Try again
      return moveToLocation(x, y, characterName);
    } else {
      throw error;
    }
  }
}

/**
 * Deposit all items in inventory to the bank
 * @async
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<void>}
 */
async function depositAllToBank(characterName = config.character) {
  try {
    console.log('Depositing all items to bank...');
    const character = await getCharacterDetails(characterName);
    
    if (!character.inventory || character.inventory.length === 0) {
      console.log('Inventory is empty, nothing to deposit');
      return;
    }
    
    // Deposit each item in inventory
    for (const item of character.inventory) {
      if (item && item.code && item.quantity) {
        await waitForCooldown(characterName);
        await makeApiRequest('action/bank/deposit', 'POST', { 
          code: item.code,
          quantity: item.quantity,
          character: characterName
        }, characterName);
        console.log(`Deposited ${item.quantity} x ${item.code}`);
      }
    }
    
    console.log('Successfully deposited all items to bank');
  } catch (error) {
    console.error('Error depositing all items:', error.message);
    throw error;
  }
}

/**
 * Check if item exists in inventory and get its quantity
 * @async
 * @param {string} code - Item code to check
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<Object|null>} Item object or null if not found
 */
async function checkInventoryForItem(code, characterName = config.character) {
  const characterDetails = await getCharacterDetails(characterName);
  
  if (!characterDetails || !characterDetails.inventory) {
    return null;
  }
  
  return characterDetails.inventory.find(item => item && item.code === code) || null;
}

/**
 * Get the quantity of an item in inventory
 * @async
 * @param {string} code - Item code to check
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<number>} Quantity of item in inventory (0 if not found)
 */
async function getItemQuantityInInventory(code, characterName = config.character) {
  const item = await checkInventoryForItem(code, characterName);
  return item ? (item.quantity || 0) : 0;
}

/**
 * Perform one complete iron ring crafting cycle
 * @async
 * @param {string} [characterName] - Optional character name
 * @param {boolean} [shouldRecycle=true] - Whether to perform the recycling step
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function ironRingCraftingCycle(characterName = config.character, shouldRecycle = true) {
  try {
    console.log(`Starting iron ring crafting cycle... (Recycle: ${shouldRecycle})`);

    // Move to bank
    console.log('Moving to bank...');
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);
    
    // Deposit any leftover items from previous cycles
    await depositAllToBank(characterName);
    
    // Withdraw required materials
    for (const material of REQUIRED_MATERIALS) {
      await waitForCooldown(characterName);
      await withdrawFromBank(material.code, material.quantity, characterName);
      console.log(`Successfully withdrew ${material.quantity} x ${material.code}`);
    }
    
    // Move to jewelcrafter
    await moveToLocation(JEWELCRAFTER_COORDS.x, JEWELCRAFTER_COORDS.y, characterName);
    
    // Craft iron rings
    await waitForCooldown(characterName);
    console.log(`Crafting ${IRON_RING_QUANTITY} x ${IRON_RING_CODE}...`);
    await craftingAction(IRON_RING_CODE, IRON_RING_QUANTITY, null, characterName);
    console.log(`Successfully crafted ${IRON_RING_QUANTITY} x ${IRON_RING_CODE}`);
    
    // Check that iron rings were created
    const ringInInventory = await checkInventoryForItem(IRON_RING_CODE, characterName);
    if (!ringInInventory) {
      console.error('Failed to find crafted iron rings in inventory!');
      return false;
    }
    
    console.log(`Successfully crafted iron rings, found ${ringInInventory.quantity} x ${IRON_RING_CODE} in inventory`);

    // Recycle the crafted items (conditionally)
    if (shouldRecycle) {
      await waitForCooldown(characterName);
      console.log(`Recycling ${ringInInventory.quantity} x ${IRON_RING_CODE}...`);
      await recyclingAction(IRON_RING_CODE, ringInInventory.quantity, characterName);
      console.log('Successfully recycled items.');
    } else {
      console.log('Skipping recycling step as requested.');
    }

    // Move back to bank to deposit any remaining items/byproducts
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);
    
    // Deposit all items in inventory (e.g., byproducts of recycling)
    await waitForCooldown(characterName);
    await depositAllToBank(characterName);
    
    console.log('Iron ring crafting cycle completed successfully!');
    return true;
  } catch (error) {
    console.error('Iron ring crafting cycle failed:', error.message);
    
    // Log the error to the database for monitoring
    try {
      await db.query(
        `INSERT INTO error_logs(character, error_type, error_message)
         VALUES ($1, $2, $3)`,
        [
          characterName,
          'iron_ring_crafting_error',
          error.message
        ]
      );
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError.message);
    }
    
    return false;
  }
}

/**
 * Main function that runs the iron ring crafting loop
 * @async
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<void>}
 */
async function main() {
  // Check for --no-recycle flag
  const shouldRecycle = !process.argv.includes('--no-recycle');

  // Filter out the recycle flag to parse other args correctly
  const args = process.argv.slice(2).filter(arg => arg !== '--no-recycle');

  // Get character name from command line argument if provided
  const characterName = args[0] || config.character; // Assumes character name is the first arg after flags
  console.log(`Starting iron ring crafting loop for character: ${characterName}`);
  console.log(`Recycling enabled: ${shouldRecycle}`);

  // Create a wrapper function for executeWithCooldown
  const cycleWrapper = async () => {
    // Pass shouldRecycle to the cycle function
    return await ironRingCraftingCycle(characterName, shouldRecycle);
  };
  
  // Execute the crafting cycle in a loop with cooldown handling
  await executeWithCooldown(
    cycleWrapper,
    (result) => {
      console.log('Cycle completed successfully, scheduling next cycle...');
    },
    (error, attempts) => {
      console.error(`Cycle attempt ${attempts} failed:`, error.message);
      
      // Continue the loop regardless of errors
      return {
        continueExecution: true,
        retryDelay: 10000 // Wait 10 seconds before retrying after an error
      };
    },
    0 // Run indefinitely
  );
}

// Execute the main function if this is the main module
if (require.main === module) {
  main();
}

/**
 * Module exports
 * @exports iron-ring-crafting-loop
 */
module.exports = {
  ironRingCraftingCycle
};
