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
   * @param {Object} [options={}] - Configuration options for the loop.
   * @param {Object} [options.mineCoords={ x: 2, y: 0 }] - Coordinates for mining.
   * @param {Object} [options.smithCoords={ x: 1, y: 5 }] - Coordinates for the smithy.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   * @param {number} [options.targetCopperOre=100] - Target ore quantity to collect.
   * @param {number} [options.copperBarsToSmelt=10] - Number of bars to smelt per cycle.
   * @param {boolean} [options.skipSmelting=false] - Whether to skip smelting.
   */
  constructor(characterName, options = {}) {
    super(characterName);

    const defaults = {
      mineCoords: { x: 2, y: 0 },
      smithCoords: { x: 1, y: 5 },
      bankCoords: { x: 4, y: 1 },
      targetCopperOre: 100,
      copperBarsToSmelt: 10,
      skipSmelting: false,
    };

    /** @type {Object} Coordinates of the copper mine */
    this.mineCoords = options.mineCoords || defaults.mineCoords;
    /** @type {Object} Coordinates of the smith */
    this.smithCoords = options.smithCoords || defaults.smithCoords;
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Target amount of copper ore to mine before proceeding */
    this.targetCopperOre = options.targetCopperOre || defaults.targetCopperOre;
    /** @type {number} Amount of copper bars to smelt in each cycle */
    this.copperBarsToSmelt = options.copperBarsToSmelt || defaults.copperBarsToSmelt;
    /** @type {boolean} Whether to skip the smelting step */
    this.skipSmelting = options.skipSmelting || defaults.skipSmelting;
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
    return currentCopper >= this.targetCopperOre; // Use configured target
  }

  /**
   * Main loop that coordinates the mining, smelting, and depositing process.
   * Continuously mines copper ore, optionally smelts it into bars, and deposits resources at the bank.
   * @returns {Promise<void>}
   */
  async mainLoop() {
    
    while (true) {
      // Call the startLoop method to record coordinates properly
      await this.startLoop(); // This increments this.loopCount
      
      console.log(`\nStarting mining loop #${this.loopCount} with character ${this.characterName}`);
      
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
      if (currentDetails.x === this.mineCoords.x && currentDetails.y === this.mineCoords.y) {
        console.log('Character is already at the copper mine. Continuing with mining...');
      } else {
        console.log(`Moving to copper mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
        try {
          await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
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
      console.log(`Moving to copper mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
      try {
        await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
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
        if (error.message.includes('inventory is full') || 
            error.message.includes('Character inventory is full') || 
            (error.message.includes('API error') && error.message.includes('497'))) {
          console.log('Inventory is full. Proceeding to emergency deposit...');
          
          // Log the inventory full event to database
          const details = await getCharacterDetails(this.characterName);
          await db.query(
            `INSERT INTO action_logs(character, action_type, result, coordinates)
             VALUES ($1, 'mining', $2, point($3,$4))`,
            [
              this.characterName,
              { error: 'inventory_full', message: 'Emergency deposit triggered due to full inventory' },
              details.x,
              details.y
            ]
          );
          
          // Move to bank and deposit immediately when inventory is full
          try {
            console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
            await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
            
            console.log('Starting emergency deposit of all items...');
            await depositAllItems(this.characterName);
            console.log('Emergency deposit complete');
            
            // Return to mine to continue mining
            console.log(`Returning to mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
            await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
            continue; // Continue mining after deposit
          } catch (depositError) {
            console.error('Emergency deposit failed:', depositError.message);
            // If deposit fails, break the mining loop and continue with normal flow
          }
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
    console.log(`Collected target of ${this.targetCopperOre} copper ore`); // Use configured target
    
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
      if (currentDetails.x === this.smithCoords.x && currentDetails.y === this.smithCoords.y) {
        console.log('Character is already at the smith. Continuing with smelting...');
      } else {
        console.log(`Moving to smith at (${this.smithCoords.x}, ${this.smithCoords.y})`);
        await moveCharacter(this.smithCoords.x, this.smithCoords.y, this.characterName);
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to smith at (${this.smithCoords.x}, ${this.smithCoords.y})`);
      await moveCharacter(this.smithCoords.x, this.smithCoords.y, this.characterName);
    }
    
    // Calculate how many bars can be made
    const currentOre = await this.getCopperOreCount();
    const barsToMake = Math.min(this.copperBarsToSmelt, Math.floor(currentOre / 10)); // Assuming 10 ore per bar

    if (barsToMake <= 0) {
      console.log('Not enough copper ore to smelt any bars.');
    } else {
      console.log(`Smelting ${barsToMake} copper bars...`);
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
        await craftingAction('copper', barsToMake, 'copper_ore', this.characterName);
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
            // Recalculate bars to make after cooldown
            const oreAfterCooldown = await this.getCopperOreCount();
            const barsToRetry = Math.min(this.copperBarsToSmelt, Math.floor(oreAfterCooldown / 10));
            if (barsToRetry > 0) {
              const result = await craftingAction('copper', barsToRetry, 'copper_ore', this.characterName);
              console.log('Smelting successful:', result);
            } else {
              console.log('Not enough ore to retry smelting.');
            }
          } catch (retryError) {
            console.error('Smelting failed after retry:', retryError.message);
          }
        } else {
          throw error;
        }
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
      
      // Temporarily set config.character to this.characterName
      const originalCharacter = config.character;
      config.character = this.characterName;
      
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
      } finally {
        // Restore original character
        config.character = originalCharacter;
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
    }
    console.log('Deposit complete');
    
    console.log(`Completed mining loop #${this.loopCount}\n`);
  }
}

  /**
   * Main entry point for the application that handles command line arguments and initiates the mining loop.
   * Parses command line arguments for character name and processing options.
   * @static
   * @async
   * @example
   * node copper-mining-loop.js [characterName] [processOption] [targetOre] [mineX] [mineY] [bankX] [bankY] [smithX] [smithY] [barsToSmelt]
   * node copper-mining-loop.js MyChar smelt 150 2 0 4 1 1 5 15
   * node copper-mining-loop.js MyOtherChar store 200 2 0 4 1
   * @returns {Promise<void>}
   * @throws {Error} If there's an error in the main process
   */
  static async main() {
  const args = process.argv.slice(2);
  const characterName = args[0] || process.env.control_character || config.character;

  // --- Parse options from command line arguments ---
  const options = {};
  const processOption = args[1] || 'store'; // Default to storing ore
  options.skipSmelting = processOption !== 'smelt';

  if (args[2]) options.targetCopperOre = parseInt(args[2], 10);
  if (args[3] && args[4]) options.mineCoords = { x: parseInt(args[3], 10), y: parseInt(args[4], 10) };
  if (args[5] && args[6]) options.bankCoords = { x: parseInt(args[5], 10), y: parseInt(args[6], 10) };
  if (args[7] && args[8]) options.smithCoords = { x: parseInt(args[7], 10), y: parseInt(args[8], 10) };
  if (args[9]) options.copperBarsToSmelt = parseInt(args[9], 10);

  // Create an instance with potentially overridden options
  const miningLoop = new CopperMiningLoop(characterName, options);

  try {
    console.log(`Starting copper mining automation for character ${characterName}`);
    console.log(`Processing option: ${processOption} (skipSmelting: ${miningLoop.skipSmelting})`);
    console.log('Using configuration:');
    console.log(`  - Target Copper Ore: ${miningLoop.targetCopperOre}`);
    console.log(`  - Mine Coords: (${miningLoop.mineCoords.x}, ${miningLoop.mineCoords.y})`);
    console.log(`  - Bank Coords: (${miningLoop.bankCoords.x}, ${miningLoop.bankCoords.y})`);
    if (!miningLoop.skipSmelting) {
      console.log(`  - Smith Coords: (${miningLoop.smithCoords.x}, ${miningLoop.smithCoords.y})`);
      console.log(`  - Bars to Smelt per Cycle: ${miningLoop.copperBarsToSmelt}`);
    }
    console.log('\nWill perform the following steps in a loop:');
    console.log(`1. Mine at (${miningLoop.mineCoords.x},${miningLoop.mineCoords.y}) until ${miningLoop.targetCopperOre} copper ore collected`);

    if (!miningLoop.skipSmelting) {
      console.log(`2. Smelt at (${miningLoop.smithCoords.x},${miningLoop.smithCoords.y}) into copper bars`);
      console.log(`3. Deposit all items at bank (${miningLoop.bankCoords.x},${miningLoop.bankCoords.y})`);
    } else {
      console.log(`2. Skip smelting and directly deposit all ore at bank (${miningLoop.bankCoords.x},${miningLoop.bankCoords.y})`);
    }
    console.log('Press Ctrl+C to stop the script at any time');
    await miningLoop.mainLoop();
  } catch (error) {
    console.error('Error in main process:', error.message);
  }
  }
}

// Execute the main function defined above
(async () => {
  try {
    await CopperMiningLoop.main();
  } catch (error) {
    console.error('Fatal error in CopperMiningLoop.main():', error);
    process.exit(1);
  }
})();
