require('./setup');

beforeAll(() => {
  loadScript('core_db_ledger.js');
});

describe('Math & Calculation Safety Tests', () => {
  test('computeLedgerRow with null or empty row returns zeroes', () => {
    const result = computeLedgerRow(null);
    expect(result.sales.du1_p.day).toBe(0);
    expect(result.totals.net_24h.petrol).toBe(0);
    expect(result.financials.total_revenue).toBe(0);
    expect(result.financials.profit).toBe(0);
  });

  test('computeLedgerRow calculates normal sales volume correctly without calibration tests', () => {
    const row = {
      date: '2026-06-25',
      prices: { petrol: 110.0, diesel: 95.0 },
      du1_p: { open: 10000.0, close_day: 10500.0, close_night: 11000.0, tests_day: 0, tests_night: 0 },
      du1_d: { open: 20000.0, close_day: 20400.0, close_night: 20900.0, tests_day: 0, tests_night: 0 },
      du2_p: { open: 5000.0, close_day: 5200.0, close_night: 5500.0, tests_day: 0, tests_night: 0 },
      du2_d: { open: 8000.0, close_day: 8100.0, close_night: 8300.0, tests_day: 0, tests_night: 0 }
    };

    const wacMap = {
      '2026-06-25': { ms: 100.0, hsd: 85.0 }
    };

    const result = computeLedgerRow(row, wacMap);

    // Day volumes (No test deductions)
    // DU1 Petrol: 500L, DU2 Petrol: 200L -> Total Petrol Day = 700L
    expect(result.sales.du1_p.day).toBe(500);
    expect(result.sales.du2_p.day).toBe(200);
    expect(result.totals.day.petrol).toBe(700);

    // Night volumes
    // DU1 Petrol: 500L, DU2 Petrol: 300L -> Total Petrol Night = 800L
    expect(result.sales.du1_p.night).toBe(500);
    expect(result.sales.du2_p.night).toBe(300);
    expect(result.totals.night.petrol).toBe(800);

    // 24h totals
    expect(result.totals.net_24h.petrol).toBe(1500); // 700 + 800
    expect(result.totals.net_24h.diesel).toBe(800);  // DU1: (400 + 500) + DU2: (100 + 200) - Wait: (20400-20000)=400, (20900-20400)=500. (8100-8000)=100, (8300-8100)=200. Total = 900 + 300 = 1200
    expect(result.totals.net_24h.diesel).toBe(1200);

    // Revenue
    // Petrol: 1500 * 110 = 165000
    // Diesel: 1200 * 95 = 114000
    // Total Revenue = 279000
    expect(result.financials.rev_petrol).toBe(165000);
    expect(result.financials.rev_diesel).toBe(114000);
    expect(result.financials.total_revenue).toBe(279000);

    // Cost (WAC)
    // Petrol: 1500 * 100 = 150000
    // Diesel: 1200 * 85 = 102000
    // Total Cost = 252000
    expect(result.financials.total_cost).toBe(252000);

    // Profit = 279000 - 252000 = 27000
    expect(result.financials.profit).toBe(27000);
  });

  test('computeLedgerRow deducts calibration tests correctly', () => {
    const row = {
      date: '2026-06-25',
      prices: { petrol: 100.0, diesel: 90.0 },
      du1_p: { open: 10000.0, close_day: 10500.0, close_night: 11000.0, tests_day: 2, tests_night: 1 }, // Day tests = 2 (10L), Night tests = 1 (5L)
      du1_d: { open: 20000.0, close_day: 20400.0, close_night: 20900.0, tests_day: 1, tests_night: 2 }, // Day tests = 1 (5L), Night tests = 2 (10L)
      du2_p: { open: 5000.0, close_day: 5200.0, close_night: 5500.0, tests_day: 0, tests_night: 0 },
      du2_d: { open: 8000.0, close_day: 8100.0, close_night: 8300.0, tests_day: 0, tests_night: 0 }
    };

    const wacMap = {
      '2026-06-25': { ms: 80.0, hsd: 70.0 }
    };

    const result = computeLedgerRow(row, wacMap);

    // Day volumes:
    // DU1 Petrol: (10500 - 10000) - (2 * 5) = 490L
    // DU2 Petrol: (5200 - 5000) - 0 = 200L
    // Total Petrol Day = 690L
    expect(result.sales.du1_p.day).toBe(490);
    expect(result.totals.day.petrol).toBe(690);

    // Night volumes:
    // DU1 Petrol: (11000 - 10500) - (1 * 5) = 495L
    // DU2 Petrol: (5500 - 5200) - 0 = 300L
    // Total Petrol Night = 795L
    expect(result.sales.du1_p.night).toBe(495);
    expect(result.totals.night.petrol).toBe(795);

    // 24h Net Volumes:
    // Petrol: 690 + 795 = 1485L
    // Diesel Day: DU1: (20400 - 20000) - 5 = 395L; DU2: 100L. Total = 495L
    // Diesel Night: DU1: (20900 - 20400) - 10 = 490L; DU2: 200L. Total = 690L
    // Total Diesel 24h = 495 + 690 = 1185L
    expect(result.totals.net_24h.petrol).toBe(1485);
    expect(result.totals.net_24h.diesel).toBe(1185);

    // Revenues:
    // Petrol: 1485 * 100 = 148500
    // Diesel: 1185 * 90 = 106650
    // Total = 255150
    expect(result.financials.total_revenue).toBe(255150);
  });
});
