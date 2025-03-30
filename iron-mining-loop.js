const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

class IronMiningLoop extends BaseLoop {
  /**
   * Create an iron mining loop.
   * @param {string} characterName - The name of the character to perform actions with.
   * @param {Object} [options={}] - Configuration options for the loop.
   * @param {Object} [options.mineCoords={ x: 1, y: 7 }] - Coordinates for mining.
   * @param {Object} [options.smithCoords={ x: 1, y: 5 }] - Coordinates for the smithy.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   * @param {number} [options.targetIronOre=100] - Target ore quantity to collect.
   * @param {number} [options.ironBarsToSmelt=10] - Number of bars to smelt per cycle.
   * @param {boolean} [options.skipSmelting=false] - Whether to skip smelting.
   */
  constructor(characterName, options = {}) {
    super(characterName);

    const defaults = {
      mineCoords: { x: 1, y: 7 },
      smithCoords: { x: 1, y: 5 },
      bankCoords: { x: 4, y: 1 },
      targetIronOre: 100,
      ironBarsToSmelt: 10,
      skipSmelting: false,
    };

    /** @type {Object} Coordinates of the iron mine */
    this.mineCoords = options.mineCoords || defaults.mineCoords;
    /** @type {Object} Coordinates of the smith */
    this.smithCoords = options.smithCoords || defaults.smithCoords;
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Target amount of iron ore to mine before proceeding */
    this.targetIronOre = options.targetIronOre || defaults.targetIronOre;
    /** @type {number} Amount of iron bars to smelt in each cycle */
    this.ironBarsToSmelt = options.ironBarsToSmelt || defaults.ironBarsToSmelt;
    /** @type {boolean} Whether to skip the smelting step */
    this.skipSmelting = options.skipSmelting || defaults.skipSmelting;
  }

  async getIronOreCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const ironOreItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'iron_ore'
      );
      
      return ironOreItem ? (ironOreItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  async hasEnoughIronOre() {
    const currentIron = await this.getIronOreCount();
    return currentIron >= this.targetIronOre; // Use configured target
  }

  async mainLoop() {
  let loopCount = 0;
  
  while (true) {
    // Call the startLoop method to record coordinates properly
    await this.startLoop();
    
    loopCount++;
    console.log(`\nStarting mining loop #${loopCount}`);
    
    // Step 1: Mine iron until we have enough
    // Check for cooldown before moving
    console.log('Checking for cooldown before moving to iron mine...');
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
      
      // Check if already at iron mine
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.mineCoords.x && currentDetails.y === this.mineCoords.y) {
        console.log('Character is already at the iron mine. Continuing with mining...');
      } else {
        console.log(`Moving to iron mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
        try {
          await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the iron mine. Continuing with mining...');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to iron mine at (${this.mineCoords.x}, ${this.mineCoords.y})`);
      try {
        await moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName);
      } catch (error) {
        if (error.message.includes('Character already at destination')) {
          console.log('Character is already at the iron mine. Continuing with mining...');
        } else {
          throw error;
        }
      }
    }
    
    // Get starting iron count
    const startingIron = await this.getIronOreCount();
    console.log(`Starting iron mining. Current iron ore: ${startingIron}`);
    
    while (!await this.hasEnoughIronOre()) {
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
        const currentIron = await this.getIronOreCount();
        const gatheredIron = currentIron - startingIron;
        console.log(`Iron ore gathered this session: ${gatheredIron}`);
        console.log(`Total iron ore: ${currentIron}`);
        
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
    console.log(`Collected target of ${this.targetIronOre} iron ore`); // Use configured target
    
    // Check if smelting should be skipped
    if (this.skipSmelting) {
      console.log('Smelting step skipped due to skipSmelting flag');
    } else {
      // Step 2: Smelt iron into bars
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
    const currentOre = await this.getIronOreCount();
    const barsToMake = Math.min(this.ironBarsToSmelt, Math.floor(currentOre / 10)); // Assuming 10 ore per bar

    if (barsToMake <= 0) {
      console.log('Not enough iron ore to smelt any bars.');
    } else {
      console.log(`Smelting ${barsToMake} iron bars...`);
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
      
        // Perform smelting - convert iron_ore to iron
        await craftingAction('iron', barsToMake, 'iron_ore', this.characterName);
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
          const oreAfterCooldown = await this.getIronOreCount();
          const barsToRetry = Math.min(this.ironBarsToSmelt, Math.floor(oreAfterCooldown / 10));
          if (barsToRetry > 0) {
            const result = await craftingAction('iron', barsToRetry, 'iron_ore', this.characterName);
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

  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;

    // --- Parse options from command line arguments ---
    const options = {};
    const processOption = args[1] || 'store'; // Default to storing ore
    options.skipSmelting = processOption !== 'smelt';

    if (args[2]) options.targetIronOre = parseInt(args[2], 10);
    if (args[3] && args[4]) options.mineCoords = { x: parseInt(args[3], 10), y: parseInt(args[4], 10) };
    if (args[5] && args[6]) options.bankCoords = { x: parseInt(args[5], 10), y: parseInt(args[6], 10) };
    if (args[7] && args[8]) options.smithCoords = { x: parseInt(args[7], 10), y: parseInt(args[8], 10) };
    if (args[9]) options.ironBarsToSmelt = parseInt(args[9], 10);

    // Create an instance with potentially overridden options
    const miningLoop = new IronMiningLoop(characterName, options);

    try {
      console.log(`Starting iron mining automation for character ${characterName}`);
      console.log(`Processing option: ${processOption} (skipSmelting: ${miningLoop.skipSmelting})`);
      console.log('Using configuration:');
      console.log(`  - Target Iron Ore: ${miningLoop.targetIronOre}`);
      console.log(`  - Mine Coords: (${miningLoop.mineCoords.x}, ${miningLoop.mineCoords.y})`);
      console.log(`  - Bank Coords: (${miningLoop.bankCoords.x}, ${miningLoop.bankCoords.y})`);
      if (!miningLoop.skipSmelting) {
        console.log(`  - Smith Coords: (${miningLoop.smithCoords.x}, ${miningLoop.smithCoords.y})`);
        console.log(`  - Bars to Smelt per Cycle: ${miningLoop.ironBarsToSmelt}`);
      }
      console.log('\nWill perform the following steps in a loop:');
      console.log(`1. Mine at (${miningLoop.mineCoords.x},${miningLoop.mineCoords.y}) until ${miningLoop.targetIronOre} iron ore collected`);

      if (!miningLoop.skipSmelting) {
        console.log(`2. Smelt at (${miningLoop.smithCoords.x},${miningLoop.smithCoords.y}) into iron bars`);
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

// Execute the main function
IronMiningLoop.main();
