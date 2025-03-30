/**
 * @fileoverview Script to perform a crafting action for a character.
 * Use node crafting.js in the terminal to execute the script.
 * @module crafting
 */

// Import the API utilities
const { craftingAction, getCharacterDetails } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate crafting.
 * Handles cooldown waiting, performs the crafting action, and logs results.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the crafting action fails
 */
async function main() {
  // Check if code was provided as command line argument
  const code = process.argv[2] || 'ITEM';
  const quantity = parseInt(process.argv[3]) || 1;
  
  try {
    console.log(`Crafting ${quantity} items with code ${code} for character ${config.character}...`);
    
    // Check if character is in cooldown before crafting
    console.log('Checking for cooldown before crafting...');
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
      
      // Now that we've waited for any cooldown, perform crafting action
      console.log('Starting crafting...');
      const result = await craftingAction(code, quantity);
      
      console.log('Crafting successful:');
      console.log(result);
    } catch (error) {
      // Handle cooldown errors for crafting action (in case our cooldown check missed something)
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Crafting action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        
        // Try again after cooldown
        console.log('Retrying crafting after cooldown...');
        const result = await craftingAction(code, quantity);
        
        console.log('Crafting successful:');
        console.log(result);
      } else {
        // For other errors, rethrow
        throw error;
      }
    }
  } catch (error) {
    console.error('Crafting failed:', error.message);
  }
}

// Execute the main function
main();
