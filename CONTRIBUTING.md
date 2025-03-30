# Contributing to ArtifactsMMO Client

Thank you for your interest in contributing to the ArtifactsMMO Client! This guide will help you understand the project structure, coding standards, and contribution workflow.

## Table of Contents

- [Project Overview](#project-overview)
- [Development Environment Setup](#development-environment-setup)
- [Code Architecture](#code-architecture)
- [Coding Standards](#coding-standards)
- [Task Automation Loop Development](#task-automation-loop-development)
- [Database Management](#database-management)
- [GUI Components](#gui-components)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)

## Project Overview

The ArtifactsMMO Client is a Node.js application that provides automation tools and a GUI for ArtifactsMMO game tasks. The application uses:

- Express.js for the web server
- Node.js child processes for running game automation scripts
- PostgreSQL for task persistence and recovery
- Browser-based frontend GUI

## Development Environment Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up PostgreSQL database
4. Configure environment variables in a `.env` file
5. Start the GUI server: `node gui.js`

### Configuring the GUI Port

By default, the GUI server runs on port 3000. You can customize this in several ways:

1. **Environment Variable:**
   ```bash
   GUI_PORT=8080 node gui.js
   ```

2. **Command Line Argument:**
   ```bash
   node gui.js --port=8080
   ```

3. **In .env File:**
   ```
   GUI_PORT=8080
   ```

### Supporting Multiple Accounts

You can run multiple instances of the client for different game accounts:

1. **Create a secondary environment file** by copying the template:
   ```bash
   cp account-template.env account2.env
   ```

2. **Edit the new file** with your second account's credentials:
   ```
   ARTIFACTS_API_TOKEN=your_second_account_token
   control_character=your_second_account_character
   ```

3. **Run a separate instance** with the custom environment file:
   ```bash
   node gui.js --env=account2.env --port=3001
   ```

This allows you to control characters from different accounts simultaneously.

## Code Architecture

### Core Components

- **GUI Server** (`gui.js`): Main Express server that provides the web UI and API endpoints
- **Task System** (`character-tasks.js`): State machine for character task management and persistence
- **Task Recovery** (`task-recovery.js`): System for recovering interrupted tasks after server restart
- **Database Connection** (`db.js`): PostgreSQL connection pool management
- **Automation Loops**: Individual scripts for automating game activities (mining, crafting, etc.)

## Coding Standards

### Common Standards

- Use CommonJS module system (`require()` and `module.exports`)
- Maintain async/await consistency for asynchronous code
- Use descriptive variable and function names in camelCase
- Add JSDoc comments for all files, functions, and classes
- Handle errors with specific try/catch blocks and meaningful error messages

### File Structure

New JavaScript files should follow this structure:

```javascript
/**
 * @fileoverview Brief description of the file's purpose.
 * @module ModuleName
 */

// Imports
const dependency = require('./dependency');

// Constants
const CONSTANTS = {
  KEY: 'value'
};

// Main implementation

/**
 * Function description
 * @param {string} param - Parameter description
 * @returns {Promise<Object>} Return value description
 */
async function exampleFunction(param) {
  try {
    // Implementation
  } catch (error) {
    console.error('Error message:', error.message);
    throw error;
  }
}

/**
 * Module exports
 * @exports module-name
 */
module.exports = {
  exampleFunction,
  CONSTANTS
};
```

## Task Automation Loop Development

When creating a new task automation loop:

### Design Principles

1. **Single Responsibility**: Each loop should focus on one specific game activity
2. **Error Recovery**: Include robust error handling and retry mechanisms
3. **State Awareness**: Monitor and respond to character state changes
4. **Progress Logging**: Log meaningful progress information
5. **Resource Management**: Be efficient with API calls and resource usage

### Implementation Pattern

```javascript
/**
 * @fileoverview Automation loop for [specific task]
 * @module task-name-loop
 */

const api = require('./api');
const utils = require('./utils');

/**
 * Main task loop
 * @param {string} characterName - Character to perform the task
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
async function mainLoop(characterName, options = {}) {
  console.log(`Starting [task] for ${characterName}`);
  
  while (true) {
    try {
      // 1. Check character status
      // 2. Perform task action
      // 3. Handle results
      // 4. Wait appropriate time
    } catch (error) {
      console.error(`Error in [task] loop: ${error.message}`);
      // Error recovery logic
      await utils.sleep(5000);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const characterName = args[0] || process.env.control_character;

if (!characterName) {
  console.error('Character name is required!');
  process.exit(1);
}

// Start the loop
mainLoop(characterName).catch(error => {
  console.error(`Fatal error in [task] loop: ${error.message}`);
  process.exit(1);
});
```

## Database Management

When working with the database:

1. Always use parameterized queries to prevent SQL injection
2. Use the db.js connection pool for optimal performance
3. Handle database errors gracefully
4. Ensure proper transaction management for related operations
5. Follow the established schema patterns for consistency

Example database operation:

```javascript
const db = require('./db');

async function exampleDatabaseOperation(param) {
  try {
    const result = await db.query(
      'SELECT * FROM table_name WHERE column = $1',
      [param]
    );
    return result.rows;
  } catch (error) {
    console.error('Database operation failed:', error.message);
    throw error;
  }
}
```

## GUI Components

When modifying the GUI:

1. Maintain separation between server-side and client-side code
2. Follow the established event handling patterns for process management
3. Ensure responsive design for different screen sizes
4. Keep UI consistent with existing components
5. Test changes across different browsers

## Testing

While formal tests are not yet implemented, manually test your changes:

1. Run the application locally
2. Verify your feature works as expected
3. Verify it doesn't break existing functionality
4. Test error conditions and edge cases
5. Check browser console for JavaScript errors

## Documentation

### JSDoc Conventions

Every JavaScript file should include proper JSDoc documentation:

#### File Headers

```javascript
/**
 * @fileoverview Brief description of the file's purpose.
 * @module ModuleName
 */
```

#### Functions

```javascript
/**
 * Description of what the function does.
 * @param {string} param1 - Description of param1.
 * @param {Object} param2 - Description of param2.
 * @param {string} param2.subparam - Description of nested parameter.
 * @returns {Promise<number>} Description of the return value.
 * @throws {Error} Description of when exceptions are thrown.
 */
async function myFunction(param1, param2) {
```

#### Classes and Methods

```javascript
/**
 * Description of the class.
 * @class
 */
class MyClass {
  /**
   * Create a new instance.
   * @param {string} param - Description of param.
   */
  constructor(param) {
    /** @type {string} Description of property */
    this.property = param;
  }
}
```

## Pull Request Process

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Submit a pull request** with a clear description of:
   - What the change accomplishes
   - How it was implemented
   - How it was tested
   - Any potential concerns or limitations

The maintainers will review your changes and provide feedback. Once approved, your changes will be merged into the main branch.

## Questions or Issues?

If you have questions about contributing, please open an issue on GitHub, and a maintainer will assist you.

Happy coding!