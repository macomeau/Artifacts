/**
 * @fileoverview Script to perform fight actions in a loop, healing after each fight.
 * Use node fight-loop-with-heal.js [character_name] in the terminal to execute the script.
 * If no character name is provided, it will use the character from environment or config.
 * @module fight-loop-with-heal
 */

// Import the API utilities
const { fightAction, restAction, executeWithCooldown, getCharacterDetails, healCharacter } = require('./api'); // Added healCharacter
const config = require('./config');

// Get character name from command line arguments if provided
const args = process.argv.slice(2);
const characterName = args[0] || config.character;

/**
 * Main function to demonstrate continuous fighting with healing after each fight
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If there's a fatal error in the fight loop
 */
async function main() {
  console.log(`Starting continuous fight loop for character ${characterName}...`);
  console.log('Will heal before starting and after every fight to restore full health.');
  console.log('Press Ctrl+C to stop the script at any time.');
  console.log('---------------------------------------------------');
  
  // First, get the character's current status and heal if needed
  console.log('Checking initial health status...');
  let characterInfo;
  try {
    // Get character details without triggering cooldown
    characterInfo = await getCharacterDetails(characterName);
    
    if (!characterInfo) {
      throw new Error('Character information not available');
    }
    
    console.log(`Got character details without triggering cooldown`);
    
    // Heal to full health before starting the fight loop
    if (characterInfo.hp < characterInfo.max_hp) {
      console.log('Initial healing before starting fight loop...');
      // Use healCharacter from api.js, passing the character name
      characterInfo = await healCharacter(characterName);
    } else {
      console.log(`Health is already full: ${characterInfo.hp}/${characterInfo.max_hp} (${Math.round(characterInfo.hp / characterInfo.max_hp * 100)}%)`);
    }
  } catch (error) {
    console.error('Failed to get character details from public API, falling back to rest action:', error.message);
    
    // Fallback to rest action if public API fails
    try {
      const result = await restAction(characterName);
      characterInfo = result.character;
      
      if (!characterInfo) {
        throw new Error('Character information not available');
      }
      
      // Heal to full health before starting the fight loop
      if (characterInfo.hp < characterInfo.max_hp) {
        console.log('Initial healing before starting fight loop...');
        // Use healCharacter from api.js, passing the character name
        characterInfo = await healCharacter(characterName);
      } else {
        console.log(`Health is already full: ${characterInfo.hp}/${characterInfo.max_hp} (${Math.round(characterInfo.hp / characterInfo.max_hp * 100)}%)`);
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
        const result = await restAction(characterName);
        characterInfo = result.character;
        
        // Heal to full health before starting the fight loop
        if (characterInfo.hp < characterInfo.max_hp) {
          console.log('Initial healing before starting fight loop...');
          // Use healCharacter from api.js, passing the character name
          characterInfo = await healCharacter(characterName);
        } else {
          console.log(`Health is already full: ${characterInfo.hp}/${characterInfo.max_hp} (${Math.round(characterInfo.hp / characterInfo.max_hp * 100)}%)`);
        }
      } else {
        console.error('Failed to get character status:', restError.message);
        return; // Exit if we can't get character status
      }
    }
  }
  
  // Define max attempts (0 for infinite)
  const maxAttempts = 0; // Set to a number to limit attempts
  
  // Track the last known character state
  let lastCharacterState = characterInfo;
  
  /**
   * Combines fighting and healing actions with cooldown handling
   * @async
   * @returns {Promise<Object>} Result of fight action
   * @throws {Error} If fight or heal actions fail
   */
  const fightAndHeal = async () => {
    // Check if character is in cooldown before fighting
    console.log('Checking for cooldown before fighting...');
    try {
      // Get fresh character details to check cooldown
      const freshDetails = await getCharacterDetails(characterName);
      
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
      // Continue even if we can't check cooldown, the fight action will handle it
    }
    
    // Start a fight
    console.log('Starting fight...');
    const result = await fightAction(characterName);
    
    // Update character state
    lastCharacterState = result.character;
    
    // Always heal after a fight
    if (lastCharacterState) {
      console.log('Fight completed. Healing before next fight...');
      // Use healCharacter from api.js, passing the character name
      lastCharacterState = await healCharacter(characterName);
    }

    return result;
  };
  
  /**
   * Success handler for fight actions
   * @param {Object} result - The result from the fight action
   * @param {Object} [result.character] - Character information after the fight
   * @param {Object} [result.enemy] - Information about the defeated enemy
   * @returns {void}
   */
  const onSuccess = (result) => {
    console.log('Fight successful!');
    
    // Log fight results if available
    if (result.enemy) {
      console.log(`Defeated enemy: ${result.enemy.name}`);
    }
    
    // Log character status if available
    if (result.character) {
      console.log(`Character HP: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
    }
  };
  
  /**
   * Error handler for fight actions
   * @param {Error} error - The error that occurred during the action
   * @param {number} attempts - The number of attempts made so far
   * @returns {boolean|Object} Whether to continue execution or configuration for retry
   */
  const onError = async (error, attempts) => {
    console.error(`Attempt ${attempts} failed: ${error.message}`);
    
    // Handle character death by respawning
    if (error.message.includes('character is dead')) {
      console.log('Character has died. Will heal, then continue fighting...');
      
      try {
        // Get current character details after respawn
        console.log('Getting character details after respawn...');
        let characterInfo = await getCharacterDetails(characterName);
        
        if (!characterInfo) {
          console.log('Failed to get character details, attempting to rest...');
          const result = await restAction(characterName);
          characterInfo = result.character;
        }
        
        // Character should be at 1 HP at (0,0) after respawn
        console.log(`Character respawned at coordinates (${characterInfo.x}, ${characterInfo.y}) with ${characterInfo.hp}/${characterInfo.max_hp} HP`);
        
        // Heal the character to full health
        console.log('Healing character before continuing...');
        // Use healCharacter from api.js, passing the character name
        const healedChar = await healCharacter(characterName);

        // Update the last known character state
        lastCharacterState = healedChar;
        
        // Check if we need to move back to combat location
        if (characterInfo.x === 0 && characterInfo.y === 0) {
          console.log('Character is at spawn point. Need to move back to combat location.');
          // This will be handled in the next loop iteration via the fight action
        }
        
        // Continue with the next fight cycle
        return {
          continueExecution: true,
          retryDelay: 2000 // Short delay before next attempt
        };
      } catch (healError) {
        console.error('Failed to handle respawn:', healError.message);
        // If we can't handle the respawn process, stop the loop
        return false;
      }
    }
    
    // Handle "Monster not found" error
    if (error.message.includes('Monster not found')) {
      console.log('No monsters found on this map. You may need to move to a different location.');
      return true;
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
  
  // Start the fight loop with healing after each fight
  try {
    await executeWithCooldown(fightAndHeal, onSuccess, onError, maxAttempts);
  } catch (error) {
    console.error('Fatal error in fight loop:', error.message);
  }
}

// Execute the main function
main();
