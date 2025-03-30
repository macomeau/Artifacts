/**
 * @fileoverview Express server for the ArtifactsMMO Client GUI
 * @module gui
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

// Load environment variables first
const envLoader = require('./env-loader');
// This will handle both default and custom env files via the --env parameter
envLoader.loadEnv();

// Load modules that depend on environment configuration
const rootConfig = require('./config'); // Load root config for token etc. (Corrected path)
const guiConfig = require('./config/config'); // Load GUI specific config
const { checkConfig } = require('./config/config-validator');
const db = require('./db');
const characterTasks = require('./character-tasks');
const taskRecovery = require('./task-recovery');

// Get the custom env file argument for later use
const envFileArg = process.argv.find(arg => arg.startsWith('--env='));

const { createLogger, transports, format } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Configure structured logging
const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/gui-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// Log to console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.simple()
  }));
}

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});

const app = express();
// Allow port to be configured via environment variable, config file, or command line argument
const port = (() => {
  // Check environment variable first
  if (process.env.GUI_PORT && !isNaN(parseInt(process.env.GUI_PORT))) {
    return parseInt(process.env.GUI_PORT);
  }
  
  // Then check command line arguments for --port=XXXX
  try {
    const portArg = process.argv.find(arg => arg.startsWith('--port='));
    if (portArg) {
      const portValue = parseInt(portArg.split('=')[1]);
      if (!isNaN(portValue)) {
        return portValue;
      }
    }
  } catch (e) {
    // Ignore errors when accessing process.argv
  }
  
  // Default port
  return 3000;
})();

// Serve static files from the public directory
app.use(express.static('public'));
app.use(express.json());

// Store running processes
const runningProcesses = {};
const MAX_CONCURRENT_PROCESSES = parseInt(process.env.MAX_CONCURRENT_PROCESSES) || 10; // Limit concurrent processes

/**
 * Validates and sanitizes script arguments.
 * Currently, just ensures args is an array.
 * @param {any} args - The arguments passed from the API request.
 * @returns {Array} - A validated array of arguments.
 */
function validateAndSanitizeArgs(args) {
  if (!args) {
    return []; // Return empty array if args is null or undefined
  }
  if (!Array.isArray(args)) {
    console.warn(`Received non-array arguments: ${JSON.stringify(args)}. Converting to empty array.`);
    return []; // Return empty array if not an array
  }
  // Basic sanitization could be added here if needed, e.g., trimming strings
  return args;
}

/**
 * Process output parser to extract progress metrics
 * @param {string} output - The process output text
 * @returns {Object} - Extracted metrics
 */
/**
 * Process output parser to extract progress metrics and loop counts
 * @param {string} output - The process output text
 * @returns {Object} - Extracted metrics
 */
