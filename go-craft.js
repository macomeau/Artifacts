// Use node go-craft.js "(x,y)" <item_code> <quantity> in the terminal to execute the script.
// This script moves the character to specified coordinates and performs crafting.

// Import the API utilities and database
const { moveCharacter, craftingAction, getCharacterDetails } = require('./api');
const config = require('./config');
const db = require('./db');

/**
 * Parse coordinates from string format "(x,y)" to numbers
 * @param {string} coordString - Coordinates in string format "(x,y)"
 * @returns {Object} - Object with x and y properties
 */
function parseCoordinates(coordString) {
  // Remove parentheses and split by comma
  const coordMatch = coordString.match(/\((-?\d+),(-?\d+)\)/);
  
  if (!coordMatch) {
    throw new Error('Invalid coordinate format. Use format "(x,y)" e.g. "(2,0)"');
  }
  
  return {
    x: parseInt(coordMatch[1], 10),
    y: parseInt(coordMatch[2], 10)
  };
}

/**
 * Main function to move to coordinates and craft items
 */
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.error('Usage: node go-craft.js "(x,y)" <item_code> <quantity>');
      console.error('Example: node go-craft.js "(2,0)" WOODEN_SWORD 1');
      process.exit(1);
    }
    
    // Parse coordinates
    const coords = parseCoordinates(args[0]);
    const itemCode = args[1];
    const quantity = parseInt(args[2], 10);
    
    // Validate quantity
    if (isNaN(quantity) || quantity < 1) {
      console.error('Quantity must be a positive integer');
      process.exit(1);
    }
    
    // Check character's current position and cooldown status
    console.log('Checking character details before moving...');
    try {
      const characterDetails = await getCharacterDetails();
      
      // Check if character is already at the destination
      if (characterDetails.x === coords.x && characterDetails.y === coords.y) {
        console.log(`Character is already at coordinates (${coords.x}, ${coords.y}). Skipping movement.`);
      } else {
        // Check if character is in cooldown
        if (characterDetails.cooldown && characterDetails.cooldown > 0) {
          const now = new Date();
          const expirationDate = new Date(characterDetails.cooldown_expiration);
          const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
          
          if (cooldownSeconds > 0) {
            console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
            
            // Wait for the cooldown
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          }
        }
        
        // Now move the character to the specified coordinates
        console.log(`Moving character ${config.character} to coordinates (${coords.x}, ${coords.y})...`);
        try {
          const moveResult = await moveCharacter(coords.x, coords.y);
          console.log('Movement successful:');
          console.log(moveResult);
          
          // Log movement to database
          await db.query(
            'INSERT INTO action_logs (character, action_type, coordinates, result) VALUES ($1, $2, POINT($3, $4), $5)',
            [config.character, 'move', coords.x, coords.y, JSON.stringify(moveResult)]
          );
        } catch (error) {
          // Handle cooldown errors for movement
          const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
          if (cooldownMatch) {
            const cooldownSeconds = parseFloat(cooldownMatch[1]);
            console.log(`Movement action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
            
            // Wait for the cooldown
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
            
            // Try again after cooldown
            console.log('Retrying movement after cooldown...');
            try {
              const moveResult = await moveCharacter(coords.x, coords.y);
              console.log('Movement successful:');
              console.log(moveResult);
            } catch (retryError) {
              console.error('Movement failed after retry:', retryError.message);
              process.exit(1);
            }
          } else if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the destination. Continuing with crafting...');
          } else {
            console.error('Movement failed:', error.message);
            process.exit(1);
          }
        }
      }
    } catch (error) {
      console.error('Failed to get character details:', error.message);
      console.log('Proceeding with movement without character details check...');
      
      // Attempt to move without character details check
      console.log(`Moving character ${config.character} to coordinates (${coords.x}, ${coords.y})...`);
      try {
        const moveResult = await moveCharacter(coords.x, coords.y);
        console.log('Movement successful:');
        console.log(moveResult);
      } catch (error) {
        console.error('Movement failed:', error.message);
        process.exit(1);
      }
    }
    
    // Now perform the crafting action
    console.log(`Crafting ${quantity} ${itemCode} at coordinates (${coords.x}, ${coords.y})...`);
    
    // Check if character is in cooldown before crafting
    console.log('Checking for cooldown before crafting...');
    try {
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
      
      // Perform crafting
      const result = await craftingAction(itemCode, quantity);
      console.log('Crafting successful:');
      console.log(result);
      
      // Log crafting to database
      await db.query(
        'INSERT INTO action_logs (character, action_type, result) VALUES ($1, $2, $3)',
        [config.character, 'craft', JSON.stringify({
          item: itemCode,
          quantity: quantity,
          result: result
        })]
      );
    } catch (error) {
      // Handle cooldown errors for crafting
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Crafting action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        
        // Try again after cooldown
        console.log('Retrying crafting after cooldown...');
        try {
          const result = await craftingAction(itemCode, quantity);
          console.log('Crafting successful:');
          console.log(result);
        } catch (retryError) {
          console.error('Crafting failed after retry:', retryError.message);
        }
      } else {
        console.error('Crafting failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Execute the main function
main();
