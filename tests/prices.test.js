require('./setup');

beforeAll(() => {
  loadScript('core_db_ledger.js');
});

describe('Price History retrieval', () => {
  test('getPricesAt returns correct historical price', () => {
    db.prices = [
      { effective_date: '2026-06-01T08:00', petrol: 110.0, diesel: 95.0 },
      { effective_date: '2026-06-15T08:00', petrol: 112.0, diesel: 97.0 },
      { effective_date: '2026-06-25T08:00', petrol: 113.5, diesel: 98.4 }
    ];

    // Case 1: Exact date of price change
    const p1 = getPricesAt('2026-06-15');
    expect(p1.petrol).toBe(112.0);
    expect(p1.diesel).toBe(97.0);

    // Case 2: Intermediate date (e.g. June 20th)
    const p2 = getPricesAt('2026-06-20');
    expect(p2.petrol).toBe(112.0);
    expect(p2.diesel).toBe(97.0);

    // Case 3: After the latest price change
    const p3 = getPricesAt('2026-06-27');
    expect(p3.petrol).toBe(113.5);
    expect(p3.diesel).toBe(98.4);

    // Case 4: Before any defined effective price change (fallback to oldest or default)
    const p4 = getPricesAt('2026-05-30');
    expect(p4.petrol).toBe(110.0);
    expect(p4.diesel).toBe(95.0);
  });

  test('getPricesAt fallbacks to default values when db.prices is empty', () => {
    db.prices = [];
    const result = getPricesAt('2026-06-01');
    expect(result.petrol).toBe(103.50);
    expect(result.diesel).toBe(90.80);
  });
});
