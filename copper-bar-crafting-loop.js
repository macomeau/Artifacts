/**
 * @fileoverview Script to create a loop that withdraws copper ore from bank,
 * crafts copper bars at the forge, and deposits them back to bank.
 * @module copper-bar-crafting-loop
 */

const { moveCharacter, getCharacterDetails, makeApiRequest, craftingAction, recyclingAction, executeWithCooldown } = require('./api'); // Added recyclingAction
const config = require('./config');
const db = require('./db');

// Materials needed for copper bars
const REQUIRED_MATERIALS = [
  { code: 'copper_ore', quantity: 100 }
];

// Forge coordinates
const FORGE_COORDS = { x: 1, y: 5 };
// Bank coordinates
const BANK_COORDS = { x: 4, y: 1 };
// Copper bar recipe code and quantity
const COPPER_BAR_CODE = 'copper';
const COPPER_BAR_QUANTITY = 10;

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
 * Deposit an item to the bank
 * @async
 * @param {string} code - The item code to deposit
 * @param {number} quantity - The quantity to deposit
 * @param {string} [characterName] - Optional character name
 * @returns {Promise<Object>} Deposit result
 * @throws {Error} For invalid parameters or if character is in cooldown
 */
async function depositToBank(code, quantity, characterName = config.character) {
  if (!code) {
    throw new Error('Item code is required for bank deposit');
  }
  
  if (typeof quantity !== 'number' || quantity < 1) {
    throw new Error('Quantity must be a positive number');
  }
  
  console.log(`Depositing ${quantity} x ${code} to bank...`);
  return makeApiRequest('action/bank/deposit', 'POST', { 
    code: code,
    quantity: quantity,
    character: characterName
  }, characterName);
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
 * Perform one complete copper bar crafting cycle
 * @async
 * @param {string} [characterName] - Optional character name
 * @param {boolean} [shouldRecycle=true] - Whether to perform the recycling step
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function copperBarCraftingCycle(characterName = config.character, shouldRecycle = true) {
  try {
    console.log(`Starting copper bar crafting cycle... (Recycle: ${shouldRecycle})`);

    // 1. First check current inventory for copper ore
    console.log('Checking current inventory for copper ore...');
    const inventoryChecks = [];
    
    for (const material of REQUIRED_MATERIALS) {
      const quantityInInventory = await getItemQuantityInInventory(material.code, characterName);
      inventoryChecks.push({
        code: material.code,
        required: material.quantity,
        inInventory: quantityInInventory,
        needed: Math.max(0, material.quantity - quantityInInventory)
      });
      
      console.log(`${material.code}: ${quantityInInventory}/${material.quantity} in inventory, need to withdraw: ${Math.max(0, material.quantity - quantityInInventory)}`);
    }
    
    // Check if we need to go to the bank
    const needBank = inventoryChecks.some(item => item.needed > 0);
    
    if (needBank) {
      // 2. Move to bank only if we need to withdraw something
      console.log('Need to withdraw copper ore, moving to bank...');
      await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);
      
      // 3. Withdraw copper ore
      for (const item of inventoryChecks) {
        if (item.needed > 0) {
          await waitForCooldown(characterName);
          await withdrawFromBank(item.code, item.needed, characterName);
          console.log(`Successfully withdrew ${item.needed} x ${item.code}`);
        } else {
          console.log(`Already have enough ${item.code} (${item.inInventory}/${item.required}), no need to withdraw`);
        }
      }
    } else {
      console.log('Already have all required materials in inventory, skipping bank visit');
    }
    
    // 4. Move to forge
    await moveToLocation(FORGE_COORDS.x, FORGE_COORDS.y, characterName);
    
    // 5. Craft copper bars
    await waitForCooldown(characterName);
    console.log(`Crafting ${COPPER_BAR_QUANTITY} x ${COPPER_BAR_CODE}...`);
    await craftingAction(COPPER_BAR_CODE, COPPER_BAR_QUANTITY, null, characterName);
    console.log(`Successfully crafted ${COPPER_BAR_QUANTITY} x ${COPPER_BAR_CODE}`);
    
    // 6. Check that copper bars were created
    const copperBarInInventory = await checkInventoryForItem(COPPER_BAR_CODE, characterName);
    if (!copperBarInInventory) {
      console.error('Failed to find crafted copper bars in inventory!');
      return false;
    }
    
    console.log(`Successfully crafted copper bars, found ${copperBarInInventory.quantity} x ${COPPER_BAR_CODE} in inventory`);

    // 7. Recycle the crafted items (conditionally)
    if (shouldRecycle) {
      await waitForCooldown(characterName);
      console.log(`Recycling ${copperBarInInventory.quantity} x ${COPPER_BAR_CODE}...`);
      await recyclingAction(COPPER_BAR_CODE, copperBarInInventory.quantity, characterName);
      console.log('Successfully recycled items.');
    } else {
      console.log('Skipping recycling step as requested.');
    }

    // 8. Move back to bank to deposit any remaining items/byproducts
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);
    
    // 9. Deposit any remaining items (e.g., byproducts of recycling)
    // Check if bars still exist after recycling before depositing specifically them.
    const remainingBars = await checkInventoryForItem(COPPER_BAR_CODE, characterName);
    if (remainingBars && remainingBars.quantity > 0) {
        await waitForCooldown(characterName);
        await depositToBank(COPPER_BAR_CODE, remainingBars.quantity, characterName);
        console.log(`Successfully deposited ${remainingBars.quantity} x ${COPPER_BAR_CODE}`);
    } else {
        console.log('No copper bars left to deposit after recycling.');
        // Consider using depositAllToBank if recycling yields other items you want deposited.
        // await depositAllToBank(characterName); // Uncomment if needed
    }
    
    console.log('Copper bar crafting cycle completed successfully!');
    return true;
  } catch (error) {
    console.error('Copper bar crafting cycle failed:', error.message);
    
    // Log the error to the database for monitoring
    try {
      await db.query(
        `INSERT INTO error_logs(character, error_type, error_message)
         VALUES ($1, $2, $3)`,
        [
          characterName,
          'copper_crafting_error',
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
 * Main function that runs the copper bar crafting loop
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
  console.log(`Starting copper bar crafting loop for character: ${characterName}`);
  console.log(`Recycling enabled: ${shouldRecycle}`);

  // Create a wrapper function for executeWithCooldown
  const cycleWrapper = async () => {
    // Pass shouldRecycle to the cycle function
    return await copperBarCraftingCycle(characterName, shouldRecycle);
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
 * @exports copper-bar-crafting-loop
 */
module.exports = {
  copperBarCraftingCycle
};
