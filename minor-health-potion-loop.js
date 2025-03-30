/**
 * @fileoverview Script to create a loop that withdraws materials from bank,
 * crafts minor health potions at the alchemist, and deposits them back to bank.
 * @module minor-health-potion-loop
 */

const { moveCharacter, getCharacterDetails, makeApiRequest, craftingAction, executeWithCooldown } = require('./api');
const config = require('./config');
const db = require('./db');

// Items needed for minor health potions
const REQUIRED_MATERIALS = [
  { code: 'nettle_leaf', quantity: 20 }, // 2 nettle_leaf per potion × 10 potions
  { code: 'algae', quantity: 10 }       // 1 algae per potion × 10 potions
];

// Alchemist coordinates
const ALCHEMIST_COORDS = { x: 2, y: 3 };
// Bank coordinates
const BANK_COORDS = { x: 4, y: 1 };
// Minor health potion recipe code and quantity
const HEALTH_POTION_CODE = 'minor_health_potion';
const HEALTH_POTION_QUANTITY = 10;

/**
 * Withdraw a specific item from the bank
 * @async
 * @param {string} code - The item code to withdraw
 * @param {number} quantity - The quantity to withdraw
 * @returns {Promise<Object>} Withdrawal result with updated bank and inventory
 * @throws {Error} For invalid parameters or if character is in cooldown
 */
