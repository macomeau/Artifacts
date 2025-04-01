/**
 * @fileoverview Script to create a loop that withdraws materials from bank,
 * crafts adventurer boots at the armorsmith, and deposits them back to bank.
 * Optionally recycles the crafted boots.
 * @module adventurer-boots-crafting-loop
 */

const { moveCharacter, getCharacterDetails, makeApiRequest, craftingAction, recyclingAction, executeWithCooldown } = require('./api');
const config = require('./config');
const db = require('./db'); // Assuming db setup is done elsewhere if needed for logging
const { sleep, handleCooldown } = require('./utils'); // Import necessary utils

// --- Configuration ---
// Maximum boots to craft per cycle
const MAX_CRAFT_QUANTITY = 6;

// Materials required per single boot
const MATERIALS_PER_BOOT = [
  { code: 'cowhide', quantity: 6 },
  { code: 'wolf_hair', quantity: 4 },
  { code: 'mushroom', quantity: 3 },
  { code: 'spruce_plank', quantity: 2 }
];

// Calculate total materials needed for the max quantity
const REQUIRED_MATERIALS = MATERIALS_PER_BOOT.map(material => ({
  code: material.code,
  quantity: material.quantity * MAX_CRAFT_QUANTITY
}));

// Item code for the crafted boots
const CRAFTED_ITEM_CODE = 'adventurer_boots';

// Coordinates
const ARMORSMITH_COORDS = { x: 3, y: 1 };
const BANK_COORDS = { x: 4, y: 1 };
// --- End Configuration ---

/**
 * Withdraw a specific item from the bank.
 * Uses handleCooldown internally via makeApiRequest.
 * @async
 * @param {string} code - The item code to withdraw.
 * @param {number} quantity - The quantity to withdraw.
 * @param {string} characterName - The character performing the action.
 * @returns {Promise<Object>} Withdrawal result.
 * @throws {Error} For invalid parameters or API errors.
 */
async function withdrawFromBank(code, quantity, characterName) {
  if (!code) throw new Error('Item code is required for bank withdrawal');
  if (typeof quantity !== 'number' || quantity < 1) throw new Error('Quantity must be a positive number');

  console.log(`[${characterName}] Withdrawing ${quantity} x ${code} from bank...`);
  return makeApiRequest('action/bank/withdraw', 'POST', { code, quantity }, characterName);
}

/**
 * Deposit an item to the bank.
 * Uses handleCooldown internally via makeApiRequest.
 * @async
 * @param {string} code - The item code to deposit.
 * @param {number} quantity - The quantity to deposit.
 * @param {string} characterName - The character performing the action.
 * @returns {Promise<Object>} Deposit result.
 * @throws {Error} For invalid parameters or API errors.
 */
async function depositToBank(code, quantity, characterName) {
  if (!code) throw new Error('Item code is required for bank deposit');
  if (typeof quantity !== 'number' || quantity < 1) throw new Error('Quantity must be a positive number');

  console.log(`[${characterName}] Depositing ${quantity} x ${code} to bank...`);
  return makeApiRequest('action/bank/deposit', 'POST', { code, quantity }, characterName);
}

/**
 * Deposit all items currently in the character's inventory to the bank.
 * Handles cooldown between deposits.
 * @async
 * @param {string} characterName - The character performing the action.
 * @returns {Promise<void>}
 * @throws {Error} If fetching character details or depositing fails.
 */
async function depositAllToBank(characterName) {
  console.log(`[${characterName}] Depositing all items to bank...`);
  try {
    // Need fresh details to see current inventory
    await handleCooldown(characterName); // Ensure no cooldown before getting details
    const character = await getCharacterDetails(characterName);

    if (!character || !character.inventory || character.inventory.length === 0) {
      console.log(`[${characterName}] Inventory is empty, nothing to deposit.`);
      return;
    }

    console.log(`[${characterName}] Current inventory:`, character.inventory.map(item => item ? `${item.quantity}x${item.code}` : 'Empty Slot').join(', '));

    // Deposit each item stack
    // Use a standard for loop for easier async/await handling with cooldowns
    for (const item of character.inventory) {
      if (item && item.code && item.quantity > 0) {
        await handleCooldown(characterName); // Wait for cooldown from previous action (if any)
        try {
          await depositToBank(item.code, item.quantity, characterName);
          console.log(`[${characterName}] Deposited ${item.quantity} x ${item.code}`);
          await sleep(500); // Small delay after action
        } catch (depositError) {
          console.error(`[${characterName}] Error depositing ${item.code}:`, depositError.message);
          // Decide whether to continue or rethrow
          // For now, log the error and attempt to continue with other items
        }
      }
    }

    console.log(`[${characterName}] Finished depositing all items.`);
  } catch (error) {
    console.error(`[${characterName}] Error in depositAllToBank:`, error.message);
    throw error; // Re-throw the error to be caught by the main loop handler
  }
}

