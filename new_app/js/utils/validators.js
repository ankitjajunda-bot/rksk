// ============================================================================
// js/utils/validators.js — Validation Functions
// ============================================================================

const Validators = {
  isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr + 'T12:00:00');
    return !isNaN(d.getTime());
  },

  isValidNumber(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(String(value).replace(/,/g, ''));
    return !isNaN(n) && isFinite(n);
  },

  isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return /^(\+?\d{10,15})$/.test(cleaned);
  },

  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  },

  isValidPIN(pin) {
    if (!pin || typeof pin !== 'string') return false;
    return /^\d{4,6}$/.test(pin);
  },

  isNotFutureDate(dateStr) {
    if (!this.isValidDate(dateStr)) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr <= today;
  },

  isPositiveNumber(value) {
    return this.isValidNumber(value) && Number(value) > 0;
  },

  validateLedgerRow(row) {
    const errors = [];
    if (!row.date) errors.push('Date is required');
    if (!this.isValidDate(row.date)) errors.push('Invalid date format');
    if (!this.isNotFutureDate(row.date)) errors.push('Cannot submit future dates');

    const nozzles = ['du1_p', 'du1_d', 'du2_p', 'du2_d'];
    nozzles.forEach(nz => {
      if (row[nz]) {
        const open = row[nz].open || 0;
        const closeDay = row[nz].close_day || 0;
        const closeNight = row[nz].close_night || 0;
        if (closeDay > 0 && closeDay < open && !row[nz].is_reset) {
          errors.push(`${nz}: Closing reading (${closeDay}) < Opening (${open})`);
        }
        if (closeNight > 0 && closeNight < closeDay) {
          errors.push(`${nz}: Night closing (${closeNight}) < Day closing (${closeDay})`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }
};

window.Validators = Validators;
