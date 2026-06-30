require('./setup');

beforeAll(() => {
  loadScript('schema.js');
});

describe('Runtime Schema Validation', () => {
  test('validateRow cleans types and fills defaults correctly', () => {
    const dirtyRow = {
      date: '2026-06-25',
      prices: { petrol: '110.50', diesel: '95.20' }, // strings
      du1_p: { open: '10000', close_day: 10500, close_night: '11000' }, // mixed string/number, missing tests
      du1_d: null, // missing object
      du2_p: {},
      du2_d: {}
    };

    const cleanRow = RKSKSchema.validateRow(dirtyRow);

    expect(cleanRow.date).toBe('2026-06-25');
    expect(cleanRow.prices.petrol).toBe(110.5);
    expect(cleanRow.prices.diesel).toBe(95.2);
    expect(cleanRow.du1_p.open).toBe(10000);
    expect(cleanRow.du1_p.close_night).toBe(11000);
    expect(cleanRow.du1_p.tests_day).toBe(0); // filled default
    expect(cleanRow.du1_d.open).toBe(0); // created fallback object
  });

  test('validateRow throws error on invalid dates', () => {
    expect(() => {
      RKSKSchema.validateRow({ date: 'invalid-date' });
    }).toThrow();

    expect(() => {
      RKSKSchema.validateRow(null);
    }).toThrow();
  });

  test('validateSettings returns fallback object on invalid input', () => {
    const result = RKSKSchema.validateSettings(null);
    expect(result.petrol_capacity).toBe(20000);
    expect(result.safety_stock).toBe(2500);

    const partialSettings = { safety_stock: '3000' };
    const result2 = RKSKSchema.validateSettings(partialSettings);
    expect(result2.safety_stock).toBe(3000);
    expect(result2.petrol_capacity).toBe(20000); // defaulted
  });
});
