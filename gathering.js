/**
 * @fileoverview Script to perform a gathering action for a character.
 * Use node gathering.js in the terminal to execute the script.
 * @module gathering
 */

// Import the API utilities
const { gatheringAction, getCharacterDetails } = require('./api');
const config = require('./config');
const db = require('./db'); // Add db module for direct coordinate logging

/**
 * Main function to demonstrate gathering resources.
 * Handles cooldown waiting, performs the gathering action, and logs results.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the gathering action fails
 */
async function main() {
  try {
    console.log(`Gathering resources for character ${config.character}...`);
    
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
      
      // Get coordinates before gathering to record starting position
      const beforeDetails = await getCharacterDetails();
      console.log(`Starting gathering at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      // Log coordinates to database before action
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          config.character,
          'action/gathering_start',
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting gathering action' }
        ]
      );
      
      // Perform the gathering action
      const result = await gatheringAction();
      
      // Get the current coordinates for logging after gathering
      const afterDetails = await getCharacterDetails();
      
      console.log(`Gathering action successful at coordinates (${afterDetails.x}, ${afterDetails.y}):`);
      console.log(result);
    } catch (error) {
      // Handle specific errors
      if (error.message.includes('No resource on this map') || 
          error.message.includes('Resource not found')) {
        console.log('No resources found on this map. You may need to move to a different location.');
      } else if (error.message.includes('inventory is full')) {
        console.log('Inventory is full. You need to free up space before gathering more resources.');
      } else {
        // Handle cooldown errors for gathering action (in case our cooldown check missed something)
        const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
        if (cooldownMatch) {
          const cooldownSeconds = parseFloat(cooldownMatch[1]);
          console.log(`Gathering action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          
          // Wait for the cooldown
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          
          // Get coordinates before gathering retry
          const beforeRetryDetails = await getCharacterDetails();
          console.log(`Retrying gathering at coordinates (${beforeRetryDetails.x}, ${beforeRetryDetails.y})...`);
          
          // Log coordinates to database before retry
          await db.query(
            `INSERT INTO action_logs(character, action_type, coordinates, result)
             VALUES ($1, $2, point($3,$4), $5)`,
            [
              config.character,
              'action/gathering_retry',
              beforeRetryDetails.x || 0,
              beforeRetryDetails.y || 0,
              { message: 'Retrying gathering action after cooldown' }
            ]
          );

          // Try again after cooldown
          const result = await gatheringAction();
          
          // Get coordinates after gathering retry
          const afterRetryDetails = await getCharacterDetails();
          console.log(`Gathering action successful at coordinates (${afterRetryDetails.x}, ${afterRetryDetails.y}):`);
          console.log(result);
        } else {
          // For other errors, rethrow
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('Gathering action failed:', error.message);
  }
}

// Execute the main function
main();
