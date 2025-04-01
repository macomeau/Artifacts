/**
 * @fileoverview Express server for the ArtifactsMMO Client GUI
 * @module gui
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

// Load environment variables first.
// Requiring env-loader automatically loads the environment and modifies process.env.
// It also exports the final loaded config object, though we might not use it directly here.
const envConfig = require('./env-loader');

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
  // Ensure the script is allowed in the config
  const allowedScripts = [
      ...guiConfig.validation.scripts,
      'adventurer-boots-crafting-loop' // Add the new script here
  ];
  if (!allowedScripts.includes(scriptBaseName)) {
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

  // --- Refined Argument and Character Name Handling ---
  let characterName = null;
  let scriptOnlyArgs = []; // Arguments specifically for the script, excluding character name if passed first
  let finalSpawnArgs = [script]; // Arguments for the node spawn command [script, char, ...scriptOnlyArgs, flags]

  // 1. Determine Character Name and Script-Specific Args
  const firstArgIsChar = scriptArgs.length > 0 && !scriptArgs[0].startsWith('--') && !isCoordinatePair(scriptArgs[0]);
  const firstArgIsCoords = scriptArgs.length > 0 && isCoordinatePair(scriptArgs[0]);

  if (firstArgIsChar) {
    // Character name is the first argument
    characterName = sanitizeCharacterName(scriptArgs[0]);
    scriptOnlyArgs = scriptArgs.slice(1); // The rest are script-specific args
    console.log(`Character name determined from first argument: ${characterName}`);
  } else if (firstArgIsCoords) {
    // Coordinate script: first arg is coords, second (optional) is character
    const coordArg = scriptArgs[0];
    scriptOnlyArgs = [coordArg]; // Coords are part of script-specific args
    if (scriptArgs.length > 1) {
      characterName = sanitizeCharacterName(scriptArgs[1]);
      scriptOnlyArgs.push(characterName); // Add character to script args if provided *after* coords
      console.log(`Character name determined from second argument (coord script): ${characterName}`);
    } else {
      characterName = sanitizeCharacterName(process.env.control_character || guiConfig.defaultCharacter);
      console.log(`Using default/env character for coord script: ${characterName}`);
    }
  } else {
    // Character name not in args, use env or default
    characterName = sanitizeCharacterName(process.env.control_character || guiConfig.defaultCharacter);
    scriptOnlyArgs = scriptArgs; // All args are script-specific
    console.log(`Using default/env character: ${characterName}`);
  }

  // Final check for a valid character name
  if (!characterName || characterName === 'UNKNOWN_CHARACTER') {
    throw new Error("Cannot determine a valid character name.");
  }
  console.log(`Final Character Name: ${characterName}, Script-Only Args: ${JSON.stringify(scriptOnlyArgs)}`);

  // 2. Construct Process ID using Character Name and Script-Only Args
  const processId = `${script}_${characterName}_${scriptOnlyArgs.join('_')}`;
  console.log(`Constructed Process ID: ${processId}`);

  // 3. Define Task Type
  let taskType = characterTasks.TASK_TYPES.UNKNOWN; // Use constant
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
    taskType = characterTasks.TASK_TYPES.CRAFTING;
  }

  // Kill any existing process with the same ID (using the correctly constructed processId)
  if (runningProcesses[processId]) {
    console.log(`Killing existing process: ${processId}`);
    // Ensure the process object and kill method exist before calling
    if (runningProcesses[processId].process && typeof runningProcesses[processId].process.kill === 'function') {
       runningProcesses[processId].process.kill();
    } else {
       console.warn(`Process ${processId} found in runningProcesses but lacks a killable process object.`);
    }
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
      scriptOnlyArgs, // Store the script-specific args
      { processId } // Store the derived processId
    );
    taskId = newTask.id;
    console.log(`Created task ${taskId} in database for ${characterName}: ${script}`);
  } catch (error) {
    console.error(`Failed to create task in database:`, error.message);
    // Continue anyway since we can still start the process
  }
  
  // 4. Prepare Arguments for Spawning
  // Start with the script name itself
  let spawnArgsForNode = [script];

  // Add the character name (most scripts expect this first)
  // Exception: Coordinate scripts might handle it differently internally, but passing it first is usually safe.
  spawnArgsForNode.push(characterName);

  // Add the script-only arguments
  spawnArgsForNode.push(...scriptOnlyArgs);

  // Add flags like --no-recycle
  if (!shouldRecycle) {
    spawnArgsForNode.push(noRecycleFlag);
  }

  // Add --env flag if needed
  if (customEnvFile) {
    spawnArgsForNode.push(`--env=${customEnvFile}`);
  }

  console.log(`Spawning node with args: ${spawnArgsForNode.join(' ')}`); // Log final args

  // 5. Spawn the Process
  const childProcess = spawn('node', spawnArgsForNode, { env });

  // Store process information
  // 6. Store Process Information using the correct processId
  runningProcesses[processId] = {
    process: childProcess,
    script,
    characterName: characterName, // Store determined character name
    args: scriptOnlyArgs, // Store script-specific args for potential restart
    startTime: new Date(),
    output: [],
    taskId, // Store associated task ID
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

// API endpoint to restart a stopped/failed script
app.post('/api/restart', async (req, res) => {
  const { id } = req.body; // This 'id' is the derived processId string

  if (!id) {
    return res.status(400).json({ error: 'Process ID is required for restart' });
  }

  let script;
  let args;

  // Check if the process exists in memory first
  if (runningProcesses[id]) {
    const proc = runningProcesses[id];

    // Prevent restarting an already running process from memory
    if (proc.running) {
      return res.status(400).json({ error: 'Cannot restart a process that is currently running' });
    }

    // Retrieve original script, character, and script-specific args from memory
    script = proc.script;
    const character = proc.characterName; // Use stored character name
    args = proc.args; // Use stored script-specific args

    if (!script || !character) {
      return res.status(500).json({ error: 'Could not retrieve original script/character name for this memory process' });
    }
    console.log(`Restarting process found in memory: ${id} with script: ${script}, character: ${character}, args: ${JSON.stringify(args)}`);

    // Reconstruct args for startScript: [character, ...scriptOnlyArgs]
    // Note: startScript will re-sanitize the character name.
    args = [character, ...(args || [])];


  } else {
    // Process not in memory, attempt to parse ID (less reliable)
    console.log(`Process ${id} not found in memory. Attempting to parse ID for restart.`);
    try {
      // ID format: `${script}_${characterName}_${scriptArgs.join('_')}`
      // Split carefully, considering args might contain underscores
      const parts = id.split('_');
      if (parts.length < 2) { // Need at least script and character
        throw new Error('Invalid process ID format for parsing');
      }

      // Assume the first part is the script name (potentially with .js)
      script = parts[0];
      // The second part is the character name
      const characterName = parts[1];
      // The rest are arguments, joined by underscores
      const argString = parts.slice(2).join('_');

      // Reconstruct args array - this is imperfect if args originally contained underscores
      // but is the best we can do from the ID string alone.
      // A better approach might be to fetch from DB using characterName and script,
      // but let's stick to parsing the ID for now.
      args = argString ? argString.split('_') : [];

      // Re-assemble args for startScript: [characterName, ...parsedArgs]
      args = [characterName, ...(args || [])];

      console.log(`Parsed from ID - Script: ${script}, Reconstructed Args for startScript: ${JSON.stringify(args)}`);

      // Basic validation
      if (!script || !characterName) {
          throw new Error('Could not reliably parse script or character name from process ID');
      }

    } catch (parseError) {
      console.error(`Error parsing process ID ${id}:`, parseError);
      // As a fallback, try fetching the latest task for the potential character from DB
      // This is complex because extracting character name reliably from ID is hard.
      // For now, return an error if parsing fails.
      return res.status(404).json({ error: `Process not found in memory and failed to parse ID: ${id}. Cannot determine restart parameters.` });
    }
  }

  // Now, attempt to start the script with the determined parameters
  try {
    // Call the existing startScript function with the reconstructed args
    // startScript will handle adding --no-recycle internally if needed based on script type,
    // but adding it here ensures it's present for restarts.
    const result = await startScript(script, [...(args || []), '--no-recycle']);
    console.log(`Restarted process (Original ID: ${id}) successfully. New ID: ${result.id}, Task ID: ${result.taskId}`);
    // Remove the old ID from the manually cleared set if it was there
    manuallyCleared.delete(id);
    res.json({ success: true, newProcessId: result.id, taskId: result.taskId });
  } catch (error) {
    console.error(`Error restarting script (Original ID: ${id}):`, error);
    res.status(500).json({ error: `Failed to restart script: ${error.message}` });
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

// API endpoint to list all running processes and last known tasks
app.get('/api/processes', async (req, res) => {
  try {
    // Filter out stopped processes that are older than 5 minutes from memory
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes in milliseconds

    // Auto-clean old stopped processes from memory
    Object.keys(runningProcesses).forEach(id => {
      const proc = runningProcesses[id];
      if (!proc.running && proc.endTime && new Date(proc.endTime) < fiveMinutesAgo) {
        console.log(`Auto-cleaning old stopped process from memory: ${id}`);
        delete runningProcesses[id];
        manuallyCleared.add(id); // Ensure it stays cleared if manually cleared before
      }
    });

    // Get current processes from memory (excluding manually cleared)
    const memoryProcesses = Object.keys(runningProcesses)
      .filter(id => !manuallyCleared.has(id))
      .map(id => {
        const proc = runningProcesses[id];
        return {
          id, // This is the derived processId
          script: proc.script,
          args: proc.args,
          running: proc.running,
          startTime: proc.startTime,
          endTime: proc.endTime,
          exitCode: proc.exitCode,
          // Include progress metrics if available
          itemsGathered: proc.itemsGathered || 0,
          enemiesDefeated: proc.enemiesDefeated || 0,
          loopCount: proc.loopCount || 0,
          activityCount: proc.activityCount || 0,
          source: 'memory' // Indicate source
        };
      });

    // Get the latest task for EACH character from the database
    const dbTasksResult = await db.query(`
      SELECT DISTINCT ON (character) *
      FROM character_tasks
      ORDER BY character, last_updated DESC
    `);
    const latestDbTasks = dbTasksResult.rows;

    // Create a map of characters currently represented in memoryProcesses
    const memoryCharacters = new Set(memoryProcesses.map(p => {
        // Extract character name reliably based on script type
        if ((p.script.includes('go-fight') || p.script.includes('go-gather') || p.script.includes('fight-loop') || p.script.includes('gathering-loop') || p.script.includes('strange-ore-mining-loop')) && p.args?.length > 1 && /^\s*\(?\s*-?\d+\s*,\s*-?\d+\s*\)?\s*$/.test(p.args[0])) {
            return p.args[1]; // Second arg is character
        }
        return p.args?.[0]; // First arg is character (default)
    }));


    // Filter DB tasks: include only those whose character is NOT in memoryProcesses
    const dbOnlyTasks = latestDbTasks
      .filter(task => !memoryCharacters.has(task.character))
      .map(task => {
        // Reconstruct the processId for frontend consistency
        const processId = reconstructProcessId(task.script_name, task.character, task.script_args);
        // Skip if this ID was manually cleared
        if (manuallyCleared.has(processId)) {
            return null; // Filter this out later
        }
        return {
          id: processId, // Use reconstructed processId
          script: task.script_name,
          args: task.script_args || [], // Ensure args is an array
          running: false, // These are never running if they are DB-only
          startTime: task.start_time,
          // Use last_updated as endTime for completed/failed tasks from DB
          endTime: (task.state === characterTasks.TASK_STATES.COMPLETED || task.state === characterTasks.TASK_STATES.FAILED) ? task.last_updated : null,
          // Map DB state to exitCode concept (0 for completed, 1 for failed/other)
          exitCode: task.state === characterTasks.TASK_STATES.COMPLETED ? 0 : (task.state === characterTasks.TASK_STATES.FAILED ? 1 : undefined),
          // Progress metrics are not stored in the DB task record, default to 0
          itemsGathered: 0,
          enemiesDefeated: 0,
          loopCount: 0, // Task DB doesn't store loop count
          activityCount: 0, // Task DB doesn't store activity count
          dbState: task.state, // Include the actual DB state
          source: 'database' // Indicate source
        };
      })
      .filter(task => task !== null); // Remove null entries (manually cleared)


    // Combine memory and DB-only tasks
    const combinedProcesses = [...memoryProcesses, ...dbOnlyTasks];

    res.json({ processes: combinedProcesses });

  } catch (error) {
    console.error('Error fetching processes:', error.message);
    res.status(500).json({ error: 'Failed to fetch process list', details: error.message });
  }
});

// Store IDs of manually cleared processes to prevent them from reappearing
const manuallyCleared = new Set();

/**
 * Reconstructs the process ID string from task details.
 * Matches the format used as keys in runningProcesses and by the frontend.
 * @param {string} script - The script name (e.g., 'go-gather-loop.js')
 * @param {string} characterName - The character name.
 * @param {string} characterName - The character name associated with the task.
 * @param {Array} scriptOnlyArgs - The script-specific arguments array (as stored in DB).
 * @returns {string} The reconstructed process ID.
 */
