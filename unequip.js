/**
 * @fileoverview Script to unequip an item from a specific slot for a character.
 * Use node unequip.js in the terminal to execute the script.
 * @module unequip
 */

// Import the API utilities
const { unequipAction, getCharacterDetails } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate unequipping items.
 * Handles command line arguments, cooldown waiting, and performs the unequip action.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the unequip action fails
 */
async function main() {
  // Check if slot was provided as command line argument
  const slot = process.argv[2] || 'weapon';
  
  if (!slot) {
    console.log('Usage: node unequip.js <slot>');
    console.log('Example: node unequip.js weapon');
    console.log('Available slots: weapon, shield, helmet, body_armor, leg_armor, boots, ring1, ring2, amulet, artifact1, artifact2, artifact3');
    return;
  }
  
  try {
    console.log(`Unequipping item from ${slot} slot for character ${config.character}...`);
    
    // Check if character is in cooldown before unequipping
    console.log('Checking for cooldown before unequipping...');
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
      
      // Now that we've waited for any cooldown, perform unequip action
      console.log('Starting unequip action...');
      const result = await unequipAction(slot);
      
      console.log('Unequip successful:');
      console.log(result);
    } catch (error) {
      // Handle cooldown errors for unequip action (in case our cooldown check missed something)
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Unequip action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        
        // Try again after cooldown
        console.log('Retrying unequip after cooldown...');
        const result = await unequipAction(slot);
        
        console.log('Unequip successful:');
        console.log(result);
      } else {
        // For other errors, rethrow
        throw error;
      }
    }
  } catch (error) {
    console.error('Unequip failed:', error.message);
  }
}

// Execute the main function
main();
