// ============================================================================
// tests/math_engine.test.js — Unit Tests for Pure Math Engine
// ============================================================================

// If running in Node/Jest context, require the module
const MathEngine = typeof require !== 'undefined' ? require('../js/engine/math_engine') : window.MathEngine;

describe('MathEngine Core Arithmetic & Scaling', () => {
  test('toML scales decimal liters to integer milliliters', () => {
    expect(MathEngine.toML(10.555)).toBe(10555);
    expect(MathEngine.toML(0)).toBe(0);
    expect(MathEngine.toML(null)).toBe(0);
    expect(MathEngine.toML(undefined)).toBe(0);
  });

  test('toPaise scales decimal rupees to integer paise', () => {
    expect(MathEngine.toPaise(105.58)).toBe(10558);
    expect(MathEngine.toPaise(0)).toBe(0);
    expect(MathEngine.toPaise(null)).toBe(0);
  });

  test('toLiters converts milliliters back to decimal liters', () => {
    expect(MathEngine.toLiters(10555)).toBe(10.555);
    expect(MathEngine.toLiters(0)).toBe(0);
  });

  test('toRupees converts paise back to decimal rupees', () => {
    expect(MathEngine.toRupees(10558)).toBe(105.58);
    expect(MathEngine.toRupees(0)).toBe(0);
  });
});

describe('MathEngine Sales Calculation', () => {
  test('calculateSalesML computes sales volume accurately in milliliters', () => {
    // 500L difference, 0 tests
    expect(MathEngine.calculateSalesML(10000000, 10500000, 0)).toBe(500000);
    // 500L difference, 1 test (5L = 5000mL)
    expect(MathEngine.calculateSalesML(10000000, 10500000, 1)).toBe(495000);
    // 500L difference, 2 tests (10L = 10000mL)
    expect(MathEngine.calculateSalesML(10000000, 10500000, 2)).toBe(490000);
  });

  test('calculateSalesML handles zero or negative boundary checks gracefully', () => {
    // Close < Open returns 0
    expect(MathEngine.calculateSalesML(10500000, 10000000, 0)).toBe(0);
    // Sales < Tests returns 0 (e.g. close - open is 2L, but tests are 5L)
    expect(MathEngine.calculateSalesML(10000000, 10002000, 1)).toBe(0);
  });
});

describe('MathEngine Revenue Calculation', () => {
  test('calculateRevenuePaise computes exact revenue in paise', () => {
    // 10.5L sold at 100.00 Rs/L -> 1050.00 Rs -> 105000 Paise
    const salesML = MathEngine.toML(10.5);
    const pricePaise = MathEngine.toPaise(100.00);
    expect(MathEngine.calculateRevenuePaise(salesML, pricePaise)).toBe(105000);
  });

  test('calculateRevenuePaise handles rounding precision correctly', () => {
    // 458.83L sold at 113.37 Rs/L -> 52017.5571 Rs -> 5201756 Paise (rounded)
    const salesML = MathEngine.toML(458.83);
    const pricePaise = MathEngine.toPaise(113.37);
    expect(MathEngine.calculateRevenuePaise(salesML, pricePaise)).toBe(5201756);
  });
});

describe('MathEngine computeLedgerRow Reconcile', () => {
  test('computeLedgerRow outputs matching structure with zero values for empty row', () => {
    const res = MathEngine.computeLedgerRow(null);
    expect(res.sales.du1_p.day).toBe(0);
    expect(res.totals.net_24h.petrol).toBe(0);
    expect(res.financials.profit).toBe(0);
  });

  test('computeLedgerRow reconciles normal row with tests and WAC costs correctly', () => {
    const row = {
      date: '2026-06-02',
      prices: { petrol: 113.37, diesel: 98.41 },
      du1_p: { open: 1492561.55, close_day: 1493025.38, close_night: 1493214.44, tests_day: 1, tests_night: 0 },
      du1_d: { open: 1234826.96, close_day: 1235272.96, close_night: 1235462.98, tests_day: 1, tests_night: 0 },
      du2_p: { open: 43159.70, close_day: 43195.09, close_night: 43199.50, tests_day: 1, tests_night: 0 },
      du2_d: { open: 1231774.53, close_day: 1232100.52, close_night: 1232185.97, tests_day: 1, tests_night: 0 }
    };

    const wacMap = {
      '2026-06-02': { ms: 100.00, hsd: 85.00 }
    };

    const res = MathEngine.computeLedgerRow(row, wacMap);

    // Sales checking
    // DU1 Petrol Day: (1493025.38 - 1492561.55) - 5 = 458.83L
    expect(res.sales.du1_p.day).toBe(458.83);
    // DU2 Petrol Day: (43195.09 - 43159.70) - 5 = 30.39L
    expect(res.sales.du2_p.day).toBe(30.39);
    // Day Petrol Total: 458.83 + 30.39 = 489.22L
    expect(res.totals.day.petrol).toBeCloseTo(489.22, 2);

    // Revenue checking
    // Petrol Revenue: 489.22 (day) + 193.47 (night: DU1 is 189.06, DU2 is 4.41) -> 682.69L * 113.37 = 77396.56
    // Check our exact rounded calculation output:
    expect(res.financials.rev_petrol).toBe(77396.56);
  });
});
