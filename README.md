# ArtifactsMMO API Client

A simple Node.js client for interacting with the ArtifactsMMO API.

## Files

- `config.js` - Configuration settings for the API
- `api.js` - API utility functions and request handling
- `index.js` - Example of character movement
- `fight.js` - Example of character fighting
- `gathering.js` - Example of resource gathering
- `gathering-loop.js` - Example of continuous resource gathering with cooldown handling
- `go-gather-loop.js` - Example of moving to coordinates and then performing gathering actions in a loop
- `go-fight-heal-loop.js` - Example of moving to coordinates and then performing fight-heal actions in a loop
- `rest.js` - Example of character resting to recover HP
- `crafting.js` - Example of crafting items
- `recycling.js` - Example of recycling items from inventory
- `unequip.js` - Example of unequipping items from equipment slots
- `equip.js` - Example of equipping items to equipment slots

## Usage

### Setup

1. Edit `config.js` to set your character name if needed
2. The API token is already configured

### Running the examples

To move your character:
```
node index.js
```
or
```
npm start
```

To initiate a fight:
```
node fight.js
```
or
```
npm run fight
```

To gather resources (must be at a location with resources):
```
node gathering.js
```
or
```
npm run gather
```

Note: The gathering action will only work if your character is at a location with resources to gather. You may need to move your character to a resource location first using the movement action.

To continuously gather resources (with automatic cooldown handling):
```
node gathering-loop.js
```
or
```
npm run gather-loop
```

Note: The continuous gathering will automatically wait for cooldowns and retry until resources are depleted or inventory is full. Press Ctrl+C to stop the script at any time.

To move to coordinates and perform gathering actions in a loop:
```
node go-gather-loop.js <x> <y> <numberOfGathers>
```
or
```
node go-gather-loop.js "(x,y)" <numberOfGathers>
```
or
```
npm run go-gather-loop -- <x> <y> <numberOfGathers>
```
or
```
npm run go-gather-loop -- "(x,y)" <numberOfGathers>
```

Examples:
- `node go-gather-loop.js 2 0 5` - Move to coordinates (2, 0) and perform 5 gathering actions
- `node go-gather-loop.js "(2,0)" 5` - Same as above but with coordinates in string format
- `npm run go-gather-loop -- 2 0 5` - Using npm run with separate coordinates
- `npm run go-gather-loop -- "(2,0)" 5` - Using npm run with coordinates as a string

Note: This script combines movement and gathering in one operation. It will first move your character to the specified coordinates, then perform the specified number of gathering actions, waiting for cooldowns as needed.

To move to coordinates and perform fight-heal actions in a loop:
```
node go-fight-heal-loop.js <x> <y>
```
or
```
node go-fight-heal-loop.js "(x,y)"
```
or
```
npm run go-fight-heal-loop -- <x> <y>
```
or
```
npm run go-fight-heal-loop -- "(x,y)"
```

Examples:
- `node go-fight-heal-loop.js 2 0` - Move to coordinates (2, 0) and perform continuous fight-heal actions
- `node go-fight-heal-loop.js "(2,0)"` - Same as above but with coordinates in string format
- `npm run go-fight-heal-loop -- 2 0` - Using npm run with separate coordinates
- `npm run go-fight-heal-loop -- "(2,0)"` - Using npm run with coordinates as a string

Note: This script combines movement and fighting in one operation. It will first move your character to the specified coordinates, then perform continuous fight actions, healing after each fight to maintain full health. The script will check for cooldowns before each action and wait if necessary. Press Ctrl+C to stop the script at any time.

To rest and recover HP:
```
node rest.js
```
or
```
npm run rest
```

To craft items:
```
node crafting.js [code] [quantity]
```
or
```
npm run craft -- [code] [quantity]
```

Example: `node crafting.js WOODEN_SWORD 1` or `npm run craft -- WOODEN_SWORD 1`

Note: 
- The code parameter represents the crafting recipe code. If not provided, 'ITEM' will be used as the default.
- You will need to know the correct recipe codes that are available in the game.

To recycle items from your inventory:
```
node recycling.js <item_code> [quantity]
```
or
```
npm run recycle -- <item_code> [quantity]
```

Example: `node recycling.js STONE 5` or `npm run recycle -- STONE 5`

Note:
- The item_code parameter is required and represents the code of the item you want to recycle.
- If no quantity is specified, 1 will be used by default.
- Recycling items will convert them into resources that can be used for crafting.
- The script will check for cooldowns before recycling and wait if necessary.

To unequip items from equipment slots:
```
node unequip.js [slot]
```
or
```
npm run unequip -- [slot]
```

Example: `node unequip.js weapon` or `npm run unequip -- shield`

Available slots: weapon, shield, helmet, body_armor, leg_armor, boots, ring1, ring2, amulet, artifact1, artifact2, artifact3

Note: If no slot is specified, the weapon slot will be unequipped by default.

To equip items to equipment slots:
```
node equip.js <item_code> [slot] [quantity]
```
or
```
npm run equip -- <item_code> [slot] [quantity]
```

Example: `node equip.js WOODEN_SWORD weapon 1` or `npm run equip -- WOODEN_SWORD shield 1`

Available slots: weapon, shield, helmet, body_armor, leg_armor, boots, ring1, ring2, amulet, artifact1, artifact2, artifact3

Note: 
- The item_code parameter is required and represents the code of the item you want to equip.
- If no slot is specified, the weapon slot will be used by default.
- If no quantity is specified, 1 will be used by default.

## Code Improvements

The code has been refactored with the following improvements:

1. **Modular Structure**
   - Separated configuration from implementation
   - Created reusable API utility functions
   - Improved code organization

2. **Better Error Handling**
   - Added input validation
   - Improved error messages
   - HTTP status code checking
   - Proper error propagation

3. **Security Enhancements**
   - URL encoding to prevent injection
   - Centralized token management
   - Comments about environment variable usage for production

4. **Code Quality**
   - Added JSDoc comments
   - Consistent coding style
   - Fixed the undefined body issue in fight.js
   - Proper JSON serialization

## Future Improvements

1. Move sensitive data (token) to environment variables
2. Add rate limiting for API calls
3. Implement retry logic for failed requests
4. Add more comprehensive error handling
5. Create a proper CLI interface for easier usage
