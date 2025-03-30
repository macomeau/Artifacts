# ArtifactsMMO Client - Development Guidelines

## Code Style Guidelines
- **Imports**: Prefer CommonJS `require()` for module imports
- **Function Style**: Use async/await for asynchronous code
- **Error Handling**: Always use try/catch blocks for API calls with specific error messages
- **Documentation**: Use JSDoc for function documentation with parameter types
- **Logging**: Use console.log/error for basic logging with descriptive messages
- **Naming**: Use camelCase for variables/functions, PascalCase for classes
- **Database**: Use parameterized queries with the pg pool for database operations
- **Environment**: Use environment variables via dotenv for configuration
- **Validation**: Always validate function parameters before API calls

## JSDoc Conventions

### File Headers

Every JavaScript file should start with a file header:

```javascript
/**
 * @fileoverview Brief description of the file's purpose.
 * @module ModuleName
 */
```

### Classes

Document classes with a description and any inheritance:

```javascript
/**
 * Description of the class.
 * @class
 * @extends ParentClass
 */
class MyClass extends ParentClass {
```

### Constructor

Document the constructor with parameters:

```javascript
/**
 * Create a new instance.
 * @param {string} param1 - Description of param1.
 * @param {number} [param2=defaultValue] - Description of optional param2 with default value.
 * @throws {Error} When something goes wrong.
 */
constructor(param1, param2 = defaultValue) {
```

### Properties

Document class properties using inline comments:

```javascript
/** @type {string} Description of property */
this.myProperty = 'value';
```

### Methods

Document methods with description, parameters, return values, and exceptions:

```javascript
/**
 * Description of what the method does.
 * @param {string} param1 - Description of param1.
 * @param {Object} param2 - Description of param2.
 * @param {string} param2.subparam - Description of nested parameter.
 * @returns {Promise<number>} Description of the return value.
 * @throws {Error} Description of when exceptions are thrown.
 */
async myMethod(param1, param2) {
```

### Functions

Document functions similar to methods:

```javascript
/**
 * Description of what the function does.
 * @param {string} param - Description of param.
 * @returns {boolean} Description of the return value.
 */
function myFunction(param) {
```

### Module Exports

Document module exports:

```javascript
/**
 * Module exports
 * @exports module-name
 */
module.exports = {
  /**
   * Brief description of exported function
   */
  exportedFunction,
  
  /**
   * Brief description of exported object
   * @type {Object}
   */
  exportedObject
};
```

### TypeScript-style Types

Use TypeScript-style annotations for complex types:

```javascript
/**
 * @typedef {Object} User
 * @property {string} name - The user's name
 * @property {number} age - The user's age
 * @property {string[]} roles - The user's roles
 */

/**
 * @param {User} user - User information
 */
function processUser(user) {
```

### Promises and Async Functions

For asynchronous functions, document the wrapped return type:

```javascript
/**
 * @returns {Promise<Array<string>>} A promise that resolves to an array of strings
 */
async function fetchItems() {
```

## Best Practices

1. Be concise but complete in descriptions
2. Document all parameters, even if their purpose seems obvious
3. Specify thrown exceptions 
4. Use `@private`, `@protected`, or `@public` to indicate method visibility
5. Document complex code blocks with inline comments
6. Update documentation when changing code

## Examples

See the copper-mining-loop.js, db.js, and go-deposit-all.js files for practical examples of these conventions in use.