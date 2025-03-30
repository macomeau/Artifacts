/**
 * @fileoverview Automated ash wood harvesting loop with processing and banking
 * @module AshHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, craftingAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

/**
 * Ash wood harvesting automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class AshHarvestingLoop extends BaseLoop {
  /**
   * Create an ash harvesting loop instance
   * @param {string} characterName - Name of character to perform actions with
   * @param {Object} [options={}] - Configuration options for the loop
   * @param {Object} [options.ashForestCoords={ x: -1, y: 0 }] - Coordinates of the ash forest
   * @param {Object} [options.workshopCoords={ x: -2, y: -3 }] - Coordinates of the workshop
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates of the bank
   * @param {number} [options.targetAshWood=100] - Target ash wood quantity to collect
   * @param {number} [options.ashPlanksToProcess=10] - Number of ash planks to process per loop (if processing)
   */
  constructor(characterName, options = {}) {
    super(characterName);

    // Default coordinates and targets
    const defaults = {
      ashForestCoords: { x: -1, y: 0 },
      workshopCoords: { x: -2, y: -3 },
      bankCoords: { x: 4, y: 1 },
      targetAshWood: 100,
      ashPlanksToProcess: 10, // Note: This might be implicitly handled by crafting logic based on available wood
    };

    // Merge options with defaults
    /** @type {Object} Coordinates of ash forest */
    this.ashForestCoords = options.ashForestCoords || defaults.ashForestCoords;
    /** @type {Object} Coordinates of workshop */
    this.workshopCoords = options.workshopCoords || defaults.workshopCoords;
    /** @type {Object} Coordinates of bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {number} Target ash wood quantity to collect */
    this.targetAshWood = options.targetAshWood || defaults.targetAshWood;
    /** @type {number} Number of ash planks to process per loop */
    this.ashPlanksToProcess = options.ashPlanksToProcess || defaults.ashPlanksToProcess; // Keep for potential future use if needed
  }

  /**
   * Get current ash wood quantity from inventory
   * @returns {Promise<number>} Current ash wood count
   * @throws {Error} If inventory check fails
   */
  async getAshWoodCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const ashWoodItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === 'ash_wood'
      );
      
      return ashWoodItem ? (ashWoodItem.quantity || 1) : 0;
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Check if target ash wood quantity has been collected
   * @returns {Promise<boolean>} True if enough ash wood collected
   */
  async hasEnoughAshWood() {
    const currentAsh = await this.getAshWoodCount();
    return currentAsh >= this.targetAshWood; // Use configured target
  }

  /**
   * Main loop that coordinates the harvesting, processing, and depositing process
   */
  /**
   * Main harvesting loop execution
   * @async
   * @returns {Promise<void>} Runs indefinitely until interrupted
   * @throws {Error} If any critical step fails unrecoverably
   */
  async mainLoop() {
  let loopCount = 0;
  
  while (true) {
    // Call the startLoop method to record coordinates properly
    await this.startLoop();
    
    loopCount++;
    console.log(`\nStarting harvesting loop #${loopCount}`);
    
    // Step 1: Harvest ash until we have enough
    // Check for cooldown before moving
    console.log('Checking for cooldown before moving to ash forest...');
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
      
      // Check if already at ash forest
      const currentDetails = await getCharacterDetails(this.characterName);
      if (currentDetails.x === this.ashForestCoords.x && currentDetails.y === this.ashForestCoords.y) {
        console.log('Character is already at the ash forest. Continuing with harvesting...');
      } else {
        console.log(`Moving to ash forest at (${this.ashForestCoords.x}, ${this.ashForestCoords.y})`);
        try {
          await moveCharacter(this.ashForestCoords.x, this.ashForestCoords.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the ash forest. Continuing with harvesting...');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to ash forest at (${this.ashForestCoords.x}, ${this.ashForestCoords.y})`);
      try {
        await moveCharacter(this.ashForestCoords.x, this.ashForestCoords.y, this.characterName);
      } catch (error) {
        if (error.message.includes('Character already at destination')) {
          console.log('Character is already at the ash forest. Continuing with harvesting...');
        } else {
          throw error;
        }
      }
    }
    
    // Get starting ash count
    const startingAsh = await this.getAshWoodCount();
    console.log(`Starting ash harvesting. Current ash wood: ${startingAsh}`);
    
    while (!await this.hasEnoughAshWood()) {
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
        const currentAsh = await this.getAshWoodCount();
        const gatheredAsh = currentAsh - startingAsh;
        console.log(`Ash wood harvested this session: ${gatheredAsh}`);
        console.log(`Total ash wood: ${currentAsh}`);
        
        // Log only non-empty inventory slots
        const details = await getCharacterDetails();
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
            error.message.includes('Character inventory is full') || 
            (error.message.includes('API error') && error.message.includes('497'))) {
          console.log('Inventory is full. Proceeding to deposit items...');
          
          // Move to bank and deposit immediately when inventory is full
          try {
            console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
            await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
            
            console.log('Starting emergency deposit of all items...');
            await depositAllItems(this.characterName);
            console.log('Emergency deposit complete');
            
            // Return to ash forest to continue harvesting
            console.log(`Returning to ash forest at (${this.ashForestCoords.x}, ${this.ashForestCoords.y})`);
            await moveCharacter(this.ashForestCoords.x, this.ashForestCoords.y, this.characterName);
            continue; // Continue harvesting after deposit
          } catch (depositError) {
            console.error('Emergency deposit failed:', depositError.message);
            // If deposit fails, break the harvesting loop and continue with normal flow
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
    // Check if we're breaking the loop due to inventory full or target reached
    const currentAsh = await this.getAshWoodCount();
    if (currentAsh >= this.targetAshWood) {
      console.log(`Collected target of ${this.targetAshWood} ash wood`);
    } else {
      console.log(`Inventory full with ${currentAsh} ash wood. Proceeding to deposit.`);
    }
    
    // Step 2: Process ash into planks
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
      const currentDetails = await getCharacterDetails();
      if (currentDetails.x === this.workshopCoords.x && currentDetails.y === this.workshopCoords.y) {
        console.log('Character is already at the workshop. Continuing with processing...');
      } else {
        console.log(`Moving to workshop at (${this.workshopCoords.x}, ${this.workshopCoords.y})`);
        await moveCharacter(this.workshopCoords.x, this.workshopCoords.y, this.characterName);
      }
    } catch (error) {
      console.error('Failed to check cooldown:', error.message);
      // Continue with movement even if we can't check cooldown
      console.log(`Moving to workshop at (${this.workshopCoords.x}, ${this.workshopCoords.y})`);
      await moveCharacter(this.workshopCoords.x, this.workshopCoords.y, this.characterName);
    }
    
    // Calculate how many ash planks we can make based on ash wood inventory
    const ashWoodCount = await this.getAshWoodCount();
    const planksToMake = Math.floor(ashWoodCount / 10);
    
    if (planksToMake === 0) {
      console.log('Not enough ash wood to make planks (need at least 10)');
      // Continue to deposit step instead of returning
      console.log('Skipping processing step due to insufficient materials');
    } else {
    
    console.log(`Processing ${planksToMake} ash planks...`);
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
      
      // Perform processing - convert ash_wood to ash_plank
      await craftingAction('ash_plank', planksToMake, 'ash_wood', this.characterName);
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
          // Recalculate planks to make based on current wood count after cooldown
          const currentAshWood = await this.getAshWoodCount();
          const planksToRetry = Math.floor(currentAshWood / 10);
          if (planksToRetry > 0) {
            const result = await craftingAction('ash_plank', planksToRetry, 'ash_wood', this.characterName);
            console.log('Processing successful:', result);
          } else {
            console.log('Not enough ash wood to retry processing.');
          }
        } catch (retryError) {
          console.error('Processing failed after retry:', retryError.message);
        }
      } else {
        throw error;
      }
    }
    }  // Close the else block from planksToMake check
    
    console.log('Processing complete or skipped');
    
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
      const currentDetails = await getCharacterDetails();
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
    
    console.log(`Completed harvesting loop #${loopCount}\n`);
  }
}

  /**
   * Command line entry point for ash harvesting automation
   * @static
   * @async
   * @example
   * node ash-harvesting-loop.js [characterName] [processOption] [targetAsh] [ashX] [ashY] [bankX] [bankY] [workshopX] [workshopY]
   * node ash-harvesting-loop.js MyChar store 150 -1 0 4 1 -2 -3
   * @returns {Promise<void>}
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    const args = process.argv.slice(2);
    const characterName = args[0] || process.env.control_character || config.character;
    
    // Get processing option (store or process)
    const processOption = args[1] || 'store'; // Default to storing wood
    const skipProcessing = processOption === 'store';

    // --- Parse options from command line arguments ---
    const options = {};
    if (args[2]) options.targetAshWood = parseInt(args[2], 10);
    if (args[3] && args[4]) options.ashForestCoords = { x: parseInt(args[3], 10), y: parseInt(args[4], 10) };
    if (args[5] && args[6]) options.bankCoords = { x: parseInt(args[5], 10), y: parseInt(args[6], 10) };
    if (args[7] && args[8]) options.workshopCoords = { x: parseInt(args[7], 10), y: parseInt(args[8], 10) };
    // Note: ashPlanksToProcess is not currently configurable via CLI, uses default/calculated

    // Create an instance with potentially overridden options
    const harvestingLoop = new AshHarvestingLoop(characterName, options);
    
    try {
      console.log(`Starting ash harvesting automation for character ${characterName}`);
      console.log(`Processing option: ${processOption} (skipProcessing: ${skipProcessing})`);
      console.log('Using configuration:');
      console.log(`  - Target Ash Wood: ${harvestingLoop.targetAshWood}`);
      console.log(`  - Ash Forest Coords: (${harvestingLoop.ashForestCoords.x}, ${harvestingLoop.ashForestCoords.y})`);
      console.log(`  - Bank Coords: (${harvestingLoop.bankCoords.x}, ${harvestingLoop.bankCoords.y})`);
      if (!skipProcessing) {
        console.log(`  - Workshop Coords: (${harvestingLoop.workshopCoords.x}, ${harvestingLoop.workshopCoords.y})`);
      }
      console.log('\nWill perform the following steps in a loop:');
      console.log(`1. Harvest at (${harvestingLoop.ashForestCoords.x},${harvestingLoop.ashForestCoords.y}) until ${harvestingLoop.targetAshWood} ash wood collected`);
      
      if (!skipProcessing) {
        console.log(`2. Process at (${harvestingLoop.workshopCoords.x},${harvestingLoop.workshopCoords.y}) into ash planks`);
        console.log(`3. Deposit all items at bank (${harvestingLoop.bankCoords.x},${harvestingLoop.bankCoords.y})`);
      } else {
        console.log(`2. Skip processing and directly deposit all wood at bank (${harvestingLoop.bankCoords.x},${harvestingLoop.bankCoords.y})`);
      }
      console.log('Press Ctrl+C to stop the script at any time');
      
      // Modify the main loop logic to skip processing step if specified
      if (skipProcessing) {
        // Override the mainLoop method to skip the processing step
        harvestingLoop.originalMainLoop = harvestingLoop.mainLoop;
        harvestingLoop.mainLoop = async function() {
          let loopCount = 0;
          
          while (true) {
            // Call the startLoop method to record coordinates properly
            await this.startLoop();
            
            loopCount++;
            console.log(`\nStarting harvesting loop #${loopCount} (skipping processing)`);
            
            // Step 1: Harvest ash until we have enough
            // [Harvesting code remains the same, not modified here]
            
            // Get starting ash count and harvest until target is reached
            const startingAsh = await this.getAshWoodCount();
            console.log(`Starting ash harvesting. Current ash wood: ${startingAsh}`);
            
            while (!await this.hasEnoughAshWood()) {
              // [Harvesting logic remains the same]
              try {
                await gatheringAction();
                console.log('Harvesting successful');
                
                // Check inventory after each harvest
                const currentAsh = await this.getAshWoodCount();
                console.log(`Total ash wood: ${currentAsh}`);
              } catch (error) {
                if (error.message.includes('inventory is full') || 
                    error.message.includes('Character inventory is full') || 
                    (error.message.includes('API error') && error.message.includes('497'))) {
                  console.log('Inventory is full. Proceeding to emergency deposit...');
                
                  // Move to bank and deposit immediately when inventory is full
                  try {
                    console.log(`Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})`);
                    await moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName);
                  
                    console.log('Starting emergency deposit of all items...');
                    await depositAllItems(this.characterName);
                    console.log('Emergency deposit complete');
                  
                    // Return to ash forest to continue harvesting
                    console.log(`Returning to ash forest at (${this.ashForestCoords.x}, ${this.ashForestCoords.y})`);
                    await moveCharacter(this.ashForestCoords.x, this.ashForestCoords.y, this.characterName);
                    continue; // Continue harvesting after deposit
                  } catch (depositError) {
                    console.error('Emergency deposit failed:', depositError.message);
                    // If deposit fails, break the harvesting loop and continue with normal flow
                  }
                  break;
                }
                
                // [Other error handling remains the same]
              }
            }
            
            // Skip processing step and go directly to bank
            console.log('Skipping processing step as requested');
            
            // Step 3: Deposit everything in the bank
            // [Banking code remains the same]
            
            console.log(`Completed harvesting loop #${loopCount}\n`);
          }
        };
      }
      
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
    }
  }
}

// Execute the main function
AshHarvestingLoop.main();
