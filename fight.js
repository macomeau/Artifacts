/**
 * @fileoverview Script to initiate a fight action for a character.
 * Use node fight.js in the terminal to execute the script.
 * @module fight
 */

// Import the API utilities
const { fightAction, getCharacterDetails } = require('./api');
const config = require('./config');
const db = require('./db'); // Add db module for direct coordinate logging

/**
 * Main function to demonstrate character fighting.
 * Handles cooldown waiting, performs the fight action, and logs results.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If the fight action fails
 */
async function main() {
  try {
    console.log(`Initiating fight for character ${config.character}...`);
    
    // Check if character is in cooldown before fighting
    console.log('Checking for cooldown before fighting...');
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
      
      // Get coordinates before fight to record starting position
      const beforeDetails = await getCharacterDetails();
      console.log(`Starting fight at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      // Log coordinates to database before action
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          config.character,
          'action/fight_start',
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting fight action' }
        ]
      );
      
      // Perform the fight action
      const result = await fightAction();
      
      // Get the current coordinates for logging after fight
      const afterDetails = await getCharacterDetails();
      
      console.log(`Fight action successful at coordinates (${afterDetails.x}, ${afterDetails.y}):`);
      console.log(result);
      
      // Show character health after fight
      if (result.character) {
        console.log(`Character HP after fight: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
      }
    } catch (error) {
      // Handle specific errors
      if (error.message.includes('Monster not found')) {
        console.log('No monsters found on this map. You may need to move to a different location.');
      } else {
        // Handle cooldown errors for fight action (in case our cooldown check missed something)
        const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
        if (cooldownMatch) {
          const cooldownSeconds = parseFloat(cooldownMatch[1]);
          console.log(`Fight action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          
          // Wait for the cooldown
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          
          // Get coordinates before fight retry
          const beforeRetryDetails = await getCharacterDetails();
          console.log(`Retrying fight at coordinates (${beforeRetryDetails.x}, ${beforeRetryDetails.y})...`);
          
          // Log coordinates to database before retry
          await db.query(
            `INSERT INTO action_logs(character, action_type, coordinates, result)
             VALUES ($1, $2, point($3,$4), $5)`,
            [
              config.character,
              'action/fight_retry',
              beforeRetryDetails.x || 0,
              beforeRetryDetails.y || 0,
              { message: 'Retrying fight action after cooldown' }
            ]
          );

          // Try again after cooldown
          const result = await fightAction();
          
          // Get coordinates after fight retry
          const afterRetryDetails = await getCharacterDetails();
          console.log(`Fight action successful at coordinates (${afterRetryDetails.x}, ${afterRetryDetails.y}):`);
          console.log(result);
          
          // Show character health after fight
          if (result.character) {
            console.log(`Character HP after fight: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
          }
        } else {
          // For other errors, rethrow
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('Fight action failed:', error.message);
  }
}

// Execute the main function
main();