function reconstructProcessId(script, characterName, scriptOnlyArgs = []) {
  // Ensure args is an array before joining
  const safeArgs = Array.isArray(scriptOnlyArgs) ? scriptOnlyArgs : [];
  // Use the character name directly from the task record
  const charNameToUse = characterName || 'unknown'; // Fallback if characterName is somehow null/undefined
  // Construct the ID using the script name, character name, and script-specific args
  return `${script}_${charNameToUse}_${safeArgs.join('_')}`;
}


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

    // --- Dynamically determine account name and token ---
    const accountName = process.env.ACCOUNT_NAME;
    const apiToken = rootConfig.token || process.env.API_TOKEN; // Use token from root config or env

    if (!accountName) {
      console.error('FATAL: ACCOUNT_NAME environment variable is not set. Cannot determine which account to fetch characters for.');
      logger.error('FATAL: ACCOUNT_NAME environment variable is not set.'); // Use logger
      return res.status(500).json({ error: 'Server configuration error: ACCOUNT_NAME missing.' });
    }
    if (!apiToken) {
      console.error('FATAL: API token is missing (checked rootConfig.token and process.env.API_TOKEN). Cannot authenticate character fetch.');
      logger.error('FATAL: API token is missing (checked rootConfig.token and process.env.API_TOKEN).'); // Use logger
      return res.status(500).json({ error: 'Server configuration error: API token missing.' });
    }
    // --- End Dynamic Determination ---

    // Construct URL dynamically
    const url = `${process.env.API_SERVER || 'https://api.artifactsmmo.com'}/accounts/${encodeURIComponent(accountName)}/characters`;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] Fetching characters for account '${accountName}' from URL:`, url);
      logger.debug(`Fetching characters for account '${accountName}' from URL: ${url}`); // Use logger
    }

    // Use server's token for authentication, not client headers
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ArtifactsMMO-Client-GUI', // Slightly different agent for clarity
        'Authorization': `Bearer ${apiToken}` // Use the server's token
      }
    };

    if (process.env.NODE_ENV !== 'production') {
      const logOptions = {
        method: options.method,
        headers: {
          ...options.headers,
          // Don't log the actual auth token value
          'Authorization': '[REDACTED]'
        }
      };
      console.log('[DEBUG] Request options:', JSON.stringify(logOptions, null, 2));
      logger.debug('Request options:', logOptions); // Use logger
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