async function withdrawFromBank(code, quantity) {
  if (!code) {
    throw new Error('Item code is required for bank withdrawal');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  console.log(`Withdrawing ${quantity} x ${code} from bank...`);
  return makeApiRequest('action/bank/withdraw', 'POST', { 
    code: code,
    quantity: quantity
  });
}

/**
 * Wait for cooldown to expire
 * @async
 * @returns {Promise<void>}
 */
async function waitForCooldown() {
  try {
    const freshDetails = await getCharacterDetails();
    
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
 * @returns {Promise<void>}
 */
async function moveToLocation(x, y) {
  try {
    // Check current position
    const characterDetails = await getCharacterDetails();
    
    // Check if already at target coordinates
    if (characterDetails.x === x && characterDetails.y === y) {
      console.log(`Character is already at coordinates (${x}, ${y}).`);
      return;
    }
    
    // Wait for any cooldown
    await waitForCooldown();
    
    // Move to target coordinates
    console.log(`Moving to coordinates (${x}, ${y})...`);
    await moveCharacter(x, y);
    console.log(`Successfully moved to (${x}, ${y}).`);
  } catch (error) {
    // Handle cooldown errors
    const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
    if (cooldownMatch) {
      const cooldownSeconds = parseFloat(cooldownMatch[1]);
      console.log(`Movement in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
      
      // Try again
      return moveToLocation(x, y);
    } else {
      throw error;
    }
  }
}

/**
 * Deposit an item to the bank
 * @async
 * @param {string} code - The item code to deposit
 * @param {number} quantity - The quantity to deposit
 * @returns {Promise<Object>} Deposit result
 * @throws {Error} For invalid parameters or if character is in cooldown
 */
async function depositToBank(code, quantity) {
  if (!code) {
    throw new Error('Item code is required for bank deposit');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  console.log(`Depositing ${quantity} x ${code} to bank...`);
  return makeApiRequest('action/bank/deposit', 'POST', { 
    code: code,
    quantity: quantity
  });
}

/**
 * Deposit all items in inventory to the bank
 * @async
 * @returns {Promise<void>}
 */
async function depositAllToBank() {
  try {
    console.log('Depositing all items to bank...');
    const character = await getCharacterDetails();
    
    if (!character.inventory || character.inventory.length === 0) {
      console.log('Inventory is empty, nothing to deposit');
      return;
    }
    
    // Deposit each item in inventory
    for (const item of character.inventory) {
      if (item && item.code && item.quantity) {
        await waitForCooldown();
        await depositToBank(item.code, item.quantity);
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
 * @returns {Promise<Object|null>} Item object or null if not found
 */
async function checkInventoryForItem(code) {
  const characterDetails = await getCharacterDetails();
  
  if (!characterDetails || !characterDetails.inventory) {
    return null;
  }
  
  return characterDetails.inventory.find(item => item && item.code === code) || null;
}

/**
 * Get the quantity of an item in inventory
 * @async
 * @param {string} code - Item code to check
 * @returns {Promise<number>} Quantity of item in inventory (0 if not found)
 */
async function getItemQuantityInInventory(code) {
  const item = await checkInventoryForItem(code);
  return item ? (item.quantity || 0) : 0;
}

/**
 * Perform one complete minor health potion crafting cycle
 * @async
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function minorHealthPotionCraftingCycle() {
  try {
    console.log('Starting minor health potion crafting cycle...');
    
    // 1. First check current inventory for required materials
    console.log('Checking current inventory for required materials...');
    const inventoryChecks = [];
    
    for (const material of REQUIRED_MATERIALS) {
      const quantityInInventory = await getItemQuantityInInventory(material.code);
      inventoryChecks.push({
        code: material.code,
        required: material.quantity,
        inInventory: quantityInInventory,
        needed: Math.max(0, material.quantity - quantityInInventory)
      });
      
      console.log(`${material.code}: ${quantityInInventory}/${material.quantity} in inventory, need to withdraw: ${Math.max(0, material.quantity - quantityInInventory)}`);
    }
    
    // Always go to bank to ensure inventory is clean before next cycle
    console.log('Moving to bank for materials...');
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y);
    
    // Deposit any leftover items before starting new cycle
    await depositAllToBank();
    
    // 3. Withdraw materials
    for (const item of inventoryChecks) {
      await waitForCooldown();
      await withdrawFromBank(item.code, item.required);
      console.log(`Successfully withdrew ${item.required} x ${item.code}`);
    }
    
    // 4. Move to alchemist
    await moveToLocation(ALCHEMIST_COORDS.x, ALCHEMIST_COORDS.y);
    
    // 5. Craft minor health potions
    await waitForCooldown();
    console.log(`Crafting ${HEALTH_POTION_QUANTITY} x ${HEALTH_POTION_CODE}...`);
    await craftingAction(HEALTH_POTION_CODE, HEALTH_POTION_QUANTITY);
    console.log(`Successfully crafted ${HEALTH_POTION_QUANTITY} x ${HEALTH_POTION_CODE}`);
    
    // 6. Check that potions were created
    const potionsInInventory = await checkInventoryForItem(HEALTH_POTION_CODE);
    if (!potionsInInventory) {
      console.error('Failed to find crafted minor health potions in inventory!');
      return false;
    }
    
    console.log(`Successfully crafted minor health potions, found ${potionsInInventory.quantity} x ${HEALTH_POTION_CODE} in inventory`);
    
    // 7. Move back to bank to deposit potions
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y);
    
    // 8. Deposit all items in inventory
    await waitForCooldown();
    await depositAllToBank();
    
    console.log('Minor health potion crafting cycle completed successfully!');
    return true;
  } catch (error) {
    console.error('Minor health potion crafting cycle failed:', error.message);
    return false;
  }
}

/**
 * Main function that runs the minor health potion crafting loop
 * @async
 * @param {string} [characterName] - Optional character name override
 * @returns {Promise<void>}
 */
async function main() {
  // Get character name from command line argument if provided
  const characterName = process.argv[2] || config.character;
  console.log(`Starting minor health potion crafting loop for character: ${characterName}`);
  
  // Override config.character for this session if a name was provided
  if (characterName) {
    config.character = characterName;
  }
  
  // Create a wrapper function for executeWithCooldown
  const cycleWrapper = async () => {
    return await minorHealthPotionCraftingCycle();
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
 * @exports minor-health-potion-loop
 */
module.exports = {
  minorHealthPotionCraftingCycle
};