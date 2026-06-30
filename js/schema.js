// js/schema.js
// Runtime Data Validator for RKSK Fuel Station Management System
// Ensures strict type safety and defaults for all localStorage and API payloads

const RKSKSchema = {
  /**
   * Validates and sanitizes a ledger row record.
   * @param {Object} row 
   * @returns {Object} Cleaned and typed ledger row
   */
  validateRow(row) {
    if (!row || typeof row !== 'object') {
      throw new Error("Ledger row must be a valid object.");
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!row.date || typeof row.date !== 'string' || !dateRegex.test(row.date)) {
      throw new Error(`Invalid or missing row date: ${row.date}`);
    }

    const cleanRow = {
      date: row.date,
      prices: {
        petrol: this.sanitizeNumber(row.prices?.petrol, 0),
        diesel: this.sanitizeNumber(row.prices?.diesel, 0)
      }
    };

    const nozzles = ['du1_p', 'du1_d', 'du2_p', 'du2_d'];
    for (const nz of nozzles) {
      const sourceNz = row[nz] || {};
      cleanRow[nz] = {
        open: this.sanitizeNumber(sourceNz.open, 0),
        close_day: this.sanitizeNumber(sourceNz.close_day, 0),
        close_night: this.sanitizeNumber(sourceNz.close_night, 0),
        tests_day: this.sanitizeNumber(sourceNz.tests_day, 0),
        tests_night: this.sanitizeNumber(sourceNz.tests_night, 0)
      };
    }

    if (row.recon) {
      cleanRow.recon = {
        day: {
          variance: this.sanitizeNumber(row.recon.day?.variance, 0),
          kharcha: this.sanitizeNumber(row.recon.day?.kharcha, 0),
          net_collection: this.sanitizeNumber(row.recon.day?.net_collection, 0),
          phonepe: this.sanitizeNumber(row.recon.day?.phonepe, 0),
          card: this.sanitizeNumber(row.recon.day?.card, 0),
          paytm: this.sanitizeNumber(row.recon.day?.paytm, 0),
          office_cash: this.sanitizeNumber(row.recon.day?.office_cash, 0),
          credit_sales: this.sanitizeNumber(row.recon.day?.credit_sales, 0)
        },
        night: {
          variance: this.sanitizeNumber(row.recon.night?.variance, 0),
          kharcha: this.sanitizeNumber(row.recon.night?.kharcha, 0),
          net_collection: this.sanitizeNumber(row.recon.night?.net_collection, 0),
          phonepe: this.sanitizeNumber(row.recon.night?.phonepe, 0),
          card: this.sanitizeNumber(row.recon.night?.card, 0),
          paytm: this.sanitizeNumber(row.recon.night?.paytm, 0),
          office_cash: this.sanitizeNumber(row.recon.night?.office_cash, 0),
          credit_sales: this.sanitizeNumber(row.recon.night?.credit_sales, 0)
        }
      };
    }

    return cleanRow;
  },

  /**
   * Validates and sanitizes settings values.
   */
  validateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      return {};
    }
    return {
      petrol_capacity: this.sanitizeNumber(settings.petrol_capacity, 20000),
      diesel_capacity: this.sanitizeNumber(settings.diesel_capacity, 20000),
      safety_stock: this.sanitizeNumber(settings.safety_stock, 2500),
      currency: typeof settings.currency === 'string' ? settings.currency : "₹",
      ads_days: this.sanitizeNumber(settings.ads_days, 14),
      sundays_closed: !!settings.sundays_closed,
      sats_closed: !!settings.sats_closed,
      petrol_tank_dia: this.sanitizeNumber(settings.petrol_tank_dia, 200),
      petrol_tank_len: this.sanitizeNumber(settings.petrol_tank_len, 636.6),
      petrol_dead_stock: this.sanitizeNumber(settings.petrol_dead_stock, 600),
      diesel_tank_dia: this.sanitizeNumber(settings.diesel_tank_dia, 200),
      diesel_tank_len: this.sanitizeNumber(settings.diesel_tank_len, 636.6),
      diesel_dead_stock: this.sanitizeNumber(settings.diesel_dead_stock, 40),
      phonepe_mid: typeof settings.phonepe_mid === 'string' ? settings.phonepe_mid : "",
      phonepe_salt_key: typeof settings.phonepe_salt_key === 'string' ? settings.phonepe_salt_key : "",
      phonepe_salt_index: typeof settings.phonepe_salt_index === 'string' ? settings.phonepe_salt_index : "1"
    };
  },

  validateNozzleReadings(open, close, name) {
    const o = Number(open) || 0;
    const c = Number(close) || 0;
    if (c < o) {
      return `Closing meter reading (${c}) cannot be less than opening reading (${o}) for nozzle ${name}.`;
    }
    return null;
  },

  validateDenominations(countedCash, denomsObj) {
    if (!denomsObj) return true;
    let sum = 0;
    const values = {
      note2000: 2000, note500: 500, note200: 200, note100: 100,
      note50: 50, note20: 20, note10: 10, note5: 5, note2: 2, note1: 1, coin: 1
    };
    for (const key in denomsObj) {
      const count = Number(denomsObj[key]) || 0;
      const val = values[key] || 0;
      sum += count * val;
    }
    return Math.abs(sum - countedCash) < 0.01;
  },

  validateTankCapacity(currentStock, quantity, limit) {
    const current = Number(currentStock) || 0;
    const incoming = Number(quantity) || 0;
    const maxVal = Number(limit) || 25000;
    return (current + incoming) <= maxVal;
  },

  sanitizeNumber(val, fallback = 0) {
    if (val === null || val === undefined || val === '') return fallback;
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
  }
};

// Export for Node/Jest environment if applicable
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RKSKSchema;
}
