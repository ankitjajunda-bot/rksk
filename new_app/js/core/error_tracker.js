// ============================================================================
// js/core/error_tracker.js — Centralized Error Logging
// ============================================================================

const ErrorTracker = {
  MAX_LOGS: 500,

  async log(severity, message, context = '', error = null) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      user: this._getCurrentUser(),
      message: String(message),
      stack: error?.stack || '',
      context: String(context),
      severity // 'info' | 'warning' | 'error' | 'critical'
    };

    try {
      await OctaneDB.dbPut('error_logs', entry);
      await this._pruneOldLogs();
      if (context === 'SyncQueue') {
        await this.checkSyncHealth();
      }
    } catch (e) {
      // Last resort: console
      console.warn('[ErrorTracker] Failed to persist log:', entry, e);
    }

    // Console mirror
    const prefix = `[${severity.toUpperCase()}] [${context}]`;
    if (severity === 'error' || severity === 'critical') {
      console.error(prefix, message, error || '');
    } else if (severity === 'warning') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }
  },

  info(message, context)    { return this.log('info', message, context); },
  warning(message, context) { return this.log('warning', message, context); },
  error(message, context, err) { return this.log('error', message, context, err); },
  critical(message, context, err) { return this.log('critical', message, context, err); },

  async getAll() {
    const logs = await OctaneDB.dbGetAll('error_logs');
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  async getLast(n = 100) {
    const all = await this.getAll();
    return all.slice(0, n);
  },

  async clear() {
    await OctaneDB.dbClear('error_logs');
  },

  async _pruneOldLogs() {
    const all = await OctaneDB.dbGetAll('error_logs');
    if (all.length > this.MAX_LOGS) {
      all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const toDelete = all.slice(0, all.length - this.MAX_LOGS);
      for (const log of toDelete) {
        await OctaneDB.dbDelete('error_logs', log.id);
      }
    }
  },

  async checkSyncHealth() {
    const allLogs = await OctaneDB.dbGetAll('error_logs');
    const errors = allLogs.filter(e => e.severity === 'error' && e.context === 'SyncQueue');
    const recentErrors = errors.filter(e => Date.now() - new Date(e.timestamp).getTime() < 60000); // Last minute
    
    if (recentErrors.length >= 3) {
      if (typeof showNotification === 'function') {
        showNotification('⚠️ Multiple sync failures detected. Please check your internet connection and try again.', 'danger');
      }
      // Log critical alert
      await this.log('critical', 'Sync failures threshold reached (3+ in last min)', 'SyncHealth');
    }
  },

  _getCurrentUser() {
    try {
      const session = JSON.parse(sessionStorage.getItem('octaneflow_session') || 'null');
      return session?.username || 'anonymous';
    } catch { return 'anonymous'; }
  }
};

// Intercept global errors
window.addEventListener('error', (event) => {
  ErrorTracker.log('error', event.message, `Global:${event.filename}:${event.lineno}`, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  ErrorTracker.log('error', `Unhandled Promise Rejection: ${event.reason}`, 'PromiseRejection', event.reason);
});

// Monkey-patch console.error and console.warn to auto-log
const _origConsoleError = console.error.bind(console);
const _origConsoleWarn = console.warn.bind(console);

console.error = function(...args) {
  _origConsoleError(...args);
  ErrorTracker.log('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'console.error').catch(() => {});
};

console.warn = function(...args) {
  _origConsoleWarn(...args);
  ErrorTracker.log('warning', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'console.warn').catch(() => {});
};

window.ErrorTracker = ErrorTracker;
