/**
 * @fileoverview Automated copper mining bot that mines copper ore, optionally smelts it into bars, and deposits in bank.
 * @module CopperMiningLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
const db = require('./db');
require('dotenv').config();

/**
 * Class representing an automated copper mining loop.
 * @extends BaseLoop
 */
class CopperMiningLoop extends BaseLoop {
  /**
   * Create a copper mining loop.
   * @param {string} characterName - The name of the character to perform actions with.
   * @param {boolean} [skipSmelting=false] - Whether to skip the smelting step and go directly to the bank.
   */
  constructor(characterName, skipSmelting = false) {
    super(characterName);
    /** @type {Object} Coordinates of the copper mine */
    this.COPPER_MINE_COORDS = { x: 2, y: 0 };
    /** @type {Object} Coordinates of the smith */
    this.SMITH_COORDS = { x: 1, y: 5 };
    /** @type {Object} Coordinates of the bank */
    this.BANK_COORDS = { x: 4, y: 1 };
    /** @type {number} Target amount of copper ore to mine before proceeding */
    this.TARGET_COPPER_ORE = 100;
    /** @type {number} Amount of copper bars to smelt in each cycle */
    this.COPPER_BARS_TO_SMELT = 10;
    /** @type {boolean} Whether to skip the smelting step */
    this.skipSmelting = skipSmelting;
  }

