// ============================================================================
// js/auth/mfa.js — Multi-Factor Authentication (TOTP-style)
// ============================================================================

const MFA = {
  SECRET_KEY: 'octaneflow_mfa_secret',
  ENABLED_KEY: 'octaneflow_mfa_enabled',

  /**
   * Generate a new MFA secret (random 20 hex chars).
   */
  generateSecret() {
    const array = new Uint8Array(10);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Generate a time-based 6-digit code from a secret.
   * Uses 30-second time steps.
   */
  async generateCode(secret) {
    const epoch = Math.floor(Date.now() / 30000); // 30-second window
    const message = `${secret}:${epoch}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);

    // Take last 4 bytes, mod 1000000 for 6-digit code
    const offset = hashArray[hashArray.length - 1] & 0x0f;
    const code = ((hashArray[offset] & 0x7f) << 24 |
                  hashArray[offset + 1] << 16 |
                  hashArray[offset + 2] << 8 |
                  hashArray[offset + 3]) % 1000000;

    return code.toString().padStart(6, '0');
  },

  /**
   * Verify a 6-digit code against the secret.
   * Allows ±1 time step tolerance.
   */
  async verifyCode(secret, inputCode) {
    for (let drift = -1; drift <= 1; drift++) {
      const epoch = Math.floor(Date.now() / 30000) + drift;
      const message = `${secret}:${epoch}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);

      const offset = hashArray[hashArray.length - 1] & 0x0f;
      const code = ((hashArray[offset] & 0x7f) << 24 |
                    hashArray[offset + 1] << 16 |
                    hashArray[offset + 2] << 8 |
                    hashArray[offset + 3]) % 1000000;

      if (code.toString().padStart(6, '0') === inputCode) return true;
    }
    return false;
  },

  /**
   * Enable MFA for the owner account.
   */
  enableMFA() {
    const secret = this.generateSecret();
    localStorage.setItem(this.SECRET_KEY, secret);
    localStorage.setItem(this.ENABLED_KEY, 'true');
    return secret;
  },

  /**
   * Disable MFA.
   */
  disableMFA() {
    localStorage.removeItem(this.SECRET_KEY);
    localStorage.setItem(this.ENABLED_KEY, 'false');
  },

  /**
   * Check if MFA is enabled.
   */
  isEnabled() {
    return localStorage.getItem(this.ENABLED_KEY) === 'true';
  },

  /**
   * Get the stored secret.
   */
  getSecret() {
    return localStorage.getItem(this.SECRET_KEY) || '';
  },

  /**
   * Verify MFA during login.
   */
  async verify(code) {
    const secret = this.getSecret();
    if (!secret) return false;
    return this.verifyCode(secret, code);
  }
};

window.MFA = MFA;
