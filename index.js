//Use node index.js in the terminal to execute the script.
//Warning: Firefox does not fully support the editor. Please use a chromium-based web browser such as Chrome, Brave or Edge.
//This script is a basic example of a player's movement.

// Import the API utilities
const { moveCharacter } = require('./api');
const config = require('./config');

/**
 * Main function to demonstrate character movement
 */
async function main() {
  try {
    console.log(`Moving character ${config.character}...`);
    
    // Move the character by 0 in X direction and 1 in Y direction
    const result = await moveCharacter(2, 1);
    
    console.log('Movement successful:');
    console.log(result);
  } catch (error) {
    console.error('Movement failed:', error.message);
  }
}

// Execute the main function
main();
