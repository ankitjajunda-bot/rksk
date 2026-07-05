// ============================================================================
// js/core/sanitize.js — Input Sanitization & Validation
// ============================================================================

const Sanitize = {
  /**
   * Remove HTML tags and dangerous characters from input.
   */
  input(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/<[^>]*>/g, '')            // Strip HTML tags
      .replace(/[<>"'`]/g, '')            // Remove dangerous chars
      .replace(/javascript:/gi, '')       // Remove JS protocol
      .replace(/on\w+\s*=/gi, '')         // Remove inline event handlers
      .trim();
  },

  /**
   * Sanitize a number: return a valid float or fallback.
   */
  number(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    // Handle Indian-style comma formatting
    const cleaned = String(value).replace(/,/g, '');
    const parsed = Number(cleaned);
    return isNaN(parsed) ? fallback : parsed;
  },

  /**
   * Sanitize an integer: return a valid integer or fallback.
   */
  integer(value, fallback = 0) {
    return Math.floor(this.number(value, fallback));
  },

  /**
   * Validate email format.
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  },

  /**
   * Validate phone number format (Indian / international).
   */
  isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return /^(\+?\d{10,15})$/.test(cleaned);
  },

  /**
   * Validate that a value is a valid number (not NaN, not Infinity).
   */
  isValidNumber(value) {
    if (value === null || value === undefined || value === '') return false;
    const n = Number(String(value).replace(/,/g, ''));
    return !isNaN(n) && isFinite(n);
  },

  /**
   * Validate date string (YYYY-MM-DD).
   */
  isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr + 'T12:00:00');
    return !isNaN(d.getTime());
  },

  /**
   * Sanitize all inputs within a container element.
   */
  sanitizeForm(containerEl) {
    if (!containerEl) return;
    const inputs = containerEl.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
      input.value = this.input(input.value);
    });
  }
};

window.Sanitize = Sanitize;
