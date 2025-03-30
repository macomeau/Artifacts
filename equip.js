/**
 * @fileoverview Script to equip an item to a specific slot for a character.
 * Use node equip.js in the terminal to execute the script.
 * @module equip
 */

// Import the API utilities
const { equipAction, getCharacterDetails } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate equipping items.
 * Handles command line arguments, cooldown waiting, and performs the equip action.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the equip action fails
 */
async function main() {
  // Check if item code and slot were provided as command line arguments
  const code = process.argv[2];
  const slot = process.argv[3] || 'weapon';
  const quantity = parseInt(process.argv[4], 10) || 1;
  
  if (!code) {
    console.log('Usage: node equip.js <item_code> [slot] [quantity]');
    console.log('Example: node equip.js IRON_SWORD weapon 1');
    console.log('Available slots: weapon, shield, helmet, body_armor, leg_armor, boots, ring1, ring2, amulet, artifact1, artifact2, artifact3');
    return;
  }
  
  try {
    console.log(`Equipping ${code} to ${slot} slot for character ${config.character}...`);
    
    // Check if character is in cooldown before equipping
    console.log('Checking for cooldown before equipping...');
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
      
      // Now that we've waited for any cooldown, perform equip action
      console.log('Starting equip action...');
      const result = await equipAction(code, slot, quantity);
      
      console.log('Equip successful:');
      console.log(result);
    } catch (error) {
      // Handle cooldown errors for equip action (in case our cooldown check missed something)
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Equip action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        
        // Try again after cooldown
        console.log('Retrying equip after cooldown...');
        const result = await equipAction(code, slot, quantity);
        
        console.log('Equip successful:');
        console.log(result);
      } else {
        // For other errors, rethrow
        throw error;
      }
    }
  } catch (error) {
    console.error('Equip failed:', error.message);
  }
}

// Execute the main function
main();
