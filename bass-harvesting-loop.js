/**
 * @fileoverview Automated bass fishing bot that catches fish and deposits at bank when inventory is full.
 * Use node bass-harvesting-loop.js in the terminal to execute the script.
 * @module BassHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { moveCharacter, getCharacterDetails, gatheringAction } = require('./api');
const { handleCooldown, checkInventory, sleep, withRetry } = require('./utils'); // Added sleep and withRetry import
const config = require('./config');
const db = require('./db');
const depositAllItems = require('./go-deposit-all').depositAllItems;

/**
 * Class representing an automated bass fishing loop.
 * @extends BaseLoop
 */
class BassHarvestingLoop extends BaseLoop {
  /**
   * Create a bass fishing loop.
   * @param {string} [characterName=config.character] - The character name to perform actions with.
   * @param {Object} [options={}] - Configuration options for the loop.
   * @param {Object} [options.harvestCoords={ x: 6, y: 12 }] - Coordinates for fishing.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   */
  constructor(characterName, options = {}) {
    super(characterName || config.character);

    const defaults = {
      harvestCoords: { x: 6, y: 12 },
      bankCoords: { x: 4, y: 1 },
    };

    /** @type {Object} Coordinates of the bass fishing location */
    this.harvestCoords = options.harvestCoords || defaults.harvestCoords;
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Counter for total fish caught */
    this.resourceCount = 0; // Reset per instance
  }

  /**
   * Perform the bass fishing action and handle results.
   * Records the action in database and tracks caught fish.
   * @returns {Promise<Object|null>} The result of the fishing action, or null if there was an error
   * @throws {Error} If a fatal error occurs during fishing
   */
  async fish() {
    try {
      const beforeDetails = await getCharacterDetails(this.characterName);
      console.log(`Starting bass fishing at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          this.characterName,
          'action/bass_fishing_start',
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting bass fishing action' }
        ]
      );
      
      const result = await this.handleAction(
        () => gatheringAction(this.characterName),
        'Bass fishing'
      );

      // Use character details from the action result if available, otherwise log generic success
      const characterAfterAction = result?.character || beforeDetails; // Fallback to beforeDetails if result has no character info

      if (result && result.resources) {
        const caughtAmount = result.resources.length;
        this.resourceCount += caughtAmount;
        console.log(`Caught ${caughtAmount} bass (total: ${this.resourceCount})`);
        await sleep(500 + Math.random() * 500); // Small delay after successful catch (0.5-1s)
      } else {
         // Add a small delay even if no resources were caught, but action was successful
         await sleep(250 + Math.random() * 250); // (0.25-0.5s)
      }

      console.log(`Fishing action completed at coordinates (${characterAfterAction.x}, ${characterAfterAction.y})`);
      return result;
    } catch (error) {
       // Handle 429 Too Many Requests specifically
      if (error.message.includes('429') || error.message.toLowerCase().includes('too many requests')) {
        const waitTime = 15000 + Math.random() * 5000; // Wait 15-20 seconds for 429
        console.warn(`Rate limit hit (429). Waiting ${Math.round(waitTime/1000)}s...`);
        await sleep(waitTime);
        return null; // Indicate action didn't complete, loop should retry
      } else if (error.message.includes('inventory is full')) {
        console.log('Inventory is full. Proceeding to deposit bass...');
        await this.depositFish();
        return null;
      } else if (error.message.includes('No resource on this map') || 
                 error.message.includes('Resource not found')) {
        console.log('No bass found. Will try again...');
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
      
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x !== this.bankCoords.x || currentDetails.y !== this.bankCoords.y) {
        await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
      } else {
        console.log('Already at bank location.');
      }
      await sleep(1000 + Math.random() * 500); // Wait 1-1.5s after arriving at bank

      console.log('Depositing all fish to bank...');
      // Pass the character name to the deposit function
      await depositAllItems(this.characterName);
      await sleep(1000 + Math.random() * 500); // Wait 1-1.5s after depositing

      console.log(`Moving back to fishing location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
      await sleep(1000 + Math.random() * 500); // Wait 1-1.5s after arriving back
      
      console.log('Ready to continue fishing!');
    } catch (error) {
      console.error('Error during deposit cycle:', error.message);
      // Attempt to return to fishing location with retry logic for cooldowns
      try {
        console.log(`Attempting to return to fishing location at (${this.harvestCoords.x}, ${this.harvestCoords.y}) with retry...`);
        await withRetry(
          () => moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName),
          3, // Max 3 retries for the recovery move
          1000 // Initial delay 1s
        );
        console.log('Successfully returned to fishing location after deposit error.');
      } catch (recoveryMoveError) {
        console.error('Failed to return to fishing location even after retries:', recoveryMoveError.message);
        // Decide if we should throw or just log and let the main loop try again
        // For now, just log, the main loop will re-evaluate position.
      }
    }
  }

