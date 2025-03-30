/**
 * @fileoverview Automated salmon fishing bot that catches fish and deposits at bank when inventory is full.
 * Use node salmon-harvesting-loop.js in the terminal to execute the script.
 * @module SalmonHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { moveCharacter, getCharacterDetails, gatheringAction } = require('./api');
const { handleCooldown, checkInventory } = require('./utils');
const config = require('./config');
const db = require('./db');
const depositAllItems = require('./go-deposit-all').depositAllItems;

/**
 * Class representing an automated salmon fishing loop.
 * @extends BaseLoop
 */
class SalmonHarvestingLoop extends BaseLoop {
  /**
   * Create a salmon fishing loop.
   * @param {string} [characterName=config.character] - The character name to perform actions with.
   */
  constructor(characterName) {
    super(characterName || config.character);
    /** @type {Object} Coordinates of the salmon fishing location */
    this.harvestCoords = { x: -2, y: -4 }; // Updated coordinates for salmon
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = { x: 4, y: 1 }; // Same bank coordinates
    /** @type {number} Counter for total fish caught */
    this.resourceCount = 0;
  }

  /**
   * Perform the salmon fishing action and handle results.
   * Records the action in database and tracks caught fish.
   * @returns {Promise<Object|null>} The result of the fishing action, or null if there was an error
   * @throws {Error} If a fatal error occurs during fishing
   */
  async fish() {
    try {
      const beforeDetails = await getCharacterDetails(this.characterName);
      console.log(`Starting salmon fishing at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          this.characterName,
          'action/salmon_fishing_start', // Updated action type
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting salmon fishing action' }
        ]
      );
      
      const result = await this.handleAction(
        () => gatheringAction(this.characterName),
        'Salmon fishing' // Updated action name for logging
      );
      
      const afterDetails = await getCharacterDetails(this.characterName);
      
      if (result && result.resources) {
        // Assuming salmon resource name is 'salmon' or similar, adjust if needed
        const salmonCaught = result.resources.filter(r => r.item_code.toLowerCase().includes('salmon')).length;
        this.resourceCount += salmonCaught;
        console.log(`Caught ${salmonCaught} salmon (total: ${this.resourceCount})`);
      }
      
      console.log(`Fishing successful at coordinates (${afterDetails.x}, ${afterDetails.y})`);
      return result;
    } catch (error) {
      if (error.message.includes('inventory is full')) {
        console.log('Inventory is full. Proceeding to deposit salmon...');
        await this.depositFish();
        return null;
      } else if (error.message.includes('No resource on this map') || 
                 error.message.includes('Resource not found')) {
        console.log('No salmon found. Will try again...');
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
      
      console.log('Depositing all items (including salmon) to bank...');
      await depositAllItems(this.characterName); // Pass character name
      
      console.log(`Moving back to fishing location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
      
      console.log('Ready to continue fishing!');
    } catch (error) {
      console.error('Error during deposit cycle:', error.message);
      
      try {
        console.log(`Attempting to return to fishing location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
        await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
      } catch (moveError) {
        console.error('Failed to return to fishing location:', moveError.message);
      }
    }
  }

  /**
   * Main loop that continuously fishes for salmon and manages inventory.
   * Initializes by moving to the fishing location, then repeatedly fishes
   * and deposits items when inventory is full.
   * @returns {Promise<void>}
   * @throws {Error} If a fatal error occurs in the loop
   */
  async runLoop() {
    try {
      console.log(`Initializing salmon fishing loop at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await this.initialize(this.harvestCoords);
      
      while (true) {
        await this.startLoop();
        
        const details = await getCharacterDetails(this.characterName);
        if (await checkInventory(details)) {
          console.log('Inventory full, depositing items...');
          await this.depositFish();
          continue;
        }
        
        if (details.x !== this.harvestCoords.x || details.y !== this.harvestCoords.y) {
          console.log(`Not at fishing location, moving to (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
          await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
        }
        
        await this.fish();
        
        console.log(`Completed loop #${this.loopCount}. Caught ${this.resourceCount} salmon in total.`);
        
        // Add a small delay to prevent tight looping if fishing fails repeatedly
        await new Promise(resolve => setTimeout(resolve, 1000)); 
      }
    } catch (error) {
      console.error('Fatal error in salmon fishing loop:', error.message);
      // Log error to database before throwing
      try {
        await db.query(
          `INSERT INTO action_logs(character, action_type, result, coordinates)
           VALUES ($1, $2, $3, point($4,$5))`,
          [
            this.characterName,
            'salmon_fishing_loop_error',
            { error: error.message, stack: error.stack },
            this.harvestCoords.x,
            this.harvestCoords.y
          ]
        );
      } catch (dbError) {
        console.error('Failed to log fatal error to database:', dbError.message);
      }
      throw error;
    }
  }

  /**
   * Main execution method for command line usage
   */
  static async main() {
    let characterName;
    
    // Safe access to command line arguments
    try {
      const args = process.argv.slice(2);
      characterName = args[0];
    } catch (error) {
      console.log('Error accessing command line arguments, using fallback character');
    }
    
    // Fallback to environment variable or config if no command line argument
    if (!characterName) {
      try {
        characterName = process.env.control_character;
      } catch (error) {
        console.log('Error accessing environment variables, using config character');
      }
    }
    
    // Final fallback to config
    characterName = characterName || config.character;
    
    const loop = new SalmonHarvestingLoop(characterName);
    console.log('Starting salmon fishing loop...');
    console.log(`Will fish at (${loop.harvestCoords.x}, ${loop.harvestCoords.y}) and deposit at (${loop.bankCoords.x}, ${loop.bankCoords.y})`);
    console.log('Press Ctrl+C to stop the script at any time.');
    console.log('---------------------------------------------------');
    
    // Set up safe process event handling
    try {
      process.on('SIGINT', async () => {
        console.log('\nGracefully shutting down...');
        console.log(`Caught ${loop.resourceCount} salmon in total across ${loop.loopCount} loops.`);
        
        try {
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          readline.question('Would you like to return to the bank before exiting? (y/n) ', async (answer) => {
            if (answer.toLowerCase() === 'y') {
              console.log(`Moving back to bank at (${loop.bankCoords.x}, ${loop.bankCoords.y})...`);
              try {
                // Use handleAction for cooldown management
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
      console.error('Salmon fishing loop failed:', error.message);
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
  SalmonHarvestingLoop.main().catch(error => {
    console.error('Unhandled error in salmon fishing loop:', error);
    try {
      process.exit(1);
    } catch (e) {
      console.error('Failed to exit process:', e.message);
    }
  });
}

/**
 * Export the SalmonHarvestingLoop class
 * @exports SalmonHarvestingLoop
 */
module.exports = SalmonHarvestingLoop;
