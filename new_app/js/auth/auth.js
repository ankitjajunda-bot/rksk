// ============================================================================
// js/auth/auth.js — Authentication Logic with Rate Limiting
// ============================================================================

const Auth = {
  SESSION_KEY: 'octaneflow_session',
  LOCKOUT_KEY: 'octaneflow_lockout',
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION: 5 * 60 * 1000, // 5 minutes

  async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  getSession() {
    try { return JSON.parse(sessionStorage.getItem(this.SESSION_KEY) || 'null'); }
    catch { return null; }
  },

  setSession(user, token = null) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
      username: user.username || user.phone,
      displayName: user.displayName || user.name,
      role: user.role || 'employee',
      uid: user.id,
      token: token, // Secure token for verification
      loginAt: new Date().toISOString()
    }));
  },

  clearSession() {
    sessionStorage.removeItem(this.SESSION_KEY);
  },

  isLockedOut() {
    try {
      const lockout = JSON.parse(localStorage.getItem(this.LOCKOUT_KEY) || 'null');
      if (!lockout) return false;
      if (Date.now() - lockout.timestamp > this.LOCKOUT_DURATION) {
        localStorage.removeItem(this.LOCKOUT_KEY);
        return false;
      }
      return lockout.attempts >= this.MAX_ATTEMPTS;
    } catch { return false; }
  },

  recordFailedAttempt() {
    let lockout = { attempts: 0, timestamp: Date.now() };
    try { lockout = JSON.parse(localStorage.getItem(this.LOCKOUT_KEY) || '{}'); } catch {}
    lockout.attempts = (lockout.attempts || 0) + 1;
    lockout.timestamp = Date.now();
    localStorage.setItem(this.LOCKOUT_KEY, JSON.stringify(lockout));
    return lockout.attempts;
  },

  clearLockout() {
    localStorage.removeItem(this.LOCKOUT_KEY);
  },

  async loginOwner(password) {
    if (this.isLockedOut()) {
      return { success: false, error: 'Account locked. Try again in 5 minutes.' };
    }

    const DEFAULT_HASH = await this.hashString('OctaneFlow@2026');
    const storedHash = localStorage.getItem('octaneflow_owner_hash') || DEFAULT_HASH;
    const inputHash = await this.hashString(password);

    if (inputHash !== storedHash) {
      const attempts = this.recordFailedAttempt();
      const remaining = this.MAX_ATTEMPTS - attempts;
      return { success: false, error: remaining > 0 ? `Incorrect password. ${remaining} attempts remaining.` : 'Account locked for 5 minutes.' };
    }

    this.clearLockout();
    const owner = { username: 'owner', displayName: 'Owner', role: 'owner', id: 'owner' };
    
    // Generate secure session token to prevent DevTools bypass
    const token = crypto.randomUUID();
    await OctaneDB.dbPut('settings', { key: 'owner_session_token', value: token });
    
    this.setSession(owner, token);

    // Check MFA
    if (localStorage.getItem('octaneflow_mfa_enabled') === 'true') {
      return { success: true, user: owner, requiresMFA: true };
    }

    return { success: true, user: owner };
  },

  async loginEmployee() {
    return { success: false, error: 'Employee login is now link-based. Please use the login link provided by the owner.' };
  },

  logout() {
    this.clearSession();
    location.reload();
  },

  async verifySession(session) {
    if (!session) return false;

    if (session.role === 'owner') {
      // Check secure token against IndexedDB to prevent DevTools bypass
      const storedToken = await OctaneDB.dbGet('settings', 'owner_session_token');
      if (!session.token || !storedToken || session.token !== storedToken.value) {
        this.clearSession();
        return false;
      }
      return true;
    }

    // Check that the session token matches a valid user in the database
    const employees = await OctaneDB.dbGetAll('employees');
    const user = employees.find(e => e.id === session.uid);
    if (!user || user.role !== session.role || user.active === false) {
      this.clearSession();
      return false;
    }
    
    // Verify employee session token
    if (!session.token || session.token !== user.session_token) {
      this.clearSession();
      return false;
    }

    return true;
  },

  async ensureOwner() {
    const session = this.getSession();
    const isValid = await this.verifySession(session);
    if (!isValid || session.role !== 'owner') {
      throw new Error("Unauthorized: Owner access required.");
    }
    return session;
  },

  async ensureEmployee() {
    const session = this.getSession();
    const isValid = await this.verifySession(session);
    if (!isValid) {
      throw new Error("Unauthorized: Employee access required.");
    }
    return session;
  },

  async checkAuth() {
    const session = this.getSession();
    const isValid = await this.verifySession(session);
    
    const loginEl = document.getElementById('login-overlay');
    const appEl = document.getElementById('app-container');
    const empEl = document.getElementById('employee-shell');

    if (!isValid) {
      if (loginEl) loginEl.style.display = 'flex';
      if (appEl) appEl.style.display = 'none';
      if (empEl) empEl.style.display = 'none';
      return null;
    }

    if (loginEl) loginEl.style.display = 'none';
    if (session.role === 'owner') {
      if (appEl) appEl.style.display = 'flex';
      if (empEl) empEl.style.display = 'none';
    } else {
      if (appEl) appEl.style.display = 'none';
      if (empEl) empEl.style.display = 'flex';
    }
    return session;
  },

  async changeOwnerPassword(oldPassword, newPassword) {
    const DEFAULT_HASH = await this.hashString('OctaneFlow@2026');
    const storedHash = localStorage.getItem('octaneflow_owner_hash') || DEFAULT_HASH;
    const oldHash = await this.hashString(oldPassword);

    if (oldHash !== storedHash) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    const newHash = await this.hashString(newPassword);
    localStorage.setItem('octaneflow_owner_hash', newHash);
    return { success: true };
  }
};

window.Auth = Auth;
