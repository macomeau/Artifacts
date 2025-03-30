const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
const db = require('./db');
require('dotenv').config();

class SpruceHarvestingLoop extends BaseLoop {
  constructor(characterName) {
    super(characterName);
    this.SPRUCE_FOREST_COORDS = { x: 2, y: 6 };
    this.WORKSHOP_COORDS = { x: -2, y: -3 };
    this.BANK_COORDS = { x: 4, y: 1 };
    this.TARGET_SPRUCE_WOOD = 100;
    this.SPRUCE_PLANKS_TO_PROCESS = 10;
  }

  /**
   * Get current spruce wood count from inventory
   */
  async getSpruceWoodCount() {
  try {
    const details = await getCharacterDetails(this.characterName);
    if (!details.inventory) return 0;
    
    // Find the spruce wood item in inventory (case insensitive)
    const spruceWoodItem = details.inventory.find(item => 
      item && item.code.toLowerCase() === 'spruce_wood'
    );
    
    // Return the quantity if found, otherwise 0
    return spruceWoodItem ? (spruceWoodItem.quantity || 1) : 0;
  } catch (error) {
    console.error('Failed to check inventory:', error.message);
    return 0;
  }
}

  /**
   * Check if we have enough spruce wood in inventory
   */
  async hasEnoughSpruceWood() {
    const currentSpruce = await this.getSpruceWoodCount();
    return currentSpruce >= this.TARGET_SPRUCE_WOOD;
  }

