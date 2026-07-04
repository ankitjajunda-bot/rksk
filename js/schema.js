const RKSKSchema = {
  /**
   * Validates and sanitizes a ledger row record.
   * @param {Object} row 
   * @returns {Object} Cleaned and typed ledger row
   */
  validateRow(row) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
    if (!row || typeof row !== "object") {
      throw new Error("Ledger row must be a valid object.");
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!row.date || typeof row.date !== "string" || !dateRegex.test(row.date)) {
      throw new Error(`Invalid or missing row date: ${row.date}`);
    }
    const cleanRow = {
      date: row.date,
      prices: {
        petrol: this.sanitizeNumber((_a = row.prices) == null ? void 0 : _a.petrol, 0),
        diesel: this.sanitizeNumber((_b = row.prices) == null ? void 0 : _b.diesel, 0)
      }
    };
    const nozzles = ["du1_p", "du1_d", "du2_p", "du2_d"];
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
          variance: this.sanitizeNumber((_c = row.recon.day) == null ? void 0 : _c.variance, 0),
          kharcha: this.sanitizeNumber((_d = row.recon.day) == null ? void 0 : _d.kharcha, 0),
          net_collection: this.sanitizeNumber((_e = row.recon.day) == null ? void 0 : _e.net_collection, 0),
          phonepe: this.sanitizeNumber((_f = row.recon.day) == null ? void 0 : _f.phonepe, 0),
          card: this.sanitizeNumber((_g = row.recon.day) == null ? void 0 : _g.card, 0),
          paytm: this.sanitizeNumber((_h = row.recon.day) == null ? void 0 : _h.paytm, 0),
          office_cash: this.sanitizeNumber((_i = row.recon.day) == null ? void 0 : _i.office_cash, 0),
          credit_sales: this.sanitizeNumber((_j = row.recon.day) == null ? void 0 : _j.credit_sales, 0)
        },
        night: {
          variance: this.sanitizeNumber((_k = row.recon.night) == null ? void 0 : _k.variance, 0),
          kharcha: this.sanitizeNumber((_l = row.recon.night) == null ? void 0 : _l.kharcha, 0),
          net_collection: this.sanitizeNumber((_m = row.recon.night) == null ? void 0 : _m.net_collection, 0),
          phonepe: this.sanitizeNumber((_n = row.recon.night) == null ? void 0 : _n.phonepe, 0),
          card: this.sanitizeNumber((_o = row.recon.night) == null ? void 0 : _o.card, 0),
          paytm: this.sanitizeNumber((_p = row.recon.night) == null ? void 0 : _p.paytm, 0),
          office_cash: this.sanitizeNumber((_q = row.recon.night) == null ? void 0 : _q.office_cash, 0),
          credit_sales: this.sanitizeNumber((_r = row.recon.night) == null ? void 0 : _r.credit_sales, 0)
        }
      };
    }
    return cleanRow;
  },
  /**
   * Validates and sanitizes settings values.
   */
  validateSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return {};
    }
    return {
      petrol_capacity: this.sanitizeNumber(settings.petrol_capacity, 2e4),
      diesel_capacity: this.sanitizeNumber(settings.diesel_capacity, 2e4),
      safety_stock: this.sanitizeNumber(settings.safety_stock, 2500),
      currency: typeof settings.currency === "string" ? settings.currency : "\u20B9",
      ads_days: this.sanitizeNumber(settings.ads_days, 14),
      sundays_closed: !!settings.sundays_closed,
      sats_closed: !!settings.sats_closed,
      petrol_tank_dia: this.sanitizeNumber(settings.petrol_tank_dia, 200),
      petrol_tank_len: this.sanitizeNumber(settings.petrol_tank_len, 636.6),
      petrol_dead_stock: this.sanitizeNumber(settings.petrol_dead_stock, 600),
      diesel_tank_dia: this.sanitizeNumber(settings.diesel_tank_dia, 200),
      diesel_tank_len: this.sanitizeNumber(settings.diesel_tank_len, 636.6),
      diesel_dead_stock: this.sanitizeNumber(settings.diesel_dead_stock, 40),
      phonepe_mid: typeof settings.phonepe_mid === "string" ? settings.phonepe_mid : "",
      phonepe_salt_key: typeof settings.phonepe_salt_key === "string" ? settings.phonepe_salt_key : "",
      phonepe_salt_index: typeof settings.phonepe_salt_index === "string" ? settings.phonepe_salt_index : "1"
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
      note2000: 2e3,
      note500: 500,
      note200: 200,
      note100: 100,
      note50: 50,
      note20: 20,
      note10: 10,
      note5: 5,
      note2: 2,
      note1: 1,
      coin: 1
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
    const maxVal = Number(limit) || 25e3;
    return current + incoming <= maxVal;
  },
  sanitizeNumber(val, fallback = 0) {
    if (val === null || val === void 0 || val === "") return fallback;
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
  },
  /**
   * Prevents XSS by escaping HTML special characters.
   */
  escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = RKSKSchema;
}
