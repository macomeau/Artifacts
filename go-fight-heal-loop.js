/**
 * @fileoverview Script to move a character to specified coordinates and perform fight-heal actions in a loop.
 * Use node go-fight-heal-loop.js "(x,y)" in the terminal to execute the script.
 * @module go-fight-heal-loop
 */

// Import the API utilities and deposit function
const { moveCharacter, fightAction, restAction, executeWithCooldown, getCharacterDetails, healCharacter } = require('./api'); // Added healCharacter
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config'); // Import the final config object
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
 * Main function to move to coordinates and perform fight-heal actions in a loop
 * @async
 * @returns {Promise<void>}
 * @throws {Error} If movement, fighting, or healing actions fail
 */
async function main() {
  try {
    // Ensure database tables are ready before proceeding
    await db.createTables();

    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.error('Usage: node go-fight-heal-loop.js "(x,y)"');
      console.error('Example: node go-fight-heal-loop.js "(2,0)"');
      process.exit(1);
    }
    
    // Log the received arguments for debugging
    console.log('Received arguments:', args);
    
    // Handle different coordinate formats
    let x, y;
    let characterName;
    
    // First, check for a combined coordinate string in any position
    const coordPattern = /\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/;
    let coordFound = false;
    
    // Look through all arguments for a coordinate pattern (x,y)
    for (let i = 0; i < args.length; i++) {
      if (!args[i]) continue;
      const match = String(args[i]).match(coordPattern);
      if (match) {
        x = parseInt(match[1], 10);
        y = parseInt(match[2], 10);
        coordFound = true;
        
        // If this isn't the last argument, the next one might be the character name
        if (i < args.length - 1) {
          characterName = args[i + 1];
        }
        
        console.log(`Found coordinates (${x}, ${y}) in argument ${i+1}`);
        break;
      }
    }
    
    // If no coordinate pattern was found, try other formats
    if (!coordFound) {
      // Check if first argument contains two numbers separated by a comma (no parentheses)
      const commaPattern = /^(-?\d+),(-?\d+)$/;
      const commaMatch = args[0] ? String(args[0]).match(commaPattern) : null;
      
      if (commaMatch) {
        x = parseInt(commaMatch[1], 10);
        y = parseInt(commaMatch[2], 10);
        console.log(`Parsed comma-separated coordinates: ${x},${y}`);
        
        // If there's a second argument, it might be the character name
        if (args.length > 1) {
          characterName = args[1];
        }
      } 
      // Check if we have separate x and y coordinates as first two arguments
      else if (args.length >= 2 && !isNaN(parseInt(args[0], 10)) && !isNaN(parseInt(args[1], 10))) {
        x = parseInt(args[0], 10);
        y = parseInt(args[1], 10);
        console.log(`Using separate x,y arguments: ${x},${y}`);
        
        // If there's a third argument, it might be the character name
        if (args.length > 2) {
          characterName = args[2];
        }
      } 
      // Try to extract any numbers from the first argument as a last resort
      else if (args.length >= 1) {
        let coordString = String(args[0] || "");
        console.log('Attempting to extract numbers from:', coordString);
        
        const numbers = coordString.match(/-?\d+/g);
        if (numbers && numbers.length >= 2) {
          x = parseInt(numbers[0], 10);
          y = parseInt(numbers[1], 10);
          console.log(`Extracted coordinates: (${x}, ${y})`);
          
          // If there's a second argument, it might be the character name
          if (args.length > 1) {
            characterName = args[1];
          }
        } else {
          console.error('Could not parse coordinates from input:', args.join(' '));
          console.error('Usage examples:');
          console.error('  npm run go-fight-heal-loop -- "(2,0)"');
          console.error('  npm run go-fight-heal-loop -- 2,0');
          console.error('  npm run go-fight-heal-loop -- 2 0');
          process.exit(1);
        }
      }
    }
    
    // If we still couldn't parse coordinates, show error
    if (typeof x === 'undefined' || typeof y === 'undefined') {
      console.error('Not enough arguments provided or could not parse coordinates');
      console.error('Usage examples:');
      console.error('  npm run go-fight-heal-loop -- "(2,0)"');
      console.error('  npm run go-fight-heal-loop -- 2,0');
      console.error('  npm run go-fight-heal-loop -- 2 0');
      process.exit(1);
    }
    
    // Create coords object
    const coords = { x, y };
    
    // Check character's current position and cooldown status
    console.log('Checking character details before moving...');
    try {
      // Add a small delay before checking cooldown to ensure we get the latest data
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const characterDetails = await getCharacterDetails(characterName);
      
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
        console.log(`Moving character to coordinates (${coords.x}, ${coords.y})...`);
        try {
          const moveResult = await moveCharacter(coords.x, coords.y, characterName);
          console.log('Movement successful:');
          console.log(moveResult);
          
          // Log movement action to database
          try {
            await db.query(
              `INSERT INTO action_logs(character, action_type, result, coordinates)
               VALUES ($1, 'move', $2, point($3,$4))`,
              [
                characterName || config.character, // Use config.character directly
                { destination: `(${coords.x},${coords.y})` },
                coords.x,
                coords.y
              ]
            );
          } catch (dbError) {
            console.error('Failed to log movement action to database:', dbError.message);
          }
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
              const moveResult = await moveCharacter(coords.x, coords.y, characterName);
              console.log('Movement successful:');
              console.log(moveResult);
              
              // Log movement action to database
              try {
                await db.query(
                  `INSERT INTO action_logs(character, action_type, result, coordinates)
                   VALUES ($1, 'move', $2, point($3,$4))`,
                  [
                    characterName || config.character, // Use config.character directly
                    { destination: `(${coords.x},${coords.y})` },
                    coords.x,
                    coords.y
                  ]
                );
              } catch (dbError) {
                console.error('Failed to log movement action to database:', dbError.message);
              }
            } catch (retryError) {
              console.error('Movement failed after retry:', retryError.message);
              process.exit(1);
            }
          } else if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the destination. Continuing with fighting...');
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
      console.log(`Moving character to coordinates (${coords.x}, ${coords.y})...`);
      try {
        const moveResult = await moveCharacter(coords.x, coords.y, characterName);
        console.log('Movement successful:');
        console.log(moveResult);
        
        // Log movement action to database
        try {
          await db.query(
            `INSERT INTO action_logs(character, action_type, result, coordinates)
             VALUES ($1, 'move', $2, point($3,$4))`,
            [
              characterName || config.character, // Use config.character directly
              { destination: `(${coords.x},${coords.y})` },
              coords.x,
              coords.y
            ]
          );
        } catch (dbError) {
          console.error('Failed to log movement action to database:', dbError.message);
        }
      } catch (error) {
        console.error('Movement failed:', error.message);
        process.exit(1);
      }
    }
    
    // First, get the character's current status and heal if needed
    console.log('Checking initial health status...');
    let characterInfo;
    try {
      // Add a small delay before checking health to ensure we get the latest data
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
    
    console.log(`Starting fight-heal loop at coordinates (${coords.x}, ${coords.y})...`);
    console.log('Will check for cooldown before each action.');
    console.log('Press Ctrl+C to stop the script at any time.');
    console.log('---------------------------------------------------');
    
    // Define max attempts (0 for infinite)
    const maxAttempts = 0; // Set to a number to limit attempts
    
    // Track the last known character state
    let lastCharacterState = characterInfo;
    
    /**
     * Checks if inventory is full and deposits items if needed
     * @async
     * @returns {Promise<boolean>} True if inventory was full and items were deposited
     * @throws {Error} If inventory check or deposit actions fail
     */
    const checkInventory = async () => {
      try {
        const details = await getCharacterDetails(characterName);
        const totalItems = details.inventory.reduce((sum, slot) => sum + (slot?.quantity || 0), 0);
        
        if (totalItems >= details.inventory_max_items) {
          console.log('Inventory full - depositing...');
          
          // Log inventory full event
          await db.query(
            `INSERT INTO action_logs(character, action_type, result)
             VALUES ($1, 'inventory_full', $2)`,
            [characterName || config.character, { total_items: totalItems }] // Use config.character directly
          );

          // Deposit workflow
          await moveCharacter(4, 1, characterName);
          await depositAllItems(characterName); // Pass characterName here
          await moveCharacter(coords.x, coords.y, characterName);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Inventory check failed:', error.message);
        return false;
      }
    };

    /**
     * Custom action function that fights and then heals if health is low
     * @async
     * @returns {Promise<Object>} Result of fight action with cooldown information
     * @throws {Error} If fight or heal actions fail
     */
    const fightAndHeal = async () => {
      try {
        const wasFull = await checkInventory();
        if (wasFull) {
          console.log('Returned from bank deposit, continuing fight loop...');
        }
        
        // Get fresh cooldown status
        const freshDetails = await getCharacterDetails(characterName);
        if (freshDetails.cooldown > 0) {
          const cooldownSeconds = Math.ceil(freshDetails.cooldown);
          console.log(`Waiting ${cooldownSeconds}s cooldown before fighting...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000));
        }

        // Fight action
        console.log('Starting fight...');
        const result = await fightAction(characterName);
        
        // Heal if needed
        if (result.character.hp / result.character.max_hp < 0.65) {
          console.log('Healing after fight...');
          // Use healCharacter from api.js, passing the character name
          await healCharacter(characterName);
        }

        // Return modified result with cooldown
        return {
          ...result,
          cooldown: result.cooldown || { total_seconds: 1 } // Default 1s if missing
        };
      } catch (error) {
        console.error('Fight-heal cycle failed:', error.message);
        throw error; // Ensure error propagates to executeWithCooldown
      }
    };
    
    /**
     * Success handler for fight actions
     * @async
     * @param {Object} result - The result from the fight action
     * @param {Object} [result.character] - Character information after the fight
     * @param {Object} [result.enemy] - Information about the defeated enemy
     * @param {Array} [result.loot] - Items looted from the fight
     * @returns {Promise<void>}
     */
    const onSuccess = async (result) => {
      console.log('Fight successful!');
      
      // Log fight results if available
      if (result.enemy) {
        console.log(`Defeated enemy: ${result.enemy.name}`);
      }
      
      // Log character status if available
      if (result.character) {
        console.log(`Character HP: ${result.character.hp}/${result.character.max_hp} (${Math.round(result.character.hp / result.character.max_hp * 100)}%)`);
      }
      
      // Log fight action to database
      try {
        await db.query(
          `INSERT INTO action_logs(character, action_type, result, coordinates)
           VALUES ($1, 'fight', $2, point($3,$4))`,
          [
            characterName || config.character, // Use config.character directly
            {
              enemy: result.enemy ? result.enemy.name : 'unknown',
              hp_remaining: result.character ? result.character.hp : 0,
              hp_max: result.character ? result.character.max_hp : 0,
              loot: result.loot || []
            },
            coords.x,
            coords.y
          ]
        );
      } catch (dbError) {
        console.error('Failed to log fight action to database:', dbError.message);
      }
    };
    
    /**
     * Error handler for fight actions
     * @param {Error} error - The error that occurred during the action
     * @param {number} attempts - The number of attempts made so far
     * @returns {Promise<boolean|Object>} Whether to continue execution or configuration for retry
     */
    const onError = async (error, attempts) => { // Made async
      console.error(`Attempt ${attempts} failed: ${error.message}`);

      // Handle character death
      if (error.message.includes('character is dead')) {
        console.log('Character has died. Healing and then continuing fight loop...');
        try {
          // Heal the character (respawn and restore health)
          // Ensure characterName is accessible here (it should be from the outer scope)
          await healCharacter(characterName); 
          console.log('Character healed. Resuming fight loop.');
          // Optionally add a small delay after healing before the next attempt
          await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds
          return true; // Continue the loop after healing
        } catch (healError) {
          console.error('Failed to heal character after death:', healError.message);
          // If healing fails, we should probably stop
          return false; // Stop the loop if healing fails
        }
      }
      
      // Handle "Monster not found" error
      // Note: Ensure 'coords' and 'characterName' from the outer 'main' scope are accessible here.
      if (error.message.includes('Monster not found')) {
          console.log('Monster not found at current location. Healing and returning to start coordinates...');
          try {
              // Heal first (optional, but good practice if something unexpected happened)
              await healCharacter(characterName);
              console.log('Character healed.');
              
              // Move back to original coordinates
              console.log(`Moving back to original coordinates (${coords.x}, ${coords.y})...`);
              await moveCharacter(coords.x, coords.y, characterName);
              console.log('Returned to original coordinates. Resuming fight loop.');
              
              // Add a small delay after moving back
              await new Promise(resolve => setTimeout(resolve, 1500)); 
              return true; // Continue the loop from the original spot
          } catch (recoveryError) {
              console.error('Failed during recovery (heal/move) after "Monster not found":', recoveryError.message);
              return false; // Stop the loop if recovery fails
          }
      }

      // Handle cooldown errors
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        return {
          continueExecution: true,
          retryDelay: cooldownSeconds * 1000
        };
      }
      
      return true; // Continue with default retry
    };
    
    // Start the fight loop with healing after each fight
    try {
      await executeWithCooldown(fightAndHeal, async (result) => {
        await onSuccess(result);
      }, onError, maxAttempts);
    } catch (error) {
      console.error('Fatal error in fight loop:', error.message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Execute the main function
main();
