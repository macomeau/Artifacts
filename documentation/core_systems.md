# Core Systems Documentation

This document describes the core modules that form the foundation of the ArtifactsMMO Client.

---

## API (`api.js`)

Handles all direct communication with the ArtifactsMMO game server API.

### Key Functions:

*   `sanitizeCharacterName(characterName)`: Ensures character names meet API requirements (`^[a-zA-Z0-9_-]+$`). Returns the sanitized name or the default from config if invalid.
*   `makeApiRequest(endpoint, method, body, characterName)`: The core function for making authenticated API requests. Constructs the URL, adds the auth token, sends the request, handles response status, parses JSON, logs the action/error to the database, and returns the response data. Throws errors for non-2xx responses.
*   `moveCharacter(x, y, characterName)`: Moves the specified character to the given coordinates. Uses `makeApiRequest`.
*   `fightAction(characterName)`: Initiates a fight action for the character. Uses `makeApiRequest`.
*   `gatheringAction(characterName)`: Performs a generic gathering action (e.g., woodcutting, mining, fishing). Uses `makeApiRequest`.
*   `miningAction(characterName)`: Specific alias for mining. Uses `makeApiRequest`.
*   `restAction(characterName)`: Initiates a rest action to recover HP. Uses `makeApiRequest`.
*   `craftingAction(code, quantity, material, characterName)`: Performs a crafting action for a specific recipe code and quantity. Uses `makeApiRequest`.
*   `smeltingAction(code, quantity, characterName)`: Performs a smelting action (specific type of crafting). Uses `makeApiRequest`.
*   `recyclingAction(code, quantity, characterName)`: Performs a recycling action on specified items. Uses `makeApiRequest`.
*   `equipAction(code, slot, quantity)`: Equips an item to a specified slot. Uses `makeApiRequest`.
*   `unequipAction(slot)`: Unequips an item from a specified slot. Uses `makeApiRequest`.
*   `getCharacterDetails(characterName)`: Fetches public character details (stats, inventory, position) without triggering game cooldowns. Uses the public `/characters/:name` endpoint.
*   `healCharacter(characterName)`: Repeatedly uses `restAction` until the character's HP is full. Handles cooldowns between rests. Logs healing actions.
*   `executeWithCooldown(actionFn, onSuccess, onError, maxAttempts)`: A wrapper function to execute an action repeatedly, handling cooldowns automatically based on API responses or error messages. Manages retry logic and delays.

---

## Base Loop (`base-loop.js`)

Provides an abstract base class for creating automated gameplay loops. Specific loop scripts (e.g., `CopperMiningLoop`, `AshHarvestingLoop`) inherit from this class.

### Key Properties:

*   `characterName`: The name of the character controlled by the loop.
*   `loopCount`: Tracks the number of loop iterations completed.

### Key Methods:

*   `constructor(characterName)`: Initializes the loop with the character name.
*   `initialize(coords)`: Moves the character to the specified starting coordinates and prunes old database logs. Handles cooldowns during movement.
*   `handleAction(actionFn, actionName)`: Executes a given action function (`actionFn`), ensuring any existing cooldown is waited out first. Logs the action name.
*   `depositItems()`: Deposits all items at the current location using `depositAllItems` from `go-deposit-all.js`. (Note: This method in `base-loop.js` does *not* move to the bank first, unlike the overridden version in `mithril-mining-loop.js`).
*   `checkAndDeposit()`: Fetches character details, logs an inventory snapshot to the database, and calls `depositItems` if the inventory is full (based on `checkInventory` from `utils.js`).
*   `startLoop()`: Increments `loopCount`, logs the start of a new loop iteration to the database, including current coordinates.

---

## Utilities (`utils.js`)

Contains general helper functions used across various modules.

### Key Functions:

*   `sleep(ms)`: Returns a Promise that resolves after the specified number of milliseconds.
*   `parseCoordinates(coordString)`: Parses a string like `"(x,y)"` into an object `{ x: number, y: number }`.
*   `handleCooldown(cooldownSeconds)`: Waits for the specified duration if `cooldownSeconds` is greater than 0. Adds a small buffer.
*   `extractCooldownTime(error)`: Attempts to parse the remaining cooldown duration (in seconds) from an API error message.
*   `checkInventory(characterDetails)`: Checks if the character's inventory is full based on the number of items and `inventory_max_items`. Logs an inventory snapshot.
*   `withRetry(fn, maxRetries, initialDelay, maxDelay)`: Executes a function `fn` with automatic retries on failure, using exponential backoff for delays. Handles cooldown errors specifically by waiting the required time.

