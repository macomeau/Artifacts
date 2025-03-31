/**
 * @fileoverview Base class for automated gameplay loops with cooldown handling and logging
 * @module BaseLoop
 */

const { moveCharacter, getCharacterDetails, gatheringAction, craftingAction, depositAllItems } = require('./api');
const { handleCooldown, checkInventory } = require('./utils');
const db = require('./db');

/**
 * Abstract base class for automation loops
 * @class
 * @abstract
 */
class BaseLoop {
  /**
   * Create a base loop instance
   * @param {string} characterName - Name of character to control
   */
  constructor(characterName) {
    /** @type {string} Controlled character name */
    this.characterName = characterName;
    /** @type {number} Current loop iteration count */
    this.loopCount = 0;
  }

  /**
   * Initialize loop by moving to starting coordinates
   * @async
   * @param {Object} coords - Target coordinates
   * @param {number} coords.x - X coordinate
   * @param {number} coords.y - Y coordinate
   * @throws {Error} If initialization fails
   */
  async initialize(coords) {
    try {
      await db.pruneOldLogs();
    } catch (error) {
      console.error('Could not prune logs:', error.message);
    }

    try {
      const characterDetails = await getCharacterDetails(this.characterName);
      
      if (characterDetails.x === coords.x && characterDetails.y === coords.y) {
        console.log(`Already at (${coords.x}, ${coords.y})`);
        return;
      }
      
      await handleCooldown(characterDetails.cooldown);
      
      console.log(`Moving to (${coords.x}, ${coords.y})`);
      await moveCharacter(coords.x, coords.y, this.characterName);
    } catch (error) {
      console.error('Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Execute an action with cooldown handling
   * @async
   * @param {Function} actionFn - Action function to execute
   * @param {string} actionName - Name for logging purposes
   * @returns {Promise<Object>} Action result
   * @throws {Error} If action fails
   */
  async handleAction(actionFn, actionName) {
    try {
      // Fetching details here is often redundant. 
      // handleCooldown (utils.js) or the actionFn itself should manage fetching 
      // details if necessary based on cooldown state or action requirements.
      // We now pass the character name to handleCooldown.
      await handleCooldown(this.characterName); // Pass name instead of cooldown value

      let result;
      try {
        result = await actionFn();
        console.log(`${actionName} successful`);
      } catch (actionError) {
        // Check if it's a move action and the error is "already at destination"
        if ((actionName.toLowerCase().includes('move') || actionName.toLowerCase().includes('moving')) && 
            (actionError.message.includes('Character already at destination') || actionError.message.includes('API error (490)'))) {
          console.log(`[${this.characterName}] Already at destination for action: ${actionName}.`);
          // Treat as success, return null or a specific success object if needed
          return null; 
        } else {
          // For any other error, re-throw it to be caught by the outer handler
          throw actionError;
        }
      }
      return result;
    } catch (error) {
      // This outer catch handles errors from handleCooldown or re-thrown errors from actionFn
      console.error(`${actionName} failed overall:`, error.message);
      throw error;
    }
  }

  /**
   * Deposit all items at current location
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If deposit fails
   */
  async depositItems() {
    try {
      await this.handleAction(
        () => depositAllItems(this.characterName),
        'Deposit'
      );
    } catch (error) {
      console.error('Deposit failed:', error.message);
      throw error;
    }
  }

  /**
   * Check inventory status and deposit if full
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If inventory check or deposit fails
   */
  async checkAndDeposit() {
    const details = await getCharacterDetails(this.characterName);
    
    try {
      // Log inventory snapshot (without coordinates, matching db schema)
      await db.query(
        `INSERT INTO inventory_snapshots(character, items)
         VALUES ($1, $2)`,
        [
          this.characterName,
          JSON.stringify(details.inventory || [])
        ]
      );
    } catch (error) {
      console.error('Failed to save inventory snapshot:', error.message);
      throw error;
    }

    if (await checkInventory(details)) {
      console.log('Inventory full, depositing items...');
      await this.depositItems();
    }
  }

  /**
   * Start loop iteration with logging
   * @async
   * @returns {Promise<void>}
   */
  async startLoop() {
    this.loopCount++;
    console.log(`\nStarting loop #${this.loopCount}`);
    
    // Get current character details to record accurate coordinates
    const characterDetails = await getCharacterDetails(this.characterName);
    const x = characterDetails?.x || 0;
    const y = characterDetails?.y || 0;
    
    // Log loop start to database with actual coordinates
    await db.query(
      `INSERT INTO action_logs(character, action_type, result, coordinates)
       VALUES ($1, 'loop_start', $2, point($3,$4))`,
      [
        this.characterName,
        {
          loop_count: this.loopCount,
          timestamp: new Date().toISOString()
        },
        x,
        y
      ]
    );
  }
}

/**
 * Module exports
 * @exports BaseLoop
 */
module.exports = BaseLoop;
