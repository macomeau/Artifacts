/**
 * @fileoverview Tests for the API module and related classes like BaseLoop
 */

// --- Mock Setup ---

// Mock the config module
jest.mock('../config', () => ({
  server: 'http://mockserver.com',
  token: 'mock-token',
  character: 'DefaultTestChar' // Default character for tests if none provided
}));

// Mock the db module to prevent actual database calls during tests
const mockDbQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPruneOldLogs = jest.fn().mockResolvedValue();
jest.mock('../db', () => ({
  query: mockDbQuery,
  pruneOldLogs: mockPruneOldLogs,
  // Mock createTables if it's called during import/initialization
  createTables: jest.fn().mockResolvedValue()
}));

// Mock the utils module, especially sleep
const mockSleep = jest.fn().mockResolvedValue();
jest.mock('../utils', () => ({
  sleep: mockSleep,
  handleCooldown: jest.fn(async (cooldownSeconds) => {
    if (cooldownSeconds > 0) {
      // Use the mockSleep defined above
      await mockSleep(cooldownSeconds * 1000 + 500); // Add buffer in mock
    }
  }),
  extractCooldownTime: jest.fn((error) => { // Basic mock for extractCooldownTime
      if (error?.message?.includes('cooldown:')) {
          const match = error.message.match(/cooldown: (\d+\.?\d*)/);
          if (match && match[1]) return parseFloat(match[1]);
      }
      // Add check for the specific format used in go-deposit-all.js and api.js
      if (error?.message?.includes('Character in cooldown:')) {
          const match = error.message.match(/Character in cooldown: (\d+\.?\d*) seconds left/);
          if (match && match[1]) return parseFloat(match[1]);
      }
      return 0;
  }),
  // Add mocks for other utils if needed, e.g., checkInventory
  checkInventory: jest.fn().mockResolvedValue(false), // Default mock assumes inventory not full
  withRetry: jest.fn(async (fn) => fn()), // Simple mock for withRetry, just executes the function once
}));

// Mock the go-deposit-all module specifically for the BaseLoop test
const mockDepositAllItems = jest.fn().mockResolvedValue({ success: true }); // Default mock
jest.mock('../go-deposit-all', () => ({
    depositAllItems: mockDepositAllItems,
    // Mock other exports if BaseLoop uses them
}));


// --- Enhanced Fetch Mock ---

// Store mock responses keyed by URL/method pattern
const mockResponses = {};

/**
 * Helper to set up a mock response for a specific fetch call.
 * Can accept a function for dynamic responses.
 * @param {string|RegExp} urlPattern - URL string or RegExp to match.
 * @param {string} method - HTTP method (e.g., 'GET', 'POST').
 * @param {object|Function} response - The response object { ok: boolean, status?: number, json?: object, text?: string } OR a function returning this object.
 */
const setMockResponse = (urlPattern, method, response) => {
  const key = `${method}_${urlPattern.toString()}`;
  mockResponses[key] = response;
};

// Global fetch mock implementation
global.fetch = jest.fn(async (url, options) => {
  const method = options?.method || 'GET';
  console.log(`[MOCK FETCH] Called: ${method} ${url}`); // Log mock calls for debugging tests

  // Find a matching mock response
  for (const key in mockResponses) {
    // Split only on the first underscore to handle URLs containing underscores
    const [respMethod, respUrlPatternStr] = key.split(/_(.+)/);
    let isMatch = false;
    if (respMethod === method) {
      // Check if respUrlPatternStr is a RegExp string or plain string
      if (respUrlPatternStr.startsWith('/') && respUrlPatternStr.endsWith('/')) {
        try {
            const regex = new RegExp(respUrlPatternStr.slice(1, -1));
            if (regex.test(url)) {
              isMatch = true;
            }
        } catch (e) {
            console.error(`[MOCK FETCH] Invalid regex pattern: ${respUrlPatternStr}`);
        }
      } else if (url.includes(respUrlPatternStr)) { // Simple substring match for plain strings
        isMatch = true;
      }
    }

    if (isMatch) {
      let mock = mockResponses[key];
      // If the mock is a function, call it to get the dynamic response
      if (typeof mock === 'function') {
          mock = await mock(url, options);
      }

      console.log(`[MOCK FETCH] Matched: ${key}, Returning:`, mock);
      // Simulate network delay slightly
      await new Promise(res => setTimeout(res, 5)); // Reduced delay
      return Promise.resolve({
        ok: mock.ok,
        status: mock.status || (mock.ok ? 200 : 400),
        json: async () => mock.json || {},
        text: async () => mock.text || JSON.stringify(mock.json) || '',
      });
    }
  }

  // Default fallback if no mock is found
  console.error(`[MOCK FETCH] No mock response found for ${method} ${url}`);
  return Promise.resolve({
    ok: false,
    status: 404,
    text: async () => `Mock API endpoint not found: ${method} ${url}`,
  });
});

