/**
 * @fileoverview Automated strange wood harvesting loop that collects wood at dynamic coordinates
 * @module StrangeWoodHarvestingLoop
 */

const BaseLoop = require('./base-loop');
const { getCharacterDetails, gatheringAction, moveCharacter } = require('./api');
const { depositAllItems } = require('./go-deposit-all');
const config = require('./config');
require('dotenv').config();

/**
 * Strange wood harvesting automation loop extending BaseLoop
 * @class
 * @extends BaseLoop
 */
class StrangeWoodHarvestingLoop extends BaseLoop {
  /**
   * Create a strange wood harvesting loop instance
   * @param {string} characterName - Name of character to perform actions with
   * @param {number} woodX - X coordinate of the strange wood location
   * @param {number} woodY - Y coordinate of the strange wood location
   */
  constructor(characterName, woodX, woodY) {
    super(characterName);
    /** @type {Object} Coordinates of strange wood location */
    this.STRANGE_WOOD_COORDS = { x: parseInt(woodX), y: parseInt(woodY) };
    /** @type {Object} Coordinates of bank */
    this.BANK_COORDS = { x: 4, y: 1 };
    /** @type {number} Target wood quantity to collect before depositing */
    this.TARGET_WOOD = 100; // Target quantity for wood
    /** @type {string} Item code for the wood being harvested */
    this.WOOD_ITEM_CODE = 'strange_wood'; // Assuming this is the item code
  }

