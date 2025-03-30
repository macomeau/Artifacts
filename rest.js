/**
 * @fileoverview Script to perform a rest action for a character to recover HP.
 * Use node rest.js in the terminal to execute the script.
 * @module rest
 */

// Import the API utilities
const { restAction, getCharacterDetails } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate character resting.
 * Handles cooldown waiting, performs the rest action, and logs results.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the rest action fails
 */
async function main() {
  try {
    console.log(`Resting character ${config.character}...`);
    
    // Check if character is in cooldown before resting
    console.log('Checking for cooldown before resting...');
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
      
      // Now that we've waited for any cooldown, perform rest action
      console.log('Starting rest action...');
      const result = await restAction();
      
      console.log('Rest action successful:');
      console.log(result);
      
      // Show character health after rest
      if (result.character) {
        console.log(`Character HP after rest: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
      }
    } catch (error) {
      // Handle cooldown errors for rest action (in case our cooldown check missed something)
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Rest action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        
        // Try again after cooldown
        console.log('Retrying rest after cooldown...');
        const result = await restAction();
        
        console.log('Rest action successful:');
        console.log(result);
        
        // Show character health after rest
        if (result.character) {
          console.log(`Character HP after rest: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
        }
      } else {
        // For other errors, rethrow
        throw error;
      }
    }
  } catch (error) {
    console.error('Rest action failed:', error.message);
  }
}

// Execute the main function
main();
