/**
 * @fileoverview Automated nettle harvesting bot that gathers nettles and deposits at bank when inventory is full.
 * Use node nettle-harvesting-loop.js in the terminal to execute the script.
 * @module NettleHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { moveCharacter, getCharacterDetails, gatheringAction } = require('./api');
const { handleCooldown, checkInventory } = require('./utils');
const config = require('./config');
const db = require('./db');
const depositAllItems = require('./go-deposit-all').depositAllItems;

/**
 * Class representing an automated nettle harvesting loop.
 * @extends BaseLoop
 */
class NettleHarvestingLoop extends BaseLoop {
  /**
   * Create a nettle harvesting loop.
   * @param {string} [characterName=config.character] - The character name to perform actions with.
   */
  constructor(characterName = config.character) {
    super(characterName);
    /** @type {Object} Coordinates of the nettle harvesting location */
    this.harvestCoords = { x: 7, y: 14 };
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = { x: 4, y: 1 };
    /** @type {number} Counter for total resources harvested */
    this.resourceCount = 0;
  }

  /**
   * Perform the nettle harvesting action and handle results.
   * Records the action in database and tracks harvested resources.
   * @returns {Promise<Object|null>} The result of the gathering action, or null if there was an error
   * @throws {Error} If a fatal error occurs during harvesting
   */
  async harvest() {
    try {
      const beforeDetails = await getCharacterDetails(this.characterName);
      console.log(`Starting nettle harvesting at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          this.characterName,
          'action/nettle_harvesting_start',
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting nettle harvesting action' }
        ]
      );
      
      const result = await this.handleAction(
        () => gatheringAction(this.characterName),
        'Nettle harvesting'
      );
      
      const afterDetails = await getCharacterDetails(this.characterName);
      
      if (result && result.resources) {
        this.resourceCount += result.resources.length;
        console.log(`Harvested ${result.resources.length} nettles (total: ${this.resourceCount})`);
      }
      
      console.log(`Harvesting successful at coordinates (${afterDetails.x}, ${afterDetails.y})`);
      return result;
    } catch (error) {
      if (error.message.includes('inventory is full')) {
        console.log('Inventory is full. Proceeding to deposit nettles...');
        await this.depositNettles();
        return null;
      } else if (error.message.includes('No resource on this map') || 
                 error.message.includes('Resource not found')) {
        console.log('No nettles found. Will try again...');
        return null;
      } else {
        console.error('Harvesting failed:', error.message);
        throw error;
      }
    }
  }

  /**
   * Move to bank, deposit all inventory items, and return to harvesting location.
   * @returns {Promise<void>}
   */
  async depositNettles() {
    try {
      console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})...`);
      
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x !== this.bankCoords.x || currentDetails.y !== this.bankCoords.y) {
        await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
      } else {
        console.log('Already at bank location.');
      }
      
      console.log('Depositing all items to bank...');
      await depositAllItems();
      
      console.log(`Moving back to harvesting location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
      
      console.log('Ready to continue harvesting!');
    } catch (error) {
      console.error('Error during deposit cycle:', error.message);
      
      try {
        console.log(`Attempting to return to harvesting location at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
        await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
      } catch (moveError) {
        console.error('Failed to return to harvesting location:', moveError.message);
      }
    }
  }

  /**
   * Main loop that continuously harvests nettles and manages inventory.
   * Initializes by moving to the harvesting location, then repeatedly harvests
   * and deposits items when inventory is full.
   * @returns {Promise<void>}
   * @throws {Error} If a fatal error occurs in the loop
   */
  async runLoop() {
    try {
      console.log(`Initializing nettle harvesting loop at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await this.initialize(this.harvestCoords);
      
      while (true) {
        await this.startLoop();
        
        const details = await getCharacterDetails(this.characterName);
        if (await checkInventory(details)) {
          console.log('Inventory full, depositing items...');
          await this.depositNettles();
          continue;
        }
        
        if (details.x !== this.harvestCoords.x || details.y !== this.harvestCoords.y) {
          console.log(`Not at harvesting location, moving to (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
          await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
        }
        
        await this.harvest();
        
        console.log(`Completed loop #${this.loopCount}. Harvested ${this.resourceCount} nettles in total.`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Fatal error in nettle harvesting loop:', error.message);
      throw error;
    }
  }
}

// Execute the script if it's the main module
if (require.main === module) {
  const loop = new NettleHarvestingLoop();
  console.log('Starting nettle harvesting loop...');
  console.log(`Will harvest at (${loop.harvestCoords.x}, ${loop.harvestCoords.y}) and deposit at (${loop.bankCoords.x}, ${loop.bankCoords.y})`);
  console.log('Press Ctrl+C to stop the script at any time.');
  console.log('---------------------------------------------------');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    console.log(`Harvested ${loop.resourceCount} nettles in total across ${loop.loopCount} loops.`);
    
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
        console.log('Exiting script. Thank you for farming!');
        process.exit(0);
      });
    } catch (error) {
      console.log('Exiting without returning to bank.');
      process.exit(0);
    }
  });
  
  loop.runLoop().catch(error => {
    console.error('Nettle harvesting loop failed:', error.message);
    process.exit(1);
  });
}

/**
 * Export the NettleHarvestingLoop class
 * @exports NettleHarvestingLoop
 */
module.exports = NettleHarvestingLoop;