/**
 * Get the quantity of a specific item in the character's inventory.
 * @async
 * @param {string} code - Item code to check.
 * @param {string} characterName - The character performing the action.
 * @returns {Promise<number>} Quantity of the item (0 if not found or error).
 */
async function getItemQuantityInInventory(code, characterName) {
  try {
    await handleCooldown(characterName); // Ensure no cooldown before getting details
    const characterDetails = await getCharacterDetails(characterName);
    if (!characterDetails || !characterDetails.inventory) {
      return 0;
    }
    const item = characterDetails.inventory.find(invItem => invItem && invItem.code === code);
    return item ? (item.quantity || 0) : 0;
  } catch (error) {
    console.error(`[${characterName}] Error checking inventory for ${code}:`, error.message);
    return 0; // Return 0 on error to avoid breaking the flow, but log it
  }
}

/**
 * Move character to specific coordinates, handling cooldowns and retries.
 * @async
 * @param {number} x - Target X coordinate.
 * @param {number} y - Target Y coordinate.
 * @param {string} characterName - The character performing the action.
 * @returns {Promise<void>}
 * @throws {Error} If movement fails after retries.
 */
async function moveToLocation(x, y, characterName) {
  console.log(`[${characterName}] Attempting to move to (${x}, ${y})...`);
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      await handleCooldown(characterName); // Check/wait for cooldown before getting details/moving
      const characterDetails = await getCharacterDetails(characterName);

      if (characterDetails.x === x && characterDetails.y === y) {
        console.log(`[${characterName}] Already at target coordinates (${x}, ${y}).`);
        return; // Already there
      }

      console.log(`[${characterName}] Moving from (${characterDetails.x}, ${characterDetails.y}) to (${x}, ${y})... (Attempt ${attempts})`);
      await moveCharacter(x, y, characterName);
      console.log(`[${characterName}] Successfully moved to (${x}, ${y}).`);
      await sleep(500); // Small delay after successful move
      return; // Success
    } catch (error) {
      console.error(`[${characterName}] Error moving to (${x}, ${y}) (Attempt ${attempts}):`, error.message);
      if (attempts >= maxAttempts) {
        throw new Error(`[${characterName}] Failed to move to (${x}, ${y}) after ${maxAttempts} attempts.`);
      }
      // Wait before retrying, potentially longer if it was a cooldown error handled by handleCooldown
      await sleep(2000 + Math.random() * 1000); // Wait 2-3 seconds before retry
    }
  }
}

/**
 * Perform one complete adventurer boots crafting cycle.
 * Handles material withdrawal, crafting, optional recycling, and depositing results.
 * @async
 * @param {string} characterName - The character performing the action.
 * @param {boolean} [shouldRecycle=true] - Whether to perform the recycling step.
 * @returns {Promise<boolean>} True if the cycle completed successfully, false otherwise.
 */