function parseProcessOutput(output) {
  const metrics = {
    loopCount: 0,
    activityCount: 0
  };

  // Try to find loop count information
  const loopCountMatch = output.match(/Completed loop #(\d+)/i);
  if (loopCountMatch && loopCountMatch[1]) {
    metrics.loopCount = parseInt(loopCountMatch[1], 10);
  }
  
  // Look for alternative loop count format
  const altLoopMatch = output.match(/loop #(\d+)/i);
  if (!metrics.loopCount && altLoopMatch && altLoopMatch[1]) {
    metrics.loopCount = parseInt(altLoopMatch[1], 10);
  }
  
  // Track activities - either harvesting or combat
  if (output.includes('Fishing successful') || 
      output.includes('Gathering successful') || 
      output.includes('Mining successful') || 
      output.includes('Harvesting successful')) {
    metrics.activityCount++;
  }
  
  // Track combat activities
  if (output.includes('Fight successful')) {
    metrics.activityCount++;
  }

  return metrics;
}

/**
 * Start a script with the given parameters
 * @param {string} script - The script to run
 * @param {Array} args - Arguments to pass to the script
 * @returns {Promise<Object>} - Process information
 */
// Security: Validate script name format to prevent path traversal
const ALLOWED_SCRIPT_PATTERN = /^[a-zA-Z0-9_-]+(\.js)?$/;

async function startScript(script, args = []) {
  // Validate script name format
  if (!ALLOWED_SCRIPT_PATTERN.test(script)) {
    throw new Error(`Invalid script name format: ${script}. Only alphanumeric characters, hyphens, and underscores are allowed.`);
  }

  // --- Security: Check against script allowlist ---
  const scriptBaseName = script.replace(/\.js$/, ''); // Remove .js extension for check
  if (!guiConfig.validation.scripts.includes(scriptBaseName)) {
      throw new Error(`Script '${scriptBaseName}' is not in the allowed list.`);
  }
  // --- End Security Check ---

  // Check if script file actually exists
  const scriptPath = path.join(__dirname, script);
  try {
    await fs.promises.access(scriptPath, fs.constants.F_OK | fs.constants.R_OK);
  } catch (error) {
    throw new Error(`Script ${script} not found or inaccessible`);
  }

  // --- Security: Check concurrent process limit ---
  const currentProcessCount = Object.keys(runningProcesses).filter(id => runningProcesses[id].running).length;
  if (currentProcessCount >= MAX_CONCURRENT_PROCESSES) {
      throw new Error(`Maximum concurrent process limit (${MAX_CONCURRENT_PROCESSES}) reached.`);
  }
  // --- End Security Check ---

  console.log(`Attempting to start script: ${script}`); // Log script name, avoid logging all args directly

  // Create a copy of args to avoid modifying the original
  let incomingArgs = validateAndSanitizeArgs(args);

  // Check for the --no-recycle flag and remove it from args for further processing
  const noRecycleFlag = '--no-recycle';
  const shouldRecycle = !incomingArgs.includes(noRecycleFlag);
  let scriptArgs = incomingArgs.filter(arg => arg !== noRecycleFlag); // Args without the recycle flag

  console.log(`Recycling for ${script}: ${shouldRecycle}`); // Log recycling status

  // Function to check if a string looks like a coordinate pair
  const isCoordinatePair = (str) => {
    if (!str) return false;
    
    // Check for common coordinate formats:
    // (x,y) format
    const parenthesesFormat = /^\s*\(\s*-?\d+\s*,\s*-?\d+\s*\)\s*$/;
    // x,y format
    const commaFormat = /^\s*-?\d+\s*,\s*-?\d+\s*$/;
    
    return parenthesesFormat.test(str) || commaFormat.test(str);
  };
  
  // Function to sanitize character names to meet API requirements
  const sanitizeCharacterName = (name) => {
    // Use default character from config if name is not provided
    if (!name) {
      if (!guiConfig.defaultCharacter) {
        console.error("Error: Cannot sanitize character name - no name provided and no default character configured.");
        // Return a placeholder or throw an error, depending on desired behavior
        return 'UNKNOWN_CHARACTER'; // Or throw new Error(...)
      }
      return guiConfig.defaultCharacter;
    }
    
    // Remove any characters that aren't alphanumeric, underscore, or hyphen
    const sanitized = String(name).replace(/[^a-zA-Z0-9_-]/g, '');
    
    // If sanitization removed all characters, return default
    // Ensure defaultCharacter exists before using it as a fallback
    return sanitized || guiConfig.defaultCharacter || 'UNKNOWN_CHARACTER';
  };

  // Initialize characterName variable that will be used in both cases
  let characterName = null;
  // Flag to skip regular case processing if we handled the special case
  let skipRegularProcessing = false;

  // Special case for scripts that work with coordinates like go-fight-heal-loop.js
  if (script.includes('fight') || script.includes('gather') || script.includes('mining') || script.includes('harvesting')) {
    // Check if first argument is a coordinate pair
    if (scriptArgs.length > 0 && isCoordinatePair(scriptArgs[0])) {
      // First arg is coordinates, do not sanitize it
      const coordArg = scriptArgs[0];
      
      // If there's a second argument, it's the character name
      if (scriptArgs.length > 1) {
        characterName = sanitizeCharacterName(scriptArgs[1]);
      } else {
        // Use default character from config if control_character env var is not set
        characterName = sanitizeCharacterName(guiConfig.defaultCharacter);
        if (!characterName || characterName === 'UNKNOWN_CHARACTER') {
           throw new Error("Cannot determine character name: Not provided in args, control_character env var not set, and no default character configured.");
        }
      }
      
      // Build the new arguments array: [coordinates, characterName]
      scriptArgs = [coordArg, characterName];
      console.log(`Using coordinates ${coordArg} with character: ${characterName}`);
      
      // Skip the regular case processing since we've already set everything up
      skipRegularProcessing = true;
    }
  }
  
  // Regular case: first argument might be character name
  if (!skipRegularProcessing) {
    // Check if we have a characterName in the first argument
    if (scriptArgs.length > 0) {
      characterName = sanitizeCharacterName(scriptArgs[0]);
    }
    
    // If not provided in args, get control character from environment
    if (!characterName && process.env.control_character) {
      // Sanitize and prepend character name to arguments
      characterName = sanitizeCharacterName(process.env.control_character);
      scriptArgs = [characterName, ...scriptArgs.slice(scriptArgs[0] ? 1 : 0)]; // Prepend sanitized name
    } else if (!characterName) {
      // Default character name if not provided in args or environment
      characterName = sanitizeCharacterName(guiConfig.defaultCharacter);
      if (!characterName || characterName === 'UNKNOWN_CHARACTER') {
         throw new Error("Cannot determine character name: Not provided in args, control_character env var not set, and no default character configured.");
      }
      scriptArgs = [characterName, ...scriptArgs]; // Prepend default name
      console.log(`Using default character name from config: ${characterName}`);
    } else {
      // Character name was provided as first arg, ensure it's sanitized and updated in args
      scriptArgs[0] = characterName;
    }
    
    // Log if sanitization occurred
    if (characterName !== (scriptArgs.length > 0 ? scriptArgs[0] : process.env.control_character)) {
      console.log(`Character name sanitized to: ${characterName}`);
    }
  }
  
  // Define task type based on script name
  let taskType = 'unknown';
  if (script.includes('mining')) {
    taskType = characterTasks.TASK_TYPES.MINING;
  } else if (script.includes('harvesting') && (script.includes('ash') || script.includes('birch') || script.includes('maple') || script.includes('spruce') || script.includes('deadwood'))) {
    taskType = characterTasks.TASK_TYPES.WOODCUTTING;
  } else if (script.includes('harvesting') && (script.includes('shrimp') || script.includes('gudgeon') || script.includes('trout') || script.includes('bass') || script.includes('bass'))) {
    taskType = characterTasks.TASK_TYPES.FISHING;
  } else if (script.includes('cook')) {
    taskType = characterTasks.TASK_TYPES.COOKING;
  } else if (script.includes('boost-potion') || script.includes('sunflower') || script.includes('nettle')) {
    taskType = characterTasks.TASK_TYPES.ALCHEMY;
  } else if (script.includes('fight')) {
    taskType = characterTasks.TASK_TYPES.COMBAT;
  } else if (script.includes('craft')) {
    taskType = characterTasks.TASK_TYPES.CRAFTING;
  }
  
  // Kill any existing process with the same ID
  const processId = `${script}_${characterName}_${scriptArgs.join('_')}`;
  if (runningProcesses[processId]) {
    console.log(`Killing existing process: ${processId}`);
    runningProcesses[processId].process.kill();
    delete runningProcesses[processId];
  }
  
  // Set up environment variables for the child process
  const env = { ...process.env };
  // Ensure character name is set in environment to avoid warnings
  env.control_character = characterName;
  
  // Track if we're using a custom env file
  const customEnvFile = envFileArg ? envFileArg.split('=')[1] : null;
  // Save the env file path to pass to child processes
  if (customEnvFile) {
    env.CUSTOM_ENV_FILE = customEnvFile;
  }
  
  // Create a task entry in the database
  let taskId = null;
  try {
    // Check if character already has a running task
    const existingTask = await characterTasks.getRunningTask(characterName);
    
    if (existingTask) {
      console.log(`Character ${characterName} already has a running task. Stopping it first.`);
      
      // Try to stop the existing process if it's running
      if (runningProcesses[existingTask.process_id]) {
        console.log(`Killing existing process: ${existingTask.process_id}`);
        runningProcesses[existingTask.process_id].process.kill();
        delete runningProcesses[existingTask.process_id];
      }
      
      // Mark the task as completed (with canceled flag)
      await characterTasks.cancelTask(existingTask.id);
    }
    
    // Create a new task in the database
    const newTask = await characterTasks.createTask(
      characterName,
      taskType,
      script,
      scriptArgs,
      { processId }
    );
    
    taskId = newTask.id;
    console.log(`Created task ${taskId} in database for ${characterName}: ${script}`);
  } catch (error) {
    console.error(`Failed to create task in database:`, error.message);
    // Continue anyway since we can still start the process
  }
  
  // Prepare the command line arguments for the script
  let nodeArgs = [script];

  // Add the --no-recycle flag if it was present
  if (!shouldRecycle) {
    nodeArgs.push(noRecycleFlag);
  }

  // Add the processed script arguments (character name, coords, etc.)
  nodeArgs.push(...scriptArgs);

  // Add the --env argument if we're using a custom env file
  // Note: This prepends the env arg, ensure 'node' is the first element for spawn
  let finalSpawnArgs = nodeArgs;
  if (customEnvFile) {
    finalSpawnArgs = [`--env=${customEnvFile}`, ...nodeArgs];
  }

  console.log(`Spawning node with args: ${finalSpawnArgs.join(' ')}`); // Log final args

  // Spawn the new process with the enhanced environment
  const childProcess = spawn('node', finalSpawnArgs, { env });

  // Store process information
  runningProcesses[processId] = {
    process: childProcess,
    script,
    args: scriptArgs,
    startTime: new Date(),
    output: [],
    taskId,
    itemsGathered: 0,
    enemiesDefeated: 0,
    loopCount: 0,
    activityCount: 0
  };
  
  // Handle process output
  childProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[${script}] ${output}`);
    runningProcesses[processId].output.push({
      type: 'stdout',
      text: output,
      time: new Date()
    });
    
    // Limit output buffer size
    if (runningProcesses[processId].output.length > 1000) {
      runningProcesses[processId].output.shift();
    }
    
    // Check for loop completion - use the BaseLoop pattern as the primary method
    let foundLoop = false;
    
    // PRIMARY PATTERN: "loop #X" - this is the standard BaseLoop pattern
    // This should catch both "Starting loop #X" and "Completed loop #X"
    const baseLoopMatch = output.match(/loop\s+#(\d+)/i);
    if (baseLoopMatch && baseLoopMatch[1]) {
      const loopNumber = parseInt(baseLoopMatch[1], 10);
      if (loopNumber >= runningProcesses[processId].loopCount) {
        runningProcesses[processId].loopCount = loopNumber;
        console.log(`Process ${processId} BaseLoop match #${loopNumber}`);
        foundLoop = true;
      }
    }
    
    // Pattern 4: "Starting loop X" or "Iteration X" without the # symbol
    if (!foundLoop) {
      const startingLoopMatch = output.match(/(Starting loop|Iteration|Loop iteration|Cycle)\s+(\d+)/i);
      if (startingLoopMatch && startingLoopMatch[2]) {
        const loopNumber = parseInt(startingLoopMatch[2], 10);
        if (loopNumber > runningProcesses[processId].loopCount) {
          runningProcesses[processId].loopCount = loopNumber;
          console.log(`Process ${processId} starting loop #${loopNumber}`);
          foundLoop = true;
        }
      }
    }
    
    // Pattern 5: "Loop: X"
    if (!foundLoop) {
      const loopColonMatch = output.match(/Loop:\s*(\d+)/i);
      if (loopColonMatch && loopColonMatch[1]) {
        const loopNumber = parseInt(loopColonMatch[1], 10);
        if (loopNumber > runningProcesses[processId].loopCount) {
          runningProcesses[processId].loopCount = loopNumber;
          console.log(`Process ${processId} loop: ${loopNumber}`);
          foundLoop = true;
        }
      }
    }
    
    // Pattern 6: Special pattern for fight scripts - "Attempt X failed/succeeded" from executeWithCooldown
    if (!foundLoop) {
      // For fight scripts, look for "Attempt X failed:" or "Action attempt X failed:"
      const attemptMatch = output.match(/(?:Attempt|Action attempt) (\d+) (?:failed|succeeded)/i);
      if (attemptMatch && attemptMatch[1]) {
        const attemptNumber = parseInt(attemptMatch[1], 10);
        // Only update if this is a newer/higher attempt number
        if (attemptNumber > runningProcesses[processId].loopCount) {
          runningProcesses[processId].loopCount = attemptNumber;
          console.log(`Process ${processId} attempt #${attemptNumber}`);
          foundLoop = true;
        }
      }
    }
    
    // Pattern 7: For fight-heal scripts - "Fight successful" counts as a loop iteration
    if (!foundLoop && runningProcesses[processId].script && (runningProcesses[processId].script.includes('fight') || runningProcesses[processId].script.includes('combat'))) {
      if (output.includes('Fight successful')) {
        runningProcesses[processId].loopCount++;
        console.log(`Process ${processId} - Fight successful, incrementing counter to ${runningProcesses[processId].loopCount}`);
        foundLoop = true;
      }
    }
    
    // Pattern 8: Specialized incremental counters for scripts that don't use standard BaseLoop logging
    if (!foundLoop && runningProcesses[processId].script) {
      // Only increment these counters if we haven't found a standard loop number pattern
      // Get script basename to handle variants
      const scriptBase = runningProcesses[processId].script.toLowerCase();
      
      // GATHERING/MINING SCRIPTS: Detect successful gathering actions
      if (scriptBase.includes('harvesting') || 
          scriptBase.includes('mining') || 
          scriptBase.includes('gathering')) {
        
        // Look for consistent activity markers
        if (output.includes('Gathering successful') || 
            output.includes('Mining successful') || 
            output.includes('Harvesting successful') || 
            output.includes('Fishing successful')) {
          
          // Increment the counter if activity detected
          runningProcesses[processId].loopCount = 
            (runningProcesses[processId].loopCount || 0) + 1;
            
          console.log(`Process ${processId} - Gathering activity detected, incrementing to ${runningProcesses[processId].loopCount}`);
          foundLoop = true;
        }
      }
    }
    
    // Track activities
    if (output.includes('Fishing successful') || 
        output.includes('Gathering successful') || 
        output.includes('Mining successful') || 
        output.includes('Harvesting successful')) {
      runningProcesses[processId].activityCount++;
      console.log(`Process ${processId} activity count: ${runningProcesses[processId].activityCount}`);
    }
    
    // Track combat activities
    if (output.includes('Fight successful')) {
      runningProcesses[processId].activityCount++;
      console.log(`Process ${processId} activity count: ${runningProcesses[processId].activityCount}`);
    }
    
    // Update legacy progress metrics by analyzing the output
    
    // Parse mining/harvesting progress - check both session gathering and total values
    let matchFound = false;
    
    // Check for session gathering
    const sessionMatches = output.match(/(?:Copper ore gathered this session|Gathered|Harvested|Collected|Mined): (\d+)/i);
    if (sessionMatches && sessionMatches[1]) {
      const newItems = parseInt(sessionMatches[1], 10);
      console.log(`Detected ${newItems} items gathered in session for process ${processId}`);
      
      // Update the gathered count if it's larger than what we have
      if (newItems > runningProcesses[processId].itemsGathered) {
        runningProcesses[processId].itemsGathered = newItems;
        matchFound = true;
      }
    }
    
    // Also check for total values if we didn't find a session value
    if (!matchFound) {
      const totalMatches = output.match(/Total (?:copper ore|items|ore|iron|coal|gold|fish|wood|logs): (\d+)/i);
      if (totalMatches && totalMatches[1]) {
        const totalItems = parseInt(totalMatches[1], 10);
        console.log(`Detected ${totalItems} total items in process ${processId}`);
        
        // Update total count if it's larger
        if (totalItems > runningProcesses[processId].itemsGathered) {
          runningProcesses[processId].itemsGathered = totalItems;
        }
      }
    }
    
    // Check for specific increments in gathering
    const incrementMatches = output.match(/Successfully (gathered|harvested|mined|collected) (\d+)/i);
    if (incrementMatches && incrementMatches[2]) {
      const increment = parseInt(incrementMatches[2], 10);
      console.log(`Detected increment of ${increment} items in process ${processId}`);
      
      // Add to the current count
      runningProcesses[processId].itemsGathered += increment;
    }
    
    // Parse combat progress patterns
    if (output.includes('Fight successful')) {
      console.log(`Detected enemy defeated in process ${processId}`);
      runningProcesses[processId].enemiesDefeated++;
    }
    
    // Check for health info and fight patterns
    const fightMatches = output.match(/Current health: (\d+)\/(\d+)/);
    if (fightMatches) {
      // Found a combat process, increment if needed
      if (!output.includes('Health is already full') && output.includes('Rest successful')) {
        // This indicates a combat-rest cycle, which happens after each fight
        console.log(`Detected combat rest cycle in process ${processId}`);
        runningProcesses[processId].enemiesDefeated++;
      }
    }
  });
  
  childProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.error(`[${script}] Error: ${output}`);
    runningProcesses[processId].output.push({
      type: 'stderr',
      text: output,
      time: new Date()
    });
  });
  
  childProcess.on('close', (code) => {
    console.log(`${script} process exited with code ${code}`);
    
    // Check if this process was manually cleared while it was still running
    if (manuallyCleared.has(processId)) {
      console.log(`Process ${processId} was manually cleared, removing from running processes`);
      delete runningProcesses[processId];
    } else if (runningProcesses[processId]) {
      // Make sure the process still exists in our tracking object before updating it
      runningProcesses[processId].exitCode = code;
      runningProcesses[processId].endTime = new Date();
      runningProcesses[processId].running = false;
    } else {
      console.log(`Process ${processId} not found in runningProcesses, it may have been removed earlier`);
    }
    
    // Update task state in database
    if (taskId) {
      if (code === 0) {
        console.log(`Marking task ${taskId} as completed`);
        characterTasks.completeTask(taskId, { exitCode: code })
          .catch(err => console.error(`Failed to mark task ${taskId} as completed:`, err.message));
      } else {
        console.log(`Marking task ${taskId} as failed (exit code ${code})`);
        characterTasks.failTask(taskId, `Process exited with code ${code}`)
          .catch(err => console.error(`Failed to mark task ${taskId} as failed:`, err.message));
      }
    }
  });
  
  // Update task status in database to RUNNING
  if (taskId) {
    try {
      await characterTasks.updateTaskState(taskId, characterTasks.TASK_STATES.RUNNING, { 
        processId,
        taskData: { processStartTime: new Date().toISOString() }
      });
    } catch (error) {
      console.error(`Failed to update task ${taskId} state:`, error.message);
    }
  }
  
  runningProcesses[processId].running = true;
  return { id: processId, taskId };
}

