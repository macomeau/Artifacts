const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

class IronMiningLoop extends BaseLoop {
  constructor(characterName, skipSmelting = false) {
    super(characterName);
    this.IRON_MINE_COORDS = { x: 1, y: 7 };
    this.SMITH_COORDS = { x: 1, y: 5 };
    this.BANK_COORDS = { x: 4, y: 1 };
    this.TARGET_IRON_ORE = 100;
    this.IRON_BARS_TO_SMELT = 10;
    this.skipSmelting = skipSmelting;
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
    return currentIron >= this.TARGET_IRON_ORE;
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
      if (currentDetails.x === this.IRON_MINE_COORDS.x && currentDetails.y === this.IRON_MINE_COORDS.y) {
        console.log('Character is already at the iron mine. Continuing with mining...');
      } else {
        console.log(`Moving to iron mine at (${this.IRON_MINE_COORDS.x}, ${this.IRON_MINE_COORDS.y})`);
        try {
          await moveCharacter(this.IRON_MINE_COORDS.x, this.IRON_MINE_COORDS.y, this.characterName);
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
      console.log(`Moving to iron mine at (${this.IRON_MINE_COORDS.x}, ${this.IRON_MINE_COORDS.y})`);
      try {
        await moveCharacter(this.IRON_MINE_COORDS.x, this.IRON_MINE_COORDS.y, this.characterName);
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
    console.log(`Collected ${this.TARGET_IRON_ORE} iron ore`);
    
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
    
    console.log(`Smelting ${this.IRON_BARS_TO_SMELT} iron bars...`);
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
      await craftingAction('iron', this.IRON_BARS_TO_SMELT, 'iron_ore', this.characterName);
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
          const result = await craftingAction('iron', this.IRON_BARS_TO_SMELT, 'iron_ore', this.characterName);
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
    
    // Check for --skip-smelting flag in arguments
    const skipSmelting = args.includes('--skip-smelting');
    
    const miningLoop = new IronMiningLoop(characterName, skipSmelting);
    
    try {
      console.log(`Starting iron mining automation for character ${characterName}`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Mine at (${miningLoop.IRON_MINE_COORDS.x},${miningLoop.IRON_MINE_COORDS.y}) until ${miningLoop.TARGET_IRON_ORE} iron ore collected`);
      
      if (!skipSmelting) {
        console.log(`2. Smelt at (${miningLoop.SMITH_COORDS.x},${miningLoop.SMITH_COORDS.y}) into ${miningLoop.IRON_BARS_TO_SMELT} iron bars`);
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
IronMiningLoop.main();
