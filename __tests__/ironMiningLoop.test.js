const { mainLoop, getIronOreCount, hasEnoughIronOre } = require('../iron-mining-loop');
const { getCharacterDetails, moveCharacter, gatheringAction, craftingAction, depositAllItems } = require('../api');

jest.mock('../api');

describe('Iron Mining Loop', () => {
  const characterName = 'testCharacter';
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.control_character = characterName;
    
    // Default mock responses
    getCharacterDetails.mockResolvedValue({
      x: 1,
      y: 7,
      inventory: [],
      cooldown: 0,
      inventory_max_items: 20
    });
    moveCharacter.mockResolvedValue({ success: true });
    gatheringAction.mockResolvedValue({ resources: [{ code: 'iron_ore', quantity: 1 }] });
    craftingAction.mockResolvedValue({ success: true });
    depositAllItems.mockResolvedValue({ success: true });
  });

  describe('Utility Functions', () => {
    test('getIronOreCount returns correct count', async () => {
      getCharacterDetails.mockResolvedValue({
        inventory: [{ code: 'iron_ore', quantity: 5 }]
      });
      const count = await getIronOreCount();
      expect(count).toBe(5);
    });

    test('hasEnoughIronOre returns true when target is met', async () => {
      getCharacterDetails.mockResolvedValue({
        inventory: [{ code: 'iron_ore', quantity: 100 }]
      });
      const hasEnough = await hasEnoughIronOre();
      expect(hasEnough).toBe(true);
    });
  });

  describe('Main Loop', () => {
    test('completes one mining cycle', async () => {
      await mainLoop();
      
      expect(getCharacterDetails).toHaveBeenCalled();
      expect(moveCharacter).toHaveBeenCalledWith(1, 7, characterName);
      expect(gatheringAction).toHaveBeenCalled();
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

    test('completes full mining loop', async () => {
      await mainLoop();

      expect(moveCharacter).toHaveBeenCalledWith(1, 7, characterName);
      expect(gatheringAction).toHaveBeenCalled();
      expect(craftingAction).toHaveBeenCalled();
      expect(depositAllItems).toHaveBeenCalled();
    });
  });
});
