/**
 * @fileoverview Script to perform continuous gathering actions in a loop.
 * Use node gathering-loop.js in the terminal to execute the script.
 * @module gathering-loop
 */

const db = require('./db');
// Import the API utilities
const { gatheringLoopAction, getCharacterDetails, gatheringAction, executeWithCooldown } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate continuous gathering.
 * Sets up a loop that performs gathering actions with cooldown handling.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If there's a fatal error in the gathering loop
 */
async function main() {
  console.log(`Starting continuous gathering for character ${config.character}...`);
  console.log('Will check for cooldown before each gathering attempt.');
  console.log('Press Ctrl+C to stop the script at any time.');
  console.log('---------------------------------------------------');
  
  // Define max attempts (0 for infinite)
  const maxAttempts = 0; // Set to a number to limit attempts
  
  /**
   * Custom action function that checks cooldown before gathering
   * @async
   * @returns {Promise<Object>} Gathering action result
   * @throws {Error} If gathering fails
   */
  const gatherWithCooldownCheck = async () => {
    // Check if character is in cooldown before gathering
    console.log('Checking for cooldown before gathering...');
    try {
      // Get fresh character details to check cooldown
      const freshDetails = await getCharacterDetails();
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          
          // Wait for the cooldown
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        }
      }
    } catch (error) {
      console.error('Failed to check cooldown with getCharacterDetails:', error.message);
      // Continue even if we can't check cooldown, the gathering action will handle it
    }
    
    // Start gathering
    console.log('Starting gathering...');
    return await gatheringAction();
  };
  
  /**
   * Success handler for gathering actions
   * @async
   * @param {Object} result - The result from the gathering action
   * @param {Object} [result.resources] - Resources gathered during the action
   * @param {Object} [result.character] - Character information after the action
   * @returns {Promise<void>}
   */
  const onSuccess = async (result) => {
    console.log('Gathering successful!');
    
    // Log gathering results
    await db.query(
      `INSERT INTO action_logs(character, action_type, result, coordinates)
       VALUES ($1, 'gathering_loop', $2, point($3,$4))`,
      [
        config.character,
        {
          resources: result.resources,
          loop_count: attempts
        },
        result.character?.x || 0,
        result.character?.y || 0
      ]
    );
    
    // Log gathered resources if available
    if (result.resources) {
      console.log('Resources gathered:');
      console.log(result.resources);
    }
    
    // Get and display formatted inventory
    try {
      const characterDetails = await getCharacterDetails();
      if (characterDetails && characterDetails.inventory) {
        console.log('\n=== Inventory ===');
        
        // Create a map to track items and their quantities
        const inventoryMap = new Map();
        
        characterDetails.inventory.forEach(item => {
          if (item && item.code) {
            const existing = inventoryMap.get(item.code) || {count: 0, quantity: 0};
            inventoryMap.set(item.code, {
              count: existing.count + 1,
              quantity: existing.quantity + (item.quantity || 1)
            });
          }
        });
        
        // Display inventory in a table-like format
        let totalItems = 0;
        let totalQuantity = 0;
        inventoryMap.forEach((details, code) => {
          if (details.quantity > details.count) {
            console.log(`- ${code}: ${details.quantity} (${details.count} stacks)`);
          } else {
            console.log(`- ${code}: ${details.quantity}`);
          }
          totalItems += details.count;
          totalQuantity += details.quantity;
        });
        
        console.log(`\nTotal quantity: ${totalQuantity}`);
        
        console.log(`\nTotal items: ${totalItems}/${characterDetails.inventory_max_items}`);
        console.log('================\n');
      }
    } catch (error) {
      console.error('Failed to get inventory:', error.message);
    }
  };
  
  /**
   * Error handler for gathering actions
   * @param {Error} error - The error that occurred during gathering
   * @param {number} attempts - The number of attempts made so far
   * @returns {boolean|Object} Whether to continue execution or configuration for retry
   */
  const onError = (error, attempts) => {
    console.error(`Gathering attempt ${attempts} failed: ${error.message}`);
    
    // Stop on specific errors
    if (error.message.includes('inventory is full')) {
      console.log('Stopping: Inventory is full.');
      return false;
    }
    
    if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
      console.log('Stopping: No resources available at this location.');
      return false;
    }
    
    // Handle cooldown errors more gracefully
    const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
    if (cooldownMatch) {
      const cooldownSeconds = parseFloat(cooldownMatch[1]);
      console.log(`Waiting for cooldown: ${cooldownSeconds.toFixed(1)} seconds...`);
      // Return object with retry configuration
      return {
        continueExecution: true,
        retryDelay: cooldownSeconds * 1000 // Convert to milliseconds
      };
    }
    
    // Continue for other errors with default retry delay
    return true;
  };
  
  // Start the gathering loop with cooldown check
  try {
    await executeWithCooldown(gatherWithCooldownCheck, onSuccess, onError, maxAttempts);
  } catch (error) {
    console.error('Fatal error in gathering loop:', error.message);
  }
}

// Execute the main function
main();
