/**
 * @fileoverview Automation loop for mining mithril rocks and optionally refining them.
 * @module mithril-mining-loop
 */

// Load environment variables first
require('./env-loader').loadEnv();

const { getCharacterDetails, miningAction, smeltingAction, moveCharacter } = require('./api');
const BaseLoop = require('./base-loop');
const { sleep, handleCooldown, extractCooldownTime } = require('./utils');
const db = require('./db'); // Assuming db is used for logging as in BaseLoop
const config = require('./config'); // Load config after env vars

// Constants for coordinates and item codes - ADJUST THESE AS NEEDED
const MITHRIL_COORDS = { x: -2, y: 13 };
const BANK_COORDS = { x: 4, y: 1 }; // Standard bank location used in other scripts
const REFINERY_COORDS = { x: -2, y: -3 }; // Standard sawmill/refinery location used in other scripts
const MITHRIL_ORE_CODE = 'mithril_ore'; // MAKE SURE THIS IS THE CORRECT ITEM CODE
const MITHRIL_BAR_CODE = 'mithril_bar'; // MAKE SURE THIS IS THE CORRECT ITEM CODE
const ORE_PER_BAR = 5; // Example: Amount of ore needed per bar - ADJUST IF NEEDED

/**
 * Represents the mithril mining automation loop.
 * @class
 * @extends BaseLoop
 */
class MithrilMiningLoop extends BaseLoop {
  /**
   * Create a mithril mining loop instance.
   * @param {string} characterName - Name of the character to perform actions with.
   * @param {Object} options - Configuration options.
   * @param {boolean} [options.refineOre=false] - Whether to refine ore into bars.
   * @param {number} [options.targetOre=0] - Target quantity of ore to collect before banking/refining. 0 means run until inventory full.
   * @param {Object} [options.mineCoords={ x: -2, y: 13 }] - Coordinates for mining.
   * @param {Object} [options.bankCoords={ x: 4, y: 1 }] - Coordinates for the bank.
   * @param {Object} [options.refineryCoords={ x: -2, y: -3 }] - Coordinates for the refinery.
   */
  constructor(characterName, options = {}) {
    super(characterName);

    const defaults = {
      refineOre: false,
      targetOre: 0,
      mineCoords: { x: -2, y: 13 },
      bankCoords: { x: 4, y: 1 },
      refineryCoords: { x: -2, y: -3 },
    };

    /** @type {boolean} Whether to refine the ore */
    this.refineOre = options.refineOre || defaults.refineOre;
    /** @type {number} Target amount of ore before banking/refining (0 for inventory full) */
    this.targetOre = options.targetOre || defaults.targetOre;
    /** @type {Object} Coordinates of the mithril mine */
    this.mineCoords = options.mineCoords || defaults.mineCoords;
    /** @type {Object} Coordinates of the bank */
    this.bankCoords = options.bankCoords || defaults.bankCoords;
    /** @type {Object} Coordinates of the refinery */
    this.refineryCoords = options.refineryCoords || defaults.refineryCoords;
    /** @type {number} Amount of ore currently held (approximate, updated periodically) */
    this.currentOreCount = 0;

    console.log(`[${this.characterName}] Initialized Mithril Mining Loop.`);
    console.log(`  - Target Coordinates: (${this.mineCoords.x}, ${this.mineCoords.y})`);
    console.log(`  - Refine Ore: ${this.refineOre}`);
    console.log(`  - Target Ore per trip: ${this.targetOre === 0 ? 'Inventory Full' : this.targetOre}`);
  }

  /**
   * Checks the character's inventory for mithril ore.
   * @returns {Promise<number>} The quantity of mithril ore found.
   */
  async checkMithrilOreCount() {
    try {
      const details = await getCharacterDetails(this.characterName);
      if (!details || !details.inventory) return 0;
      const oreItem = details.inventory.find(item => item && item.code === MITHRIL_ORE_CODE);
      return oreItem ? oreItem.quantity : 0;
    } catch (error) {
      console.error(`[${this.characterName}] Error checking inventory:`, error.message);
      // Avoid throwing here, return 0 and let the loop handle potential issues
      return 0;
    }
  }