  /**
   * Get the current amount of copper ore in the character's inventory.
   * @returns {Promise<number>} The quantity of copper ore.
   */
  async getCopperOreCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const copperOreItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'copper_ore'
      );
      
      return copperOreItem ? (copperOreItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Check if the character has enough copper ore to proceed to the next step.
   * @returns {Promise<boolean>} True if the character has reached or exceeded the target amount.
   */
  async hasEnoughCopperOre() {
    const currentCopper = await this.getCopperOreCount();
    return currentCopper >= this.TARGET_COPPER_ORE;
  }

  /**
   * Main loop that coordinates the mining, smelting, and depositing process.
   * Continuously mines copper ore, optionally smelts it into bars, and deposits resources at the bank.
   * @returns {Promise<void>}
   */
  async mainLoop() {
    let loopCount = 0;
    
    while (true) {
      // Call the startLoop method to record coordinates properly
      await this.startLoop();
      
      loopCount++;
      console.log(`\nStarting mining loop #${loopCount} with character ${this.characterName}`);
      
      // Step 1: Mine copper until we have enough
      // Check for cooldown before moving
      console.log('Checking for cooldown before moving to copper mine...');
    try {
      const freshDetails = await getCharacterDetails(this.characterName);
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        }
      }
      
      // Check if already at copper mine
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.COPPER_MINE_COORDS.x && currentDetails.y === this.COPPER_MINE_COORDS.y) {
        console.log('Character is already at the copper mine. Continuing with mining...');
      } else {
        console.log(`Moving to copper mine at (${this.COPPER_MINE_COORDS.x}, ${this.COPPER_MINE_COORDS.y})`);
        try {
          await moveCharacter(this.COPPER_MINE_COORDS.x, this.COPPER_MINE_COORDS.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the copper mine. Continuing with mining...');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to copper mine at (${this.COPPER_MINE_COORDS.x}, ${this.COPPER_MINE_COORDS.y})`);
      try {
        await moveCharacter(this.COPPER_MINE_COORDS.x, this.COPPER_MINE_COORDS.y, this.characterName);
      } catch (error) {
        if (error.message.includes('Character already at destination')) {
          console.log('Character is already at the copper mine. Continuing with mining...');
        } else {
          throw error;
        }
      }
    }
    
    // Get starting copper count
    const startingCopper = await this.getCopperOreCount();
    console.log(`Starting copper mining. Current copper ore: ${startingCopper}`);
    
    while (!await this.hasEnoughCopperOre()) {
      // Use the gathering action directly
      try {
        // Check for cooldown before gathering
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
        
        // Perform gathering action
        await gatheringAction();
        console.log('Gathering successful');
        
        // Check inventory after each gather
        const currentCopper = await this.getCopperOreCount();
        const gatheredCopper = currentCopper - startingCopper;
        console.log(`Copper ore gathered this session: ${gatheredCopper}`);
        console.log(`Total copper ore: ${currentCopper}`);
        
        // Log only non-empty inventory slots
        const details = await getCharacterDetails(this.characterName);
        if (details.inventory) {
          const items = details.inventory
            .filter(item => item && item.code)
            .map(item => `${item.code} x${item.quantity || 1}`);
          
          if (items.length > 0) {
            console.log('Inventory:', items.join(', '));
          }
        }
        
      } catch (error) {
        console.error('Gathering failed:', error.message);
        
        // Handle specific errors
        if (error.message.includes('Character inventory is full')) {
          console.log('Stopping: Inventory is full.');
          // Log the inventory full event to database
          const details = await getCharacterDetails(this.characterName);
          await db.query(
            `INSERT INTO action_logs(character, action_type, result, coordinates)
             VALUES ($1, 'mining', $2, point($3,$4))`,
            [
              this.characterName,
              { error: 'inventory_full', message: 'Stopped due to full inventory' },
              details.x,
              details.y
            ]
          );
          break;
        }
        
        if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
          console.log('Stopping: No resources available at this location.');
          break;
        }
        
        // Handle cooldown errors
        const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
        if (cooldownMatch) {
          const cooldownSeconds = parseFloat(cooldownMatch[1]);
          console.log(`Waiting for cooldown: ${cooldownSeconds.toFixed(1)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000));
          continue;
        }
      }
    }
    console.log(`Collected ${this.TARGET_COPPER_ORE} copper ore`);
    
    // Check if smelting should be skipped
    if (this.skipSmelting) {
      console.log('Smelting step skipped due to skipSmelting flag');
    } else {
      // Step 2: Smelt copper into bars
      // Check for cooldown before moving to smith
    console.log('Checking for cooldown before moving to smith...');
    try {
      const freshDetails = await getCharacterDetails(this.characterName);
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        }
      }
      
      // Check if already at smith
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.SMITH_COORDS.x && currentDetails.y === this.SMITH_COORDS.y) {
        console.log('Character is already at the smith. Continuing with smelting...');
      } else {
        console.log(`Moving to smith at (${this.SMITH_COORDS.x}, ${this.SMITH_COORDS.y})`);
        await moveCharacter(this.SMITH_COORDS.x, this.SMITH_COORDS.y, this.characterName);
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to smith at (${this.SMITH_COORDS.x}, ${this.SMITH_COORDS.y})`);
      await moveCharacter(this.SMITH_COORDS.x, this.SMITH_COORDS.y, this.characterName);
    }
    
    console.log(`Smelting ${this.COPPER_BARS_TO_SMELT} copper bars...`);
    try {
      
      // Check for cooldown before smelting
      console.log('Checking for cooldown before smelting...');
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
      
      // Perform smelting - convert copper_ore to copper
      await craftingAction('copper', this.COPPER_BARS_TO_SMELT, 'copper_ore', this.characterName);
      console.log('Smelting successful');
    } catch (error) {
      console.error('Smelting failed:', error.message);
      
      // Handle cooldown errors for smelting
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Smelting action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
        
        // Try again after cooldown
        console.log('Retrying smelting after cooldown...');
        try {
          const result = await craftingAction('copper', this.COPPER_BARS_TO_SMELT, 'copper_ore', this.characterName);
          console.log('Smelting successful:', result);
        } catch (retryError) {
          console.error('Smelting failed after retry:', retryError.message);
        }
      } else {
        throw error;
      }
    }
    console.log('Smelting complete');
    }
    
    // Step 3: Deposit everything in the bank
    // Check for cooldown before moving to bank
    console.log('Checking for cooldown before moving to bank...');
    try {
      const freshDetails = await getCharacterDetails(this.characterName);
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        }
      }
      
      // Check if already at bank
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.BANK_COORDS.x && currentDetails.y === this.BANK_COORDS.y) {
        console.log('Character is already at the bank. Continuing with deposit...');
      } else {
        console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
        await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
      await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
    }
    
    console.log('Starting deposit of all items...');
    
    // Check if character is in cooldown before depositing
    console.log('Checking for cooldown before depositing...');
    try {
      const freshDetails = await getCharacterDetails(this.characterName);
      
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
      
      // Temporarily set config.character to this.characterName
      const originalCharacter = config.character;
      config.character = this.characterName;
      
      // Perform deposit with error handling
      try {
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
      } finally {
        // Restore original character
        config.character = originalCharacter;
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
    }
    console.log('Deposit complete');
    
    console.log(`Completed mining loop #${loopCount}\n`);
  }
}

  /**
   * Main entry point for the application that handles command line arguments and initiates the mining loop.
   * Parses command line arguments for character name and processing options.
   * @static
   * @returns {Promise<void>}
   * @throws {Error} If there's an error in the main process
   */
  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    // Check processing option from args[1]
    const processOption = args[1] || 'store';
    
    // Convert processOption to skipSmelting boolean
    // 'store' -> true (skip smelting), 'smelt' -> false (do smelting)
    const skipSmelting = processOption !== 'smelt';
    
    const miningLoop = new CopperMiningLoop(characterName, skipSmelting);
    
    try {
      console.log(`Starting copper mining automation for character ${characterName}`);
      console.log(`Processing option: ${processOption} (skipSmelting: ${skipSmelting})`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Mine at (${miningLoop.COPPER_MINE_COORDS.x},${miningLoop.COPPER_MINE_COORDS.y}) until ${miningLoop.TARGET_COPPER_ORE} copper ore collected`);
      
      if (!skipSmelting) {
        console.log(`2. Smelt at (${miningLoop.SMITH_COORDS.x},${miningLoop.SMITH_COORDS.y}) into ${miningLoop.COPPER_BARS_TO_SMELT} copper bars`);
        console.log(`3. Deposit all items at bank (${miningLoop.BANK_COORDS.x},${miningLoop.BANK_COORDS.y})`);
      } else {
        console.log(`2. Skip smelting and directly deposit all ore at bank (${miningLoop.BANK_COORDS.x},${miningLoop.BANK_COORDS.y})`);
      }
      console.log('Press Ctrl+C to stop the script at any time');
      
      await miningLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
CopperMiningLoop.main();