  /**
   * Get current strange wood quantity from character inventory
   * @returns {Promise<number>} Current strange wood count
   * @throws {Error} If inventory check fails
   */
  async getWoodCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details.inventory) return 0;
      
      const woodItem = details.inventory.find(item => 
        item && item.code.toLowerCase() === this.WOOD_ITEM_CODE
      );
      
      return woodItem ? (woodItem.quantity || 0) : 0; // Use quantity, default to 0
    } catch (error) {
      console.error('Failed to check inventory:', error.message);
      return 0;
    }
  }

  /**
   * Check if target wood quantity has been collected
   * @returns {Promise<boolean>} True if enough wood collected
   */
  async hasEnoughWood() {
    const currentWood = await this.getWoodCount();
    return currentWood >= this.TARGET_WOOD;
  }

  /**
   * Main harvesting loop execution
   * @async
   * @returns {Promise<void>} Runs indefinitely until interrupted
   */
  async mainLoop() {
    let loopCount = 0;
    
    while (true) {
      // Call the startLoop method to record coordinates properly
      await this.startLoop();
      
      loopCount++;
      console.log(`\nStarting harvesting loop #${loopCount}`);
      
      // Step 1: Harvest strange wood until we have enough
      // Check for cooldown before moving
      console.log('Checking for cooldown before moving to strange wood location...');
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
        
        // Check if already at the wood location
        const currentDetails = await getCharacterDetails(this.characterName);
        if (currentDetails.x === this.STRANGE_WOOD_COORDS.x && currentDetails.y === this.STRANGE_WOOD_COORDS.y) {
          console.log('Character is already at the strange wood location. Continuing with harvesting...');
        } else {
          console.log(`Moving to strange wood location at (${this.STRANGE_WOOD_COORDS.x}, ${this.STRANGE_WOOD_COORDS.y})`);
          try {
            await moveCharacter(this.STRANGE_WOOD_COORDS.x, this.STRANGE_WOOD_COORDS.y, this.characterName);
          } catch (error) {
            if (error.message.includes('Character already at destination')) {
              console.log('Character is already at the strange wood location. Continuing with harvesting...');
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Failed to check cooldown:', error.message);
        // Continue with movement even if we can't check cooldown
        console.log(`Moving to strange wood location at (${this.STRANGE_WOOD_COORDS.x}, ${this.STRANGE_WOOD_COORDS.y})`);
        try {
          await moveCharacter(this.STRANGE_WOOD_COORDS.x, this.STRANGE_WOOD_COORDS.y, this.characterName);
        } catch (error) {
          if (error.message.includes('Character already at destination')) {
            console.log('Character is already at the strange wood location. Continuing with harvesting...');
          } else {
            throw error;
          }
        }
      }
      
      // Get starting wood count
      let startingWood = await this.getWoodCount();
      console.log(`Starting strange wood harvesting. Current ${this.WOOD_ITEM_CODE}: ${startingWood}`);
      
      while (!await this.hasEnoughWood()) {
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
          console.log('Harvesting successful');
          
          // Check inventory after each gather
          const currentWood = await this.getWoodCount();
          const gatheredWood = currentWood - startingWood; // Track wood gathered in this sub-loop
          console.log(`${this.WOOD_ITEM_CODE} gathered this session: ${gatheredWood}`);
          console.log(`Total ${this.WOOD_ITEM_CODE}: ${currentWood}`);
          
          // Log only non-empty inventory slots
          const details = await getCharacterDetails(this.characterName);
          if (details.inventory) {
            const items = details.inventory
              .filter(item => item && item.code)
              .map(item => `${item.code} x${item.quantity || 1}`);
            
            if (items.length > 0) {
              console.log('Inventory:', items.join(', '));
            }

            // Check if inventory is full
            const totalItems = details.inventory.reduce((sum, slot) => sum + (slot?.quantity || 0), 0);
            if (totalItems >= details.inventory_max_items) {
                console.log('Inventory is full. Proceeding to deposit...');
                break; // Exit the inner harvesting loop to deposit
            }
          }
          
        } catch (error) {
          console.error('Harvesting failed:', error.message);
          
          // Handle specific errors
          if (error.message.includes('inventory is full')) {
            console.log('Stopping harvesting: Inventory is full.');
            break; // Exit the inner harvesting loop
          }
          
          if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
            console.log('Stopping harvesting: No resources available at this location.');
            // Consider adding a delay or stopping the loop entirely if resources are gone
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before next attempt
            continue; // Try again in the next outer loop iteration
          }
          
          // Handle cooldown errors
          const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
          if (cooldownMatch) {
            const cooldownSeconds = parseFloat(cooldownMatch[1]);
            console.log(`Waiting for cooldown: ${cooldownSeconds.toFixed(1)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, cooldownSeconds * 1000 + 500)); // Add buffer
            continue; // Retry gathering in the inner loop
          }
          
          // For other errors, maybe add a delay and continue
          console.log('Waiting 5 seconds before retrying after error...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      console.log(`Collected target quantity (${this.TARGET_WOOD}) or inventory is full.`);
      
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
   * Command line entry point for strange wood harvesting automation
   * @static
   * @async
   * @returns {Promise<void>} 
   * @throws {Error} If fatal error occurs in main process
   */
  static async main() {
    // Get command line arguments
    // Get command line arguments [characterName, "(x,y)"]
    const args = process.argv.slice(2);
    
    // Get character name from first argument or fallback
    const characterName = args[0] || process.env.control_character || config.character;
    
    // Extract coordinates (second argument) if provided in format (x,y) or x,y
    let woodX = 0;
    let woodY = 0;
    
    if (args.length > 1) {
      // Parse coordinates from second argument
      const coordMatch = args[1].match(/\(?(-?\d+)\s*,\s*(-?\d+)\)?/);
      if (coordMatch) {
        woodX = parseInt(coordMatch[1]);
        woodY = parseInt(coordMatch[2]);
      } else {
        console.error(`Error: Invalid coordinates format "${args[1]}". Must be provided in format "(X,Y)" or "X,Y" as the second argument.`);
        process.exit(1);
      }
    } else {
        console.error('Error: Coordinates must be provided in format "(X,Y)" or "X,Y" as the second argument.');
        process.exit(1);
    }
    
    // Create harvesting loop instance with coordinates and character
    const harvestingLoop = new StrangeWoodHarvestingLoop(characterName, woodX, woodY);
    
    try {
      console.log(`Starting strange wood harvesting automation for character ${characterName}`);
      console.log('Will perform the following steps in a loop:');
      console.log(`1. Harvest at (${harvestingLoop.STRANGE_WOOD_COORDS.x},${harvestingLoop.STRANGE_WOOD_COORDS.y}) until ${harvestingLoop.TARGET_WOOD} ${harvestingLoop.WOOD_ITEM_CODE} collected or inventory full`);
      console.log(`2. Deposit all items at bank (${harvestingLoop.BANK_COORDS.x},${harvestingLoop.BANK_COORDS.y})`);
      console.log('Press Ctrl+C to stop the script at any time');
      
      await harvestingLoop.mainLoop();
    } catch (error) {
      console.error('Error in main process:', error.message);
      process.exit(1); // Exit with error code
    }
  }
}

// Execute the main function if run directly
if (require.main === module) {
    StrangeWoodHarvestingLoop.main();
}

module.exports = StrangeWoodHarvestingLoop;