// API request validation middleware
function validateStartRequest(req, res, next) {
  const { script, args } = req.body;
  
  if (!script) {
    return res.status(400).json({ error: 'Script name is required' });
  }
  
  if (args && !Array.isArray(args)) {
    return res.status(400).json({ error: 'Arguments must be an array' });
  }

  // Additional security: Limit maximum arguments length
  if (args && args.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 arguments allowed' });
  }

  next();
}

// Apply rate limiting to API endpoints
app.use('/api/', apiLimiter);

// API endpoint to start a script with validation
app.post('/api/start', validateStartRequest, (req, res) => {
  const { script, args } = req.body;
  
  try {
    const result = startScript(script, args || []);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error starting script:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to stop a script
app.post('/api/stop', async (req, res) => {
  const { id } = req.body;
  
  if (!id || !runningProcesses[id]) {
    return res.status(404).json({ error: 'Process not found' });
  }
  
  try {
    // Get the task ID associated with this process
    const taskId = runningProcesses[id].taskId;
    
    // Make sure we have a valid process to kill
    if (runningProcesses[id].process && runningProcesses[id].process.kill) {
      // On Windows, we need to use a different approach
      if (process.platform === 'win32') {
        // Use taskkill to forcefully terminate the process tree
        const { execSync } = require('child_process');
        try {
          execSync(`taskkill /pid ${runningProcesses[id].process.pid} /T /F`);
        } catch (e) {
          console.error(`Failed to kill process with taskkill: ${e.message}`);
        }
      }
      
      // Standard kill for all platforms (will still work as fallback on Windows)
      runningProcesses[id].process.kill('SIGTERM');
      
      // Give it a moment to terminate gracefully, then force kill if needed
      setTimeout(() => {
        try {
          if (runningProcesses[id].running) {
            console.log(`Process ${id} did not terminate gracefully, forcing kill...`);
            runningProcesses[id].process.kill('SIGKILL');
          }
        } catch (error) {
          console.error(`Error during force kill: ${error.message}`);
        }
      }, 1000);
    }
    
    // Make sure the process still exists
    if (runningProcesses[id]) {
      runningProcesses[id].running = false;
      runningProcesses[id].endTime = new Date();
    } else {
      console.log(`Process ${id} not found in runningProcesses during stop, it may have been removed earlier`);
    }
    
    // Update task state in database if the task exists
    if (taskId) {
      try {
        console.log(`Marking task ${taskId} as canceled...`);
        await characterTasks.cancelTask(taskId);
      } catch (error) {
        console.error(`Failed to update task state in database:`, error.message);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping script:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get process output
app.get('/api/output/:id', (req, res) => {
  const { id } = req.params;
  
  if (!id || !runningProcesses[id]) {
    return res.status(404).json({ error: 'Process not found' });
  }
  
  res.json({
    output: runningProcesses[id].output,
    running: runningProcesses[id].running,
    itemsGathered: runningProcesses[id].itemsGathered || 0,
    enemiesDefeated: runningProcesses[id].enemiesDefeated || 0,
    loopCount: runningProcesses[id].loopCount || 0,
    activityCount: runningProcesses[id].activityCount || 0,
    script: runningProcesses[id].script
  });
});

// API endpoint to list all running processes
app.get('/api/processes', (req, res) => {
  // Filter out stopped processes that are older than 5 minutes
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes in milliseconds
  
  // Auto-clean old stopped processes
  Object.keys(runningProcesses).forEach(id => {
    const proc = runningProcesses[id];
    if (!proc.running && proc.endTime && new Date(proc.endTime) < fiveMinutesAgo) {
      console.log(`Auto-cleaning old stopped process: ${id}`);
      delete runningProcesses[id];
    }
  });
  
  // Only return processes that haven't been manually cleared
  const processes = Object.keys(runningProcesses)
    .filter(id => !manuallyCleared.has(id)) // Filter out manually cleared processes
    .map(id => {
      const proc = runningProcesses[id];
      return {
        id,
        script: proc.script,
        args: proc.args,
        running: proc.running,
        startTime: proc.startTime,
        endTime: proc.endTime,
        exitCode: proc.exitCode,
        itemsGathered: proc.itemsGathered || 0,
        enemiesDefeated: proc.enemiesDefeated || 0,
        loopCount: proc.loopCount || 0,
        activityCount: proc.activityCount || 0
      };
    });
  
  res.json({ processes });
});

// Store IDs of manually cleared processes to prevent them from reappearing
const manuallyCleared = new Set();

// API endpoint to clear stopped processes
app.post('/api/clear-stopped', (req, res) => {
  let count = 0;
  
  // Find all stopped processes
  const stoppedProcessIds = Object.keys(runningProcesses).filter(id => {
    return !runningProcesses[id].running;
  });
  
  // Remove each stopped process
  stoppedProcessIds.forEach(id => {
    delete runningProcesses[id];
    // Add to the set of manually cleared processes
    manuallyCleared.add(id);
    count++;
  });
  
  console.log(`Cleared ${count} stopped processes`);
  // Return both the count and the array of cleared IDs
  res.json({ 
    success: true, 
    count,
    clearedIds: stoppedProcessIds 
  });
});

// API endpoint to get characters (proxy to prevent CORS issues)
app.get('/api/characters', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DEBUG] Character API request received');
    console.log('[DEBUG] Request headers:', JSON.stringify(req.headers, null, 2));
  }

  try {
    // For debugging, let's add a fallback response option
    if (process.env.NODE_ENV !== 'production' && process.env.USE_MOCK_DATA === 'true') {
      console.log('[DEBUG] Using mock character data');
      return res.json([
        { name: 'TestCharacter1', level: 10 },
        { name: 'TestCharacter2', level: 15 }
      ]);
    }

    const url = 'https://api.artifactsmmo.com/accounts/fernloft/characters';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Fetching from URL:', url);
    }

    // Add more detailed headers
    const options = {
      method: 'GET', 
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ArtifactsMMO-Client',
        // Forward any auth tokens from the client
        ...(req.headers.authorization && { 'Authorization': req.headers.authorization }),
        // Forward cookies if present
        ...(req.headers.cookie && { 'Cookie': req.headers.cookie })
      }
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Request options:', JSON.stringify({
        method: options.method,
        headers: {
          ...options.headers,
        // Don't log the actual auth token value
        ...(options.headers.Authorization && { 'Authorization': '[REDACTED]' }),
        ...(options.headers.Cookie && { 'Cookie': '[REDACTED]' })
      } // <-- Added missing closing brace for headers object
    }, null, 2));
    }

    const response = await fetch(url, options);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] API Response status:', response.status, response.statusText);
    }

    // For debugging, log response headers
    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Response headers:', JSON.stringify(responseHeaders, null, 2));
    }

    if (!response.ok) {
      // Try to get the response body even if it's an error
      let errorBody = '';
      try {
        const errorText = await response.text();
        errorBody = errorText;
        try {
          // Try to parse it as JSON
          const errorJson = JSON.parse(errorText);
          errorBody = JSON.stringify(errorJson, null, 2);
        } catch (e) {
          // It's not JSON, use the text version
        }
      } catch (e) {
        errorBody = 'Could not read error response body';
      }

      console.error(`API Error response (${response.status}):`, errorBody); // Log error regardless of env

      return res.status(response.status).json({
        error: `Failed to fetch characters: ${response.statusText}`,
        details: errorBody
      });
    }
    
    // Try to parse the JSON response
    let data;
    try {
      const responseText = await response.text();
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DEBUG] Response body (first 500 chars):', responseText.substring(0, 500));
      }

      data = JSON.parse(responseText);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DEBUG] Parsed JSON data type:', typeof data);
      }

      // Handle the new API response format which has a data property
      if (data && typeof data === 'object' && Array.isArray(data.data)) {
        // We have a data array inside the response object
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DEBUG] Found data array with length:', data.data.length);
          if (data.data.length > 0) {
            console.log('[DEBUG] First character:', JSON.stringify(data.data[0], null, 2).substring(0, 200) + '...');
          }
        }

        // Extract the characters array from the response
        const characters = data.data;
        // Check if characters have name property
        const haveName = characters.filter(char => char && char.name).length;
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DEBUG] Characters with name property:', haveName);
        }

        // Return the characters array
        res.json(characters);
      } else if (Array.isArray(data)) {
        // Fallback for direct array format
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DEBUG] Direct array format with length:', data.length);
        }

        // Check if data has the expected structure
        const haveName = data.filter(char => char && char.name).length;
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DEBUG] Characters with name property:', haveName);
        }

        res.json(data);
      } else {
        console.error('Unexpected response format:', typeof data); // Log error regardless of env
        if (process.env.NODE_ENV !== 'production') {
          console.error('[DEBUG] Response sample:', JSON.stringify(data).substring(0, 200));
        }

        // Try to extract characters from unexpected format
        if (data && typeof data === 'object') {
          // Look for any array property that might contain characters
          for (const key in data) {
            if (Array.isArray(data[key]) && data[key].length > 0 && data[key][0].name) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEBUG] Found possible character array in property "${key}"`);
              }
              return res.json(data[key]);
            }
          }

          // If we found the character directly, return it as an array
          if (data.name) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[DEBUG] Found single character object, converting to array');
            }
            return res.json([data]);
          }
        }

        return res.status(500).json({
          error: 'Invalid response format: expected an object with data array or direct array of characters',
          actual: typeof data,
          sample: JSON.stringify(data).substring(0, 200)
        });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error); // Log error regardless of env
      return res.status(500).json({
        error: 'Failed to parse characters response',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Unexpected error in character API:', error); // Log error regardless of env
    res.status(500).json({
      error: 'Failed to fetch characters',
      details: error.message,
      stack: error.stack
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Debugging Endpoints (only available in non-production) ---
if (process.env.NODE_ENV !== 'production') {
  // API endpoint to enable mock data for debugging
  app.get('/api/enable-mock-data', (req, res) => {
    console.log('[DEBUG] Enabling mock character data for debugging');
    process.env.USE_MOCK_DATA = 'true';
    res.json({ success: true, message: 'Mock data enabled for this session' });
  });

  // API endpoint to disable mock data
  app.get('/api/disable-mock-data', (req, res) => {
    console.log('[DEBUG] Disabling mock character data');
    process.env.USE_MOCK_DATA = 'false';
    res.json({ success: true, message: 'Mock data disabled for this session' });
  });
}
// --- End Debugging Endpoints ---

// API endpoint to get character details (proxy to prevent CORS issues)
app.get('/api/character/:name', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEBUG] Character details request for: ${req.params.name}`);
  }

  try {
    // For debugging, let's add a fallback response option
    if (process.env.NODE_ENV !== 'production' && process.env.USE_MOCK_DATA === 'true') {
      console.log('[DEBUG] Using mock character data for details');

      // Generate a single character with random skill levels
      const mockCharacter = {
        name: req.params.name,
        account: "example",
        skin: "men1",
        level: Math.floor(Math.random() * 30) + 1,
        xp: Math.floor(Math.random() * 5000),
        max_xp: 10000,
        gold: Math.floor(Math.random() * 10000),
        speed: 100,
        mining_level: Math.floor(Math.random() * 40) + 1,
        mining_xp: Math.floor(Math.random() * 5000),
        mining_max_xp: 10000,
        woodcutting_level: Math.floor(Math.random() * 40) + 1,
        woodcutting_xp: Math.floor(Math.random() * 5000),
        woodcutting_max_xp: 10000,
        fishing_level: Math.floor(Math.random() * 40) + 1,
        fishing_xp: Math.floor(Math.random() * 5000),
        fishing_max_xp: 10000,
        weaponcrafting_level: Math.floor(Math.random() * 40) + 1,
        weaponcrafting_xp: Math.floor(Math.random() * 5000),
        weaponcrafting_max_xp: 10000,
        gearcrafting_level: Math.floor(Math.random() * 40) + 1,
        gearcrafting_xp: Math.floor(Math.random() * 5000),
        gearcrafting_max_xp: 10000,
        jewelrycrafting_level: Math.floor(Math.random() * 40) + 1,
        jewelrycrafting_xp: Math.floor(Math.random() * 5000),
        jewelrycrafting_max_xp: 10000,
        cooking_level: Math.floor(Math.random() * 40) + 1,
        cooking_xp: Math.floor(Math.random() * 5000),
        cooking_max_xp: 10000,
        alchemy_level: Math.floor(Math.random() * 40) + 1,
        alchemy_xp: Math.floor(Math.random() * 5000),
        alchemy_max_xp: 10000,
      };
      
      // Match the exact API response format for consistency
      return res.json(mockCharacter);
    }
    // Construct the URL for the character details API
    const url = `${process.env.API_SERVER || 'https://api.artifactsmmo.com'}/characters/${encodeURIComponent(req.params.name)}`;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Fetching character details from URL:', url);
    }

    // --- Security: Use validated token from root config ---
    if (!rootConfig.token) {
        console.error('FATAL: API token is missing in configuration. Cannot proxy character details.');
        return res.status(500).json({ error: 'Server configuration error: API token missing.' });
    }
    // --- End Security ---

    // Prepare request options with authentication
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ArtifactsMMO-Client',
        'Authorization': `Bearer ${rootConfig.token}` // Use token from root config
      }
    };

    // Make the request to the API
    const response = await fetch(url, options);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] API Response status:', response.status, response.statusText);
    }

    if (!response.ok) {
      let errorBody = await response.text();
      console.error(`API Error response (${response.status}) fetching character details:`, errorBody); // Log error regardless of env

      return res.status(response.status).json({
        error: `Failed to fetch character details: ${response.statusText}`,
        details: errorBody
      });
    }
    
    // Parse the response
    const data = await response.json();
    
    // Check if the data has a characters array
    if (data.data && Array.isArray(data.data)) {
      // Find the specific character in the array
      const character = data.data.find(char => char && char.name === req.params.name);
      if (character) {
        // Return just the character object
        return res.json(character);
      } else {
        console.error(`Character ${req.params.name} not found in the API response`); // Log error regardless of env
        return res.status(404).json({
          error: `Character ${req.params.name} not found in the API response`
        });
      }
    }
    
    // Fall back to returning the full response if the format is different
    res.json(data);

  } catch (error) {
    console.error('Unexpected error fetching character details:', error); // Log error regardless of env
    res.status(500).json({
      error: 'Failed to fetch character details',
      details: error.message,
      stack: error.stack
    });
  }
});

