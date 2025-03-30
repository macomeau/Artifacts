const { mainLoop, getCopperOreCount, hasEnoughCopperOre } = require('../copper-mining-loop');
const { getCharacterDetails, moveCharacter, gatheringAction, craftingAction, depositAllItems } = require('../api');

jest.mock('../api');

describe('Mining Loop', () => {
  const characterName = 'testCharacter';
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.control_character = characterName;
    
    // Default mock responses
    getCharacterDetails.mockResolvedValue({
      x: 2,
      y: 0,
      inventory: [],
      cooldown: 0,
      inventory_max_items: 20
    });
    moveCharacter.mockResolvedValue({ success: true });
    gatheringAction.mockResolvedValue({ resources: [{ code: 'copper_ore', quantity: 1 }] });
    craftingAction.mockResolvedValue({ success: true });
    depositAllItems.mockResolvedValue({ success: true });
  });

  describe('Utility Functions', () => {
    test('getCopperOreCount returns correct count', async () => {
      getCharacterDetails.mockResolvedValue({
        inventory: [{ code: 'copper_ore', quantity: 5 }]
      });
      const count = await getCopperOreCount();
      expect(count).toBe(5);
    });

    test('hasEnoughCopperOre returns true when target is met', async () => {
      getCharacterDetails.mockResolvedValue({
        inventory: [{ code: 'copper_ore', quantity: 100 }]
      });
      const hasEnough = await hasEnoughCopperOre();
      expect(hasEnough).toBe(true);
    });
  });

  describe('Main Loop', () => {
    test('completes one mining cycle', async () => {
      await mainLoop();
      
      expect(getCharacterDetails).toHaveBeenCalled();
      expect(moveCharacter).toHaveBeenCalledWith(2, 0, characterName);
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('handles cooldown correctly', async () => {
      getCharacterDetails.mockResolvedValue({
        cooldown: 5,
        cooldown_expiration: new Date(Date.now() + 5000)
      });
      
      await mainLoop();
      expect(getCharacterDetails).toHaveBeenCalled();
    });

    test('handles inventory full error', async () => {
      gatheringAction.mockRejectedValue(new Error('inventory is full'));
      await mainLoop();
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('handles resource not found error', async () => {
      gatheringAction.mockRejectedValue(new Error('Resource not found'));
      await mainLoop();
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('handles multiple cooldowns', async () => {
      getCharacterDetails.mockResolvedValue({ 
        cooldown: 5, 
        cooldown_expiration: new Date(Date.now() + 5000) 
      });
      gatheringAction.mockRejectedValue(new Error('Character in cooldown: 5.0 seconds left'));
      await mainLoop();
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('handles API failure', async () => {
      getCharacterDetails.mockRejectedValue(new Error('API unavailable'));
      await expect(mainLoop()).rejects.toThrow('API unavailable');
    });

    test('completes full mining loop', async () => {
      await mainLoop();

      expect(moveCharacter).toHaveBeenCalledWith(2, 0, characterName);
      expect(gatheringAction).toHaveBeenCalled();
      expect(craftingAction).toHaveBeenCalled();
      expect(depositAllItems).toHaveBeenCalled();
    });

    test('handles SIGINT gracefully', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const mockConsole = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      process.emit('SIGINT');
      
      expect(mockConsole).toHaveBeenCalledWith('\nGracefully shutting down...');
      expect(mockExit).toHaveBeenCalledWith(0);
      
      mockExit.mockRestore();
      mockConsole.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    test('stops after max loops', async () => {
      process.env.MAX_LOOPS = '2';
      await mainLoop();
      expect(gatheringAction).toHaveBeenCalledTimes(2);
    });

    test('handles time limit', async () => {
      process.env.TIME_LIMIT = '10'; // 10 seconds
      await mainLoop();
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('handles invalid configuration', async () => {
      process.env.TARGET_COPPER_ORE = 'invalid';
      await expect(mainLoop()).rejects.toThrow('Invalid resource targets');
    });
  });
});
