const { mainLoop, getSpruceWoodCount, hasEnoughSpruceWood } = require('../spruce-harvesting-loop');
const { getCharacterDetails, moveCharacter, gatheringAction, craftingAction, depositAllItems } = require('../api');

jest.mock('../api');

describe('Spruce Harvesting Loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock responses
    getCharacterDetails.mockResolvedValue({
      x: 2,
      y: 6,
      inventory: [],
      cooldown: 0,
      inventory_max_items: 20
    });
    moveCharacter.mockResolvedValue({ success: true });
    gatheringAction.mockResolvedValue({ resources: [{ code: 'spruce_wood', quantity: 1 }] });
    craftingAction.mockResolvedValue({ success: true });
    depositAllItems.mockResolvedValue({ success: true });
  });

  describe('Utility Functions', () => {
    test('getSpruceWoodCount returns correct count', async () => {
      getCharacterDetails.mockResolvedValue({
        inventory: [{ code: 'spruce_wood', quantity: 5 }]
      });
      const count = await getSpruceWoodCount();
      expect(count).toBe(5);
    });

    test('hasEnoughSpruceWood returns true when target is met', async () => {
      getCharacterDetails.mockResolvedValue({
        inventory: [{ code: 'spruce_wood', quantity: 100 }]
      });
      const hasEnough = await hasEnoughSpruceWood();
      expect(hasEnough).toBe(true);
    });
  });

  describe('Main Loop', () => {
    test('completes one harvesting cycle', async () => {
      await mainLoop();
      
      expect(getCharacterDetails).toHaveBeenCalled();
      expect(moveCharacter).toHaveBeenCalledWith(2, 6);
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('handles inventory full error', async () => {
      gatheringAction.mockRejectedValue(new Error('inventory is full'));
      await mainLoop();
      expect(gatheringAction).toHaveBeenCalled();
    });

    test('completes full harvesting loop', async () => {
      await mainLoop();

      expect(moveCharacter).toHaveBeenCalledWith(2, 6);
      expect(gatheringAction).toHaveBeenCalled();
      expect(craftingAction).toHaveBeenCalled();
      expect(depositAllItems).toHaveBeenCalled();
    });
  });
});
