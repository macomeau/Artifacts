/**
 * @fileoverview Automated strange ore mining loop that collects strange ore at dynamic coordinates
 * @module StrangeOreMiningLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

/**
 * Strange ore mining automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class StrangeOreMiningLoop extends BaseLoop {
  /**
   * Create a strange ore mining loop instance
   * @param {string} characterName - Name of character to perform actions with
   * @param {number} oreX - X coordinate of the strange ore location
   * @param {number} oreY - Y coordinate of the strange ore location
   * @param {Object} [options={}] - Configuration options for the loop.
   * @param {number} [options.targetOre=25] - Target ore quantity to collect.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   */
  constructor(characterName, oreX, oreY, options = {}) {
    super(characterName);

    const defaults = {
      targetOre: 25,
      bankCoords: { x: 4, y: 1 },
    };

    /** @type {Object} Coordinates of strange ore location */
    this.strangeOreCoords = { x: parseInt(oreX), y: parseInt(oreY) }; // Keep constructor args for coords
    /** @type {Object} Coordinates of bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Target ore quantity to collect before depositing */
    this.targetOre = options.targetOre || defaults.targetOre;
  }

  /**
   * Get current strange ore quantity from character inventory
   * @returns {Promise<number>} Current strange ore count
   * @throws {Error} If inventory check fails
   */
  async getOreCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const oreItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'strange_ore'
      );
      
      return oreItem ? (oreItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Check if target ore quantity has been collected
   * @returns {Promise<boolean>} True if enough ore collected
   */
  async hasEnoughOre() {
    const currentOre = await this.getOreCount();
    return currentOre >= this.targetOre; // Use configured target
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
      
      // Step 1: Mine strange ore until we have enough
      // Check for cooldown before moving
      console.log('Checking for cooldown before moving to strange ore location...');
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
      
        // Check if already at the ore location
        const currentDetails = await getCharacterDetails(this.characterName);
        if (currentDetails.x === this.strangeOreCoords.x && currentDetails.y === this.strangeOreCoords.y) {
          console.log('Character is already at the strange ore location. Continuing with mining...');
        } else {
          console.log(`Moving to strange ore location at (${this.strangeOreCoords.x}, ${this.strangeOreCoords.y})`);
          try {
            await moveCharacter(this.strangeOreCoords.x, this.strangeOreCoords.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the strange ore location. Continuing with mining...');
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
        // Continue with movement even if we can't check cooldown
        console.log(`Moving to strange ore location at (${this.strangeOreCoords.x}, ${this.strangeOreCoords.y})`);
        try {
          await moveCharacter(this.strangeOreCoords.x, this.strangeOreCoords.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the strange ore location. Continuing with mining...');
          } else {
            throw error;
          }
        }
      }
      
      // Get starting ore count
      const startingOre = await this.getOreCount();
      console.log(`Starting strange ore mining. Current strange ore: ${startingOre}`);
      
      while (!await this.hasEnoughOre()) {
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
          await gatheringAction(this.characterName);
          console.log('Mining successful');
          
          // Check inventory after each gather
          const currentOre = await this.getOreCount();
          const gatheredOre = currentOre - startingOre;
          console.log(`Strange ore gathered this session: ${gatheredOre}`);
          console.log(`Total strange ore: ${currentOre}`);
          
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
      console.log(`Collected target of ${this.targetOre} strange ore`); // Use configured target
    
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
   * Command line entry point for strange ore mining automation
   * @static
   * @async
   * @returns {Promise<void>} 
   * @static
   * @async
   * @example
   * node strange-ore-mining-loop.js [characterName] "(oreX,oreY)" [targetOre] [bankX] [bankY]
   * node strange-ore-mining-loop.js MyChar "(15,-5)" 50 4 1
   * @returns {Promise<void>}
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    const args = process.argv.slice(2);
    let characterName = args[0];
    let oreX, oreY;

    // Fallback logic for character name
    if (!characterName || characterName.startsWith('--')) {
      characterName = process.env.control_character || config.character;
    } else {
      args.shift(); // Remove character name if it was provided first
    }

    // --- Parse coordinates and options from remaining arguments ---
    const options = {};
    let coordArgIndex = -1;

    // Find coordinate argument "(x,y)" or "x,y"
    for (let i = 0; i < args.length; i++) {
        const coordMatch = args[i].match(/\(?(-?\d+)\s*,\s*(-?\d+)\)?/);
        if (coordMatch) {
            oreX = parseInt(coordMatch[1]);
            oreY = parseInt(coordMatch[2]);
            coordArgIndex = i;
            break;
        }
    }

    if (oreX === undefined || oreY === undefined) {
        console.error('Error: Coordinates must be provided in format "(X,Y)" or "X,Y".');
        process.exit(1);
    }

    // Remove coordinate arg from list before parsing others
    if (coordArgIndex !== -1) {
        args.splice(coordArgIndex, 1);
    }

    // Parse remaining args for options
    if (args[0]) options.targetOre = parseInt(args[0], 10);
    if (args[1] && args[2]) options.bankCoords = { x: parseInt(args[1], 10), y: parseInt(args[2], 10) };

    // Create mining loop instance with coordinates and options
    const miningLoop = new StrangeOreMiningLoop(characterName, oreX, oreY, options);

    try {
      console.log(`Starting strange ore mining automation for character ${characterName}`);
      console.log('Using configuration:');
      console.log(`  - Target Ore: ${miningLoop.targetOre}`);
      console.log(`  - Ore Coords: (${miningLoop.strangeOreCoords.x}, ${miningLoop.strangeOreCoords.y})`);
      console.log(`  - Bank Coords: (${miningLoop.bankCoords.x}, ${miningLoop.bankCoords.y})`);
      console.log('\nWill perform the following steps in a loop:');
      console.log(`1. Mine at (${miningLoop.strangeOreCoords.x},${miningLoop.strangeOreCoords.y}) until ${miningLoop.targetOre} strange ore collected`);
      console.log(`2. Deposit all items at bank (${miningLoop.bankCoords.x},${miningLoop.bankCoords.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      await miningLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
StrangeOreMiningLoop.main();
