/**
 * @fileoverview Character task state machine implementation with database persistence
 * @module character-tasks
 */

const db = require('./db');
const config = require('./config');
const { getCharacterDetails } = require('./api');

// Task states
const TASK_STATES = {
  IDLE: 'idle',
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Task types
const TASK_TYPES = {
  MINING: 'mining',
  WOODCUTTING: 'woodcutting',
  FISHING: 'fishing',
  ALCHEMY: 'alchemy',
  COMBAT: 'combat',
  CRAFTING: 'crafting'
};

/**
 * Initialize the character tasks database table
 * @async
 * @returns {Promise<void>}
 */
async function initializeTasksTable() {
  try {
    // Create the character_tasks table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS character_tasks (
        id SERIAL PRIMARY KEY,
        character VARCHAR(255) NOT NULL,
        task_type VARCHAR(50) NOT NULL,
        script_name VARCHAR(255) NOT NULL,
        script_args JSONB DEFAULT '[]',
        state VARCHAR(50) NOT NULL DEFAULT 'idle',
        process_id VARCHAR(255),
        start_time TIMESTAMPTZ,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        task_data JSONB DEFAULT '{}',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS character_tasks_character_idx
      ON character_tasks (character);
      
      CREATE INDEX IF NOT EXISTS character_tasks_state_idx
      ON character_tasks (state);
    `);
    
    console.log('Character tasks table initialized successfully');
  } catch (error) {
    console.error('Error initializing character tasks table:', error.message);
    throw error;
  }
}

/**
 * Create a new task for a character
 * @async
 * @param {string} character - Character name
 * @param {string} taskType - Type of task (mining, fishing, etc.)
 * @param {string} scriptName - Name of the script to run
 * @param {Array} scriptArgs - Arguments for the script
 * @param {Object} taskData - Additional task data
 * @returns {Promise<Object>} Created task
 */
async function createTask(character, taskType, scriptName, scriptArgs = [], taskData = {}) {
  try {
    // First check if this character already has a running task
    const existingTask = await getRunningTask(character);
    
    if (existingTask) {
      throw new Error(`Character ${character} already has a running task: ${existingTask.task_type}`);
    }
    
    // Create a new task in the PENDING state
    const result = await db.query(
      `INSERT INTO character_tasks(character, task_type, script_name, script_args, state, task_data)
       VALUES($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [character, taskType, scriptName, JSON.stringify(scriptArgs), TASK_STATES.PENDING, JSON.stringify(taskData)]
    );
    
    console.log(`Created new task for ${character}: ${taskType} (${scriptName})`);
    return result.rows[0];
  } catch (error) {
    console.error(`Error creating task for ${character}:`, error.message);
    throw error;
  }
}

/**
 * Update a task's state
 * @async
 * @param {number} taskId - ID of the task to update
 * @param {string} newState - New state for the task
 * @param {Object} updates - Additional fields to update
 * @returns {Promise<Object>} Updated task
 */
async function updateTaskState(taskId, newState, updates = {}) {
  try {
    // Build the SQL query dynamically based on updates
    let fields = ['state = $1', 'last_updated = NOW()'];
    let values = [newState];
    let paramIndex = 2;
    
    // Add process_id update if provided
    if (updates.processId !== undefined) {
      fields.push(`process_id = $${paramIndex}`);
      values.push(updates.processId);
      paramIndex++;
    }
    
    // Add error_message update if provided
    if (updates.errorMessage !== undefined) {
      fields.push(`error_message = $${paramIndex}`);
      values.push(updates.errorMessage);
      paramIndex++;
    }
    
    // Add task_data update if provided
    if (updates.taskData !== undefined) {
      fields.push(`task_data = $${paramIndex}`);
      values.push(JSON.stringify(updates.taskData));
      paramIndex++;
    }
    
    // Add start_time update for RUNNING state
    if (newState === TASK_STATES.RUNNING && !updates.resuming) {
      fields.push(`start_time = NOW()`);
    }
    
    // Create the SQL query
    const query = `
      UPDATE character_tasks 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    // Add the task ID as the last parameter
    values.push(taskId);
    
    // Execute the query
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    
    console.log(`Updated task ${taskId} state to ${newState}`);
    return result.rows[0];
  } catch (error) {
    console.error(`Error updating task ${taskId}:`, error.message);
    throw error;
  }
}

/**
 * Get a character's currently running task
 * @async
 * @param {string} character - Character name
 * @returns {Promise<Object|null>} Running task or null if none found
 */
async function getRunningTask(character) {
  try {
    const result = await db.query(
      `SELECT * FROM character_tasks 
       WHERE character = $1 
       AND state IN ($2, $3, $4)
       ORDER BY last_updated DESC
       LIMIT 1`,
      [character, TASK_STATES.PENDING, TASK_STATES.RUNNING, TASK_STATES.PAUSED]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error(`Error getting running task for ${character}:`, error.message);
    throw error;
  }
}

/**
 * Get all tasks for a character
 * @async
 * @param {string} character - Character name
 * @param {number} limit - Maximum number of tasks to return
 * @returns {Promise<Array>} List of tasks
 */
async function getCharacterTasks(character, limit = 10) {
  try {
    const result = await db.query(
      `SELECT * FROM character_tasks 
       WHERE character = $1
       ORDER BY last_updated DESC
       LIMIT $2`,
      [character, limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error(`Error getting tasks for ${character}:`, error.message);
    throw error;
  }
}

/**
 * Get all pending and running tasks for recovery
 * @async
 * @returns {Promise<Array>} List of tasks to recover
 */
async function getTasksForRecovery() {
  try {
    const result = await db.query(
      `SELECT * FROM character_tasks 
       WHERE state IN ($1, $2, $3)
       ORDER BY last_updated DESC`,
      [TASK_STATES.PENDING, TASK_STATES.RUNNING, TASK_STATES.PAUSED]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Error getting tasks for recovery:', error.message);
    throw error;
  }
}

/**
 * Check character status before resuming a task
 * @async
 * @param {string} character - Character name
 * @returns {Promise<Object>} Character status
 */
async function checkCharacterStatus(character) {
  try {
    const characterDetails = await getCharacterDetails(character);
    
    if (!characterDetails) {
      throw new Error(`Could not get details for character ${character}`);
    }
    
    return {
      position: {
        x: characterDetails.x || 0,
        y: characterDetails.y || 0
      },
      inventory: characterDetails.inventory || [],
      hp: characterDetails.hp || 0,
      maxHp: characterDetails.max_hp || 0,
      cooldown: characterDetails.cooldown || 0,
      cooldownExpiration: characterDetails.cooldown_expiration || null
    };
  } catch (error) {
    console.error(`Error checking status for ${character}:`, error.message);
    throw error;
  }
}

/**
 * Mark a task as completed
 * @async
 * @param {number} taskId - ID of the task to complete
 * @param {Object} taskData - Final task data
 * @returns {Promise<Object>} Completed task
 */
async function completeTask(taskId, taskData = {}) {
  return updateTaskState(taskId, TASK_STATES.COMPLETED, { taskData });
}

/**
 * Mark a task as failed
 * @async
 * @param {number} taskId - ID of the task to fail
 * @param {string} errorMessage - Error message
 * @param {Object} taskData - Final task data
 * @returns {Promise<Object>} Failed task
 */
async function failTask(taskId, errorMessage, taskData = {}) {
  return updateTaskState(taskId, TASK_STATES.FAILED, { errorMessage, taskData });
}

/**
 * Pause a running task (for server shutdown or maintenance)
 * @async
 * @param {number} taskId - ID of the task to pause
 * @param {Object} taskData - Current task state data for resuming later
 * @returns {Promise<Object>} Paused task
 */
async function pauseTask(taskId, taskData = {}) {
  return updateTaskState(taskId, TASK_STATES.PAUSED, { taskData });
}

/**
 * Resume a paused task
 * @async
 * @param {number} taskId - ID of the task to resume
 * @param {string} processId - New process ID
 * @returns {Promise<Object>} Resumed task
 */
async function resumeTask(taskId, processId) {
  return updateTaskState(taskId, TASK_STATES.RUNNING, { processId, resuming: true });
}

/**
 * Cancel a task (mark as completed with canceled flag)
 * @async
 * @param {number} taskId - ID of the task to cancel
 * @returns {Promise<Object>} Canceled task
 */
async function cancelTask(taskId) {
  return updateTaskState(taskId, TASK_STATES.COMPLETED, { 
    taskData: { canceled: true, cancelTime: new Date().toISOString() }
  });
}

/**
 * Clean up old completed or failed tasks
 * @async
 * @param {number} daysToKeep - Number of days to keep completed/failed tasks
 * @returns {Promise<number>} Number of tasks deleted
 */
async function cleanupOldTasks(daysToKeep = 7) {
  try {
    // 1. Find the ID of the most recent task for each character
    const latestTaskIdsResult = await db.query(`
      SELECT MAX(id) as latest_id
      FROM character_tasks
      GROUP BY character
    `);
    const latestTaskIds = latestTaskIdsResult.rows.map(row => row.latest_id);

    // 2. Delete tasks that are old AND not the latest for their character
    const result = await db.query(
      `DELETE FROM character_tasks
       WHERE state IN ($1, $2)                                  -- Only completed or failed
       AND last_updated < NOW() - INTERVAL '${daysToKeep} days' -- Older than retention period
       AND id != ALL($3::int[])                                 -- Not the latest task for any character
       RETURNING id`,
      [TASK_STATES.COMPLETED, TASK_STATES.FAILED, latestTaskIds]
    );

    console.log(`Cleaned up ${result.rows.length} old, non-latest tasks`);
    return result.rows.length;
  } catch (error) {
    console.error('Error cleaning up old tasks:', error.message);
    throw error;
  }
}

// Initialize the tasks table when this module is imported
initializeTasksTable().catch(err => {
  console.error('Failed to initialize character tasks system:', err);
});

/**
 * Module exports
 * @exports character-tasks
 */
module.exports = {
  // Constants
  TASK_STATES,
  TASK_TYPES,
  
  // Task management functions
  createTask,
  updateTaskState,
  getRunningTask,
  getCharacterTasks,
  getTasksForRecovery,
  checkCharacterStatus,
  completeTask,
  failTask,
  pauseTask,
  resumeTask,
  cancelTask,
  cleanupOldTasks
};
