/**
 * @fileoverview Automated gold mining loop that collects gold and deposits items at bank
 * @module GoldMiningLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

/**
 * Gold mining automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class GoldMiningLoop extends BaseLoop {
  /**
   * Create a gold mining loop instance
   * @param {string} characterName - Name of character to perform actions with
   * @param {Object} [options={}] - Configuration options for the loop.
   * @param {Object} [options.mineCoords={ x: 6, y: -3 }] - Coordinates for mining.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   * @param {number} [options.targetGold=50] - Target gold ore quantity to collect.
   */
  constructor(characterName, options = {}) {
    super(characterName);

    const defaults = {
      mineCoords: { x: 6, y: -3 },
      bankCoords: { x: 4, y: 1 },
      targetGold: 50,
    };

    /** @type {Object} Coordinates of gold mine */
    this.mineCoords = options.mineCoords || defaults.mineCoords;
    /** @type {Object} Coordinates of bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Target gold quantity to collect before depositing */
    this.targetGold = options.targetGold || defaults.targetGold;
  }

  /**
   * Get current gold quantity from character inventory
   * @returns {Promise<number>} Current gold count
   * @throws {Error} If inventory check fails
   */
  async getGoldCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const goldItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'gold_ore'
      );
      
      return goldItem ? (goldItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Check if target gold quantity has been collected
   * @returns {Promise<boolean>} True if enough gold collected
   */
  async hasEnoughGold() {
    const currentGold = await this.getGoldCount();
    return currentGold >= this.targetGold; // Use configured target
  }

  /**
   * Main mining loop execution
   * @async
   * @returns {Promise<void>} Runs indefinitely until interrupted
   */
  async mainLoop() {
    let loopCount = 0;
    
    while (true) {
      // Call the startLoop method to record coordinates properly
      await this.startLoop();
      
      loopCount++;
      console.log(`\nStarting mining loop #${loopCount}`);
      
      // Step 1: Mine gold until we have enough
      // Check for cooldown before moving
      console.log('Checking for cooldown before moving to gold mine...');
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
      
        // Check if already at gold mine
        const currentDetails = await getCharacterDetails(this.characterName);
        if (currentDetails.x === this.mineCoords.x && currentDetails.y === this.mineCoords.y) {
          console.log('Character is already at the gold mine. Continuing with mining...');
        } else {
          console.log(`Moving to gold mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
          try {
            await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the gold mine. Continuing with mining...');
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
        // Continue with movement even if we can't check cooldown
        console.log(`Moving to gold mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
        try {
          await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the gold mine. Continuing with mining...');
          } else {
            throw error;
          }
        }
      }
      
      // Get starting gold count
      const startingGold = await this.getGoldCount();
      console.log(`Starting gold mining. Current gold ore: ${startingGold}`);
      
      while (!await this.hasEnoughGold()) {
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
          console.log('Mining successful');
          
          // Check inventory after each gather
          const currentGold = await this.getGoldCount();
          const gatheredGold = currentGold - startingGold;
          console.log(`Gold ore gathered this session: ${gatheredGold}`);
          console.log(`Total gold ore: ${currentGold}`);
          
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
          console.error('Mining failed:', error.message);
          
          // Handle specific errors
          if (error.message.includes('inventory is full')) {
            console.log('Stopping: Inventory is full.');
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
      console.log(`Collected target of ${this.targetGold} gold ore`); // Use configured target
    
      // Step 2: Deposit everything in the bank
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
        if (currentDetails.x === this.bankCoords.x && currentDetails.y === this.bankCoords.y) {
          console.log('Character is already at the bank. Continuing with deposit...');
        } else {
          console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
          await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
        // Continue with movement even if we can't check cooldown
        console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
        await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
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
        
        // Perform deposit with error handling
        try {
          await depositAllItems(this.characterName);
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
              await depositAllItems(this.characterName);
            } catch (retryError) {
              console.error('Deposit failed after retry:', retryError.message);
            }
          } else {
            console.error('Deposit failed:', error.message);
          }
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
      }
      console.log('Deposit complete');
      
      console.log(`Completed mining loop #${loopCount}\n`);
    }
  }

  /**
   * Command line entry point for gold mining automation
   * @static
   * @async
   * @returns {Promise<void>} 
   * @static
   * @async
   * @example
   * node gold-mining-loop.js [characterName] [targetGold] [mineX] [mineY] [bankX] [bankY]
   * node gold-mining-loop.js MyChar 75 6 -3 4 1
   * @returns {Promise<void>}
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;

    // --- Parse options from command line arguments ---
    const options = {};
    if (args[1]) options.targetGold = parseInt(args[1], 10);
    if (args[2] && args[3]) options.mineCoords = { x: parseInt(args[2], 10), y: parseInt(args[3], 10) };
    if (args[4] && args[5]) options.bankCoords = { x: parseInt(args[4], 10), y: parseInt(args[5], 10) };

    // Create an instance with potentially overridden options
    const miningLoop = new GoldMiningLoop(characterName, options);

    try {
      console.log(`Starting gold mining automation for character ${characterName}`);
      console.log('Using configuration:');
      console.log(`  - Target Gold Ore: ${miningLoop.targetGold}`);
      console.log(`  - Mine Coords: (${miningLoop.mineCoords.x}, ${miningLoop.mineCoords.y})`);
      console.log(`  - Bank Coords: (${miningLoop.bankCoords.x}, ${miningLoop.bankCoords.y})`);
      console.log('\nWill perform the following steps in a loop:');
      console.log(`1. Mine at (${miningLoop.mineCoords.x},${miningLoop.mineCoords.y}) until ${miningLoop.targetGold} gold ore collected`);
      console.log(`2. Deposit all items at bank (${miningLoop.bankCoords.x},${miningLoop.bankCoords.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      await miningLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
GoldMiningLoop.main();