  /**
   * The main execution loop for mining mithril.
   * @returns {Promise<void>}
   */
  async run() {
    console.log(`[${this.characterName}] Starting mithril mining loop...`);
    // Initialize BaseLoop, including moving to start coords if necessary
    await this.initialize(this.mineCoords); // Use configured mine coords

    while (true) {
      // Call startLoop from BaseLoop to log loop start and coordinates
      await this.startLoop(); // Increments loopCount and logs

      console.log(`\n[${this.characterName}] Starting loop #${this.loopCount}`);

      try {
        // 1. Mine until inventory is full or target reached
        await this.mineMithril();

        // 2. Process the ore (refine or deposit)
        if (this.refineOre) {
          await this.refineAndDeposit();
        } else {
          // Use the overridden depositItems which includes moving to the bank
          await this.depositItems();
        }

        // Optional: Add a small delay between full cycles
        console.log(`[${this.characterName}] Cycle complete. Waiting before next cycle...`);
        await sleep(5000);

      } catch (error) {
        console.error(`[${this.characterName}] Error in main loop #${this.loopCount}:`, error.message);

        // Check if it's an inventory full error that wasn't caught during mining
        if (error.message.includes('inventory is full')) {
          console.log(`[${this.characterName}] Inventory full detected in main loop, proceeding to deposit/refine.`);
          try {
            if (this.refineOre) {
              await this.refineAndDeposit();
            } else {
              await this.depositItems();
            }
          } catch (depositError) {
            console.error(`[${this.characterName}] Error during forced deposit/refine:`, depositError.message);
            await sleep(30000); // Wait longer after deposit error
          }
        } else if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
          console.log(`[${this.characterName}] Resource depleted or not found. Waiting 60 seconds before retry...`);
          await sleep(60000);
        } else {
          // Handle potential cooldowns from other errors
          const cooldown = extractCooldownTime(error);
          if (cooldown > 0) {
            console.log(`[${this.characterName}] Handling cooldown of ${cooldown}s from error.`);
            await handleCooldown(cooldown);
          } else {
            console.log(`[${this.characterName}] Unknown error occurred. Waiting 15 seconds before retry...`);
            await sleep(15000); // Generic error wait
          }
        }
      }
    }
  }

  /**
   * Mines mithril ore at the designated coordinates until inventory is full or target is met.
   * @returns {Promise<void>}
   */
  async mineMithril() {
    console.log(`[${this.characterName}] Ensuring character is at mithril rocks (${this.mineCoords.x}, ${this.mineCoords.y})...`);
    await this.handleAction(() => moveCharacter(this.mineCoords.x, this.mineCoords.y, this.characterName), 'Moving');
    console.log(`[${this.characterName}] Arrived at mithril rocks. Starting mining.`);

    // Get initial ore count and inventory status
    let details = await getCharacterDetails(this.characterName);
    this.currentOreCount = this.findItemCount(details.inventory, MITHRIL_ORE_CODE);
    let inventoryFull = this.isInventoryFull(details);

    console.log(`[${this.characterName}] Initial ore count: ${this.currentOreCount}. Inventory full: ${inventoryFull}`);

    // Loop condition: continue if inventory is not full AND (target is 0 OR current count < target)
    while (!inventoryFull && (this.targetOre === 0 || this.currentOreCount < this.targetOre)) {
      try {
        // Use handleAction from BaseLoop for cooldown management and logging
        const result = await this.handleAction(
          () => miningAction(this.characterName),
          'Mining' // Action name for logging
        );

        // Update state based on the result from handleAction/miningAction
        details = result.character || await getCharacterDetails(this.characterName); // Use result if available
        this.currentOreCount = this.findItemCount(details.inventory, MITHRIL_ORE_CODE);
        inventoryFull = this.isInventoryFull(details);

        console.log(`[${this.characterName}] Mining successful. Ore: ${this.currentOreCount}. Inv Full: ${inventoryFull}. Target: ${this.targetOre === 0 ? 'Full' : this.targetOre}`);

        // Check inventory capacity via BaseLoop's checkAndDeposit (logs snapshot, doesn't deposit yet)
        await this.checkAndDeposit(); // Logs snapshot, maybe warns if near full

      } catch (error) {
        console.error(`[${this.characterName}] Error during mining action:`, error.message);

        // Check specific errors
        if (error.message.includes('inventory is full')) {
          console.log(`[${this.characterName}] Inventory full detected by API. Stopping mining.`);
          inventoryFull = true; // Ensure loop condition breaks
          break; // Exit mining loop immediately
        } else if (error.message.includes('No resource') || error.message.includes('Resource not found')) {
           console.log(`[${this.characterName}] Resource depleted. Stopping mining for this cycle.`);
           break; // Exit mining loop for this cycle
        }

        // If it's a cooldown error, handleAction in BaseLoop should have waited.
        // If it's another error, re-throw to be handled by the main run loop.
        // We might want more specific handling here later.
        throw error;
      }
    } // End while mining loop

    console.log(`[${this.characterName}] Finished mining session. Final ore count: ${this.currentOreCount}. Inventory full: ${inventoryFull}`);
  }

  /**
   * Moves to the refinery, smelts all available mithril ore, moves to the bank, and deposits everything.
   * @returns {Promise<void>}
   */
  async refineAndDeposit() {
    console.log(`[${this.characterName}] Starting refining and deposit process...`);

    // Check how much ore we actually have
    this.currentOreCount = await this.checkMithrilOreCount();
    const barsToMake = Math.floor(this.currentOreCount / ORE_PER_BAR);

    if (barsToMake <= 0) {
      console.log(`[${this.characterName}] Not enough ore (${this.currentOreCount}) to make any bars. Skipping refining.`);
    } else {
      // 1. Move to Refinery
      console.log(`[${this.characterName}] Moving to refinery at (${this.refineryCoords.x}, ${this.refineryCoords.y})...`);
      await this.handleAction(() => moveCharacter(this.refineryCoords.x, this.refineryCoords.y, this.characterName), 'Moving');
      console.log(`[${this.characterName}] Arrived at refinery.`);
      await sleep(1500); // Small delay after arrival

      // 2. Smelt Ore
      try {
        console.log(`[${this.characterName}] Attempting to smelt ${barsToMake} ${MITHRIL_BAR_CODE}...`);
        // Use handleAction for cooldowns and logging
        await this.handleAction(
           () => smeltingAction(MITHRIL_BAR_CODE, barsToMake, this.characterName),
           'Smelting'
        );
        console.log(`[${this.characterName}] Smelting successful.`);
        // Update ore count optimistically, will be confirmed by deposit
        this.currentOreCount = await this.checkMithrilOreCount();
      } catch (error) {
         console.error(`[${this.characterName}] Error during smelting:`, error.message);
         // Decide how to proceed - maybe try depositing ore instead?
         console.log(`[${this.characterName}] Smelting failed. Proceeding to deposit remaining items.`);
         // Fall through to deposit whatever is in inventory (ore + maybe partial bars)
      }
    }

    // 3. Move to Bank (regardless of smelting success)
    console.log(`[${this.characterName}] Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y}) for deposit...`);
    await this.handleAction(() => moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName), 'Moving');
    console.log(`[${this.characterName}] Arrived at bank.`);
    await sleep(1500); // Small delay

    // 4. Deposit All Items (including bars and any leftover ore)
    // Use the overridden depositItems which calls BaseLoop's deposit logic
    await this.depositItems(true); // Pass flag to indicate we are already at the bank

    console.log(`[${this.characterName}] Refining and deposit cycle complete.`);
  }

  /**
   * Overrides the base depositItems. Moves to the bank (if not already there)
   * and then calls the BaseLoop's deposit logic.
   * @param {boolean} [alreadyAtBank=false] - Flag to skip moving if already at the bank.
   * @returns {Promise<void>}
   */
  async depositItems(alreadyAtBank = false) {
    console.log(`[${this.characterName}] Starting deposit process...`);

    try {
      if (!alreadyAtBank) {
        // Move to Bank
        console.log(`[${this.characterName}] Moving to bank at (${this.bankCoords.x}, ${this.bankCoords.y})...`);
        await this.handleAction(() => moveCharacter(this.bankCoords.x, this.bankCoords.y, this.characterName), 'Moving');
        console.log(`[${this.characterName}] Arrived at bank.`);
        await sleep(1500); // Small delay after arrival
      } else {
         console.log(`[${this.characterName}] Already at bank, proceeding with deposit.`);
      }

      // Call the original deposit logic from BaseLoop using handleAction
      await super.depositItems(); // BaseLoop.depositItems calls handleAction(depositAllItems, 'Deposit')

      // Reset ore count after successful deposit
      this.currentOreCount = 0;
      console.log(`[${this.characterName}] Deposit successful.`);

    } catch (error) {
      console.error(`[${this.characterName}] Error during deposit process:`, error.message);
      // Handle potential cooldowns from errors - BaseLoop's handleAction might do this already
      const cooldown = extractCooldownTime(error);
      if (cooldown > 0) {
        await handleCooldown(cooldown);
      }
      // Re-throw to allow main loop to handle retries/waits if necessary
      throw error;
    }
  }

  // Helper to find item quantity in inventory array
  findItemCount(inventory, itemCode) {
    if (!inventory) return 0;
    const item = inventory.find(slot => slot && slot.code === itemCode);
    return item ? item.quantity : 0;
  }

  // Helper to check if inventory is full
  isInventoryFull(details) {
    if (!details || !details.inventory || details.inventory_max_items === undefined) {
      // Cannot determine, assume not full but log warning
      console.warn(`[${this.characterName}] Could not determine inventory status.`);
      return false;
    }
    // Check if number of slots used equals max slots
    // Or check total quantity if that's more relevant (depends on game mechanics)
    const currentItems = details.inventory.filter(item => item !== null).length;
    return currentItems >= details.inventory_max_items;
  }
}

