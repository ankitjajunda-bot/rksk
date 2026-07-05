// ============================================================================
// js/engine/math_engine.js — Pure Calculation Functions (No Side Effects)
// ============================================================================

const MathEngine = {

  /**
   * Calculate thermal expansion factor
   */
  getThermalExpansionFactor(temperature, fuelType) {
    // Approximate coefficients
    const coeff = fuelType === 'petrol' ? 0.0012 : 0.0008; // per °C
    return 1 + (coeff * (temperature - 15));
  },

  /**
   * Compute sales, totals, and financials for a single ledger row.
   * Pure function: takes row + optional WAC map, returns computed object.
   */
  computeLedgerRow(row, wacMap = null, dbSnapshot = null) {
    const empty = {
      sales: { du1_p: { day: 0, night: 0 }, du1_d: { day: 0, night: 0 }, du2_p: { day: 0, night: 0 }, du2_d: { day: 0, night: 0 } },
      totals: { day: { petrol: 0, diesel: 0 }, night: { petrol: 0, diesel: 0 }, net_24h: { petrol: 0, diesel: 0 } },
      financials: { rev_petrol: 0, rev_diesel: 0, total_revenue: 0, total_cost: 0, profit: 0, commission_petrol: 0, commission_diesel: 0, total_commission: 0, total_expenses: 0, net_operating_profit: 0 }
    };
    if (!row) return empty;

    // Test deductions: 1 test = 5L, only if the shift actually ran
    const testCount = (nozzle, closeKey, openKey) => {
      if (!nozzle) return 0;
      return ((nozzle[closeKey] ?? 0) > (nozzle[openKey] ?? 0)) ? (nozzle[`tests_${closeKey === 'close_day' ? 'day' : 'night'}`] ?? (closeKey === 'close_day' ? 1 : 0)) : 0;
    };

    const t1p_day = testCount(row.du1_p, 'close_day', 'open');
    const t1p_night = testCount(row.du1_p, 'close_night', 'close_day');
    const t1d_day = testCount(row.du1_d, 'close_day', 'open');
    const t1d_night = testCount(row.du1_d, 'close_night', 'close_day');
    const t2p_day = testCount(row.du2_p, 'close_day', 'open');
    const t2p_night = testCount(row.du2_p, 'close_night', 'close_day');
    const t2d_day = testCount(row.du2_d, 'close_day', 'open');
    const t2d_night = testCount(row.du2_d, 'close_night', 'close_day');

    const TEST_DEDUCTION = dbSnapshot?.settings?.test_deduction_liters || 5;

    // Day sales = close_day - open - (tests_day * TEST_DEDUCTION)
    const d1_p_day = Math.max(0, (row.du1_p?.close_day || 0) - (row.du1_p?.open || 0) - (t1p_day * TEST_DEDUCTION));
    const d1_d_day = Math.max(0, (row.du1_d?.close_day || 0) - (row.du1_d?.open || 0) - (t1d_day * TEST_DEDUCTION));
    const d2_p_day = Math.max(0, (row.du2_p?.close_day || 0) - (row.du2_p?.open || 0) - (t2p_day * TEST_DEDUCTION));
    const d2_d_day = Math.max(0, (row.du2_d?.close_day || 0) - (row.du2_d?.open || 0) - (t2d_day * TEST_DEDUCTION));

    // Night sales = close_night - close_day - (tests_night * TEST_DEDUCTION)
    const d1_p_night = Math.max(0, (row.du1_p?.close_night || 0) - (row.du1_p?.close_day || 0) - (t1p_night * TEST_DEDUCTION));
    const d1_d_night = Math.max(0, (row.du1_d?.close_night || 0) - (row.du1_d?.close_day || 0) - (t1d_night * TEST_DEDUCTION));
    const d2_p_night = Math.max(0, (row.du2_p?.close_night || 0) - (row.du2_p?.close_day || 0) - (t2p_night * TEST_DEDUCTION));
    const d2_d_night = Math.max(0, (row.du2_d?.close_night || 0) - (row.du2_d?.close_day || 0) - (t2d_night * TEST_DEDUCTION));

    const day_petrol = d1_p_day + d2_p_day;
    const day_diesel = d1_d_day + d2_d_day;
    const night_petrol = d1_p_night + d2_p_night;
    const night_diesel = d1_d_night + d2_d_night;
    const net_petrol_24h = day_petrol + night_petrol;
    const net_diesel_24h = day_diesel + night_diesel;

    // Revenue
    const rev_petrol = net_petrol_24h * (row.prices?.petrol || 0);
    const rev_diesel = net_diesel_24h * (row.prices?.diesel || 0);
    const total_revenue = rev_petrol + rev_diesel;

    // Cost (WAC)
    const fallbackWacP = dbSnapshot?.stock?.petrol_cost_wac || 0;
    const fallbackWacD = dbSnapshot?.stock?.diesel_cost_wac || 0;
    const rawWac = (wacMap && wacMap[row.date]) || { ms: fallbackWacP, hsd: fallbackWacD };
    const dateWac = { ms: parseFloat(rawWac.ms) || fallbackWacP, hsd: parseFloat(rawWac.hsd) || fallbackWacD };

    const cost_petrol = net_petrol_24h * dateWac.ms;
    const cost_diesel = net_diesel_24h * dateWac.hsd;
    const total_cost = cost_petrol + cost_diesel;
    const profit = total_revenue - total_cost;

    const commission_petrol = rev_petrol - cost_petrol;
    const commission_diesel = rev_diesel - cost_diesel;
    const total_commission = commission_petrol + commission_diesel;

    const dayExps = row.expenses || [];
    const total_expenses = dayExps.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
    const net_operating_profit = total_commission - total_expenses;

    return {
      sales: {
        du1_p: { day: d1_p_day, night: d1_p_night },
        du1_d: { day: d1_d_day, night: d1_d_night },
        du2_p: { day: d2_p_day, night: d2_p_night },
        du2_d: { day: d2_d_day, night: d2_d_night }
      },
      totals: {
        day: { petrol: day_petrol, diesel: day_diesel },
        night: { petrol: night_petrol, diesel: night_diesel },
        net_24h: { petrol: net_petrol_24h, diesel: net_diesel_24h }
      },
      financials: {
        rev_petrol, rev_diesel, total_revenue, total_cost, profit,
        commission_petrol, commission_diesel, total_commission,
        total_expenses, net_operating_profit
      }
    };
  },

  /**
   * Get the price record in effect on a given date.
   */
  getPricesAt(dateStr, prices) {
    if (!prices || prices.length === 0) return { petrol: 103.50, diesel: 90.80 };
    const targetTime = new Date(dateStr + 'T12:00:00').getTime();
    const sorted = [...prices].sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
    for (const price of sorted) {
      if (new Date(price.effective_date).getTime() <= targetTime) return price;
    }
    return sorted[sorted.length - 1] || { petrol: 103.50, diesel: 90.80 };
  },

  /**
   * Calculate Average Daily Sales over the last N days.
   */
  calculateADS(masterLedger, adsDays = 14) {
    if (!masterLedger || masterLedger.length === 0) return { petrol: 550, diesel: 850 };
    const recentRows = [...masterLedger].sort((a, b) => b.date.localeCompare(a.date)).slice(0, adsDays);
    let totalPetrol = 0, totalDiesel = 0;
    recentRows.forEach(row => {
      const calc = this.computeLedgerRow(row);
      totalPetrol += calc.totals.net_24h.petrol;
      totalDiesel += calc.totals.net_24h.diesel;
    });
    const n = recentRows.length || 1;
    return { petrol: Math.max(50, totalPetrol / n), diesel: Math.max(50, totalDiesel / n) };
  },

  /**
   * Predict next fuel order based on current stock and ADS.
   */
  predictNextOrder(dbSnapshot) {
    const ads = this.calculateADS(dbSnapshot.master_ledger, dbSnapshot.settings.ads_days || 14);
    const currentP = dbSnapshot.stock.petrol || 0;
    const currentD = dbSnapshot.stock.diesel || 0;
    const safety = dbSnapshot.settings.safety_stock || 2500;
    const deadP = dbSnapshot.settings.petrol_dead_stock || 0;
    const deadD = dbSnapshot.settings.diesel_dead_stock || 0;

    const usableP = Math.max(0, currentP - deadP);
    const usableD = Math.max(0, currentD - deadD);
    const daysToOrderP = (usableP - safety) / ads.petrol;
    const daysToOrderD = (usableD - safety) / ads.diesel;
    const daysToTrigger = Math.max(0, Math.min(daysToOrderP, daysToOrderD));

    const todayStr = new Date().toISOString().split('T')[0];
    const predictedPurchaseDate = this.addDays(todayStr, Math.ceil(daysToTrigger));
    const expectedPStock = Math.max(0, currentP - (daysToTrigger * ads.petrol));
    const expectedDStock = Math.max(0, currentD - (daysToTrigger * ads.diesel));
    const availPSpace = Math.max(0, (dbSnapshot.settings.petrol_capacity || 20000) - expectedPStock);
    const availDSpace = Math.max(0, (dbSnapshot.settings.diesel_capacity || 20000) - expectedDStock);

    const candidates = [
      { type: 'full-diesel', label: 'Full Diesel (12kl)', d: 12000, p: 0 },
      { type: 'full-petrol', label: 'Full Petrol (12kl)', d: 0, p: 12000 },
      { type: 'mixed-8d-4p', label: 'Mixed (8kl Diesel + 4kl Petrol)', d: 8000, p: 4000 },
      { type: 'mixed-8p-4d', label: 'Mixed (8kl Petrol + 4kl Diesel)', d: 4000, p: 8000 }
    ];

    let bestCandidate = null, bestScore = -Infinity;
    candidates.forEach(cand => {
      if (cand.p <= availPSpace && cand.d <= availDSpace) {
        const postP = expectedPStock + cand.p;
        const postD = expectedDStock + cand.d;
        const score = -(Math.max((dbSnapshot.settings.petrol_capacity || 20000) - postP, (dbSnapshot.settings.diesel_capacity || 20000) - postD));
        if (score > bestScore) { bestScore = score; bestCandidate = cand; }
      }
    });
    if (!bestCandidate) bestCandidate = candidates[2];

    const creditDetails = this.calculateDeadlineAndRTGS(predictedPurchaseDate, dbSnapshot.holidays || [], dbSnapshot.settings);
    return { ads, daysToTrigger, predictedPurchaseDate, recommendedLoad: bestCandidate, creditDetails };
  },

  /**
   * Calculate horizontal cylindrical tank volume from dip reading.
   */
  calculateHorizontalTankVolume(radius, length, dipVal, unit = 'cm') {
    let h = parseFloat(dipVal) || 0;
    if (unit === 'mm') h = h / 10;
    const R = parseFloat(radius);
    const L = parseFloat(length);
    if (h <= 0) return 0;
    if (h >= 2 * R) return (Math.PI * R * R * L) / 1000;
    const term1 = R * R * Math.acos((R - h) / R);
    const term2 = (R - h) * Math.sqrt((2 * R * h) - (h * h));
    return (term1 - term2) * L / 1000;
  },

  /**
   * Calculate payment deadline and RTGS date considering holidays.
   */
  calculateDeadlineAndRTGS(purchaseDateStr, holidays = [], settings = {}) {
    const deadlineDate = this.addDays(purchaseDateStr, 2);
    let rtgsDate = deadlineDate;
    let safety = 0;
    while (this.isHoliday(rtgsDate, holidays, settings) && safety++ < 14) {
      rtgsDate = this.addDays(rtgsDate, -1);
    }
    const daysDiff = Math.ceil((new Date(rtgsDate) - new Date(purchaseDateStr)) / (1000 * 60 * 60 * 24));
    return { deadlineDate, rtgsDate, isHighRisk: daysDiff <= 0, filingDaysFromPurchase: daysDiff };
  },

  /**
   * Check if a date is a holiday/weekend.
   */
  isHoliday(dateStr, holidays = [], settings = {}) {
    if (holidays.find(h => h.date === dateStr)) return true;
    const day = new Date(dateStr).getDay();
    if (settings.sundays_closed && day === 0) return true;
    if (settings.sats_closed && day === 6) {
      const weekNum = Math.ceil(new Date(dateStr).getDate() / 7);
      if (weekNum === 2 || weekNum === 4) return true;
    }
    return false;
  },

  /**
   * Add/subtract days from a date string.
   */
  addDays(dateStr, days) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const date = new Date(dateStr + 'T12:00:00');
    if (isNaN(date.getTime()) || isNaN(days)) return dateStr;
    date.setDate(date.getDate() + Math.round(days));
    try { return date.toISOString().split('T')[0]; } catch { return dateStr; }
  }
};

window.MathEngine = MathEngine;