// --- New Test Suite for go-deposit-all ---
describe('go-deposit-all Module', () => {
    const characterName = 'DepositTester';
    const bankCoords = { x: 4, y: 1 }; // As defined in go-deposit-all main()
    let goDepositAll; // To require the module within tests
    let localApi; // To hold the api module required in this scope

    beforeEach(() => {
        // Clear mocks
        fetch.mockClear();
        mockDbQuery.mockClear();
        mockSleep.mockClear();
        // Clear utils mocks if they were used directly
        require('../utils').handleCooldown.mockClear();

        for (const key in mockResponses) { delete mockResponses[key]; }

        // Reset modules to ensure mocks are fresh for this suite
        jest.resetModules();
        // Mock dependencies again specifically for this module's test context
        jest.mock('../config', () => ({
          server: 'http://mockserver.com',
          token: 'mock-token',
          character: characterName // Use specific char for these tests
        }));
        // Mock db.query
        jest.mock('../db', () => ({ query: mockDbQuery, createTables: jest.fn().mockResolvedValue() }));
        // Mock utils.sleep used directly in go-deposit-all
        jest.mock('../utils', () => ({
             sleep: mockSleep,
             // Provide mocks for other utils if go-deposit-all uses them
             handleCooldown: jest.fn(async (cooldownSeconds) => { if (cooldownSeconds > 0) await mockSleep(cooldownSeconds * 1000 + 500); }),
             extractCooldownTime: jest.fn().mockReturnValue(0),
        }));

        // Require the modules *after* mocks are set up for this context
        goDepositAll = require('../go-deposit-all');
        localApi = require('../api'); // Use localApi to avoid conflicts with global api variable
        config = require('../config'); // Re-require config for this scope

    });

    test('depositAllItems should deposit items one by one, handling cooldowns and logging', async () => {
        const item1 = { code: 'ITEM_A', quantity: 5 };
        const item2 = { code: 'ITEM_B', quantity: 1 };
        const initialInventory = [item1, null, item2]; // Include an empty slot

        // Mock initial getCharacterDetails (inside depositAllItems)
        setMockResponse(`/characters/${characterName}`, 'GET', {
            ok: true,
            json: () => ({ data: { name: characterName, inventory: initialInventory, cooldown: 0, cooldown_expiration: null, x: bankCoords.x, y: bankCoords.y } })
        });

        // Mock deposit API calls (makeApiRequest) - use a function to track calls and simulate cooldown
        let depositCallCount = 0;
        setMockResponse(`/my/${characterName}/action/bank/deposit`, 'POST', {
            ok: true,
            json: (url, options) => {
                depositCallCount++;
                const body = JSON.parse(options.body);
                // Simulate inventory update (remove deposited item - simplistic)
                const remainingInventory = depositCallCount === 1 ? [null, null, item2] : [null, null, null];
                return {
                    success: true,
                    inventory: remainingInventory, // API returns the updated inventory
                    // Add cooldown only on the first deposit call
                    cooldown: depositCallCount === 1 ? { total_seconds: 3 } : { total_seconds: 0 },
                    character: { name: characterName, x: bankCoords.x, y: bankCoords.y } // Assume still at bank
                };
            }
        });

        await goDepositAll.depositAllItems(characterName); // Call the function under test

        // Expectations:
        // 1. Initial getCharacterDetails called once at the start.
        // 2. Loop runs twice (for item1 and item2).
        // 3. Inside loop: getCharacterDetails called before each deposit (2 times).
        // 4. makeApiRequest('action/bank/deposit') called twice.
        // 5. Cooldown check (getCharacterDetails) after each deposit (2 times).
        // 6. Sleep called once for the cooldown after the first deposit.
        // 7. db.query called twice for inventory snapshots.
        // 8. db.query called twice for action logs.

        const getDetailsCalls = fetch.mock.calls.filter(call => call[0].includes(`/characters/${characterName}`));
        const depositApiCalls = fetch.mock.calls.filter(call => call[0].includes('/action/bank/deposit'));

        // Total getDetails calls: 1 (start) + 2 (before deposit) + 2 (after deposit) = 5
        expect(getDetailsCalls.length).toBe(5);
        expect(depositApiCalls.length).toBe(2);

        // Check deposit API call bodies (makeApiRequest adds character name automatically)
        expect(depositApiCalls[0][1].body).toBe(JSON.stringify({ code: item1.code, quantity: item1.quantity }));
        expect(depositApiCalls[1][1].body).toBe(JSON.stringify({ code: item2.code, quantity: item2.quantity }));

        // Check sleep was called for the 3s cooldown + buffer
        expect(mockSleep).toHaveBeenCalledTimes(1 + 1); // 1 for cooldown, 1 for default delay after second deposit
        expect(mockSleep).toHaveBeenCalledWith(3000 + 500); // Cooldown wait
        expect(mockSleep).toHaveBeenCalledWith(500); // Default delay

        // Check db logging calls
        const snapshotLogs = mockDbQuery.mock.calls.filter(call => call[0].includes('inventory_snapshots'));
        const actionLogs = mockDbQuery.mock.calls.filter(call => call[0].includes('action_logs') && call[1].includes('bank_deposit'));

        expect(snapshotLogs.length).toBe(2); // One snapshot per successful deposit
        expect(actionLogs.length).toBe(2); // One action log per successful deposit

        // Check log contents (example for first deposit)
        // Snapshot log uses the inventory returned by the API call
        expect(snapshotLogs[0][1]).toEqual([characterName, JSON.stringify([null, null, item2])]);
        // Action log contains item details
        expect(actionLogs[0][1]).toEqual([characterName, 'bank_deposit', { item: item1.code, quantity: item1.quantity }]);
    });

     test('depositAllItems should handle initial cooldown before starting', async () => {
        const item1 = { code: 'ITEM_A', quantity: 5 };
        const initialCooldown = 4.5;

        // Mock initial getCharacterDetails (inside depositAllItems) - WITH cooldown
        setMockResponse(`/characters/${characterName}`, 'GET', {
            ok: true,
            json: () => ({ data: { name: characterName, inventory: [item1], cooldown: initialCooldown, cooldown_expiration: new Date(Date.now() + initialCooldown * 1000).toISOString(), x: bankCoords.x, y: bankCoords.y } })
        });
        // Mock deposit call
        setMockResponse(`/my/${characterName}/action/bank/deposit`, 'POST', { ok: true, json: { success: true, inventory: [], cooldown: { total_seconds: 0 }, character: { name: characterName, x: bankCoords.x, y: bankCoords.y } } });

        await goDepositAll.depositAllItems(characterName);

        // Check that sleep was called for the initial cooldown
        expect(mockSleep).toHaveBeenCalledWith(initialCooldown * 1000 + 500);

        // Ensure deposit still happened after cooldown
        const depositApiCalls = fetch.mock.calls.filter(call => call[0].includes('/action/bank/deposit'));
        expect(depositApiCalls.length).toBe(1);
    });

    test('depositAllItems should skip deposit if inventory is empty', async () => {
         // Mock initial getCharacterDetails (empty inventory)
        setMockResponse(`/characters/${characterName}`, 'GET', {
            ok: true,
            json: () => ({ data: { name: characterName, inventory: [], cooldown: 0, cooldown_expiration: null, x: bankCoords.x, y: bankCoords.y } })
        });

        await goDepositAll.depositAllItems(characterName);

        // Ensure only the initial getDetails call was made
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/characters/${characterName}`), expect.any(Object));

        // Ensure no deposit API calls were made
        const depositApiCalls = fetch.mock.calls.filter(call => call[0].includes('/action/bank/deposit'));
        expect(depositApiCalls.length).toBe(0);
        expect(mockDbQuery).not.toHaveBeenCalled(); // No logging either
    });

    // Add test for main function in go-deposit-all (optional, more integration-like)
    test('main function should move and then call depositAllItems', async () => {
        // Mock initial getCharacterDetails (not at bank)
         setMockResponse(`/characters/${characterName}`, 'GET', {
            ok: true,
            json: () => ({ data: { name: characterName, inventory: [{code: 'TEST', quantity: 1}], cooldown: 0, cooldown_expiration: null, x: 0, y: 0 } }) // Start at 0,0
        });
        // Mock moveCharacter API call
        setMockResponse(`/my/${characterName}/action/move`, 'POST', {
            ok: true,
            json: { success: true, character: { name: characterName, x: bankCoords.x, y: bankCoords.y }, cooldown: { total_seconds: 2 } }
        });
         // Mock deposit API call (will be called by depositAllItems)
        setMockResponse(`/my/${characterName}/action/bank/deposit`, 'POST', { ok: true, json: { success: true, inventory: [], cooldown: { total_seconds: 0 }, character: { name: characterName, x: bankCoords.x, y: bankCoords.y } } });

        // Spy on the imported depositAllItems to ensure it's called by main
        const depositSpy = jest.spyOn(goDepositAll, 'depositAllItems');

        await goDepositAll.main(); // Execute the main function

        // Check move call
        const moveCalls = fetch.mock.calls.filter(call => call[0].includes('/action/move'));
        expect(moveCalls.length).toBe(1);
        expect(moveCalls[0][1].body).toBe(JSON.stringify({ x: bankCoords.x, y: bankCoords.y, character: characterName }));

        // Check sleep was called for move cooldown
        expect(mockSleep).toHaveBeenCalledWith(2000 + 500);

        // Check depositAllItems was called
        expect(depositSpy).toHaveBeenCalledTimes(1);

        depositSpy.mockRestore();
    });

});

describe('BaseLoop Class', () => {
  let loop;
  const characterName = 'LoopTester';
  // Use a function for mock details to get fresh object each time
  const getMockCharDetails = (overrides = {}) => ({
      name: characterName, x: 1, y: 2, hp: 100, max_hp: 100, inventory: [], inventory_max_items: 10, cooldown: 0, cooldown_expiration: null,
      ...overrides
  });

  beforeEach(() => {
    // Clear mocks (already done in global beforeEach, but good practice)
    fetch.mockClear();
    mockDbQuery.mockClear();
    mockPruneOldLogs.mockClear();
    mockSleep.mockClear();
    require('../utils').handleCooldown.mockClear();
    require('../utils').checkInventory.mockClear();
    mockDepositAllItems.mockClear(); // Clear deposit mock
    for (const key in mockResponses) { delete mockResponses[key]; }

    // Set up default mocks needed by BaseLoop for this suite
    setMockResponse(`/characters/${characterName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails() }) });

    // Instantiate BaseLoop *after* mocks are set up
    // Need to reset modules because BaseLoop might be cached with old mocks
    jest.resetModules();
    // Re-mock dependencies needed by BaseLoop specifically
     jest.mock('../config', () => ({
      server: 'http://mockserver.com',
      token: 'mock-token',
      character: characterName // Use specific char for these tests
    }));
    jest.mock('../db', () => ({ query: mockDbQuery, pruneOldLogs: mockPruneOldLogs, createTables: jest.fn().mockResolvedValue() }));
    jest.mock('../utils', () => ({
        sleep: mockSleep,
        handleCooldown: require('../utils').handleCooldown, // Use the actual mock function
        extractCooldownTime: require('../utils').extractCooldownTime,
        checkInventory: require('../utils').checkInventory,
        withRetry: require('../utils').withRetry,
    }));
     jest.mock('../go-deposit-all', () => ({ depositAllItems: mockDepositAllItems }));
     api = require('../api'); // Re-require api
     BaseLoop = require('../base-loop'); // Re-require BaseLoop

    loop = new BaseLoop(characterName);
  });

  test('constructor should set character name', () => {
    expect(loop.characterName).toBe(characterName);
    expect(loop.loopCount).toBe(0);
  });

  test('initialize should prune logs and get character details', async () => {
    // Mock pruneOldLogs specifically for this test if needed, otherwise rely on global mock
    // mockPruneOldLogs.mockResolvedValueOnce(); // Example specific mock

    await loop.initialize();

    expect(mockPruneOldLogs).toHaveBeenCalledTimes(1);
    // initialize calls getCharacterDetails
    expect(fetch).toHaveBeenCalledWith(
      `${config.server}/characters/${characterName}`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('handleAction should check details, handle cooldown, execute action', async () => {
    const actionName = 'Test Action';
    const mockActionResult = { success: true, message: 'Action done', cooldown: { total_seconds: 3 } };
    const mockActionFn = jest.fn().mockResolvedValue(mockActionResult); // Mock the function passed to handleAction

    // Mock getCharacterDetails called by handleAction (first time, no cooldown)
    setMockResponse(`/characters/${characterName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails({ cooldown: 0 }) }) });

    const result = await loop.handleAction(mockActionFn, actionName);

    // handleAction calls getCharacterDetails once
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/characters/${characterName}`), expect.any(Object));
    // handleCooldown mock checks the cooldown value (0 in this case)
    expect(require('../utils').handleCooldown).toHaveBeenCalledWith(0);
    // Sleep should not have been called directly by handleCooldown since cooldown is 0
    expect(mockSleep).not.toHaveBeenCalled();
    expect(mockActionFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockActionResult);
    // BaseLoop's handleAction doesn't log directly, it relies on makeApiRequest logging within the actionFn
  });

  test('handleAction should wait for cooldown via handleCooldown', async () => {
      const actionName = 'Test Cooldown Action';
      const cooldownDuration = 7.5;
      const mockActionResult = { success: true, cooldown: { total_seconds: 1 } }; // Action result itself
      const mockActionFn = jest.fn().mockResolvedValue(mockActionResult);

      // Mock getCharacterDetails called by handleAction (returns cooldown)
      setMockResponse(`/characters/${characterName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails({ cooldown: cooldownDuration, cooldown_expiration: new Date(Date.now() + cooldownDuration * 1000).toISOString() }) }) });

      await loop.handleAction(mockActionFn, actionName);

      expect(fetch).toHaveBeenCalledTimes(1); // getCharacterDetails
      // Check if handleCooldown was called with the correct duration
      expect(require('../utils').handleCooldown).toHaveBeenCalledWith(cooldownDuration);
      // Check if sleep was called via handleCooldown mock
      expect(mockSleep).toHaveBeenCalledWith(cooldownDuration * 1000 + 500); // Check for cooldown wait + buffer
      expect(mockActionFn).toHaveBeenCalledTimes(1); // Action should still be called after cooldown
  });

   test('checkAndDeposit should log inventory snapshot with coordinates', async () => {
     const inventory = [{ code: 'ITEM_A', quantity: 5 }];
     const coords = { x: 15, y: -10 };
     // Mock getCharacterDetails to return specific inventory and coords
     setMockResponse(`/characters/${characterName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails({ inventory: inventory, x: coords.x, y: coords.y }) }) });

     await loop.checkAndDeposit(); // This method now only logs snapshot

     expect(fetch).toHaveBeenCalledTimes(1); // getCharacterDetails
     expect(mockDbQuery).toHaveBeenCalledWith(
       expect.stringContaining('INSERT INTO inventory_snapshots'),
       // Ensure ONLY character and items are logged (matching updated base-loop.js and db.js schema)
       [characterName, JSON.stringify(inventory)]
     );
     // checkAndDeposit should not call depositAllItems if inventory is not full (mock checkInventory returns false)
     expect(mockDepositAllItems).not.toHaveBeenCalled();
   });

   test('depositItems should call handleAction with the depositAllItems function', async () => {
        // Mock getCharacterDetails for handleAction's initial cooldown check
        setMockResponse(`/characters/${characterName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails({ cooldown: 0 }) }) });

        // Spy on handleAction to check the function passed to it
        const handleActionSpy = jest.spyOn(loop, 'handleAction');

        // Execute depositItems
        await loop.depositItems();

        // Verify handleAction was called
        expect(handleActionSpy).toHaveBeenCalledTimes(1);
        // The function passed should be the one calling depositAllItems
        expect(handleActionSpy).toHaveBeenCalledWith(expect.any(Function), 'Deposit');

        // Verify that the function passed to handleAction, when called, calls the mocked depositAllItems
        const actionFn = handleActionSpy.mock.calls[0][0]; // Get the function passed to handleAction
        await actionFn(); // Execute the function that should call depositAllItems

        // Check that the mocked depositAllItems (from the jest.mock setup) was called
        expect(mockDepositAllItems).toHaveBeenCalledWith(characterName);

        // Clean up spies and mocks
        handleActionSpy.mockRestore();
   });


   test('startLoop should increment count and log loop start with coordinates', async () => {
        const startCoords = { x: 5, y: 5 };
        // Mock getCharacterDetails to return specific coords for startLoop
        setMockResponse(`/characters/${characterName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails({ x: startCoords.x, y: startCoords.y }) }) });

        expect(loop.loopCount).toBe(0);
        await loop.startLoop();
        expect(loop.loopCount).toBe(1);

        expect(fetch).toHaveBeenCalledTimes(1); // getCharacterDetails
        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO action_logs'),
            expect.arrayContaining([
                characterName,
                'loop_start', // action_type
                startCoords.x, // coordinate x
                startCoords.y, // coordinate y
                expect.objectContaining({ loop: 1 }) // result JSONB
            ])
        );

        // Call again to check increment
        await loop.startLoop();
        expect(loop.loopCount).toBe(2);
         expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO action_logs'),
            expect.arrayContaining([
                characterName,
                'loop_start',
                startCoords.x,
                startCoords.y,
                expect.objectContaining({ loop: 2 })
            ])
        );
   });

});


