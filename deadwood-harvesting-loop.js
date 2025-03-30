/**
 * @fileoverview Automated deadwood harvesting loop with options for crafting or banking
 * @module DeadwoodHarvestingLoop
 */

// Load environment variables first
require('./env-loader');

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
const db = require('./db');
const { sleep } = require('./utils');

/**
 * Deadwood harvesting automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class DeadwoodHarvestingLoop extends BaseLoop {
  /**
   * Create a deadwood harvesting loop instance
   * @param {string} characterName - Name of character to perform actions with
   * @param {Object} options - Configuration options
   * @param {boolean} [options.craftPlanks=false] - Whether to craft planks or just deposit
   * @param {number} [options.targetDeadwood=100] - Target quantity of deadwood to collect
   */
  constructor(characterName, options = {}) {
    super(characterName);
    /** @type {Object} Coordinates of deadwood forest */
    this.DEADWOOD_COORDS = { x: 9, y: 8 };
    /** @type {Object} Coordinates of sawmill */
    this.SAWMILL_COORDS = { x: -2, y: -3 };
    /** @type {Object} Coordinates of bank */
    this.BANK_COORDS = { x: 4, y: 1 };
    /** @type {number} Target deadwood quantity */
    this.TARGET_DEADWOOD = options.targetDeadwood || 100;
    /** @type {string} Crafting recipe code for deadwood planks */
    this.DEADWOOD_PLANK_RECIPE_CODE = 'dead_wood_plank';
    /** @type {boolean} Whether to craft planks or just deposit wood */
    this.CRAFT_PLANKS = options.craftPlanks || false;
    /** @type {number} Number of deadwood needed per plank */
    this.DEADWOOD_PER_PLANK = 10;
  }

  /**
   * Get current deadwood quantity from inventory
   * @returns {Promise<number>} Current deadwood count
   * @throws {Error} If inventory check fails
   */
  async getDeadwoodCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const deadwoodItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'dead_tree'
      );
      
      return deadwoodItem ? (deadwoodItem.quantity || 1) : 0;
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
      
      // Return to deadwood forest after depositing
      console.log(`Returning to deadwood forest at (${this.DEADWOOD_COORDS.x},${this.DEADWOOD_COORDS.y})`);
      await moveCharacter(
        this.DEADWOOD_COORDS.x, 
        this.DEADWOOD_COORDS.y, 
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
   * Craft deadwood planks from deadwood
   * @async
   * @returns {Promise<boolean>} True if crafting was successful
   * @throws {Error} If crafting fails
   */
  async craftDeadwoodPlanks() {
    try {
      const deadwoodCount = await this.getDeadwoodCount();
      const maxPlanks = Math.floor(deadwoodCount / this.DEADWOOD_PER_PLANK);
      
      if (maxPlanks <= 0) {
        console.log('Not enough deadwood to craft planks');
        return false;
      }
      
      console.log(`Checking for cooldown before moving to sawmill...`);
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
      
      // Move to sawmill - reuse freshDetails to avoid redundant API call
      if (freshDetails.x === this.SAWMILL_COORDS.x && freshDetails.y === this.SAWMILL_COORDS.y) {
        console.log('Already at sawmill');
      } else {
        console.log(`Moving to sawmill at (${this.SAWMILL_COORDS.x}, ${this.SAWMILL_COORDS.y})`);
        await moveCharacter(this.SAWMILL_COORDS.x, this.SAWMILL_COORDS.y, this.characterName);
      }
      
      console.log(`Crafting ${maxPlanks} deadwood planks...`);
      await craftingAction(this.DEADWOOD_PLANK_RECIPE_CODE, maxPlanks, this.characterName);
      console.log(`Successfully crafted ${maxPlanks} deadwood planks`);
      
      return true;
    } catch (error) {
      console.error('Deadwood plank crafting failed:', error.message);
      
      // Handle rate limits
      if (error.message.includes('429') || error.message.includes('Rate limit')) {
        const waitTime = 30; // seconds
        console.log(`Rate limit hit. Waiting ${waitTime} seconds...`);
        await sleep(waitTime * 1000);
        return this.craftDeadwoodPlanks();
      }
      
      throw error;
    }
  }

  /**
   * Check if target deadwood quantity has been collected
   * @returns {Promise<boolean>} True if enough deadwood collected or false if running infinite mode
   */
  async hasEnoughDeadwood() {
    // If target is 0, run indefinitely (never return true)
    if (this.TARGET_DEADWOOD === 0) {
      return false;
    }
    
    const currentDeadwood = await this.getDeadwoodCount();
    return currentDeadwood >= this.TARGET_DEADWOOD;
  }

  /**
   * Override the checkAndDeposit method from BaseLoop to handle inventory
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
      console.log(`\nStarting deadwood harvesting loop #${loopCount}`);
      
      try {
        // Harvesting phase setup
        console.log('Checking for cooldown before moving to deadwood location...');
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
          if (freshDetails.x === this.DEADWOOD_COORDS.x && freshDetails.y === this.DEADWOOD_COORDS.y) {
            console.log('Character is already at the deadwood location. Continuing with harvesting...');
          } else {
            console.log(`Moving to deadwood location at (${this.DEADWOOD_COORDS.x}, ${this.DEADWOOD_COORDS.y})`);
            try {
              await moveCharacter(this.DEADWOOD_COORDS.x, this.DEADWOOD_COORDS.y, this.characterName);
            } catch (error) {
              if (error.message.includes('Character already at destination')) {
                console.log('Character is already at the deadwood location. Continuing with harvesting...');
              } else {
                throw error;
              }
            }
          }
        } catch (error) {
          console.error('Failed to check cooldown:', error.message);
          console.log(`Moving to deadwood location at (${this.DEADWOOD_COORDS.x}, ${this.DEADWOOD_COORDS.y})`);
          try {
            await moveCharacter(this.DEADWOOD_COORDS.x, this.DEADWOOD_COORDS.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the deadwood location. Continuing with harvesting...');
            } else {
              throw error;
            }
          }
        }
        
        // Get starting deadwood count
        const startingDeadwood = await this.getDeadwoodCount();
        console.log(`Starting deadwood harvesting. Current deadwood: ${startingDeadwood}`);
        
        while (!await this.hasEnoughDeadwood()) {
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
            
            await gatheringAction(this.characterName);
            console.log('Harvesting successful');
            
            // Get character details once and reuse
            const details = await getCharacterDetails(this.characterName);
            
            // Calculate deadwood count from details instead of making another API call
            const deadwoodItem = details.inventory ? 
              details.inventory.find(item => item && item.code.toLowerCase() === 'dead_tree') : null;
            const currentDeadwood = deadwoodItem ? (deadwoodItem.quantity || 1) : 0;
            
            const gatheredDeadwood = currentDeadwood - startingDeadwood;
            console.log(`Deadwood harvested this session: ${gatheredDeadwood}`);
            console.log(`Total deadwood: ${currentDeadwood}`);
            
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
            
            try {
              await db.query(
                `INSERT INTO action_logs(character, action_type, result)
                 VALUES ($1, 'harvest_error', $2)`,
                [this.characterName, { error: error.message }]
              );
            } catch (dbError) {
              console.error('Failed to log harvesting error:', dbError.message);
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
        // Process based on crafting option
        if (this.CRAFT_PLANKS) {
          await this.craftDeadwoodPlanks();
        }
        
        // Always deposit at the end of the cycle
        await this.depositItems();
      }

      // Check if target reached AFTER deposit (only if not in infinite mode)
      if (this.TARGET_DEADWOOD > 0 && await this.hasEnoughDeadwood()) {
        console.log(`Successfully collected ${this.TARGET_DEADWOOD} deadwood!`);
        break;
      } else {
        // Different message based on mode
        if (this.TARGET_DEADWOOD === 0) {
          console.log(`Running in infinite mode. Continuing harvest...`);
        } else {
          console.log(`Continuing harvest until target of ${this.TARGET_DEADWOOD} is reached...`);
        }
      }
    }
  }

  /**
   * Command line entry point for deadwood harvesting automation
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    // Add initial delay to avoid burst on server restart
    await sleep(5000);
    
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    // Parse options: --craft to enable plank crafting, --target=X to set target quantity
    const craftPlanks = args.includes('--craft');
    const targetArg = args.find(arg => arg.startsWith('--target='));
    const targetDeadwood = targetArg ? parseInt(targetArg.split('=')[1], 10) : 100;
    
    const options = {
      craftPlanks,
      targetDeadwood
    };
    
    const harvestingLoop = new DeadwoodHarvestingLoop(characterName, options);
    
    try {
      console.log(`Starting deadwood harvesting automation for character ${characterName}`);
      console.log('Options:');
      console.log(`- Craft planks: ${craftPlanks ? 'Yes' : 'No'}`);
      console.log(`- Target deadwood: ${targetDeadwood === 0 ? 'Infinite (run forever)' : targetDeadwood}`);
      console.log('Will perform the following steps in a loop:');
      
      if (harvestingLoop.TARGET_DEADWOOD === 0) {
        console.log(`1. Harvest at (${harvestingLoop.DEADWOOD_COORDS.x},${harvestingLoop.DEADWOOD_COORDS.y}) indefinitely`);
      } else {
        console.log(`1. Harvest at (${harvestingLoop.DEADWOOD_COORDS.x},${harvestingLoop.DEADWOOD_COORDS.y}) until ${harvestingLoop.TARGET_DEADWOOD} deadwood collected`);
      }
      
      if (craftPlanks) {
        console.log(`2. Craft deadwood planks at sawmill (${harvestingLoop.SAWMILL_COORDS.x},${harvestingLoop.SAWMILL_COORDS.y})`);
        console.log(`3. Deposit all items at bank (${harvestingLoop.BANK_COORDS.x},${harvestingLoop.BANK_COORDS.y})`);
      } else {
        console.log(`2. Deposit all items at bank (${harvestingLoop.BANK_COORDS.x},${harvestingLoop.BANK_COORDS.y})`);
      }
      
      console.log('Press Ctrl+C to stop the script at any time');
      
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function if this is the main module
if (require.main === module) {
  DeadwoodHarvestingLoop.main();
}

/**
 * Module exports
 * @exports deadwood-harvesting-loop
 */
module.exports = {
  DeadwoodHarvestingLoop
};