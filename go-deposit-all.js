/**
 * @fileoverview Script to move character to bank coordinates and deposit all inventory items.
 * Use node go-deposit-all.js in the terminal to execute the script.
 * @module go-deposit-all
 */

const db = require('./db');
const { moveCharacter, getCharacterDetails, makeApiRequest } = require('./api');
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
 * Deposit all items from inventory into the bank.
 * Handles cooldowns between deposits and logs each deposit operation.
 * @param {string} characterName - The name of the character performing the deposit.
 * @returns {Promise<void>}
 * @throws {Error} If deposit operation fails
 */
async function depositAllItems(characterName) {
  // Validate characterName
  if (!characterName) {
    console.error('DepositAllItems Error: Character name is required.');
    throw new Error('Character name is required for depositAllItems.');
  }

  try {
    // Get character details for the specified character
    const characterDetails = await getCharacterDetails(characterName);

    if (!characterDetails || !characterDetails.inventory) {
      console.log('No items to deposit');
      return;
    }
    
    // Filter out empty slots and get items with codes
    const itemsToDeposit = characterDetails.inventory
      .filter(item => item && item.code);
      
    if (itemsToDeposit.length === 0) {
      console.log('No items to deposit');
      return;
    }
    
    // First check if we're in cooldown before starting deposits
    console.log(`[${characterName}] Checking initial cooldown status...`);
    try {
      const freshDetails = await getCharacterDetails(characterName);

      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds before starting deposits...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        }
      }
    } catch (error) {
      console.error('Failed to check initial cooldown:', error.message);
    }

    // Deposit items one at a time with cooldown handling
    for (const item of itemsToDeposit) {
      console.log(`Depositing item: ${item.code}`);
      
      try {
        // Check for cooldown before each deposit
        let freshDetails = await getCharacterDetails(characterName); // Pass characterName

        if (freshDetails.cooldown && freshDetails.cooldown > 0) {
          const now = new Date();
          const expirationDate = new Date(freshDetails.cooldown_expiration);
          const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);

          if (cooldownSeconds > 0) {
            console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds before deposit...`);
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          }
        }

        // Make API request to deposit single item for the specified character
        const result = await makeApiRequest('action/bank/deposit', 'POST', {
          code: item.code,
          quantity: item.quantity || 1,
          character: characterName // Ensure character is passed in body if API requires it
        }, characterName); // Pass characterName to makeApiRequest

        // Check for new cooldown after deposit
        freshDetails = await getCharacterDetails(characterName);
        if (freshDetails.cooldown && freshDetails.cooldown > 0) {
          const now = new Date();
          const expirationDate = new Date(freshDetails.cooldown_expiration);
          const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
          
          if (cooldownSeconds > 0) {
            console.log(`Deposit caused cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds before next deposit...`);
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
          }
        } else {
          // Add a small delay between deposits even if no cooldown
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`[${characterName}] Successfully deposited ${item.code}`);

        // Log inventory snapshot for the correct character
        await db.query(
          `INSERT INTO inventory_snapshots(character, items)
           VALUES ($1, $2)`,
          [characterName, JSON.stringify(result.inventory || [])]
        );

        // Log deposit to database for the correct character
        await db.query(
          `INSERT INTO action_logs(character, action_type, result)
           VALUES ($1, 'bank_deposit', $2)`,
          [characterName, {
            item: item.code,
            quantity: item.quantity || 1
          }]
        );
      } catch (error) {
        // Handle specific deposit errors
        if (error.message.includes('404')) {
          console.error(`[${characterName}] Failed to deposit ${item.code}: Deposit endpoint not found. Please check if the deposit feature is available.`);
        } else {
          console.error(`[${characterName}] Failed to deposit ${item.code}:`, error.message);
        }

        // Continue with next item even if one fails
        continue;
      }
    }

    console.log(`[${characterName}] Finished depositing all items`);
    return;
  } catch (error) {
    console.error(`[${characterName}] Deposit failed:`, error.message);
    throw error;
  }
}

/**
 * Main function to move to bank coordinates and deposit all inventory items.
 * Handles character movement, cooldown waiting, and initiates the deposit process.
 * @returns {Promise<void>}
 */
async function main() {
  try {
    const targetCoords = { x: 4, y: 1 };
    
    // Check character's current position and cooldown status
    console.log('Checking character details before moving...');
    try {
      const characterDetails = await getCharacterDetails();
      
      // Check if character is already at the destination
      if (characterDetails.x === targetCoords.x && characterDetails.y === targetCoords.y) {
        console.log(`Character is already at coordinates (${targetCoords.x}, ${targetCoords.y}).`);
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
        
        // Check if already at target coordinates
        const currentDetails = await getCharacterDetails();
        try {
          if (currentDetails.x === targetCoords.x && currentDetails.y === targetCoords.y) {
            console.log('Character is already at the destination.');
          } else {
            console.log(`Moving character ${config.character} to coordinates (${targetCoords.x}, ${targetCoords.y})...`);
            try {
              const moveResult = await moveCharacter(targetCoords.x, targetCoords.y);
              console.log('Movement successful');
            } catch (error) {
              console.error('Movement failed:', error.message);
            }
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
              const moveResult = await moveCharacter(targetCoords.x, targetCoords.y);
              console.log('Movement successful');
            } catch (retryError) {
              console.error('Movement failed after retry:', retryError.message);
              process.exit(1);
            }
          } else if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the destination.');
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
      console.log(`Moving character ${config.character} to coordinates (${targetCoords.x}, ${targetCoords.y})...`);
      try {
        const moveResult = await moveCharacter(targetCoords.x, targetCoords.y);
        console.log('Movement successful');
      } catch (error) {
        console.error('Movement failed:', error.message);
        process.exit(1);
      }
    }
    
    // Now deposit all items
    console.log('Starting deposit of all items...');
    
    // Check if character is in cooldown before depositing
    console.log('Checking for cooldown before depositing...');
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
      
      // Perform deposit
      await depositAllItems();
    } catch (error) {
      // Handle cooldown errors for deposit action
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Deposit action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        
        // Try again after cooldown
        console.log('Retrying deposit after cooldown...');
        try {
          await depositAllItems();
        } catch (retryError) {
          console.error('Deposit failed after retry:', retryError.message);
        }
      } else {
        console.error('Deposit failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Execute the main function if this is the main module
if (require.main === module) {
  main();
}

/**
 * Module exports
 * @exports go-deposit-all
 */
module.exports = {
  /**
   * Function to deposit all items from inventory into the bank
   */
  depositAllItems
};