// --- Required Modules (After Mocks) ---
// Needs to be required after mocks are set up
const api = require('../api'); // Now includes healCharacter etc.
const BaseLoop = require('../base-loop'); // Import BaseLoop for testing
const config = require('../config'); // Re-require config if needed after mock setup

// --- Test Setup ---
beforeEach(() => {
  // Clear mock history and responses before each test
  fetch.mockClear();
  mockDbQuery.mockClear();
  mockPruneOldLogs.mockClear();
  mockSleep.mockClear();
  // Clear mocks from utils
  require('../utils').handleCooldown.mockClear();
  require('../utils').extractCooldownTime.mockClear();
  require('../utils').checkInventory.mockClear();
  require('../utils').withRetry.mockClear();
  // Clear mock for depositAllItems
  mockDepositAllItems.mockClear();

  // Clear all predefined mock responses
  for (const key in mockResponses) {
    delete mockResponses[key];
  }
  // Set default NODE_ENV for tests
  process.env.NODE_ENV = 'test';
});

// --- Test Suites ---

describe('API Functions', () => {

  // Test sanitizeCharacterName implicitly via other tests using character names

  test('makeApiRequest should call fetch with correct parameters and auth', async () => {
    const endpoint = 'test/endpoint';
    const method = 'POST';
    const body = { data: 'value' };
    const charName = 'TestCharMake';
    const mockResponse = { success: true, character: { name: charName, x: 0, y: 0 } }; // Include coords for logging

    setMockResponse(`/my/${charName}/${endpoint}`, method, { ok: true, json: mockResponse });

    await api.makeApiRequest(endpoint, method, body, charName);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `${config.server}/my/${charName}/${endpoint}`,
      expect.objectContaining({
        method: method,
        headers: expect.objectContaining({
          'Authorization': `Bearer ${config.token}`, // Check token from mocked config
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(body)
      })
    );
    // Check db log
    expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO action_logs'),
        expect.arrayContaining([charName, endpoint, 0, 0, expect.any(Object)]) // Check coords from response
    );
  });

  test('getCharacterDetails should call the public endpoint and return data', async () => {
    const charName = 'TestCharDetail';
    const mockCharData = { name: charName, hp: 50, max_hp: 100, x: 1, y: 2, inventory: [], inventory_max_items: 10, cooldown: 0 };
    // Note: getCharacterDetails uses the /characters/ endpoint, not /my/
    setMockResponse(`/characters/${charName}`, 'GET', { ok: true, json: { data: mockCharData } });

    const details = await api.getCharacterDetails(charName);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `${config.server}/characters/${charName}`, // Public endpoint
      expect.objectContaining({ method: 'GET' }) // No Auth header needed
    );
    expect(details).toEqual(mockCharData);
    // Ensure db query was NOT called for getCharacterDetails
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  test('moveCharacter should call the move endpoint with correct body', async () => {
    const charName = 'TestCharMove';
    const targetX = 5;
    const targetY = 10;
    const mockResponse = {
        success: true,
        character: { name: charName, x: targetX, y: targetY, hp: 100, max_hp: 100 },
        cooldown: { total_seconds: 5 }
    };
    setMockResponse(`/my/${charName}/action/move`, 'POST', { ok: true, json: mockResponse });

    const result = await api.moveCharacter(targetX, targetY, charName);

    expect(fetch).toHaveBeenCalledTimes(1); // Only the move call
    expect(fetch).toHaveBeenCalledWith(
      `${config.server}/my/${charName}/action/move`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ x: targetX, y: targetY, character: charName }) // Ensure character name is in body
      })
    );
    expect(result).toEqual(expect.objectContaining(mockResponse));
    // Check if action log was called via db.query using coords from response
    expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO action_logs'),
        expect.arrayContaining([charName, 'action/move', targetX, targetY, expect.any(Object)])
    );
  });

   test('fightAction should call the fight endpoint', async () => {
     const charName = 'TestCharFight';
     const mockResponse = {
       success: true,
       enemy: { name: 'Goblin' },
       character: { name: charName, hp: 90, max_hp: 100, x: 1, y: 1 }, // Coords in response
       cooldown: { total_seconds: 10 }
     };
     setMockResponse(`/my/${charName}/action/fight`, 'POST', { ok: true, json: mockResponse });

     const result = await api.fightAction(charName);

     expect(fetch).toHaveBeenCalledTimes(1);
     expect(fetch).toHaveBeenCalledWith(
       `${config.server}/my/${charName}/action/fight`,
       expect.objectContaining({ method: 'POST', body: JSON.stringify({ character: charName }) })
     );
     expect(result).toEqual(expect.objectContaining(mockResponse));
     expect(mockDbQuery).toHaveBeenCalledWith(
         expect.stringContaining('INSERT INTO action_logs'),
         expect.arrayContaining([charName, 'action/fight', 1, 1, expect.any(Object)]) // Use coords from response
     );
   });

   // Add similar tests for gatheringAction, miningAction, restAction, craftingAction, smeltingAction etc.
   test('gatheringAction should call the gathering endpoint', async () => {
     const charName = 'TestCharGather';
     const mockResponse = { success: true, resources: [{ code: 'WOOD', quantity: 1 }], character: { name: charName, x: 2, y: 3 }, cooldown: { total_seconds: 5 } };
     setMockResponse(`/my/${charName}/action/gathering`, 'POST', { ok: true, json: mockResponse });
     await api.gatheringAction(charName);
     expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/action/gathering'), expect.objectContaining({ method: 'POST' }));
     expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO action_logs'), expect.arrayContaining([charName, 'action/gathering', 2, 3]));
   });

   test('miningAction should call the mining endpoint', async () => {
     const charName = 'TestCharMine';
     const mockResponse = { success: true, resources: [{ code: 'IRON_ORE', quantity: 1 }], character: { name: charName, x: 4, y: 5 }, cooldown: { total_seconds: 8 } };
     setMockResponse(`/my/${charName}/action/mining`, 'POST', { ok: true, json: mockResponse });
     await api.miningAction(charName);
     expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/action/mining'), expect.objectContaining({ method: 'POST' }));
     expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO action_logs'), expect.arrayContaining([charName, 'action/mining', 4, 5]));
   });

   test('restAction should call the rest endpoint', async () => {
     const charName = 'TestCharRest';
     const mockResponse = { success: true, character: { name: charName, hp: 100, max_hp: 100, x: 6, y: 7 }, cooldown: { total_seconds: 1 } };
     setMockResponse(`/my/${charName}/action/rest`, 'POST', { ok: true, json: mockResponse });
     await api.restAction(charName);
     expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/action/rest'), expect.objectContaining({ method: 'POST' }));
     expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO action_logs'), expect.arrayContaining([charName, 'action/rest', 6, 7]));
   });

   test('craftingAction should call the crafting endpoint', async () => {
     const charName = 'TestCharCraft';
     const itemCode = 'WOODEN_SWORD';
     const quantity = 2;
     const mockResponse = { success: true, inventory: [{ code: itemCode, quantity: quantity }], character: { name: charName, x: 8, y: 9 }, cooldown: { total_seconds: 15 } };
     setMockResponse(`/my/${charName}/action/crafting`, 'POST', { ok: true, json: mockResponse });
     await api.craftingAction(itemCode, quantity, undefined, charName); // Pass undefined for material if not used
     expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/action/crafting'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: itemCode, quantity: quantity, character: charName }) }));
     expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO action_logs'), expect.arrayContaining([charName, 'action/crafting', 8, 9]));
   });

   test('smeltingAction should call the smelting endpoint', async () => {
     const charName = 'TestCharSmelt';
     const itemCode = 'IRON_BAR';
     const quantity = 5;
     const mockResponse = { success: true, inventory: [{ code: itemCode, quantity: quantity }], character: { name: charName, x: 10, y: 11 }, cooldown: { total_seconds: 20 } };
     setMockResponse(`/my/${charName}/action/smelting`, 'POST', { ok: true, json: mockResponse });
     await api.smeltingAction(itemCode, quantity, charName);
     expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/action/smelting'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: itemCode, quantity: quantity, character: charName }) }));
     expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO action_logs'), expect.arrayContaining([charName, 'action/smelting', 10, 11]));
   });


   test('makeApiRequest should handle API errors and log them', async () => {
     const charName = 'TestCharError';
     const endpoint = 'action/fail';
     setMockResponse(`/my/${charName}/${endpoint}`, 'POST', { ok: false, status: 500, text: 'Internal Server Error' });
     // Mock getCharacterDetails for error logging coordinates
     setMockResponse(`/characters/${charName}`, 'GET', { ok: true, json: { data: { name: charName, x: 3, y: 4 } } });

     await expect(api.makeApiRequest(endpoint, 'POST', {}, charName)).rejects.toThrow('API error (500): Internal Server Error');

     expect(fetch).toHaveBeenCalledTimes(2); // API call + getDetails for logging
     expect(fetch).toHaveBeenCalledWith(`${config.server}/my/${charName}/${endpoint}`, expect.any(Object));
     expect(fetch).toHaveBeenCalledWith(`${config.server}/characters/${charName}`, expect.any(Object));

     // Check if error was logged to db
     expect(mockDbQuery).toHaveBeenCalledWith(
       expect.stringContaining('INSERT INTO action_logs'),
       // Error log format: character, action_type, error, coordinates
       expect.arrayContaining([charName, endpoint, 'API error (500): Internal Server Error', 3, 4]) // Coords from mock details
     );
   });

   test('healCharacter should call restAction until HP is full and log', async () => {
        const charName = 'TestCharHeal';
        const maxHp = 100;

        // Initial state: HP is low
        let currentHp = 50;
        const getMockCharDetails = () => ({
            name: charName, hp: currentHp, max_hp: maxHp, x: 1, y: 1, cooldown: 0, cooldown_expiration: null
        });
        const getMockRestResponse = () => {
             const hpBefore = currentHp;
             currentHp = Math.min(maxHp, currentHp + 20); // Heal by 20 HP
             const details = getMockCharDetails();
             return {
                 success: true,
                 character: details, // Rest action returns character object directly
                 cooldown: { total_seconds: 5 } // Simulate cooldown after rest
             };
        };

        // Mock getCharacterDetails - uses function for dynamic HP
        setMockResponse(`/characters/${charName}`, 'GET', { ok: true, json: () => ({ data: getMockCharDetails() }) });

        // Mock restAction - uses function for dynamic HP and response
        setMockResponse(`/my/${charName}/action/rest`, 'POST', { ok: true, json: getMockRestResponse });

        await api.healCharacter(charName);

        // Expectations:
        // 1. Initial getCharacterDetails call
        // 2. Multiple restAction calls until HP is full (50 -> 70 -> 90 -> 100) - 3 calls
        // 3. Cooldown waits between rest calls (mockSleep via handleCooldown/sleep)
        // 4. Logging calls for rest actions (via makeApiRequest) AND specific heal logs

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/characters/${charName}`), expect.any(Object)); // Initial check
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/my/${charName}/action/rest`), expect.any(Object));

        // Check how many times rest was called (should be 3 times to reach 100 from 50)
        const restCalls = fetch.mock.calls.filter(call => call[0].includes('/action/rest'));
        expect(restCalls.length).toBe(3);

        // Check if sleep was called for cooldowns (2 times between 3 rests + maybe initial check)
        expect(mockSleep).toHaveBeenCalledWith(expect.any(Number));
        // Check sleep specifically for the 5s cooldown + buffer
        expect(mockSleep).toHaveBeenCalledWith(5000 + 500);
        expect(mockSleep.mock.calls.length).toBeGreaterThanOrEqual(2); // Should be called at least for the cooldowns between rests

        // Check if logs were made for healing actions (specific heal log)
        const healLogCalls = mockDbQuery.mock.calls.filter(call => call[1].includes('heal'));
        expect(healLogCalls.length).toBe(3); // One log per successful rest in healCharacter loop
        expect(healLogCalls[0][1]).toEqual(expect.arrayContaining([charName, 'heal', expect.objectContaining({ hp_before: 50, hp_after: 70 }), 1, 1]));
        expect(healLogCalls[1][1]).toEqual(expect.arrayContaining([charName, 'heal', expect.objectContaining({ hp_before: 70, hp_after: 90 }), 1, 1]));
        expect(healLogCalls[2][1]).toEqual(expect.arrayContaining([charName, 'heal', expect.objectContaining({ hp_before: 90, hp_after: 100 }), 1, 1]));

        // Check generic action logs for rest calls (made by makeApiRequest)
        const restActionLogs = mockDbQuery.mock.calls.filter(call => call[1].includes('action/rest'));
        expect(restActionLogs.length).toBe(3);

        expect(currentHp).toBe(maxHp); // Final HP should be max
    });

    // Test executeWithCooldown (basic functionality check)
    describe('executeWithCooldown', () => {
        jest.useFakeTimers(); // Use fake timers for executeWithCooldown tests

        afterEach(() => {
            jest.clearAllTimers(); // Clear timers after each test
        });

        afterAll(() => {
            jest.useRealTimers(); // Restore real timers after all tests in this describe block
        });

        it('should execute action and call onSuccess', async () => {
            const mockAction = jest.fn().mockResolvedValue({ cooldown: { total_seconds: 1 } });
            const mockSuccess = jest.fn();

            // Start execution but don't wait indefinitely
            api.executeWithCooldown(mockAction, mockSuccess, null, 1); // Limit to 1 attempt for testing

            // Wait for the action to be called
            await Promise.resolve(); // Allow microtasks to run

            expect(mockAction).toHaveBeenCalledTimes(1);
            expect(mockSuccess).toHaveBeenCalledWith({ cooldown: { total_seconds: 1 } });
        });

        it('should handle errors, call onError, and retry if onError returns true', async () => {
            const mockAction = jest.fn()
                .mockRejectedValueOnce(new Error('Test error'))
                .mockResolvedValue({ cooldown: { total_seconds: 1 } });
            const mockSuccess = jest.fn();
            const mockError = jest.fn().mockResolvedValue(true); // Return true to retry

            // Start execution
            api.executeWithCooldown(mockAction, mockSuccess, mockError, 2); // Limit to 2 attempts

            // First attempt (fails)
            await Promise.resolve(); // Allow microtasks
            expect(mockAction).toHaveBeenCalledTimes(1);
            expect(mockError).toHaveBeenCalledWith(new Error('Test error'), 1);
            expect(mockSuccess).not.toHaveBeenCalled();

            // Advance timers for the retry delay (default 5000ms)
            jest.advanceTimersByTime(5000);
            await Promise.resolve(); // Allow microtasks

            // Second attempt (succeeds)
            expect(mockAction).toHaveBeenCalledTimes(2);
            expect(mockSuccess).toHaveBeenCalledWith({ cooldown: { total_seconds: 1 } });
        });

         it('should handle cooldown errors with specific retry delay', async () => {
            const cooldownSeconds = 3.5;
            const cooldownError = new Error(`Character in cooldown: ${cooldownSeconds} seconds left`);
            const mockAction = jest.fn()
                .mockRejectedValueOnce(cooldownError)
                .mockResolvedValue({ cooldown: { total_seconds: 1 } });
            const mockSuccess = jest.fn();
            // onError should return object with retryDelay for cooldown errors
            const mockError = jest.fn().mockImplementation(async (error) => {
                 const cooldownMatch = error.message.match(/Character in cooldown: (\d+\.\d+) seconds left/);
                 if (cooldownMatch) {
                     return { continueExecution: true, retryDelay: parseFloat(cooldownMatch[1]) * 1000 };
                 }
                 return true; // Default retry for other errors
            });

            api.executeWithCooldown(mockAction, mockSuccess, mockError, 2);

            // First attempt (fails with cooldown)
            await Promise.resolve();
            expect(mockAction).toHaveBeenCalledTimes(1);
            expect(mockError).toHaveBeenCalledWith(cooldownError, 1);
            expect(mockSuccess).not.toHaveBeenCalled();

            // Advance timers by the specific cooldown delay
            jest.advanceTimersByTime(cooldownSeconds * 1000);
            await Promise.resolve();

            // Second attempt (succeeds)
            expect(mockAction).toHaveBeenCalledTimes(2);
            expect(mockSuccess).toHaveBeenCalled();
        });

        it('should stop retrying if onError returns false', async () => {
            const mockAction = jest.fn().mockRejectedValue(new Error('Fatal error'));
            const mockSuccess = jest.fn();
            const mockError = jest.fn().mockResolvedValue(false); // Return false to stop

            api.executeWithCooldown(mockAction, mockSuccess, mockError, 5); // Allow multiple attempts

            // First attempt (fails)
            await Promise.resolve();
            expect(mockAction).toHaveBeenCalledTimes(1);
            expect(mockError).toHaveBeenCalledWith(new Error('Fatal error'), 1);
            expect(mockSuccess).not.toHaveBeenCalled();

            // Advance timers significantly - no more calls should happen
            jest.advanceTimersByTime(100000);
            await Promise.resolve();

            expect(mockAction).toHaveBeenCalledTimes(1); // Should not have retried
        });
    });
});