async function adventurerBootsCraftingCycle(characterName, shouldRecycle = true) {
  console.log(`\n--- [${characterName}] Starting Adventurer Boots Crafting Cycle (Recycle: ${shouldRecycle}) ---`);
  try {
    // 1. Check current inventory vs required materials for a full batch
    console.log(`[${characterName}] Checking inventory for materials needed for ${MAX_CRAFT_QUANTITY} boots...`);
    const materialsToWithdraw = [];
    for (const material of REQUIRED_MATERIALS) {
      const quantityInInventory = await getItemQuantityInInventory(material.code, characterName);
      const neededFromBank = Math.max(0, material.quantity - quantityInInventory);
      console.log(`[${characterName}] ${material.code}: Have ${quantityInInventory}, Need ${material.quantity}. Withdrawing ${neededFromBank}.`);
      if (neededFromBank > 0) {
        materialsToWithdraw.push({ code: material.code, quantity: neededFromBank });
      }
    }

    // 2. Move to Bank
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);

    // 3. Deposit any existing items to ensure clean inventory (especially important if recycling)
    await depositAllToBank(characterName);

    // 4. Withdraw needed materials
    console.log(`[${characterName}] Withdrawing required materials...`);
    for (const item of materialsToWithdraw) {
      if (item.quantity > 0) {
        await handleCooldown(characterName);
        await withdrawFromBank(item.code, item.quantity, characterName);
        await sleep(500); // Small delay
      }
    }
    console.log(`[${characterName}] Finished withdrawing materials.`);

    // 5. Move to Armorsmith
    await moveToLocation(ARMORSMITH_COORDS.x, ARMORSMITH_COORDS.y, characterName);

    // 6. Craft Adventurer Boots
    await handleCooldown(characterName);
    console.log(`[${characterName}] Crafting ${MAX_CRAFT_QUANTITY} x ${CRAFTED_ITEM_CODE}...`);
    await craftingAction(CRAFTED_ITEM_CODE, MAX_CRAFT_QUANTITY, null, characterName); // Assuming no specific material needed in API call itself
    console.log(`[${characterName}] Successfully initiated crafting for ${MAX_CRAFT_QUANTITY} x ${CRAFTED_ITEM_CODE}.`);
    await sleep(1000); // Wait a bit after crafting action

    // 7. Verify boots were created (check inventory)
    const bootsCraftedQuantity = await getItemQuantityInInventory(CRAFTED_ITEM_CODE, characterName);
    if (bootsCraftedQuantity <= 0) {
      console.error(`[${characterName}] Error: ${CRAFTED_ITEM_CODE} not found in inventory after crafting attempt!`);
      // Maybe deposit remaining materials before failing?
      await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);
      await depositAllToBank(characterName);
      return false; // Indicate cycle failure
    }
    console.log(`[${characterName}] Found ${bootsCraftedQuantity} x ${CRAFTED_ITEM_CODE} in inventory.`);

    // 8. Recycle the crafted boots (if enabled)
    if (shouldRecycle) {
      await handleCooldown(characterName);
      console.log(`[${characterName}] Recycling ${bootsCraftedQuantity} x ${CRAFTED_ITEM_CODE}...`);
      await recyclingAction(CRAFTED_ITEM_CODE, bootsCraftedQuantity, characterName);
      console.log(`[${characterName}] Successfully initiated recycling.`);
      await sleep(500); // Small delay
    } else {
      console.log(`[${characterName}] Skipping recycling step.`);
    }

    // 9. Move back to Bank
    await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);

    // 10. Deposit all remaining items (crafted boots if not recycled, or byproducts from recycling)
    await depositAllToBank(characterName);

    console.log(`--- [${characterName}] Adventurer Boots Crafting Cycle Completed Successfully ---`);
    return true; // Indicate success
  } catch (error) {
    console.error(`--- [${characterName}] Adventurer Boots Crafting Cycle FAILED ---`);
    console.error(`Error: ${error.message}`);
    // Attempt to deposit any remaining items in case of failure mid-cycle
    try {
      console.log(`[${characterName}] Attempting to deposit items after failure...`);
      await moveToLocation(BANK_COORDS.x, BANK_COORDS.y, characterName);
      await depositAllToBank(characterName);
    } catch (cleanupError) {
      console.error(`[${characterName}] Error during post-failure cleanup: ${cleanupError.message}`);
    }
    return false; // Indicate failure
  }
}

/**
 * Main function to run the crafting loop indefinitely using executeWithCooldown.
 * Parses command line arguments for character name and --no-recycle flag.
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  // Check for --no-recycle flag
  const shouldRecycle = !process.argv.includes('--no-recycle');

  // Filter out the recycle flag to parse other args correctly
  const args = process.argv.slice(2).filter(arg => arg !== '--no-recycle');

  // Get character name: first argument after flags, or fallback to config/env
  const characterName = args[0] || config.character || process.env.control_character;

  if (!characterName) {
    console.error('Error: Character name is required. Provide it as an argument or set control_character in the environment.');
    process.exit(1);
  }

  console.log(`Starting Adventurer Boots crafting loop for character: ${characterName}`);
  console.log(`Recycling enabled: ${shouldRecycle}`);
  console.log('Press Ctrl+C to stop.');
  console.log('---------------------------------------------------');

  // Create a wrapper function for the cycle to pass to executeWithCooldown
  const cycleWrapper = async () => {
    // Pass the determined character name and recycle flag to the cycle function
    return await adventurerBootsCraftingCycle(characterName, shouldRecycle);
  };

  // Use executeWithCooldown to handle the loop, cooldowns, and retries
  await executeWithCooldown(
    cycleWrapper,
    (result) => {
      if (result) {
        console.log(`[${characterName}] Cycle completed successfully. Scheduling next cycle...`);
      } else {
        // Cycle function returned false, indicating a failure within the cycle logic
        console.warn(`[${characterName}] Cycle reported failure. Scheduling retry...`);
        // We still want executeWithCooldown to retry, so don't throw here.
        // Return a value that executeWithCooldown understands as needing retry (implicitly handled by not throwing)
      }
      // Add a delay between successful cycles if desired
      // await sleep(5000); // e.g., wait 5 seconds
    },
    (error, attempts) => {
      // This is called when cycleWrapper throws an unhandled error
      console.error(`[${characterName}] Cycle attempt ${attempts} failed with error:`, error.message);
      // Decide if we should continue or stop based on the error or attempts
      // For now, always continue
      return {
        continueExecution: true,
        retryDelay: 15000 // Wait 15 seconds before retrying after an error
      };
    },
    0 // Run indefinitely (0 attempts means infinite)
  );
}

// Execute main if run directly
if (require.main === module) {
  main().catch(error => {
    console.error("Unhandled error in main execution:", error);
    process.exit(1);
  });
}

/**
 * Module exports
 * @exports adventurer-boots-crafting-loop
 */
module.exports = {
  adventurerBootsCraftingCycle // Export the cycle function if needed elsewhere
};