  /**
   * Main loop that continuously fishes for bass and manages inventory.
   * Initializes by moving to the fishing location, then repeatedly fishes
   * and deposits items when inventory is full.
   * @returns {Promise<void>}
   * @throws {Error} If a fatal error occurs in the loop
   */
  async runLoop() {
    try {
      console.log(`Initializing bass fishing loop at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await this.initialize(this.harvestCoords);
      
      while (true) {
        await this.startLoop();
        
        const details = await getCharacterDetails(this.characterName);
        if (await checkInventory(details)) {
          console.log('Inventory full, depositing bass...');
          await this.depositFish();
          continue;
        }
        
        if (details.x !== this.harvestCoords.x || details.y !== this.harvestCoords.y) {
          console.log(`Not at fishing location, moving to (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
          await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
        }
        
        await this.fish();
        
        console.log(`Completed loop #${this.loopCount}. Caught ${this.resourceCount} bass in total.`);

        // Increased delay between loops
        const loopDelay = 3000 + Math.random() * 2000; // Wait 3-5 seconds
        console.log(`Waiting ${Math.round(loopDelay/1000)}s before next loop...`);
        await sleep(loopDelay); // Use imported sleep
      }
    } catch (error) {
      console.error('Fatal error in bass fishing loop:', error.message);
      throw error;
    }
  }

  /**
   * Main execution method for command line usage
   * @example
   * node bass-harvesting-loop.js [characterName] [harvestX] [harvestY] [bankX] [bankY]
   * node bass-harvesting-loop.js MyChar 6 12 4 1
   */
  static async main() {
    const args = process.argv.slice(2);
    let characterName = args[0];

    // Fallback logic for character name
    if (!characterName) {
      characterName = process.env.control_character || config.character;
    }

    // --- Parse options from command line arguments ---
    const options = {};
    if (args[1] && args[2]) options.harvestCoords = { x: parseInt(args[1], 10), y: parseInt(args[2], 10) };
    if (args[3] && args[4]) options.bankCoords = { x: parseInt(args[3], 10), y: parseInt(args[4], 10) };

    const loop = new BassHarvestingLoop(characterName, options);

    console.log(`Starting bass fishing loop for character ${characterName}...`);
    console.log('Using configuration:');
    console.log(`  - Harvest Coords: (${loop.harvestCoords.x}, ${loop.harvestCoords.y})`);
    console.log(`  - Bank Coords: (${loop.bankCoords.x}, ${loop.bankCoords.y})`);
    console.log('Press Ctrl+C to stop the script at any time.');
    console.log('---------------------------------------------------');
    // Set up safe process event handling
    try {
      process.on('SIGINT', async () => {
        console.log('\nGracefully shutting down...');
        console.log(`Caught ${loop.resourceCount} bass in total across ${loop.loopCount} loops.`);
        
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
    } catch (error) {
      console.error('Error setting up process event handler:', error.message);
    }
    
    try {
      await loop.runLoop();
    } catch (error) {
      console.error('Bass fishing loop failed:', error.message);
      try {
        process.exit(1);
      } catch (e) {
        console.error('Failed to exit process:', e.message);
      }
    }
  }
}

// Execute the script if it's the main module
if (require.main === module) {
  BassHarvestingLoop.main().catch(error => {
    console.error('Unhandled error in bass fishing loop:', error);
    try {
      process.exit(1);
    } catch (e) {
      console.error('Failed to exit process:', e.message);
    }
  });
}

/**
 * Export the BassHarvestingLoop class
 * @exports BassHarvestingLoop
 */
module.exports = BassHarvestingLoop;
