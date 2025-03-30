/**
 * @fileoverview Service for recovering interrupted tasks after server restart
 * @module task-recovery
 */

const { spawn } = require('child_process');
const { 
  getTasksForRecovery, 
  resumeTask, 
  failTask, 
  checkCharacterStatus,
  TASK_STATES 
} = require('./character-tasks');

// We'll use the same runningProcesses object from gui.js
// This needs to be passed in when this module is initialized

/**
 * Generate a unique process ID based on script and character
 * @param {string} script - The script name
 * @param {string} characterName - The character name
 * @param {Array} args - Script arguments
 * @returns {string} Unique process ID
 */
function generateProcessId(script, characterName, args = []) {
  return `${script}_${characterName}_${args.join('_')}`;
}

/**
 * Recover a single task
 * @async
 * @param {Object} task - The task to recover
 * @returns {Promise<boolean>} Whether recovery was successful
 */
async function recoverTask(task) {
  try {
    // Check if character is in a valid state for recovery
    const characterStatus = await checkCharacterStatus(task.character);
    console.log(`Recovering task ${task.id} for ${task.character} (${task.task_type})`);
    
    // Generate a process ID
    const processId = generateProcessId(
      task.script_name, 
      task.character, 
      Array.isArray(task.script_args) ? task.script_args : JSON.parse(task.script_args)
    );
    
    // Prepare script arguments
    let scriptArgs = [];
    if (typeof task.script_args === 'string') {
      try {
        scriptArgs = JSON.parse(task.script_args);
      } catch (e) {
        scriptArgs = [];
      }
    } else if (Array.isArray(task.script_args)) {
      scriptArgs = task.script_args;
    }
    
    // Ensure character name is the first argument
    if (!scriptArgs.includes(task.character)) {
      scriptArgs = [task.character, ...scriptArgs];
    }
    
    // Add recovery flag to arguments
    scriptArgs.push('--recovering=true');
    
    // Spawn the child process
    const childProcess = spawn('node', [task.script_name, ...scriptArgs], {
      env: { ...process.env, control_character: task.character }
    });
    
    // Store the process reference in the shared runningProcesses object
    runningProcesses[processId] = {
      process: childProcess,
      script: task.script_name,
      args: scriptArgs,
      taskId: task.id,
      startTime: new Date(),
      output: [],
      running: true
    };
    
    // Handle process output
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[${task.script_name}] ${output}`);
      runningProcesses[processId].output.push({
        type: 'stdout',
        text: output,
        time: new Date()
      });
      
      // Limit output buffer size
      if (runningProcesses[processId].output.length > 1000) {
        runningProcesses[processId].output.shift();
      }
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[${task.script_name}] Error: ${output}`);
      runningProcesses[processId].output.push({
        type: 'stderr',
        text: output,
        time: new Date()
      });
    });
    
    // Handle process exit
    childProcess.on('close', (code) => {
      console.log(`Task ${task.id} process exited with code ${code}`);
      
      if (runningProcesses[processId]) {
        runningProcesses[processId].exitCode = code;
        runningProcesses[processId].endTime = new Date();
        runningProcesses[processId].running = false;
      }
      
      // Update task state in database
      if (code === 0) {
        console.log(`Marking task ${task.id} as completed`);
        characterTasks.completeTask(task.id, { exitCode: code })
          .catch(err => console.error(`Failed to mark task ${task.id} as completed:`, err.message));
      } else {
        console.log(`Marking task ${task.id} as failed (exit code ${code})`);
        failTask(task.id, `Process exited with code ${code}`).catch(err => {
          console.error(`Failed to mark task ${task.id} as failed:`, err.message);
        });
      }
    });
    
    // Update task state in database
    await resumeTask(task.id, processId);
    console.log(`Successfully recovered task ${task.id} for ${task.character}`);
    return true;
  } catch (error) {
    console.error(`Failed to recover task ${task.id} for ${task.character}:`, error.message);
    
    // Mark task as failed
    try {
      await failTask(task.id, `Recovery failed: ${error.message}`);
    } catch (markError) {
      console.error(`Failed to mark task ${task.id} as failed:`, markError.message);
    }
    
    return false;
  }
}

/**
 * Recover all interrupted tasks from database
 * @async
 * @returns {Promise<Object>} Recovery results
 */
async function recoverAllTasks() {
  try {
    // Get all tasks that need recovery
    const tasks = await getTasksForRecovery();
    console.log(`Found ${tasks.length} tasks to recover`);
    
    if (tasks.length === 0) {
      return { recovered: 0, failed: 0, total: 0 };
    }
    
    // Try to recover each task
    const results = {
      recovered: 0,
      failed: 0,
      total: tasks.length
    };
    
    // Recover tasks sequentially to avoid resource contention
    for (const task of tasks) {
      try {
        const success = await recoverTask(task);
        if (success) {
          results.recovered++;
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`Error during task recovery:`, error);
        results.failed++;
      }
      
      // Add a small delay between recoveries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Task recovery completed: ${results.recovered} recovered, ${results.failed} failed`);
    return results;
  } catch (error) {
    console.error('Failed to recover tasks:', error);
    throw error;
  }
}

/**
 * Get information about all recovered processes
 * @returns {Array} Array of process info objects
 */
function getRecoveredProcesses() {
  // We don't need a separate function since processes are now stored in runningProcesses
  // Return an empty array to maintain backwards compatibility
  return [];
}

/**
 * Stop all recovered processes - this should now be handled by the GUI server
 * @returns {Promise<number>} Number of processes stopped
 */
async function stopAllRecoveredProcesses() {
  // Empty implementation as this is handled by the server
  return 0;
}

// Shared reference to the runningProcesses object from gui.js
let runningProcesses = {};

/**
 * Initialize the recovery system with the shared runningProcesses object
 * @param {Object} processes - Reference to the runningProcesses object from gui.js
 */
function initialize(processes) {
  if (!processes) {
    throw new Error('runningProcesses object is required for initialization');
  }
  runningProcesses = processes;
  console.log('Task recovery system initialized with shared process registry');
}

/**
 * Module exports
 * @exports task-recovery
 */
module.exports = {
  initialize,
  recoverTask,
  recoverAllTasks,
  getRecoveredProcesses,
  stopAllRecoveredProcesses
};