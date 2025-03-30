/**
 * @fileoverview Script to recycle items from a character's inventory.
 * Use node recycling.js in the terminal to execute the script.
 * @module recycling
 */

// Import the API utilities
const { recyclingAction, getCharacterDetails } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate recycling items.
 * Handles command line arguments, validates inputs, manages cooldowns, and performs the recycling action.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the recycling action fails
 */
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    
    // Default values
    let itemCode = args[0] || null;
    let quantity = args[1] ? parseInt(args[1], 10) : 1;
    
    // Validate arguments
    if (!itemCode) {
      console.error('Item code is required for recycling');
      console.error('Usage: node recycling.js <item_code> [quantity]');
      console.error('Example: node recycling.js STONE 5');
      process.exit(1);
    }
    
    if (isNaN(quantity) || quantity < 1) {
      console.error('Quantity must be a positive number');
      process.exit(1);
    }
    
    console.log(`Recycling ${quantity} ${itemCode} for character ${config.character}...`);
    
    // Check if character is in cooldown before recycling
    console.log('Checking for cooldown before recycling...');
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
      
      // Now that we've waited for any cooldown, start recycling
      console.log('Starting recycling...');
      const result = await recyclingAction(itemCode, quantity);
      
      console.log('Recycling action successful:');
      console.log(result);
      
      // Log inventory status if available
      if (result.character && result.character.inventory) {
        const inventoryCount = result.character.inventory.filter(item => item && item.code).length;
        console.log(`Inventory: ${inventoryCount}/${result.character.inventory_max_items} items`);
      }
    } catch (error) {
      // Handle specific errors
      if (error.message.includes('Item not found')) {
        console.log(`Item ${itemCode} not found in inventory.`);
      } else if (error.message.includes('Insufficient quantity')) {
        console.log(`Not enough ${itemCode} in inventory to recycle ${quantity}.`);
      } else {
        // Handle cooldown errors for recycling action (in case our cooldown check missed something)
        const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
        if (cooldownMatch) {
          const cooldownSeconds = parseFloat(cooldownMatch[1]);
          console.log(`Recycling action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          
          // Wait for the cooldown
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          
          // Try again after cooldown
          console.log('Retrying recycling after cooldown...');
          const result = await recyclingAction(itemCode, quantity);
          
          console.log('Recycling action successful:');
          console.log(result);
        } else {
          // For other errors, rethrow
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('Recycling action failed:', error.message);
  }
}

// Execute the main function
main();
