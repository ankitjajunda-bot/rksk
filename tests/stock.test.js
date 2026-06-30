require('./setup');

beforeAll(() => {
  loadScript('core_db_ledger.js');
});

describe('Stock & Tanker calculations', () => {
  test('calculateRho15Formula computes density correction correctly', () => {
    // formula: obsD - 0.706 * (obsT - 15)
    // For obsD = 730, obsT = 25 -> 730 - 0.706 * 10 = 722.94
    const result = calculateRho15Formula(730, 25);
    expect(result).toBeCloseTo(722.94, 2);
  });

  test('getDensityAt15 falls back to formula when astmTable is not loaded', () => {
    // Setup global state
    global.astmTable = null;
    const result = getDensityAt15(750, 20);
    expect(result).toBeCloseTo(750 - 0.706 * (20 - 15), 2);
  });

  test('recordTanker updates stock levels and calculates correct WAC', () => {
    // Initial stock setup
    db.stock = {
      petrol: 1000,
      diesel: 2000,
      petrol_cost_wac: 100.0,
      diesel_cost_wac: 80.0
    };

    // recordTanker(dateStr, timeStr, loadType, customP, customD, priceP, priceD)
    // Let's add a full petrol load of 12,000 Liters at price ₹105
    // New WAC = (1000 * 100 + 12000 * 105) / 13000 = (100000 + 1260000) / 13000 = 1360000 / 13000 = 104.615
    global.showNotification = jest.fn();
    global.saveDB = jest.fn();
    global.initApp = jest.fn();

    recordTanker('2026-06-25', '09:00', 'full-petrol', 0, 0, 105.0, 0.0);

    expect(db.stock.petrol).toBe(13000);
    expect(db.stock.petrol_cost_wac).toBeCloseTo(104.615, 3);
    expect(db.stock.diesel).toBe(2000); // unchanged
    expect(db.stock.diesel_cost_wac).toBe(80.0); // unchanged
  });

  test('recordTanker rejects load volume not equal to 12000 liters', () => {
    db.stock = { petrol: 1000, diesel: 1000, petrol_cost_wac: 100.0, diesel_cost_wac: 80.0 };
    global.showNotification = jest.fn();

    // custom load of 5000 + 5000 = 10000 (not 12000)
    recordTanker('2026-06-25', '09:00', 'custom', 5000, 5000, 100.0, 80.0);
    expect(global.showNotification).toHaveBeenCalledWith(expect.stringContaining('Tanker load must equal exactly 12,000 Liters'), 'danger');
    expect(db.stock.petrol).toBe(1000); // stock unchanged
  });

  test('recordTanker rejects non-multiples of 4000 liters', () => {
    db.stock = { petrol: 1000, diesel: 1000, petrol_cost_wac: 100.0, diesel_cost_wac: 80.0 };
    global.showNotification = jest.fn();

    // custom load of 10000 + 2000 = 12000, but 10000 is not a multiple of 4000
    recordTanker('2026-06-25', '09:00', 'custom', 10000, 2000, 100.0, 80.0);
    expect(global.showNotification).toHaveBeenCalledWith(expect.stringContaining('must be multiples of 4,000 Liters'), 'danger');
  });
});
