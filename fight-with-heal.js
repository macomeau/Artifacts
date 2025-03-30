/**
 * @fileoverview Script to check health, heal if needed, and then fight.
 * Use node fight-with-heal.js in the terminal to execute the script.
 * @module fight-with-heal
 */

// Import the API utilities
const { fightAction, restAction, getCharacterDetails, healCharacter } = require('./api'); // Added healCharacter
const config = require('./config');

/**
 * Main function to check health, heal if needed, and then fight
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If any action fails
 */
async function main() {
  try {
    console.log(`Preparing character ${config.character} for battle...`);
    
    // Get character details without triggering cooldown
    let characterInfo;
    try {
      characterInfo = await getCharacterDetails();
      
      if (!characterInfo) {
        throw new Error('Character information not available');
      }
      
      console.log(`Got character details without triggering cooldown`);
    } catch (error) {
      console.error('Failed to get character details from public API, falling back to rest action:', error.message);
      
      // Fallback to rest action if public API fails
      try {
        const result = await restAction();
        characterInfo = result.character;
        
        if (!characterInfo) {
          throw new Error('Character information not available');
        }
      } catch (restError) {
        // Handle cooldown errors for rest action
        const cooldownMatch = restError.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
        if (cooldownMatch) {
          const cooldownSeconds = parseFloat(cooldownMatch[1]);
          console.log(`Character in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          
          // Wait for the cooldown
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          
          // Try again after cooldown
          const result = await restAction();
          characterInfo = result.character;
        } else {
          // For other errors, rethrow
          throw restError;
        }
      }
    }
    // Check health and heal if needed
    if (characterInfo.hp < characterInfo.max_hp) {
      // Use healCharacter from api.js, passing the character name from config
      characterInfo = await healCharacter(config.character);
    }

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
      
      // Now that we've waited for any cooldown, start a fight
      console.log('Starting fight...');
      const result = await fightAction();
      
      console.log('Fight action successful:');
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
          
          // Try again after cooldown
          console.log('Retrying fight after cooldown...');
          const result = await fightAction();
          
          console.log('Fight action successful:');
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
    console.error('Action failed:', error.message);
  }
}

// Execute the main function
main();
