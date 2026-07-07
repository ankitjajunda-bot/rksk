// ============================================================================
// tests/ledger_engine.test.js — Unit Tests for Ledger CRUD Engine
// ============================================================================

const MathEngine = typeof require !== 'undefined' ? require('../js/engine/math_engine') : window.MathEngine;
const LedgerEngine = typeof require !== 'undefined' ? require('../js/engine/ledger_engine') : window.LedgerEngine;

describe('LedgerEngine CRUD & Stock Operations', () => {
  let dbState;

  beforeEach(() => {
    dbState = {
      master_ledger: [
        {
          date: '2026-06-25',
          prices: { petrol: 110.0, diesel: 95.0 },
          du1_p: { open: 10000.0, close_day: 10500.0, close_night: 11000.0, tests_day: 0, tests_night: 0 }, // 1000L Petrol
          du1_d: { open: 20000.0, close_day: 20400.0, close_night: 20900.0, tests_day: 0, tests_night: 0 }, // 900L Diesel
          du2_p: { open: 5000.0, close_day: 5000.0, close_night: 5000.0, tests_day: 0, tests_night: 0 },
          du2_d: { open: 8000.0, close_day: 8000.0, close_night: 8000.0, tests_day: 0, tests_night: 0 }
        }
      ],
      stock: {
        petrol: 5000.00,
        diesel: 4000.00,
        petrol_cost_wac: 100.00,
        diesel_cost_wac: 80.00
      },
      purchases: []
    };
  });

  test('saveDailyReadings adjusts stock levels on edit correctly', () => {
    const updatedRow = {
      date: '2026-06-25',
      prices: { petrol: 110.0, diesel: 95.0 },
      du1_p: { open: 10000.0, close_day: 10400.0, close_night: 10800.0, tests_day: 0, tests_night: 0 }, // 800L Petrol (decreased from 1000L)
      du1_d: { open: 20000.0, close_day: 20500.0, close_night: 21000.0, tests_day: 0, tests_night: 0 }, // 1000L Diesel (increased from 900L)
      du2_p: { open: 5000.0, close_day: 5000.0, close_night: 5000.0, tests_day: 0, tests_night: 0 },
      du2_d: { open: 8000.0, close_day: 8000.0, close_night: 8000.0, tests_day: 0, tests_night: 0 }
    };

    const wacMap = { '2026-06-25': { ms: 100.00, hsd: 80.00 } };
    LedgerEngine.saveDailyReadings(updatedRow, dbState, wacMap);

    // Old Petrol sales: 1000L. New Petrol sales: 800L. Stock should gain 200L.
    expect(dbState.stock.petrol).toBe(5200.00);
    // Old Diesel sales: 900L. New Diesel sales: 1000L. Stock should lose 100L.
    expect(dbState.stock.diesel).toBe(3900.00);
  });

  test('deleteLedgerRow refunds stock levels and removes entry', () => {
    const wacMap = { '2026-06-25': { ms: 100.00, hsd: 80.00 } };
    LedgerEngine.deleteLedgerRow('2026-06-25', dbState, wacMap);

    // Refunds 1000L Petrol
    expect(dbState.stock.petrol).toBe(6000.00);
    // Refunds 900L Diesel
    expect(dbState.stock.diesel).toBe(4900.00);
    expect(dbState.master_ledger.length).toBe(0);
  });

  test('recordTankerPurchase blends cost and adjusts stock based on received volumes', () => {
    const purchase = {
      date: '2026-06-26',
      petrol_qty: 4000,     // paid nominal volume
      petrol_price: 110.00, // invoice price
      petrol_received: 3985, // decanted actual volume
      diesel_qty: 0,
      diesel_price: 0,
      diesel_received: 0
    };

    LedgerEngine.recordTankerPurchase(purchase, dbState);

    // Stock Petrol should increase by actual received (3985L) -> 5000 + 3985 = 8985L
    expect(dbState.stock.petrol).toBe(8985.00);

    // Rolling WAC blending check:
    // Old stock cost: 5000L * 100.00 Rs = 500,000 Rs
    // Purchase nominal cost: 4000L * 110.00 Rs = 440,000 Rs
    // Total combined cost: 940,000 Rs
    // Total combined volume: 5000L + 3985L = 8985L
    // Expected new WAC: 940,000 Rs / 8985L = 104.6188... Rs -> rounded to 104.62 Rs
    expect(dbState.stock.petrol_cost_wac).toBe(104.62);
  });
});
