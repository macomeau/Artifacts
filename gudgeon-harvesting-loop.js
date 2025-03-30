/**
 * @fileoverview Automated gudgeon fishing bot that catches fish and deposits at bank when inventory is full.
 * Use node gudgeon-harvesting-loop.js in the terminal to execute the script.
 * @module GudgeonHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { moveCharacter, getCharacterDetails, gatheringAction } = require('./api');
const { handleCooldown, checkInventory, withRetry, sleep } = require('./utils');
const config = require('./config');
const db = require('./db');
const depositAllItems = require('./go-deposit-all').depositAllItems;

/**
 * Class representing an automated gudgeon fishing loop.
 * @extends BaseLoop
 */
class GudgeonHarvestingLoop extends BaseLoop {
  /**
   * Create a gudgeon fishing loop.
   * @param {string} [characterName=config.character] - The character name to perform actions with.
   */
  constructor(characterName = config.character) {
    super(characterName);
    /** @type {Object} Coordinates of the gudgeon fishing location */
    this.harvestCoords = { x: 4, y: 2 };
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = { x: 4, y: 1 };
    /** @type {number} Counter for total fish caught */
    this.resourceCount = 0;
  }

  /**
   * Perform the gudgeon fishing action and handle results.
   * Records the action in database and tracks caught fish.
   * @returns {Promise<Object|null>} The result of the fishing action, or null if there was an error
   * @throws {Error} If a fatal error occurs during fishing
   */
  async fish() {
    try {
      // Get coordinates before fishing to record starting position
      const beforeDetails = await getCharacterDetails(this.characterName);
      console.log(`Starting gudgeon fishing at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      // Log coordinates to database before action
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          this.characterName,
          'action/gudgeon_fishing_start',
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting gudgeon fishing action' }
        ]
      );
      
      // Use the withRetry utility to handle cooldowns and rate limiting
      const result = await withRetry(
        async () => {
          // Check for existing cooldown before attempting to fish
          const details = await getCharacterDetails(this.characterName);
          if (details.cooldown && details.cooldown > 0) {
            console.log(`Character is in cooldown. Waiting ${details.cooldown.toFixed(1)} seconds...`);
            await sleep(details.cooldown * 1000 + 500);
          }
          
          // Perform the fishing action with retry handling
          return await gatheringAction(this.characterName);
        },
        5,  // maxRetries
        1000, // initialDelay
        5000 // maxDelay
      );
      
      // Get the current coordinates for logging after fishing
      const afterDetails = await getCharacterDetails(this.characterName);
      
      if (result && result.resources) {
        this.resourceCount += result.resources.length;
        console.log(`Caught ${result.resources.length} gudgeon fish (total: ${this.resourceCount})`);
      }
      
      console.log(`Fishing successful at coordinates (${afterDetails.x}, ${afterDetails.y})`);
      return result;
    } catch (error) {
      // Handle specific errors
      if (error.message.includes('inventory is full')) {
        console.log('Inventory is full. Proceeding to deposit fish...');
        await this.depositFish();
        return null;
      } else if (error.message.includes('No resource on this map') || 
                 error.message.includes('Resource not found')) {
        console.log('No fish found. Will try again...');
        return null;
      } else {
        console.error('Fishing failed:', error.message);
        throw error;
      }
    }
  }

  /**
   * Move to bank, deposit all fish and inventory items, and return to fishing location.
   * @returns {Promise<void>}
   */
  async depositFish() {
    try {
      console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})...`);
      
      // Check current position first with retry logic
      await withRetry(async () => {
        const currentDetails = await getCharacterDetails(this.characterName);
        
        // Handle existing cooldown if any
        if (currentDetails.cooldown && currentDetails.cooldown > 0) {
          console.log(`Waiting for cooldown before moving: ${currentDetails.cooldown.toFixed(1)} seconds...`);
          await sleep(currentDetails.cooldown * 1000 + 500);
        }
        
        if (currentDetails.x !== this.bankCoords.x || currentDetails.y !== this.bankCoords.y) {
          return await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
        } else {
          console.log('Already at bank location.');
          return true;
        }
      });
      
      // Add a small delay before depositing
      await sleep(500);
      
      // Deposit all items with retry
      console.log('Depositing all fish to bank...');
      await withRetry(async () => {
        const details = await getCharacterDetails(this.characterName);
        if (details.cooldown && details.cooldown > 0) {
          await sleep(details.cooldown * 1000 + 500);
        }
        return await depositAllItems();
      });
      
      // Add a small delay before moving back
      await sleep(500);
      
      // Move back to fishing location with retry
      console.log(`Moving back to fishing location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await withRetry(async () => {
        const details = await getCharacterDetails(this.characterName);
        if (details.cooldown && details.cooldown > 0) {
          await sleep(details.cooldown * 1000 + 500);
        }
        return await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
      });
      
      console.log('Ready to continue fishing!');
    } catch (error) {
      console.error('Error during deposit cycle:', error.message);
      
      // Try to move back to fishing location even if deposit fails
      try {
        console.log(`Attempting to return to fishing location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
        await withRetry(() => moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName));
      } catch (moveError) {
        console.error('Failed to return to fishing location:', moveError.message);
      }
    }
  }

  /**
   * Main loop that continuously fishes for gudgeon and manages inventory.
   * Initializes by moving to the fishing location, then repeatedly fishes
   * and deposits items when inventory is full.
   * @returns {Promise<void>}
   * @throws {Error} If a fatal error occurs in the loop
   */
  async runLoop() {
    try {
      // Initialize - move to fishing location
      console.log(`Initializing gudgeon fishing loop at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await this.initialize(this.harvestCoords);
      
      while (true) {
        await this.startLoop();
        
        try {
          // Check inventory before fishing
          const details = await getCharacterDetails(this.characterName);
          if (await checkInventory(details)) {
            console.log('Inventory full, depositing fish...');
            await this.depositFish();
            continue;
          }
          
          // Check if we're at fishing location, move if needed
          if (details.x !== this.harvestCoords.x || details.y !== this.harvestCoords.y) {
            console.log(`Not at fishing location, moving to (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
            
            // Use withRetry for movement to handle potential cooldown errors
            await withRetry(
              async () => {
                const freshDetails = await getCharacterDetails(this.characterName);
                if (freshDetails.cooldown && freshDetails.cooldown > 0) {
                  await sleep(freshDetails.cooldown * 1000 + 500);
                }
                return await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
              }
            );
          }
          
          // Fish for gudgeon with improved error handling
          await this.fish();
          
          // Log progress
          console.log(`Completed loop #${this.loopCount}. Caught ${this.resourceCount} gudgeon fish in total.`);
          
          // Add a small delay between loops to avoid API rate limiting
          await sleep(1500 + Math.random() * 500); // Random delay between 1.5-2s
          
        } catch (loopError) {
          // Check if this is a cooldown error we can recover from
          if (loopError.message.includes('cooldown')) {
            console.log('Cooldown error in loop, will retry after delay...');
            await sleep(2000); // Wait 2 seconds and continue the loop
            continue;
          }
          
          // For other errors, throw to outer handler
          throw loopError;
        }
      }
    } catch (error) {
      console.error('Fatal error in gudgeon fishing loop:', error.message);
      throw error;
    }
  }
}

