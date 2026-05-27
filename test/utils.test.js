const { convertMinutesToHours, capitalizeFirstLetter } = require('../dist/utils') || require('../src/utils');

describe('utils', () => {
  test('convertMinutesToHours formats minutes correctly', () => {
    expect(convertMinutesToHours(0)).toBe('0h 0m');
    expect(convertMinutesToHours(59)).toBe('0h 59m');
    expect(convertMinutesToHours(60)).toBe('1h 0m');
    expect(convertMinutesToHours(125)).toBe('2h 5m');
  });

  test('capitalizeFirstLetter capitalizes string', () => {
    expect(capitalizeFirstLetter('hello')).toBe('Hello');
    expect(capitalizeFirstLetter('Hello')).toBe('Hello');
    expect(capitalizeFirstLetter('')).toBe('');
  });
});