/**
 * Main execution function for command line usage
 * @example
 * node mithril-mining-loop.js [characterName] [--refine] [--target=N] [--mineX=X --mineY=Y] [--bankX=X --bankY=Y] [--refineryX=X --refineryY=Y]
 * node mithril-mining-loop.js MyChar --refine --target=50 --mineX=-2 --mineY=13
 * node mithril-mining-loop.js MyOtherChar --target=0
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let characterName = args.find(arg => !arg.startsWith('--')); // First non-flag argument
  characterName = characterName || config.character; // Use default from config if not provided

  const options = {
    refineOre: args.includes('--refine'),
    targetOre: 0, // Default to inventory full
    // Default coordinates will be set in constructor if not provided
  };

  // Find target ore argument like --target=X
  let targetOre = 0;
  const targetArg = args.find(arg => arg.startsWith('--target='));
  if (targetArg) {
      const targetValue = parseInt(targetArg.split('=')[1], 10);
      if (!isNaN(targetValue) && targetValue >= 0) { // Allow 0
          options.targetOre = targetValue;
      } else {
          console.warn(`Invalid target value: ${targetArg.split('=')[1]}. Using default (0 = inventory full).`);
      }
  }

  // Parse coordinate arguments like --mineX=N
  const coordArgs = ['mineX', 'mineY', 'bankX', 'bankY', 'refineryX', 'refineryY'];
  const coordMap = {
      mineX: 'mineCoords.x', mineY: 'mineCoords.y',
      bankX: 'bankCoords.x', bankY: 'bankCoords.y',
      refineryX: 'refineryCoords.x', refineryY: 'refineryCoords.y',
  };

  args.forEach(arg => {
      if (arg.startsWith('--')) {
          const [key, value] = arg.substring(2).split('=');
          if (coordArgs.includes(key) && value !== undefined) {
              const numValue = parseInt(value, 10);
              if (!isNaN(numValue)) {
                  const [coordsKey, axis] = coordMap[key].split('.');
                  if (!options[coordsKey]) options[coordsKey] = {};
                  options[coordsKey][axis] = numValue;
              } else {
                  console.warn(`Invalid numeric value for ${key}: ${value}`);
              }
          }
      }
  });


  if (!characterName) {
    console.error('Character name is required! Provide it as the first argument or set control_character in your .env file.');
    process.exit(1);
  }

  // Sanitize character name (redundant if BaseLoop does it, but safe)
  characterName = characterName.replace(/[^a-zA-Z0-9_-]/g, '');

  console.log(`--- Mithril Mining Loop ---`);
  console.log(`Character: ${characterName}`);
  console.log(`Refine Ore: ${options.refineOre}`);
  console.log(`Target Ore: ${options.targetOre === 0 ? 'Inventory Full' : options.targetOre}`);
  if (options.mineCoords) console.log(`Mine Coords: (${options.mineCoords.x}, ${options.mineCoords.y})`);
  if (options.bankCoords) console.log(`Bank Coords: (${options.bankCoords.x}, ${options.bankCoords.y})`);
  if (options.refineryCoords) console.log(`Refinery Coords: (${options.refineryCoords.x}, ${options.refineryCoords.y})`);
  console.log(`---------------------------`);
  await sleep(2000); // Pause to read config

  const loop = new MithrilMiningLoop(characterName, options);

  try {
    await loop.run();
  } catch (error) {
    console.error(`[${characterName}] Fatal error in mithril mining loop:`, error.message);
    // Log fatal error to DB if possible
    try {
        await db.query(
            `INSERT INTO action_logs(character, action_type, error, coordinates) VALUES ($1, $2, $3, point(0,0))`,
            [characterName, 'mithril_loop_fatal', error.message]
        );
    } catch (dbError) {
        console.error("Failed to log fatal error to DB:", dbError);
    }
    process.exit(1);
  }
}

// Start the loop if run directly
if (require.main === module) {
  main().catch(err => {
    console.error("Unhandled error in main execution:", err);
    process.exit(1);
  });
}

module.exports = MithrilMiningLoop; // Export class for potential reuse
