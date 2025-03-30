/**
 * @fileoverview Automated birch wood harvesting loop with deposit functionality
 * @module BirchHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
const db = require('./db');
const { sleep } = require('./utils');
require('dotenv').config();

/**
 * Birch wood harvesting automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class BirchHarvestingLoop extends BaseLoop {
  /**
   * Create a birch harvesting loop instance
   * @param {string} characterName - Name of character to perform actions with
   */
  constructor(characterName) {
    super(characterName);
    /** @type {Object} Coordinates of birch forest */
    this.BIRCH_FOREST_COORDS = { x: 3, y: 5 };
    /** @type {Object} Coordinates of workshop */
    this.WORKSHOP_COORDS = { x: -2, y: -3 };
    /** @type {Object} Coordinates of bank */
    this.BANK_COORDS = { x: 4, y: 1 };
    /** @type {number} Target birch wood quantity */
    this.TARGET_BIRCH_WOOD = 100;
    /** @type {string} Crafting recipe code for birch planks */
    this.BIRCH_PLANK_RECIPE_CODE = 'birch_plank';
  }

  /**
   * Get current birch wood quantity from inventory
   * @returns {Promise<number>} Current birch wood count
   * @throws {Error} If inventory check fails
   */
  async getBirchWoodCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const birchWoodItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'birch_wood'
      );
      
      return birchWoodItem ? (birchWoodItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Handle item deposit process with cooldown checks
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If deposit process fails
   */
  async depositItems() {
    console.log('Starting deposit process...');
    
    try {
      // Add initial delay
      await sleep(2000);
      
      console.log('Checking for cooldown before moving to bank...');
      const freshDetails = await getCharacterDetails(this.characterName);
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Waiting ${cooldownSeconds.toFixed(1)} seconds for cooldown...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
        }
      }
      
      // Move to bank - reuse freshDetails to avoid redundant API call
      if (freshDetails.x === this.BANK_COORDS.x && freshDetails.y === this.BANK_COORDS.y) {
        console.log('Already at bank');
      } else {
        console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
        await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
      }
      
      // Deposit items
      console.log('Starting deposit of all items...');
      await depositAllItems(this.characterName);
      console.log('Deposit complete');
      
      // Return to forest after depositing
      console.log(`Returning to birch forest at (${this.BIRCH_FOREST_COORDS.x},${this.BIRCH_FOREST_COORDS.y})`);
      await moveCharacter(
        this.BIRCH_FOREST_COORDS.x, 
        this.BIRCH_FOREST_COORDS.y, 
        this.characterName
      );
      
    } catch (error) {
      // Handle rate limits in deposits
      if (error.message.includes('429')) {
        console.log('Rate limit during deposit. Retrying in 30 seconds...');
        await sleep(30000);
        return this.depositItems();
      }
      console.error('Deposit process failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if target birch wood quantity has been collected
   * @returns {Promise<boolean>} True if enough birch wood collected
   */
  async hasEnoughBirchWood() {
    const currentBirch = await this.getBirchWoodCount();
    return currentBirch >= this.TARGET_BIRCH_WOOD;
  }

  /**
   * Override the checkAndDeposit method from BaseLoop to handle missing coordinates column
   * @async
   * @returns {Promise<void>}
   */
  async checkAndDeposit() {
    const details = await getCharacterDetails(this.characterName);
    
    try {
      await db.query(
        `INSERT INTO inventory_snapshots(character, items)
         VALUES ($1, $2)`,
        [
          this.characterName, 
          JSON.stringify(details.inventory || [])
        ]
      );
      
      // Check if inventory is getting full
      if (details.inventory && details.inventory_max_items) {
        const totalItems = details.inventory.reduce((sum, slot) => sum + (slot?.quantity || 0), 0);
        const capacityUsed = (totalItems / details.inventory_max_items) * 100;
        
        if (capacityUsed >= 80) {
          console.log(`Inventory at ${capacityUsed.toFixed(1)}% capacity - consider depositing soon`);
        }
        
        if (capacityUsed >= 95) {
          console.log('Inventory nearly full - initiating deposit');
          await this.depositItems();
        }
      }
    } catch (error) {
      console.error('Failed to save inventory snapshot:', error.message);
    }
  }

  /**
   * Main harvesting loop execution
   * @async
   * @returns {Promise<void>} Runs indefinitely until interrupted
   */
  async mainLoop() {
    let loopCount = 0;
    
    while (true) {
      // Call the startLoop method to record coordinates properly
      await this.startLoop();
      
      loopCount++;
      console.log(`\nStarting harvesting loop #${loopCount}`);
      
      try {
        // Harvesting phase setup
      console.log('Checking for cooldown before moving to birch forest...');
      try {
        const freshDetails = await getCharacterDetails(this.characterName);
        
        if (freshDetails.cooldown && freshDetails.cooldown > 0) {
          const now = new Date();
          const expirationDate = new Date(freshDetails.cooldown_expiration);
          const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
          
          if (cooldownSeconds > 0) {
            console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
          }
        }
        
        // Reuse freshDetails to avoid redundant API call
        if (freshDetails.x === this.BIRCH_FOREST_COORDS.x && freshDetails.y === this.BIRCH_FOREST_COORDS.y) {
          console.log('Character is already at the birch forest. Continuing with harvesting...');
        } else {
          console.log(`Moving to birch forest at (${this.BIRCH_FOREST_COORDS.x}, ${this.BIRCH_FOREST_COORDS.y})`);
          try {
            await moveCharacter(this.BIRCH_FOREST_COORDS.x, this.BIRCH_FOREST_COORDS.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the maple forest. Continuing with harvesting...');
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
        console.log(`Moving to birch forest at (${this.BIRCH_FOREST_COORDS.x}, ${this.BIRCH_FOREST_COORDS.y})`);
        try {
          await moveCharacter(this.BIRCH_FOREST_COORDS.x, this.BIRCH_FOREST_COORDS.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the birch forest. Continuing with harvesting...');
          } else {
            throw error;
          }
        }
      }
      
      // Get starting birch count
      const startingBirch = await this.getBirchWoodCount();
      console.log(`Starting birch harvesting. Current birch wood: ${startingBirch}`);
      
      while (!await this.hasEnoughBirchWood()) {
        try {
          // Add delay between API calls
          await sleep(1000); // 1 second between actions
          
          const freshDetails = await getCharacterDetails(this.characterName);
          
          // Add additional cooldown check
          if (freshDetails.cooldown && freshDetails.cooldown > 0) {
            const cooldownSeconds = Math.ceil(freshDetails.cooldown);
            console.log(`API cooldown active. Waiting ${cooldownSeconds} seconds...`);
            await sleep(cooldownSeconds * 1000);
          }
          
          await gatheringAction();
          console.log('Harvesting successful');
          
          // Get character details once and reuse
          const details = await getCharacterDetails(this.characterName);
          
          // Calculate birch wood count from details instead of making another API call
          const birchWoodItem = details.inventory ? 
            details.inventory.find(item => item && item.code.toLowerCase() === 'birch_wood') : null;
          const currentBirch = birchWoodItem ? (birchWoodItem.quantity || 1) : 0;
          
          const gatheredBirch = currentBirch - startingBirch;
          console.log(`Birch wood harvested this session: ${gatheredBirch}`);
          console.log(`Total birch wood: ${currentBirch}`);
          
          if (details.inventory) {
            const items = details.inventory
              .filter(item => item && item.code)
              .map(item => `${item.code} x${item.quantity || 1}`);
            
            if (items.length > 0) {
              console.log('Inventory:', items.join(', '));
            }

            // Check inventory capacity
            await this.checkAndDeposit();
            if (details.inventory.length >= details.inventory_max_items) {
              console.log('Inventory full! Breaking to deposit items');
              break;
            }
          }
          
        } catch (error) {
          console.error('Harvesting failed:', error.message);

          // Handle rate limits specifically
          if (error.message.includes('429') || error.message.includes('Rate limit')) {
            const waitTime = 30; // seconds
            console.log(`Rate limit hit. Waiting ${waitTime} seconds...`);
            await sleep(waitTime * 1000);
            continue;
          }
          
          console.log('[DEBUG] db in error handler:', db ? 'Exists' : 'UNDEFINED');
          console.log('[DEBUG] db from birch-harvesting:', db?.pool ? 'Connected' : 'No pool');
          
          try {
            await db.query(
              `INSERT INTO action_logs(character, action_type, result)
               VALUES ($1, 'harvest_error', $2)`,
              [this.characterName, { error: error.message }]
            );
          } catch (dbError) {
            console.error('[DEBUG] Database error details:');
            console.error('- db instance:', db ? 'Exists' : 'UNDEFINED');
            console.error('- db.pool:', db?.pool ? 'Exists' : 'UNDEFINED');
            console.error('- Error message:', dbError.message);
            console.error('- Error stack:', dbError.stack);
          }
          
          if (error.message.includes('inventory is full')) {
            console.log('Inventory full detected - proceeding to deposit');
            break; // Exit harvesting loop to trigger deposit
          }
          
          if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
            console.log('Stopping: No resources available at this location.');
            break;
          }
          
          const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
          if (cooldownMatch) {
            const cooldownSeconds = parseFloat(cooldownMatch[1]);
            console.log(`Waiting for cooldown: ${cooldownSeconds.toFixed(1)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000));
            continue;
          }
        }
      }
      } finally {
        // Single deposit call for both success and error cases
        await this.depositItems();
      }

      // Check if target reached AFTER deposit
      if (await this.hasEnoughBirchWood()) {
        console.log(`Successfully collected ${this.TARGET_BIRCH_WOOD} birch wood!`);
        break;
      } else {
        console.log(`Continuing harvest...`);
      }
    }
  }

  /**
   * Command line entry point for birch harvesting automation
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    // Add initial delay to avoid burst on server restart
    await sleep(5000);
    
    console.log('[DEBUG] Database connection check:');
    console.log('- db imported in birch:', db ? 'Exists' : 'UNDEFINED');
    console.log('- db.pool:', db?.pool ? 'Connected' : 'No pool');
    
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    const harvestingLoop = new BirchHarvestingLoop(characterName);
    
    try {
      console.log(`Starting birch harvesting automation for character ${characterName}`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Harvest at (${harvestingLoop.BIRCH_FOREST_COORDS.x},${harvestingLoop.BIRCH_FOREST_COORDS.y}) until ${harvestingLoop.TARGET_BIRCH_WOOD} birch wood collected`);
      console.log(`2. Deposit all items at bank (${harvestingLoop.BANK_COORDS.x},${harvestingLoop.BANK_COORDS.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
BirchHarvestingLoop.main();