---

## Database (`db.js`)

Manages the connection pool and provides functions for interacting with the PostgreSQL database.

### Key Exports:

*   `pool`: The `pg.Pool` instance for database connections.
*   `query(text, params)`: Executes a parameterized SQL query against the pool.
*   `getClient()`: Gets a client connection from the pool (useful for transactions).
*   `createTables()`: Creates the necessary database tables (`action_logs`, `inventory_snapshots`, `pruning_counters`) and indexes if they don't exist. Sets up functions and triggers for automatic log pruning based on insert counts.
*   `pruneOldLogs()`: Manually triggers the pruning of old log entries, keeping the most recent 10,000 records in each log table.

---

## Redis Queue (`redis-queue.js`)

Implements a Redis-based queue for buffering database writes (action logs and inventory snapshots) to improve performance and handle potential database downtime. Includes file-based backup and recovery.

### Key Features:

*   Uses Redis lists (`inventory_snapshots`, `action_logs`) to store pending data.
*   `initialize()`: Connects to Redis, creates a data directory for file backups, starts periodic flushing/backup, and recovers data from any existing backup files.
*   `addInventorySnapshot(character, items)`: Adds an inventory snapshot entry to the Redis queue.
*   `addActionLog(character, actionType, coordinates, result)`: Adds an action log entry to the Redis queue.
*   `flush()`: Attempts to write all queued data from Redis to the PostgreSQL database in batches. Backs up data to files before flushing. Clears Redis queues on successful DB commit.
*   `backupToFile(prefix, data)`: Writes queued data to a uniquely named JSON file in the `data/` directory as a fallback.
*   `recoverFromFiles()`: Reads data from backup files on startup, adds it back to the Redis queue, and deletes the files.
*   Handles graceful shutdown (`SIGINT`, `SIGTERM`) by attempting a final flush/backup.

---

## Character Tasks (`character-tasks.js`)

Manages the state of long-running character tasks (loops) using the `character_tasks` database table.

### Key Concepts:

*   **Task States (`TASK_STATES`)**: Defines the possible states of a task (e.g., `IDLE`, `PENDING`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED`).
*   **Task Types (`TASK_TYPES`)**: Categorizes tasks (e.g., `MINING`, `WOODCUTTING`, `FISHING`).

### Key Functions:

*   `initializeTasksTable()`: Creates the `character_tasks` table in the database if it doesn't exist.
*   `createTask(character, taskType, scriptName, scriptArgs, taskData)`: Creates a new task record in the `PENDING` state. Checks if the character already has a running task.
*   `updateTaskState(taskId, newState, updates)`: Updates the state and other fields (like `process_id`, `error_message`, `task_data`) of a specific task.
*   `getRunningTask(character)`: Retrieves the currently active (PENDING, RUNNING, PAUSED) task for a character.
*   `getCharacterTasks(character, limit)`: Gets the most recent tasks for a character.
*   `getTasksForRecovery()`: Fetches all tasks in states that indicate they might need recovery after a server restart (PENDING, RUNNING, PAUSED).
*   `checkCharacterStatus(character)`: Gets current character details (position, HP, inventory, cooldown) using `getCharacterDetails`.
*   `completeTask(taskId, taskData)`: Marks a task as `COMPLETED`.
*   `failTask(taskId, errorMessage, taskData)`: Marks a task as `FAILED` with an error message.
*   `pauseTask(taskId, taskData)`: Marks a task as `PAUSED` (intended for graceful shutdowns).
*   `resumeTask(taskId, processId)`: Marks a task as `RUNNING` when it's resumed (e.g., during recovery).
*   `cancelTask(taskId)`: Marks a task as `COMPLETED` but adds a `canceled` flag to its data.
*   `cleanupOldTasks(daysToKeep)`: Deletes old `COMPLETED` or `FAILED` task records from the database.

---

## Task Recovery (`task-recovery.js`)

Handles the process of restarting tasks that were interrupted, typically due to a server restart.

### Key Functions:

*   `initialize(processes)`: Initializes the module with a reference to the `runningProcesses` object from `gui.js`.
*   `recoverTask(task)`: Attempts to restart a single task based on its database record. Checks character status, spawns the script process, updates the `runningProcesses` object, and updates the task state in the database to `RUNNING`. Handles errors during recovery and marks the task as `FAILED` if recovery is unsuccessful.
*   `recoverAllTasks()`: Fetches all recoverable tasks from the database using `characterTasks.getTasksForRecovery` and attempts to recover each one sequentially using `recoverTask`.