// Add API endpoints for character tasks
app.get('/api/tasks/:character', async (req, res) => {
  try {
    const { character } = req.params;
    const tasks = await characterTasks.getCharacterTasks(character);
    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error getting character tasks:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    // Get the most recent task for each character
    const result = await db.query(`
      SELECT DISTINCT ON (character) *
      FROM character_tasks
      ORDER BY character, last_updated DESC
    `);
    
    res.json({ success: true, tasks: result.rows });
  } catch (error) {
    console.error('Error getting all tasks:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Clean up old tasks periodically
async function cleanupOldTasks() {
  try {
    const daysToKeep = 7; // Adjust as needed
    const count = await characterTasks.cleanupOldTasks(daysToKeep);
    console.log(`Cleaned up ${count} old tasks (older than ${daysToKeep} days)`);
  } catch (error) {
    console.error('Error cleaning up old tasks:', error.message);
  }
  
  // Run again in 24 hours
  setTimeout(cleanupOldTasks, 24 * 60 * 60 * 1000);
}

// Start the server and recover tasks
// Validate configuration before starting
checkConfig();

app.listen(port, async () => {
  console.log(`ArtifactsMMO Client GUI running at http://localhost:${port}`);
  console.log(`- Access http://localhost:${port}/api/enable-mock-data to turn on mock data for testing`);
  console.log(`- Access http://localhost:${port}/api/disable-mock-data to turn off mock data`);
  
  console.log('\nConfiguration Options:');
  console.log(`- Current port: ${port}`);
  console.log('- Port Configuration:');
  console.log('  1. Set the GUI_PORT environment variable');
  console.log('  2. Or use the --port=XXXX command line argument');
  console.log('  3. Or add GUI_PORT=XXXX to your .env file');
  
  console.log('\n- Multiple Account Support:');
  console.log('  - Default account: Using .env file');
  if (envFileArg) {
    console.log(`  - Custom account: Using ${envFileArg.split('=')[1]}`);
  }
  console.log('  - To use a different account:');
  console.log('    Run with --env=path/to/custom.env');
  console.log('    Example: node gui.js --env=account2.env --port=3001');
  
  // Initialize the task recovery system with our runningProcesses object
  console.log('Initializing task recovery system...');
  try {
    taskRecovery.initialize(runningProcesses);
    
    // Recover tasks that were interrupted by a server restart
    console.log('Attempting to recover interrupted tasks...');
    const result = await taskRecovery.recoverAllTasks();
    if (result.total > 0) {
      console.log(`Task recovery complete: ${result.recovered} recovered, ${result.failed} failed out of ${result.total} total`);
    } else {
      console.log('No tasks to recover');
    }
  } catch (error) {
    console.error('Error during task recovery:', error.message);
  }
  
  // Start cleanup schedule
  cleanupOldTasks();
});
