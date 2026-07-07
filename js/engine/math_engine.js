// ============================================================================
// js/engine/math_engine.js — Pure Financial Calculation Engine
// ============================================================================

const MathEngine = {
  /**
   * Scale liters (decimal) to milliliters (integer) to avoid float issues.
   */
  toML(liters) {
    if (typeof liters !== 'number' || isNaN(liters)) return 0;
    return Math.round(liters * 1000);
  },

  /**
   * Scale rupees (decimal) to paise (integer) to avoid float issues.
   */
  toPaise(rupees) {
    if (typeof rupees !== 'number' || isNaN(rupees)) return 0;
    return Math.round(rupees * 100);
  },

  /**
   * Convert milliliters back to liters (decimal).
   */
  toLiters(ml) {
    return ml / 1000;
  },

  /**
   * Convert paise back to rupees (decimal).
   */
  toRupees(paise) {
    return paise / 100;
  },

  /**
   * Pure sales calculation in milliliters.
   */
  calculateSalesML(openML, closeML, testsCount) {
    const testsML = (testsCount || 0) * 5000;
    return Math.max(0, closeML - openML - testsML);
  },

  /**
   * Pure revenue calculation in paise.
   */
  calculateRevenuePaise(salesML, pricePaise) {
    return Math.round((salesML * pricePaise) / 1000);
  },

  /**
   * Reconciles a single day row containing nozzles, prices, and WAC.
   * Exposes identical output signature to legacy computeLedgerRow.
   */
  computeLedgerRow(row, wacMap, dbState) {
    if (!row) {
      return {
        sales: {
          du1_p: { day: 0, night: 0 },
          du1_d: { day: 0, night: 0 },
          du2_p: { day: 0, night: 0 },
          du2_d: { day: 0, night: 0 }
        },
        totals: {
          day: { petrol: 0, diesel: 0 },
          night: { petrol: 0, diesel: 0 },
          net_24h: { petrol: 0, diesel: 0 }
        },
        financials: {
          rev_petrol: 0,
          rev_diesel: 0,
          total_revenue: 0,
          total_cost: 0,
          profit: 0,
          commission_petrol: 0,
          commission_diesel: 0,
          total_commission: 0,
          total_expenses: 0,
          net_operating_profit: 0
        }
      };
    }

    const prices = row.prices || {};
    const pricePetrolPaise = this.toPaise(prices.petrol || 0);
    const priceDieselPaise = this.toPaise(prices.diesel || 0);

    const processNozzle = (nozzleKey, isPetrol) => {
      const nozzle = row[nozzleKey] || {};
      const openML = this.toML(nozzle.open || 0);
      const closeDayML = this.toML(nozzle.close_day || 0);
      const closeNightML = this.toML(nozzle.close_night || 0);

      // Determine tests day/night count
      const testDay = (closeDayML > openML) ? (nozzle.tests_day ?? 1) : 0;
      const testNight = (closeNightML > closeDayML) ? (nozzle.tests_night ?? 0) : 0;

      const salesDayML = this.calculateSalesML(openML, closeDayML, testDay);
      const salesNightML = this.calculateSalesML(closeDayML, closeNightML, testNight);

      const pricePaise = isPetrol ? pricePetrolPaise : priceDieselPaise;
      const revDayPaise = this.calculateRevenuePaise(salesDayML, pricePaise);
      const revNightPaise = this.calculateRevenuePaise(salesNightML, pricePaise);

      return {
        salesDayML,
        salesNightML,
        revDayPaise,
        revNightPaise
      };
    };

    const u1p = processNozzle('du1_p', true);
    const u1d = processNozzle('du1_d', false);
    const u2p = processNozzle('du2_p', true);
    const u2d = processNozzle('du2_d', false);

    // Day volumes (liters)
    const d1_p_day = this.toLiters(u1p.salesDayML);
    const d1_d_day = this.toLiters(u1d.salesDayML);
    const d2_p_day = this.toLiters(u2p.salesDayML);
    const d2_d_day = this.toLiters(u2d.salesDayML);

    // Night volumes (liters)
    const d1_p_night = this.toLiters(u1p.salesNightML);
    const d1_d_night = this.toLiters(u1d.salesNightML);
    const d2_p_night = this.toLiters(u2p.salesNightML);
    const d2_d_night = this.toLiters(u2d.salesNightML);

    // Net 24h volumes (liters)
    const net_p_day = d1_p_day + d2_p_day;
    const net_d_day = d1_d_day + d2_d_day;
    const net_p_night = d1_p_night + d2_p_night;
    const net_d_night = d1_d_night + d2_d_night;

    const net_petrol_24h = net_p_day + net_p_night;
    const net_diesel_24h = net_d_day + net_d_night;

    // Revenues (rupees)
    const rev_petrol_paise = u1p.revDayPaise + u1p.revNightPaise + u2p.revDayPaise + u2p.revNightPaise;
    const rev_diesel_paise = u1d.revDayPaise + u1d.revNightPaise + u2d.revDayPaise + u2d.revNightPaise;
    const total_revenue_paise = rev_petrol_paise + rev_diesel_paise;

    const rev_petrol = this.toRupees(rev_petrol_paise);
    const rev_diesel = this.toRupees(rev_diesel_paise);
    const total_revenue = this.toRupees(total_revenue_paise);

    // WAC Cost Allocation
    const fallbackWacP = dbState?.stock?.petrol_cost_wac || 0;
    const fallbackWacD = dbState?.stock?.diesel_cost_wac || 0;
    const rawWac = (wacMap && wacMap[row.date]) || { ms: fallbackWacP, hsd: fallbackWacD };

    const wacPPaise = this.toPaise(parseFloat(rawWac.ms) || fallbackWacP);
    const wacDPaise = this.toPaise(parseFloat(rawWac.hsd) || fallbackWacD);

    const cost_petrol_paise = Math.round((this.toML(net_petrol_24h) * wacPPaise) / 1000);
    const cost_diesel_paise = Math.round((this.toML(net_diesel_24h) * wacDPaise) / 1000);
    const total_cost_paise = cost_petrol_paise + cost_diesel_paise;

    const total_cost = this.toRupees(total_cost_paise);
    const profit = this.toRupees(total_revenue_paise - total_cost_paise);

    // Commission/Margins
    const commission_petrol = this.toRupees(rev_petrol_paise - cost_petrol_paise);
    const commission_diesel = this.toRupees(rev_diesel_paise - cost_diesel_paise);
    const total_commission = this.toRupees(total_revenue_paise - total_cost_paise);

    // Expenses
    const dayExps = row.expenses || [];
    const total_expenses_paise = dayExps.reduce((sum, item) => sum + this.toPaise(parseFloat(item.amount) || 0), 0);
    const total_expenses = this.toRupees(total_expenses_paise);
    const net_operating_profit = this.toRupees(total_revenue_paise - total_cost_paise - total_expenses_paise);

    return {
      sales: {
        du1_p: { day: d1_p_day, night: d1_p_night },
        du1_d: { day: d1_d_day, night: d1_d_night },
        du2_p: { day: d2_p_day, night: d2_p_night },
        du2_d: { day: d2_d_day, night: d2_d_night }
      },
      totals: {
        day: { petrol: net_p_day, diesel: net_d_day },
        night: { petrol: net_p_night, diesel: net_d_night },
        net_24h: { petrol: net_petrol_24h, diesel: net_diesel_24h }
      },
      financials: {
        rev_petrol,
        rev_diesel,
        total_revenue,
        total_cost,
        profit,
        commission_petrol,
        commission_diesel,
        total_commission,
        total_expenses,
        net_operating_profit
      }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathEngine;
}
if (typeof window !== 'undefined') {
  window.MathEngine = MathEngine;
}
