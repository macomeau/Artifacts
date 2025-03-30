/**
 * @fileoverview Automated coal mining loop that collects coal and deposits items at bank
 * @module CoalMiningLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

/**
 * Coal mining automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class CoalMiningLoop extends BaseLoop {
  /**
   * Create a coal mining loop instance
   * @param {string} characterName - Name of character to perform actions with
   */
  constructor(characterName) {
    super(characterName);
    /** @type {Object} Coordinates of coal mine */
    this.COAL_MINE_COORDS = { x: 1, y: 6 };
    /** @type {Object} Coordinates of bank */
    this.BANK_COORDS = { x: 4, y: 1 };
    /** @type {number} Target coal quantity to collect before depositing */
    this.TARGET_COAL = 100;
  }

  /**
   * Get current coal quantity from character inventory
   * @returns {Promise<number>} Current coal count
   * @throws {Error} If inventory check fails
   */
  async getCoalCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const coalItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'coal'
      );
      
      return coalItem ? (coalItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Check if target coal quantity has been collected
   * @returns {Promise<boolean>} True if enough coal collected
   */
  async hasEnoughCoal() {
    const currentCoal = await this.getCoalCount();
    return currentCoal >= this.TARGET_COAL;
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
      
      // Step 1: Mine coal until we have enough
      // Check for cooldown before moving
      console.log('Checking for cooldown before moving to coal mine...');
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
        
        // Check if already at coal mine
        const currentDetails = await getCharacterDetails(this.characterName);
        if (currentDetails.x === this.COAL_MINE_COORDS.x && currentDetails.y === this.COAL_MINE_COORDS.y) {
          console.log('Character is already at the coal mine. Continuing with mining...');
        } else {
          console.log(`Moving to coal mine at (${this.COAL_MINE_COORDS.x}, ${this.COAL_MINE_COORDS.y})`);
          try {
            await moveCharacter(this.COAL_MINE_COORDS.x, this.COAL_MINE_COORDS.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the coal mine. Continuing with mining...');
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
        // Continue with movement even if we can't check cooldown
        console.log(`Moving to coal mine at (${this.COAL_MINE_COORDS.x}, ${this.COAL_MINE_COORDS.y})`);
        try {
          await moveCharacter(this.COAL_MINE_COORDS.x, this.COAL_MINE_COORDS.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the coal mine. Continuing with mining...');
          } else {
            throw error;
          }
        }
      }
      
      // Get starting coal count
      const startingCoal = await this.getCoalCount();
      console.log(`Starting coal mining. Current coal: ${startingCoal}`);
      
      while (!await this.hasEnoughCoal()) {
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
          const currentCoal = await this.getCoalCount();
          const gatheredCoal = currentCoal - startingCoal;
          console.log(`Coal gathered this session: ${gatheredCoal}`);
          console.log(`Total coal: ${currentCoal}`);
          
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
      console.log(`Collected ${this.TARGET_COAL} coal`);
      
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
   * Command line entry point for coal mining automation
   * @static
   * @async
   * @returns {Promise<void>} 
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    const miningLoop = new CoalMiningLoop(characterName);
    
    try {
      console.log(`Starting coal mining automation for character ${characterName}`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Mine at (${miningLoop.COAL_MINE_COORDS.x},${miningLoop.COAL_MINE_COORDS.y}) until ${miningLoop.TARGET_COAL} coal collected`);
      console.log(`2. Deposit all items at bank (${miningLoop.BANK_COORDS.x},${miningLoop.BANK_COORDS.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      
      await miningLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
CoalMiningLoop.main();
