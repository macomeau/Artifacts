const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const { handleCooldown, sleep } = require('./utils');
const config = require('./config');
require('dotenv').config();

class MapleHarvestingLoop extends BaseLoop {
  /**
   * Create a maple harvesting loop instance
   * @param {string} characterName - Name of character to perform actions with
   * @param {Object} [options={}] - Configuration options for the loop
   * @param {Object} [options.mapleForestCoords={ x: 1, y: 12 }] - Coordinates of the maple forest
   * @param {Object} [options.workshopCoords={ x: -2, y: -3 }] - Coordinates of the workshop
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates of the bank
   * @param {number} [options.targetMapleWood=100] - Target maple wood quantity to collect
   * @param {number} [options.maplePlanksToProcess=10] - Number of maple planks to process per loop (if processing)
   */
  constructor(characterName, options = {}) {
    super(characterName);

    const defaults = {
      mapleForestCoords: { x: 1, y: 12 },
      workshopCoords: { x: -2, y: -3 },
      bankCoords: { x: 4, y: 1 },
      targetMapleWood: 100,
      maplePlanksToProcess: 10,
    };

    /** @type {Object} Coordinates of maple forest */
    this.mapleForestCoords = options.mapleForestCoords || defaults.mapleForestCoords;
    /** @type {Object} Coordinates of workshop */
    this.workshopCoords = options.workshopCoords || defaults.workshopCoords;
    /** @type {Object} Coordinates of bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Target maple wood quantity to collect */
    this.targetMapleWood = options.targetMapleWood || defaults.targetMapleWood;
    /** @type {number} Number of maple planks to process per loop */
    this.maplePlanksToProcess = options.maplePlanksToProcess || defaults.maplePlanksToProcess;
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
    return currentMaple >= this.targetMapleWood; // Use configured target
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
        if (currentDetails.x === this.mapleForestCoords.x && currentDetails.y === this.mapleForestCoords.y) {
          console.log('Character is already at the maple forest. Continuing with harvesting...');
        } else {
          console.log(`Moving to maple forest at (${this.mapleForestCoords.x}, ${this.mapleForestCoords.y})`);
          try {
            // Explicitly check for cooldown before moving to avoid 499 errors
            const { handleCooldown } = require('./utils');
            await handleCooldown(this.characterName);
            
            await moveCharacter(this.mapleForestCoords.x, this.mapleForestCoords.y, this.characterName);
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
          
          // Add additional delay to avoid rate limiting (429 errors)
          console.log(`Adding extra delay to avoid rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between actions
          
          // Check inventory after each harvest
          const currentMaple = await this.getMapleWoodCount();
          const gatheredMaple = currentMaple - startingMaple;
          console.log(`Maple wood harvested this session: ${gatheredMaple}`);
          console.log(`Total maple wood: ${currentMaple}`);
          
          // Check if inventory is full
          await this.checkAndDeposit();
        }
        
        console.log(`Collected target of ${this.targetMapleWood} maple wood`); // Use configured target
        
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
          console.log(`Moving to workshop at (${this.workshopCoords.x}, ${this.workshopCoords.y})`);
          
          // Explicitly check for cooldown before moving to avoid 499 errors
          const { handleCooldown } = require('./utils');
          await handleCooldown(this.characterName);
          
          await moveCharacter(this.workshopCoords.x, this.workshopCoords.y, this.characterName);
          
          // Process maple wood into planks
          const currentMaple = await this.getMapleWoodCount();
          const planksToMake = Math.min(this.maplePlanksToProcess, Math.floor(currentMaple / 10)); // Use configured planks to process

          if (planksToMake > 0) {
            console.log(`Processing ${planksToMake} maple planks...`);
            await craftingAction('maple_plank', planksToMake, 'maple_wood', this.characterName); // Specify material
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
          console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
          
          // Explicitly check for cooldown before moving to avoid 499 errors
          const { handleCooldown } = require('./utils');
          await handleCooldown(this.characterName);
          
          await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
          
          // Deposit items
          console.log('Depositing all items...');
          await depositAllItems(this.characterName);
          console.log('Deposit complete');
          
        } catch (error) {
          console.error('Processing or deposit failed:', error.message);
          // Try to deposit items anyway in case of error
          try {
            console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
            
            // Explicitly check for cooldown before moving to avoid 499 errors
            await handleCooldown(this.characterName);
            
            await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
            await depositAllItems(this.characterName);
          } catch (depositError) {
            console.error('Deposit after error failed:', depositError.message);
          }
        }
        
      } catch (error) {
        console.error('Error in harvesting loop:', error.message);
        // Try to deposit items in case of error
        try {
          console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
            
          // Explicitly check for cooldown before moving to avoid 499 errors
          await handleCooldown(this.characterName);
            
          await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
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

    // --- Parse options from command line arguments ---
    const options = {};
    if (args[1]) options.targetMapleWood = parseInt(args[1], 10);
    if (args[2] && args[3]) options.mapleForestCoords = { x: parseInt(args[2], 10), y: parseInt(args[3], 10) };
    if (args[4] && args[5]) options.bankCoords = { x: parseInt(args[4], 10), y: parseInt(args[5], 10) };
    if (args[6] && args[7]) options.workshopCoords = { x: parseInt(args[6], 10), y: parseInt(args[7], 10) };
    if (args[8]) options.maplePlanksToProcess = parseInt(args[8], 10);

    // Create an instance with potentially overridden options
    const harvestingLoop = new MapleHarvestingLoop(characterName, options);

    try {
      console.log(`Starting maple harvesting automation for character ${characterName}`);
      console.log('Using configuration:');
      console.log(`  - Target Maple Wood: ${harvestingLoop.targetMapleWood}`);
      console.log(`  - Maple Forest Coords: (${harvestingLoop.mapleForestCoords.x}, ${harvestingLoop.mapleForestCoords.y})`);
      console.log(`  - Bank Coords: (${harvestingLoop.bankCoords.x}, ${harvestingLoop.bankCoords.y})`);
      console.log(`  - Workshop Coords: (${harvestingLoop.workshopCoords.x}, ${harvestingLoop.workshopCoords.y})`);
      console.log(`  - Planks to Process per Cycle: ${harvestingLoop.maplePlanksToProcess}`);
      console.log('\nWill perform the following steps in a loop:');
      console.log(`1. Harvest at (${harvestingLoop.mapleForestCoords.x},${harvestingLoop.mapleForestCoords.y}) until ${harvestingLoop.targetMapleWood} maple wood collected`);
      console.log(`2. Process at (${harvestingLoop.workshopCoords.x},${harvestingLoop.workshopCoords.y}) into maple planks`);
      console.log(`3. Deposit all items at bank (${harvestingLoop.bankCoords.x},${harvestingLoop.bankCoords.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
MapleHarvestingLoop.main();
