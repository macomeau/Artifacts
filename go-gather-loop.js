// Use node go-gather-loop.js (2,0) 5 in the terminal to execute the script.
// This script moves the character to specified coordinates and performs gathering actions in a loop.

// Import the API utilities
const { moveCharacter, gatheringAction, getCharacterDetails, executeWithCooldown } = require('./api');
const config = require('./config');

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
 * Main function to move to coordinates and perform gathering in a loop
 */
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.error('Usage: node go-gather-loop.js "(x,y)" [numberOfGathers]');
      console.error('Example: node go-gather-loop.js "(2,0)" 5');
      console.error('If numberOfGathers is omitted, will gather until inventory is full');
      process.exit(1);
    }

    // Log the received arguments for debugging
    console.log('Received arguments:', args);
    
    // Handle different coordinate formats
    let x, y;
    // Default to gathering until inventory is full
    let numberOfGathers = Infinity;
    
    // Check if we have at least 2 arguments (could be x and y separately)
    if (args.length >= 2 && !isNaN(parseInt(args[0], 10)) && !isNaN(parseInt(args[1], 10))) {
      // Format: x y count (e.g., 2 0 3)
      x = parseInt(args[0], 10);
      y = parseInt(args[1], 10);
      
      // In this case, the gather count is the third argument
      numberOfGathers = parseInt(args[2], 10);
      
      console.log(`Using coordinates (${x}, ${y}) and ${numberOfGathers} gathers`);
    } else if (args.length >= 1) {
      // Format: "(x,y)" count (e.g., "(2,0)" 3)
      let coordString = args[0];
      console.log('Coordinate string:', coordString);
      
      // Try to extract numbers from the string
      const numbers = coordString.match(/-?\d+/g);
      if (numbers && numbers.length >= 2) {
        x = parseInt(numbers[0], 10);
        y = parseInt(numbers[1], 10);
        console.log(`Parsed coordinates: (${x}, ${y})`);
      } else {
        console.error('Could not parse coordinates from input:', coordString);
        console.error('Usage examples:');
        console.error('  npm run go-gather-loop -- "(2,0)" 3');
        console.error('  npm run go-gather-loop -- 2 0 3');
        process.exit(1);
      }
      
      // Parse number of gathers from the second argument if provided
      numberOfGathers = args[1] ? parseInt(args[1], 10) : 0;
    } else {
      console.error('Not enough arguments provided');
      console.error('Usage examples:');
      console.error('  npm run go-gather-loop -- "(2,0)" 3');
      console.error('  npm run go-gather-loop -- 2 0 3');
      process.exit(1);
    }
    
    // Validate number of gathers
    if (isNaN(numberOfGathers) || numberOfGathers < 0) {
      console.log('No valid gather count specified - will gather until inventory is full');
      numberOfGathers = Infinity;
    }
    
    if (numberOfGathers === 0 || numberOfGathers === Infinity) {
      console.log('Will gather until inventory is full');
    }
    
    // Create coords object
    const coords = { x, y };
    
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
            console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds before moving...`);
            
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
            console.log('Character is already at the destination. Continuing with gathering...');
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
    
    console.log(`Starting gathering loop for ${numberOfGathers} gathers...`);
    console.log('Will check for cooldown before each gathering attempt.');
    console.log('---------------------------------------------------');
    
    // Custom action function that checks cooldown before gathering
    const gatherWithCooldownCheck = async () => {
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
      } catch (error) {
        console.error('Failed to check cooldown with getCharacterDetails:', error.message);
        // Continue even if we can't check cooldown, the gathering action will handle it
      }
      
      // Start gathering
      console.log('Starting gathering...');
      return await gatheringAction();
    };
    
    // Custom success handler
    const onSuccess = async (result) => {
      console.log('Gathering successful!');
      
      // Log gathered resources if available
      if (result.resources) {
        console.log('Resources gathered:');
        console.log(result.resources);
      }
      
      // Get and display formatted inventory
      try {
        const characterDetails = await getCharacterDetails();
        if (characterDetails && characterDetails.inventory) {
          console.log('\n=== Inventory ===');
          
          // Create a map to track items and their quantities
          const inventoryMap = new Map();
          
          characterDetails.inventory.forEach(item => {
            if (item && item.code) {
              const existing = inventoryMap.get(item.code) || {count: 0, quantity: 0};
              inventoryMap.set(item.code, {
                count: existing.count + 1,
                quantity: existing.quantity + (item.quantity || 1)
              });
            }
          });
          
          // Display inventory in a table-like format
          let totalItems = 0;
          let totalQuantity = 0;
          inventoryMap.forEach((details, code) => {
            if (details.quantity > details.count) {
              console.log(`- ${code}: ${details.quantity} (${details.count} stacks)`);
            } else {
              console.log(`- ${code}: ${details.quantity}`);
            }
            totalItems += details.count;
            totalQuantity += details.quantity;
          });
          
          console.log(`\nTotal quantity: ${totalQuantity}`);
          console.log(`\nTotal items: ${totalQuantity}/${characterDetails.inventory_max_items}`);
          console.log('================\n');
        }
      } catch (error) {
        console.error('Failed to get inventory:', error.message);
      }
    };
    
    // Custom error handler
    const onError = (error, attempts) => {
      console.error(`Gathering attempt ${attempts} failed: ${error.message}`);
      
      // Stop on specific errors
      if (error.message.includes('inventory is full')) {
        console.log('Stopping: Inventory is full.');
        return false;
      }
      
      if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
        console.log('Stopping: No resources available at this location.');
        return false;
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
    
    // Start the gathering loop with cooldown check and limited attempts
    try {
      await executeWithCooldown(gatherWithCooldownCheck, onSuccess, onError, numberOfGathers);
      console.log(`Completed ${numberOfGathers} gathering attempts.`);
    } catch (error) {
      console.error('Fatal error in gathering loop:', error.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Execute the main function
main();
