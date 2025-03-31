/**
 * @fileoverview Automated glowstem harvesting bot that gathers glowstem leaves and deposits at bank when inventory is full.
 * Use node glowstem-harvesting-loop.js in the terminal to execute the script.
 * @module GlowstemHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { moveCharacter, getCharacterDetails, gatheringAction } = require('./api');
const { handleCooldown, checkInventory } = require('./utils');
const config = require('./config');
const db = require('./db');
const depositAllItems = require('./go-deposit-all').depositAllItems;

/**
 * Class representing an automated glowstem harvesting loop.
 * @extends BaseLoop
 */
class GlowstemHarvestingLoop extends BaseLoop {
  /**
   * Create a glowstem harvesting loop.
   * @param {string} [characterName=config.character] - The character name to perform actions with.
   * @param {Object} [options={}] - Configuration options for the loop.
   * @param {Object} [options.harvestCoords={ x: 1, y: 10 }] - Coordinates for harvesting.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   */
  constructor(characterName = config.character, options = {}) {
    super(characterName);

    const defaults = {
      harvestCoords: { x: 1, y: 10 },
      bankCoords: { x: 4, y: 1 },
    };

    /** @type {Object} Coordinates of the glowstem harvesting location */
    this.harvestCoords = options.harvestCoords || defaults.harvestCoords;
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Counter for total resources harvested */
    this.resourceCount = 0; // Reset per instance
  }

  /**
   * Perform the glowstem harvesting action and handle results.
   * Records the action in database and tracks harvested resources.
   * @returns {Promise<Object|null>} The result of the gathering action, or null if there was an error
   * @throws {Error} If a fatal error occurs during harvesting
   */
  async harvest() {
    try {
      const beforeDetails = await getCharacterDetails(this.characterName);
      console.log(`Starting glowstem harvesting at coordinates (${beforeDetails.x}, ${beforeDetails.y})...`);
      
      await db.query(
        `INSERT INTO action_logs(character, action_type, coordinates, result)
         VALUES ($1, $2, point($3,$4), $5)`,
        [
          this.characterName,
          'action/glowstem_harvesting_start',
          beforeDetails.x || 0,
          beforeDetails.y || 0,
          { message: 'Starting glowstem harvesting action' }
        ]
      );
      
      const result = await this.handleAction(
        () => gatheringAction(this.characterName),
        'Glowstem harvesting'
      );
      
      const afterDetails = await getCharacterDetails(this.characterName);
      
      if (result && result.resources) {
        this.resourceCount += result.resources.length;
        console.log(`Harvested ${result.resources.length} glowstem leaves (total: ${this.resourceCount})`);
      }
      
      console.log(`Harvesting successful at coordinates (${afterDetails.x}, ${afterDetails.y})`);
      return result;
    } catch (error) {
      if (error.message.includes('inventory is full')) {
        console.log('Inventory is full. Proceeding to deposit glowstem leaves...');
        await this.depositGlowstemLeaves();
        return null;
      } else if (error.message.includes('No resource on this map') || 
                 error.message.includes('Resource not found')) {
        console.log('No glowstem leaves found. Will try again...');
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
  async depositGlowstemLeaves() {
    try {
      console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})...`);
      
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x !== this.bankCoords.x || currentDetails.y !== this.bankCoords.y) {
        await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
      } else {
        console.log('Already at bank location.');
      }
      
      console.log('Depositing all items to bank...');
      // Pass the character name to depositAllItems
      await depositAllItems(this.characterName); 
      
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
        // Add a significant delay if returning fails, especially due to cooldown/rate limit
        console.log('Waiting 30 seconds before continuing loop after failed return...');
        await new Promise(resolve => setTimeout(resolve, 30000)); 
      }
    }
  }

  /**
   * Main loop that continuously harvests glowstem leaves and manages inventory.
   * Initializes by moving to the harvesting location, then repeatedly harvests
   * and deposits items when inventory is full.
   * @returns {Promise<void>}
   * @throws {Error} If a fatal error occurs in the loop
   */
  async runLoop() {
    try {
      console.log(`Initializing glowstem harvesting loop at (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
      await this.initialize(this.harvestCoords);
      
      while (true) {
        await this.startLoop();
        
        const details = await getCharacterDetails(this.characterName);
        if (await checkInventory(details)) {
          console.log('Inventory full, depositing items...');
          await this.depositGlowstemLeaves();
          continue;
        }
        
        if (details.x !== this.harvestCoords.x || details.y !== this.harvestCoords.y) {
          console.log(`Not at harvesting location, moving to (${this.harvestCoords.x}, ${this.harvestCoords.y})...`);
          await moveCharacter(this.harvestCoords.x, this.harvestCoords.y, this.characterName);
        }
        
        await this.harvest();
        
        console.log(`Completed loop #${this.loopCount}. Harvested ${this.resourceCount} glowstem leaves in total.`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Fatal error in glowstem harvesting loop:', error.message);
      throw error;
    }
  }
}

// Execute the script if it's the main module
if (require.main === module) {
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

  const loop = new GlowstemHarvestingLoop(characterName, options);

  console.log(`Starting glowstem harvesting loop for character ${characterName}...`);
  console.log('Using configuration:');
  console.log(`  - Harvest Coords: (${loop.harvestCoords.x}, ${loop.harvestCoords.y})`);
  console.log(`  - Bank Coords: (${loop.bankCoords.x}, ${loop.bankCoords.y})`);
  console.log('Press Ctrl+C to stop the script at any time.');
  console.log('---------------------------------------------------');
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    console.log(`Harvested ${loop.resourceCount} glowstem leaves in total across ${loop.loopCount} loops.`);
    
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
    console.error('Glowstem harvesting loop failed:', error.message);
    process.exit(1);
  });
}

/**
 * Export the GlowstemHarvestingLoop class
 * @exports GlowstemHarvestingLoop
 */
module.exports = GlowstemHarvestingLoop;
