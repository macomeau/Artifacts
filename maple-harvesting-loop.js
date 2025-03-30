const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

class MapleHarvestingLoop extends BaseLoop {
  constructor(characterName) {
    super(characterName);
    this.MAPLE_FOREST_COORDS = { x: 1, y: 12 };  // Updated coordinates
    this.WORKSHOP_COORDS = { x: -2, y: -3 };
    this.BANK_COORDS = { x: 4, y: 1 };
    this.TARGET_MAPLE_WOOD = 100;
    this.MAPLE_PLANKS_TO_PROCESS = 10;
  }

  async getMapleWoodCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const mapleWoodItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'maple_wood'
      );
      
      return mapleWoodItem ? (mapleWoodItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  async hasEnoughMapleWood() {
    const currentMaple = await this.getMapleWoodCount();
    return currentMaple >= this.TARGET_MAPLE_WOOD;
  }

  async mainLoop() {
    let loopCount = 0;
    
    while (true) {
      // Call the startLoop method to record coordinates properly
      await this.startLoop();
      
      loopCount++;
      console.log(`\nStarting harvesting loop #${loopCount}`);
      
      // Step 1: Harvest maple until we have enough
      console.log('Checking for cooldown before moving to maple forest...');
      
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
        
        // Check if already at maple forest
        const currentDetails = await getCharacterDetails(this.characterName);
        if (currentDetails.x === this.MAPLE_FOREST_COORDS.x && currentDetails.y === this.MAPLE_FOREST_COORDS.y) {
          console.log('Character is already at the maple forest. Continuing with harvesting...');
        } else {
          console.log(`Moving to maple forest at (${this.MAPLE_FOREST_COORDS.x}, ${this.MAPLE_FOREST_COORDS.y})`);
          try {
            await moveCharacter(this.MAPLE_FOREST_COORDS.x, this.MAPLE_FOREST_COORDS.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the maple forest. Continuing with harvesting...');
            } else {
              throw error;
            }
          }
        }
        
        // Get starting maple count
        const startingMaple = await this.getMapleWoodCount();
        console.log(`Starting maple harvesting. Current maple wood: ${startingMaple}`);
        
        while (!await this.hasEnoughMapleWood()) {
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
          console.log('Harvesting successful');
          
          // Check inventory after each harvest
          const currentMaple = await this.getMapleWoodCount();
          const gatheredMaple = currentMaple - startingMaple;
          console.log(`Maple wood harvested this session: ${gatheredMaple}`);
          console.log(`Total maple wood: ${currentMaple}`);
          
          // Check if inventory is full
          await this.checkAndDeposit();
        }
        
        console.log(`Collected ${this.TARGET_MAPLE_WOOD} maple wood`);
        
        // Step 2: Process maple into planks
        console.log('Checking for cooldown before moving to workshop...');
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
          
          // Move to workshop
          console.log(`Moving to workshop at (${this.WORKSHOP_COORDS.x}, ${this.WORKSHOP_COORDS.y})`);
          await moveCharacter(this.WORKSHOP_COORDS.x, this.WORKSHOP_COORDS.y, this.characterName);
          
          // Process maple wood into planks
          const planksToMake = Math.min(this.MAPLE_PLANKS_TO_PROCESS, Math.floor(await this.getMapleWoodCount() / 10));
          
          if (planksToMake > 0) {
            console.log(`Processing ${planksToMake} maple planks...`);
            await craftingAction('maple_plank', planksToMake, this.characterName);
            console.log('Processing successful');
          } else {
            console.log('Not enough maple wood to make planks');
          }
          
          // Step 3: Deposit everything in the bank
          console.log('Checking for cooldown before moving to bank...');
          const bankDetails = await getCharacterDetails(this.characterName);
          
          if (bankDetails.cooldown && bankDetails.cooldown > 0) {
            const now = new Date();
            const expirationDate = new Date(bankDetails.cooldown_expiration);
            const cooldownSeconds = Math.max(0, (expirationDate - now) / 1000);
            
            if (cooldownSeconds > 0) {
              console.log(`Character is in cooldown. Waiting ${cooldownSeconds.toFixed(1)} seconds...`);
              await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500));
            }
          }
          
          // Move to bank
          console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
          await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
          
          // Deposit items
          console.log('Depositing all items...');
          await depositAllItems(this.characterName);
          console.log('Deposit complete');
          
        } catch (error) {
          console.error('Processing or deposit failed:', error.message);
          // Try to deposit items anyway in case of error
          try {
            console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
            await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
            await depositAllItems(this.characterName);
          } catch (depositError) {
            console.error('Deposit after error failed:', depositError.message);
          }
        }
        
      } catch (error) {
        console.error('Error in harvesting loop:', error.message);
        // Try to deposit items in case of error
        try {
          console.log(`Moving to bank at (${this.BANK_COORDS.x}, ${this.BANK_COORDS.y})`);
          await moveCharacter(this.BANK_COORDS.x, this.BANK_COORDS.y, this.characterName);
          await depositAllItems(this.characterName);
        } catch (depositError) {
          console.error('Deposit after error failed:', depositError.message);
        }
      }
    }
  }

  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    const harvestingLoop = new MapleHarvestingLoop(characterName);
    
    try {
      console.log(`Starting maple harvesting automation for character ${characterName}`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Harvest at (${harvestingLoop.MAPLE_FOREST_COORDS.x},${harvestingLoop.MAPLE_FOREST_COORDS.y}) until ${harvestingLoop.TARGET_MAPLE_WOOD} maple wood collected`);
      console.log(`2. Process at (${harvestingLoop.WORKSHOP_COORDS.x},${harvestingLoop.WORKSHOP_COORDS.y}) into ${harvestingLoop.MAPLE_PLANKS_TO_PROCESS} maple planks`);
      console.log(`3. Deposit all items at bank (${harvestingLoop.BANK_COORDS.x},${harvestingLoop.BANK_COORDS.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
MapleHarvestingLoop.main();