  /**
   * Check if character's inventory is full
   */
  async isInventoryFull() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory || !details.inventory_max_items) return false;
      
      // Calculate total items in inventory
      const totalItems = details.inventory.reduce((sum, slot) => 
        sum + (slot?.quantity || 0), 0);
      
      return totalItems >= details.inventory_max_items;
    } catch (error) {
      console.error('Failed to check if inventory is full:', error.message);
      return false;
    }
  }

  /**
   * Main loop that coordinates the harvesting, processing, and depositing process
   */
  async mainLoop() {
  let loopCount = 0;
  
  while (true) {
    // Call the startLoop method to record coordinates properly
    await this.startLoop();
    
    loopCount++;
    console.log(`\nStarting harvesting loop #${loopCount}`);
    
    // Step 1: Harvest spruce until we have enough
    // Check for cooldown before moving
    console.log('Checking for cooldown before moving to spruce forest...');
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
      
      // Check if already at spruce forest
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.SPRUCE_FOREST_COORDS.x && currentDetails.y === this.SPRUCE_FOREST_COORDS.y) {
        console.log('Character is already at the spruce forest. Continuing with harvesting...');
      } else {
        console.log(`Moving to spruce forest at (${this.SPRUCE_FOREST_COORDS.x}, ${this.SPRUCE_FOREST_COORDS.y})`);
        try {
          await moveCharacter(this.SPRUCE_FOREST_COORDS.x, this.SPRUCE_FOREST_COORDS.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the spruce forest. Continuing with harvesting...');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to spruce forest at (${this.SPRUCE_FOREST_COORDS.x}, ${this.SPRUCE_FOREST_COORDS.y})`);
      try {
        await moveCharacter(this.SPRUCE_FOREST_COORDS.x, this.SPRUCE_FOREST_COORDS.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the spruce forest. Continuing with harvesting...');
          } else {
            throw error;
          }
        }
      }
    
    // Get starting spruce count
    const startingSpruce = await this.getSpruceWoodCount();
    console.log(`Starting spruce harvesting. Current spruce wood: ${startingSpruce}`);
    
    while (!await this.hasEnoughSpruceWood()) {
      // Check if inventory is full before attempting to harvest
      if (await this.isInventoryFull()) {
        console.log('Inventory is full. Going to deposit items...');
        
        // Go to bank and deposit items
        try {
          // Move to bank
          console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
          await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
          
          // Deposit items
          console.log('Depositing all items...');
          await depositAllItems(this.characterName);
          
          // Return to spruce forest
          console.log(`Returning to spruce forest at (${this.SPRUCE_FOREST_COORDS.x}, ${this.SPRUCE_FOREST_COORDS.y})`);
          await moveCharacter(this.SPRUCE_FOREST_COORDS.x, this.SPRUCE_FOREST_COORDS.y, this.characterName);
          
          console.log('Continuing harvesting after deposit...');
          continue;
        } catch (depositError) {
          console.error('Error during deposit process:', depositError.message);
        }
      }
      
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
        console.log('Harvesting successful');
        
        // Check inventory after each harvest
        const currentSpruce = await this.getSpruceWoodCount();
        const gatheredSpruce = currentSpruce - startingSpruce;
        console.log(`Spruce wood harvested this session: ${gatheredSpruce}`);
        console.log(`Total spruce wood: ${currentSpruce}`);
        
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
        console.error('Harvesting failed:', error.message);
        
        // Handle specific errors
        if (error.message.includes('inventory is full') || 
            (error.message.includes('API error') && error.message.includes('Character inventory is full'))) {
          console.log('Inventory is full. Going to deposit items...');
          
          // Go to bank and deposit items
          try {
            // Move to bank
            console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
            await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
            
            // Deposit items
            console.log('Depositing all items...');
            await depositAllItems(this.characterName);
            
            // Return to spruce forest
            console.log(`Returning to spruce forest at (${this.SPRUCE_FOREST_COORDS.x}, ${this.SPRUCE_FOREST_COORDS.y})`);
            await moveCharacter(this.SPRUCE_FOREST_COORDS.x, this.SPRUCE_FOREST_COORDS.y, this.characterName);
            
            console.log('Continuing harvesting after deposit...');
            continue;
          } catch (depositError) {
            console.error('Error during deposit process:', depositError.message);
          }
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
    console.log(`Collected ${this.TARGET_SPRUCE_WOOD} spruce wood`);
    
    // Step 2: Process spruce into planks
    // Check for cooldown before moving to workshop
    console.log('Checking for cooldown before moving to workshop...');
    try {
      const freshDetails = await getCharacterDetails();
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add 500ms buffer
        }
      }
      
      // Check if already at workshop
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.WORKSHOP_COORDS.x && currentDetails.y === this.WORKSHOP_COORDS.y) {
        console.log('Character is already at the workshop. Continuing with processing...');
      } else {
        console.log(`Moving to workshop at (${this.WORKSHOP_COORDS.x}, ${this.WORKSHOP_COORDS.y})`);
        await moveCharacter(this.WORKSHOP_COORDS.x, this.WORKSHOP_COORDS.y, this.characterName);
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to workshop at (${this.WORKSHOP_COORDS.x}, ${this.WORKSHOP_COORDS.y})`);
      await moveCharacter(this.WORKSHOP_COORDS.x, this.WORKSHOP_COORDS.y, this.characterName);
    }
    
    // Calculate how many spruce planks we can make based on spruce wood inventory
    const spruceWoodCount = await this.getSpruceWoodCount();
    const planksToMake = Math.floor(spruceWoodCount / 10);
    
    if (planksToMake === 0) {
      console.log('Not enough spruce wood to make planks (need at least 10)');
      return;
    }
    
    console.log(`Processing ${planksToMake} spruce planks...`);
    try {
      // Check for cooldown before processing
      console.log('Checking for cooldown before processing...');
      const freshDetails = await getCharacterDetails();
      
      if (freshDetails.cooldown && freshDetails.cooldown > 0) {
        const now = new Date();
        const expirationDate = new Date(freshDetails.cooldown_expiration);
        const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
        
        if (cooldownSeconds > 0) {
          console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
        }
      }
      
      // Perform processing - convert spruce_wood to spruce_plank
      await craftingAction('spruce_plank', planksToMake, 'spruce_wood', this.characterName);
      console.log('Processing successful');
    } catch (error) {
      console.error('Processing failed:', error.message);
      
      // Handle cooldown errors for processing
      const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
      if (cooldownMatch) {
        const cooldownSeconds = parseFloat(cooldownMatch[1]);
        console.log(`Processing action in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
        
        // Wait for the cooldown
        await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
        
        // Try again after cooldown
        console.log('Retrying processing after cooldown...');
        try {
          const result = await craftingAction('spruce_plank', this.SPRUCE_PLANKS_TO_PROCESS, 'spruce_wood', this.characterName);
          console.log('Processing successful:', result);
        } catch (retryError) {
          console.error('Processing failed after retry:', retryError.message);
        }
      } else {
        throw error;
      }
    }
    console.log('Processing complete');
    
    // Step 3: Deposit everything in the bank
    // Check for cooldown before moving to bank
    console.log('Checking for cooldown before moving to bank...');
    try {
      const freshDetails = await getCharacterDetails();
      
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
      const freshDetails = await getCharacterDetails();
      
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
            await depositAllItems();
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
    
    console.log(`Completed harvesting loop #${loopCount}\n`);
  }
}

  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    const harvestingLoop = new SpruceHarvestingLoop(characterName);
    
    try {
      console.log(`Starting spruce harvesting automation for character ${characterName}`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Harvest at (${harvestingLoop.SPRUCE_FOREST_COORDS.x},${harvestingLoop.SPRUCE_FOREST_COORDS.y}) until ${harvestingLoop.TARGET_SPRUCE_WOOD} spruce wood collected`);
      console.log(`2. Process at (${harvestingLoop.WORKSHOP_COORDS.x},${harvestingLoop.WORKSHOP_COORDS.y}) into ${harvestingLoop.SPRUCE_PLANKS_TO_PROCESS} spruce planks`);
      console.log(`3. Deposit all items at bank (${harvestingLoop.BANK_COORDS.x},${harvestingLoop.BANK_COORDS.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
SpruceHarvestingLoop.main();
