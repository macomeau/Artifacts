const config = require('../config');

describe('Config', () => {
  it('should use test character name in test environment', () => {
    process.env.NODE_ENV = 'test';
    expect(config.character).toBe('test_character');
  });

  it('should throw error if control_character is not set in non-test environment', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.control_character;
    expect(() => require('../config')).toThrow(
      'control_character environment variable must be set to a valid character name'
    );
  });
});
