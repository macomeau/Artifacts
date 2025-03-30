/**
 * @fileoverview Script to perform fight actions in a loop, alternating between fighting and resting.
 * Use node fight-loop.js in the terminal to execute the script.
 * @module fight-loop
 */

// Import the API utilities
const { fightLoopAction, getCharacterDetails, fightAction, restAction, executeWithCooldown } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate continuous fighting and resting.
 * Sets up a loop that alternates between fight and rest actions with cooldown handling.
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If there's a fatal error in the fight loop
 */
async function main() {
  console.log(`Starting continuous fight loop for character ${config.character}...`);
  console.log('Will check for cooldown before each action.');
  console.log('Press Ctrl+C to stop the script at any time.');
  console.log('---------------------------------------------------');
  
  // Define max attempts (0 for infinite)
  const maxAttempts = 0; // Set to a number to limit attempts
  
  // Track the current action (starts with fight)
  let isFighting = true;
  
  /**
   * Custom action function that alternates between fight and rest with cooldown check
   * @async
   * @returns {Promise<Object>} Result of either fight or rest action
   * @throws {Error} If either action fails
   */
  const alternateActions = async () => {
    // Check if character is in cooldown before action
    console.log('Checking for cooldown before action...');
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
      // Continue even if we can't check cooldown, the action will handle it
    }
    
    if (isFighting) {
      // Perform fight action
      console.log('Starting fight...');
      const result = await fightAction();
      isFighting = false; // Next action will be rest
      return result;
    } else {
      // Perform rest action
      console.log('Starting rest...');
      const result = await restAction();
      isFighting = true; // Next action will be fight
      return result;
    }
  };
  
  /**
   * Success handler for fight and rest actions
   * @param {Object} result - The result from the current action
   * @param {Object} [result.character] - Character information after the action
   * @param {Object} [result.fight] - Fight result information
   * @returns {void}
   */
  const onSuccess = (result) => {
    // isFighting has already been toggled by the time we get here,
    // so it represents the NEXT action, not the current one
    if (isFighting) {
      console.log('Rest successful!');
      
      // Log character status if available
      if (result.character) {
        console.log(`Character HP: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
      }
    } else {
      console.log('Fight successful!');
      
      // Log fight results if available
      if (result.fight && result.fight.result) {
        console.log(`Fight result: ${result.fight.result}`);
      }
      
      // Log character status if available
      if (result.character) {
        console.log(`Character HP: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
      }
    }
  };
  
  /**
   * Error handler for fight and rest actions
   * @param {Error} error - The error that occurred during the action
   * @param {number} attempts - The number of attempts made so far
   * @returns {boolean|Object} Whether to continue execution or configuration for retry
   */
  const onError = (error, attempts) => {
    console.error(`Attempt ${attempts} failed: ${error.message}`);
    
    // Stop on specific errors
    if (error.message.includes('character is dead')) {
      console.log('Stopping: Character has died.');
      return false;
    }
    
    // Handle "Monster not found" error
    if (error.message.includes('Monster not found')) {
      console.log('No monsters found on this map. You may need to move to a different location.');
      console.log('Continuing with rest action...');
      // Continue with the loop, which will alternate to rest action
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
  
  // Start the fight loop with cooldown check
  try {
    await executeWithCooldown(alternateActions, onSuccess, onError, maxAttempts);
  } catch (error) {
    console.error('Fatal error in fight loop:', error.message);
  }
}

// Execute the main function
main();