// Execute the script if it's the main module
if (require.main === module) {
  const loop = new GudgeonHarvestingLoop();
  console.log('Starting gudgeon fishing loop...');
  console.log(`Will fish at (${loop.harvestCoords.x}, ${loop.harvestCoords.y}) and deposit at (${loop.bankCoords.x}, ${loop.bankCoords.y})`);
  console.log('Press Ctrl+C to stop the script at any time.');
  console.log('---------------------------------------------------');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    console.log(`Caught ${loop.resourceCount} gudgeon fish in total across ${loop.loopCount} loops.`);
    
    // Try to move back to town if requested
    try {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      readline.question('Would you like to return to the bank before exiting? (y/n) ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          console.log(`Moving back to bank at (${loop.bankCoords.x}, ${loop.bankCoords.y})...`);
          try {
            await loop.handleAction(
              () => moveCharacter(loop.bankCoords.x, loop.bankCoords.y, loop.characterName),
              'Return to bank'
            );
            console.log('Successfully returned to bank!');
          } catch (error) {
            console.error('Failed to return to bank:', error.message);
          }
        }
        
        readline.close();
        console.log('Exiting script. Thank you for fishing!');
        process.exit(0);
      });
    } catch (error) {
      console.log('Exiting without returning to bank.');
      process.exit(0);
    }
  });
  
  loop.runLoop().catch(error => {
    console.error('Gudgeon fishing loop failed:', error.message);
    process.exit(1);
  });
}

/**
 * Export the GudgeonHarvestingLoop class
 * @exports GudgeonHarvestingLoop
 */
module.exports = GudgeonHarvestingLoop;