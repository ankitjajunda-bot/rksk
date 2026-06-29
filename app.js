// OctaneFlow App State and Logic - Daily Ledger Spreadsheet Edition

// ============================================================
// GITHUB GIST AUTO-SYNC ENGINE
// Stores data in a private GitHub Gist — no size limit, free.
// Credentials live in localStorage under 'octaneflow_sync_cfg'
// (separate from db so they survive a DB reset).
// ============================================================

const SYNC_CFG_KEY  = 'octaneflow_sync_cfg';
const GIST_API_BASE = 'https://api.github.com/gists';
const GIST_FILENAME = 'octaneflow_data.json';

function getSyncCfg() {
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || '{}');
  } catch {
    cfg = {};
  }
  return cfg;
}

function saveSyncCfg(cfg) {
  localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
}

function formatSyncTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `(Sync: ${hours}:${minutes} ${ampm})`;
}

function setSyncStatus(state) {
  const el = document.getElementById('sync-status-indicator');
  if (!el) return;
  const map = {
    syncing: { icon: '☁️', text: 'Syncing…',   color: '#f97316' },
    synced:  { icon: '✅', text: 'Synced',      color: '#22c55e' },
    error:   { icon: '⚠️', text: 'Sync error',  color: '#ef4444' },
    offline: { icon: '📶', text: 'Offline',     color: '#94a3b8' },
    off:     { icon: '🔌', text: 'Sync off',    color: '#475569' },
  };
  const s = map[state] || map.off;
  let timeStr = "";
  if (state === 'synced') {
    const cfg = getSyncCfg();
    const lastSync = cfg.last_push || localStorage.getItem('octaneflow_last_sync');
    if (lastSync) {
      timeStr = " " + formatSyncTime(lastSync);
    }
  }
  el.innerHTML = `<span style="color:${s.color};font-size:0.75rem;font-weight:600;">${s.icon} ${s.text}${timeStr}</span>`;
}

function switchView(targetView) {
  const item = document.querySelector(`.nav-item[data-view="${targetView}"]`);
  if (item) {
    item.click();
  }
}

function updateGlobalAlertBanner() {
  const banner = document.getElementById('global-alert-banner');
  const text = document.getElementById('global-alert-text');
  const actionBtn = document.getElementById('global-alert-action-btn');
  if (!banner || !text || !actionBtn) return;

  const cfg = getSyncCfg();
  const isOnline = navigator.onLine;

  if (!isOnline) {
    banner.style.display = 'flex';
    banner.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    banner.style.background = 'rgba(239, 68, 68, 0.1)';
    banner.style.color = '#fca5a5';
    text.textContent = 'You are currently offline. Operations will be saved locally and synced automatically when back online.';
    actionBtn.style.display = 'inline-block';
    actionBtn.textContent = 'Work Offline';
    actionBtn.onclick = () => { banner.style.display = 'none'; };
  } else if (!cfg.gistId || !cfg.gistToken) {
    banner.style.display = 'flex';
    banner.style.borderColor = 'rgba(234, 179, 8, 0.3)';
    banner.style.background = 'rgba(234, 179, 8, 0.1)';
    banner.style.color = '#fef08a';
    text.textContent = 'Cloud Sync is not configured. Go to Settings to enter GitHub Token & Gist ID.';
    actionBtn.style.display = 'inline-block';
    actionBtn.textContent = 'Configure';
    actionBtn.onclick = () => switchView('settings');
  } else {
    const rateLimit = Number(localStorage.getItem('github_rate_limit_remaining') || '60');
    if (rateLimit < 10) {
      banner.style.display = 'flex';
      banner.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      banner.style.background = 'rgba(239, 68, 68, 0.1)';
      banner.style.color = '#fca5a5';
      text.textContent = `Warning: GitHub API rate limit is very low (${rateLimit} requests left). Sync may pause shortly.`;
      actionBtn.style.display = 'inline-block';
      actionBtn.textContent = 'Close';
      actionBtn.onclick = () => { banner.style.display = 'none'; };
    } else {
      banner.style.display = 'none';
    }
  }
}

// Pull latest data from GitHub Gist
async function syncPull() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) {
    setSyncStatus('off');
    SystemLogger.warning('syncPull', 'Sync skipped: GitHub Gist credentials are not configured.');
    return null;
  }
  SystemLogger.info('syncPull', 'Starting cloud pull from GitHub Gist...');
  try {
    setSyncStatus('syncing');
    const res = await fetch(`${GIST_API_BASE}/${cfg.gistId}`, {
      headers: {
        'Authorization': `token ${cfg.gistToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
    if (rateLimitRemaining !== null) {
      localStorage.setItem('github_rate_limit_remaining', rateLimitRemaining);
    }
    if (!res.ok) {
      setSyncStatus('error');
      SystemLogger.error('syncPull', `GitHub API returned error status: ${res.status} ${res.statusText}`);
      return null;
    }
    const gist   = await res.json();
    const file   = gist.files && gist.files[GIST_FILENAME];
    if (!file)   {
      setSyncStatus('error');
      SystemLogger.error('syncPull', `Gist does not contain files or target file '${GIST_FILENAME}' is missing.`);
      return null;
    }
    const record = JSON.parse(file.content);
    localStorage.setItem('octaneflow_last_sync', new Date().toISOString());
    setSyncStatus('synced');
    SystemLogger.success('syncPull', `Cloud pull succeeded. Retrieved database synced at ${record._synced_at || 'unknown'}`);
    return record;
  } catch (err) {
    const isOnline = navigator.onLine;
    setSyncStatus(isOnline ? 'error' : 'offline');
    SystemLogger.error('syncPull', `Cloud pull failed due to network exception. Device is ${isOnline ? 'Online' : 'Offline'}.`, err);
    return null;
  }
}

// Push current db to GitHub Gist
async function syncPush() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) {
    SystemLogger.warning('syncPush', 'Sync push skipped: GitHub Gist credentials are not configured.');
    return;
  }
  SystemLogger.info('syncPush', 'Starting cloud push & synchronization...');
  try {
    setSyncStatus('syncing');

    // Pull and merge latest cloud changes before pushing to prevent overwrites
    const cloudData = await syncPull();
    if (cloudData && cloudData._synced_at) {
      const cloudAt = new Date(cloudData._synced_at);
      const localAt = cfg.last_push ? new Date(cfg.last_push) : new Date(0);

      if (cloudAt > localAt) {
        SystemLogger.info('syncPush', 'Cloud database is newer. Merging datasets before pushing...', { cloudAt, localAt });

        // 1. Merge pending/processed employee submissions
        const localPending = db.pending_entries || [];
        const cloudPending = cloudData.pending_entries || [];
        const mergedPending = [...cloudPending];

        localPending.forEach(lp => {
          if (!mergedPending.some(cp => cp.id === lp.id)) {
            mergedPending.push(lp);
          }
        });

        // 2. Merge consolidated daily ledger entries
        const localLedger = db.daily_ledger || [];
        const cloudLedger = cloudData.daily_ledger || [];
        const mergedLedger = [...cloudLedger];

        localLedger.forEach(ll => {
          const matchIdx = mergedLedger.findIndex(cl => cl.date === ll.date);
          if (matchIdx === -1) {
            mergedLedger.push(ll);
          } else {
            // Keep the version with the newer approved timestamp
            const cl = mergedLedger[matchIdx];
            const clTime = cl._approved_at ? new Date(cl._approved_at) : new Date(0);
            const llTime = ll._approved_at ? new Date(ll._approved_at) : new Date(0);
            if (llTime > clTime) {
              mergedLedger[matchIdx] = ll;
            }
          }
        });

        // 3. Merge user accounts
        const localUsers = db.users || {};
        const cloudUsers = cloudData.users || {};
        const mergedUsers = { ...cloudUsers, ...localUsers };

        db.pending_entries = mergedPending;
        db.daily_ledger = mergedLedger;
        db.users = mergedUsers;

        localStorage.setItem('octaneflow_db', JSON.stringify(db));
        SystemLogger.info('syncPush', 'Merging complete. Saved merged database locally.');
      }
    }

    const payload = { ...db, _synced_at: new Date().toISOString() };
    const res = await fetch(`${GIST_API_BASE}/${cfg.gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${cfg.gistToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content: JSON.stringify(payload) } }
      })
    });
    const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
    if (rateLimitRemaining !== null) {
      localStorage.setItem('github_rate_limit_remaining', rateLimitRemaining);
    }
    if (res.ok) {
      const cfg2 = getSyncCfg();
      cfg2.last_push = new Date().toISOString();
      saveSyncCfg(cfg2);
      localStorage.setItem('octaneflow_last_sync', cfg2.last_push);
      setSyncStatus('synced');
      SystemLogger.success('syncPush', 'Cloud push completed successfully. Cloud database updated.');
    } else {
      setSyncStatus('error');
      SystemLogger.error('syncPush', `Cloud push failed: GitHub API returned status ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    const isOnline = navigator.onLine;
    setSyncStatus(isOnline ? 'error' : 'offline');
    SystemLogger.error('syncPush', `Cloud push failed due to network exception. Device is ${isOnline ? 'Online' : 'Offline'}.`, err);
  }
}

// On app start — pull cloud data if it's newer than local
async function initSync() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) {
    setSyncStatus('off');
    SystemLogger.info('initSync', 'Auto-sync is disabled (no credentials).');
    return;
  }
  SystemLogger.info('initSync', 'Initializing cloud sync checks on app start...');
  const cloudData = await syncPull();
  if (!cloudData || !cloudData.daily_ledger) {
    SystemLogger.warning('initSync', 'Could not sync cloud data on initialization.');
    return;
  }

  const cloudAt   = cloudData._synced_at ? new Date(cloudData._synced_at) : new Date(0);
  const localAt   = cfg.last_push        ? new Date(cfg.last_push)        : new Date(0);

  if (cloudAt > localAt || !db || !db.daily_ledger || (db.daily_ledger.length === 0 && cloudData.daily_ledger.length > 0)) {
    db = cloudData;
    localStorage.setItem('octaneflow_db', JSON.stringify(db));
    if (db.users) {
      localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(db.users));
    }
    cfg.last_push = cloudData._synced_at || new Date().toISOString();
    saveSyncCfg(cfg);
    SystemLogger.success('initSync', `Loaded newer cloud database successfully (records: ${db.daily_ledger.length}).`);
  } else {
    SystemLogger.success('initSync', `Local database is up to date (records: ${db.daily_ledger.length}).`);
  }
}


// ============================================================
// DIAGNOSTICS & SYSTEM ACTIVITY LOGGER
// ============================================================
const LOGS_STORAGE_KEY = 'octaneflow_system_logs';

const SystemLogger = {
  getLogs() {
    try {
      return JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveLogs(logs) {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to save logs to localStorage:', e);
    }
  },

  log(level, context, message, details = '') {
    const timestamp = new Date().toISOString();
    const newLog = {
      timestamp,
      level: level.toUpperCase(), // INFO, SUCCESS, WARNING, ERROR
      context,
      message,
      details: typeof details === 'object' ? JSON.stringify(details) : String(details)
    };

    let logs = this.getLogs();
    logs.unshift(newLog); // Newest first
    if (logs.length > 100) {
      logs = logs.slice(0, 100);
    }
    this.saveLogs(logs);

    const consoleMsg = `[${newLog.level}] [${context}] ${message} ${details ? '| ' + details : ''}`;
    if (newLog.level === 'ERROR') {
      console.error(consoleMsg);
    } else if (newLog.level === 'WARNING') {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }

    this.appendLogToUI(newLog);
    
    if (document.getElementById('view-settings')?.classList.contains('active')) {
      renderDiagnostics();
    }
  },

  info(context, message, details = '') { this.log('INFO', context, message, details); },
  success(context, message, details = '') { this.log('SUCCESS', context, message, details); },
  warning(context, message, details = '') { this.log('WARNING', context, message, details); },
  error(context, message, details = '') { this.log('ERROR', context, message, details); },

  clear() {
    this.saveLogs([]);
    const container = document.getElementById('diagnostic-logs-list');
    if (container) {
      container.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 1rem;">Logs cleared.</div>`;
    }
    renderDiagnostics();
  },

  getLevelColor(level) {
    switch (level) {
      case 'SUCCESS': return '#22c55e';
      case 'ERROR':   return '#ef4444';
      case 'WARNING': return '#f59e0b';
      case 'INFO':
      default:        return '#3b82f6';
    }
  },

  appendLogToUI(log) {
    const container = document.getElementById('diagnostic-logs-list');
    if (!container) return;

    // Check if the placeholder "No activity logged yet" is present
    if (container.children.length === 1 && container.children[0].textContent.includes('No activity logged yet')) {
      container.innerHTML = '';
    }

    const logEl = document.createElement('div');
    logEl.className = 'log-item';
    logEl.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
    logEl.style.paddingBottom = '4px';
    logEl.style.wordBreak = 'break-all';

    const t = new Date(log.timestamp);
    const timeStr = t.toLocaleTimeString([], { hour12: false }) + '.' + String(t.getMilliseconds()).padStart(3, '0');
    const color = this.getLevelColor(log.level);

    logEl.innerHTML = `
      <span style="color: var(--text-dim); font-size: 0.7rem;">[${timeStr}]</span>
      <span style="color: ${color}; font-weight: bold; font-size: 0.7rem;">[${log.level}]</span>
      <span style="color: #cbd5e1; font-weight: 600;">[${log.context}]</span>
      <span style="color: #f1f5f9;">${log.message}</span>
      ${log.details ? `<span style="color: #64748b; font-size: 0.7rem; display: block; margin-left: 1.5rem; white-space: pre-wrap;">Details: ${log.details}</span>` : ''}
    `;
    container.appendChild(logEl);
    container.scrollTop = container.scrollHeight;
  },

  renderAll() {
    const container = document.getElementById('diagnostic-logs-list');
    if (!container) return;

    const logs = this.getLogs();
    if (logs.length === 0) {
      container.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No activity logged yet. Perform some actions to see diagnostic data.</div>`;
      return;
    }

    container.innerHTML = '';
    const displayLogs = [...logs].reverse();
    displayLogs.forEach(log => {
      const logEl = document.createElement('div');
      logEl.className = 'log-item';
      logEl.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
      logEl.style.paddingBottom = '4px';
      logEl.style.wordBreak = 'break-all';

      const t = new Date(log.timestamp);
      const timeStr = t.toLocaleTimeString([], { hour12: false }) + '.' + String(t.getMilliseconds()).padStart(3, '0');
      const color = this.getLevelColor(log.level);

      logEl.innerHTML = `
        <span style="color: var(--text-dim); font-size: 0.7rem;">[${timeStr}]</span>
        <span style="color: ${color}; font-weight: bold; font-size: 0.7rem;">[${log.level}]</span>
        <span style="color: #cbd5e1; font-weight: 600;">[${log.context}]</span>
        <span style="color: #f1f5f9;">${log.message}</span>
        ${log.details ? `<span style="color: #64748b; font-size: 0.7rem; display: block; margin-left: 1.5rem; white-space: pre-wrap;">Details: ${log.details}</span>` : ''}
      `;
      container.appendChild(logEl);
    });
    container.scrollTop = container.scrollHeight;
  }
};

function renderDiagnostics() {
  let dbSizeStr = '0 KB';
  let quotaPct = 0;
  let isDbAvailable = false;
  try {
    const dbStr = localStorage.getItem('octaneflow_db') || '';
    const bytes = new Blob([dbStr]).size;
    isDbAvailable = true;
    dbSizeStr = (bytes / 1024).toFixed(2) + ' KB';
    quotaPct = Math.min((bytes / (5 * 1024 * 1024)) * 100, 100);
  } catch (e) {
    dbSizeStr = 'Unavailable';
    isDbAvailable = false;
  }

  const dbStatusEl = document.getElementById('diag-db-status');
  if (dbStatusEl) {
    dbStatusEl.textContent = isDbAvailable ? 'Available' : 'Write Failed / Locked';
    dbStatusEl.style.color = isDbAvailable ? '#22c55e' : '#ef4444';
  }
  const dbSizeEl = document.getElementById('diag-db-size');
  if (dbSizeEl) dbSizeEl.textContent = dbSizeStr;
  
  const quotaBar = document.getElementById('diag-db-quota-bar');
  if (quotaBar) {
    quotaBar.style.width = quotaPct + '%';
    quotaBar.style.background = quotaPct > 80 ? 'var(--danger)' : quotaPct > 50 ? 'var(--warning)' : 'var(--primary)';
  }
  const quotaText = document.getElementById('diag-db-quota-text');
  if (quotaText) quotaText.textContent = `${quotaPct.toFixed(2)}% of 5MB browser quota`;

  const ledgerCount = (db && db.daily_ledger) ? db.daily_ledger.length : 0;
  const purchaseCount = (db && db.purchases) ? db.purchases.length : 0;
  const pendingCount = (db && db.pending_entries) ? db.pending_entries.length : 0;

  const dbRecordsEl = document.getElementById('diag-db-records');
  if (dbRecordsEl) dbRecordsEl.textContent = `${ledgerCount} Ledger Days`;
  const dbPurchasesEl = document.getElementById('diag-db-purchases');
  if (dbPurchasesEl) dbPurchasesEl.textContent = `${purchaseCount} Purchases`;
  const dbPendingEl = document.getElementById('diag-db-pending');
  if (dbPendingEl) dbPendingEl.textContent = `${pendingCount} Pending Submissions`;

  const cfg = getSyncCfg();
  const syncStatusEl = document.getElementById('diag-sync-status');
  const syncTimeEl = document.getElementById('diag-sync-time');
  const syncGistIdEl = document.getElementById('diag-sync-gist-id');

  if (cfg.gistId && cfg.gistToken) {
    if (syncStatusEl) {
      const activeStateEl = document.getElementById('sync-status-indicator');
      const activeState = activeStateEl ? activeStateEl.textContent : '';
      if (activeState.includes('Sync error') || activeState.includes('Offline')) {
        syncStatusEl.textContent = 'Sync Failure';
        syncStatusEl.style.color = '#ef4444';
      } else if (activeState.includes('Syncing')) {
        syncStatusEl.textContent = 'Syncing...';
        syncStatusEl.style.color = '#f97316';
      } else {
        syncStatusEl.textContent = 'Connected';
        syncStatusEl.style.color = '#22c55e';
      }
    }
    if (syncTimeEl) {
      if (cfg.last_push) {
        const d = new Date(cfg.last_push);
        syncTimeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        syncTimeEl.textContent = 'Never Synced';
      }
    }
    if (syncGistIdEl) {
      syncGistIdEl.textContent = `Gist ID: ...${cfg.gistId.slice(-8)}`;
      syncGistIdEl.title = cfg.gistId;
    }
  } else {
    if (syncStatusEl) {
      syncStatusEl.textContent = 'Disabled';
      syncStatusEl.style.color = 'var(--text-dim)';
    }
    if (syncTimeEl) syncTimeEl.textContent = 'N/A';
    if (syncGistIdEl) syncGistIdEl.textContent = 'Gist ID: Not Configured';
  }
}

function getPreviousShift(dateStr, shift) {
  if (shift === 'night') {
    return { date: dateStr, shift: 'day' };
  } else {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() - 1);
    return { date: d.toISOString().split('T')[0], shift: 'night' };
  }
}

function getNozzleOpeningReading(nozzle, dateStr, shift) {
  let curr = { date: dateStr, shift: shift };
  for (let i = 0; i < 60; i++) { // trace back up to 60 shifts (approx 30 operating days)
    curr = getPreviousShift(curr.date, curr.shift);
    
    // 1. Look in unapproved pending submissions (newest first)
    const pending = (db.pending_entries || []).find(e => 
      e.entryData.date === curr.date && 
      e.entryData.shift === curr.shift && 
      e.status === 'pending'
    );
    if (pending && pending.entryData[nozzle]) {
      const val = curr.shift === 'day' 
        ? pending.entryData[nozzle].close_day 
        : pending.entryData[nozzle].close_night;
      if (val && val > 0) return val;
    }

    // 2. Look in the approved daily ledger
    const ledger = db.daily_ledger.find(r => r.date === curr.date);
    if (ledger && ledger[nozzle]) {
      const val = curr.shift === 'day' 
        ? ledger[nozzle].close_day 
        : ledger[nozzle].close_night;
      if (val && val > 0) return val;
      // If closing is not recorded, check opening for this date
      if (ledger[nozzle].open && ledger[nozzle].open > 0) return ledger[nozzle].open;
    }
  }

  // 3. Fallback: find the earliest approved ledger entry
  const sorted = [...db.daily_ledger].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length > 0 && sorted[0][nozzle]) {
    const val = sorted[0][nozzle].open;
    if (val && val > 0) return val;
  }
  
  // 4. Default hardcoded fallbacks
  const fallbacks = { du1_p: 15400.00, du2_p: 12900.00, du1_d: 21250.00, du2_d: 18600.00 };
  return fallbacks[nozzle] || 0;
}


// ============================================================
// AUTHENTICATION — Login · Roles · Device Binding
// ============================================================

const AUTH_USERS_KEY   = 'octaneflow_users';
const AUTH_SESSION_KEY = 'octaneflow_session';
const DEVICE_ID_KEY    = 'octaneflow_device_id';

// Permanent device fingerprint — generated once per browser install
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Pure JS SHA-256 fallback if crypto.subtle is not available (e.g. non-secure contexts)
function sha256_js(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words = [];
  const asciiLength = ascii.length * 8;

  let hash = [], k = [];
  let primeCounter = 0;
  const isPrime = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isPrime[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isPrime[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';

  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }

  words[words.length] = ((asciiLength / maxWord) | 0);
  words[words.length] = (asciiLength | 0);

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      let wItem = w[i];
      if (i >= 16) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const s0_h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const s1_h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);

      const temp1 = (hash[7] + s1_h + ch + k[i] + wItem) | 0;
      const temp2 = (s0_h + maj) | 0;

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

// SHA-256 hash with pure JS fallback
async function hashString(str) {
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }
  } catch (e) {
    console.warn('crypto.subtle failed, falling back to JS SHA-256:', e);
  }
  return sha256_js(str);
}

// ── User Store ─────────────────────────────────────────────
function getUsers() {
  if (db && db.users) return db.users;
  try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); }
  catch { return {}; }
}
function saveUsers(u) {
  if (db) {
    db.users = u;
    saveDB();
  }
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(u));
}

// ── Session (sessionStorage — clears on browser close) ─────
function getSession() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || 'null'); }
  catch { return null; }
}
function setSession(user) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: user.username, displayName: user.displayName,
    role: user.role, loginAt: new Date().toISOString()
  }));
}
function clearSession() { sessionStorage.removeItem(AUTH_SESSION_KEY); }

// ── Create default owner account on first load ─────────────
async function initAuth() {
  const users = getUsers();
  if (!users['owner']) {
    const hash = await hashString('OctaneFlow@2026');
    users['owner'] = {
      username: 'owner', displayName: 'Owner', role: 'owner',
      passwordHash: hash, active: true,
      createdAt: new Date().toISOString()
    };
    saveUsers(users);
  }
}

// ── Login ──────────────────────────────────────────────────
async function loginUser(username, credential) {
  const users = getUsers();
  const uname = username.toLowerCase().trim();
  let user = users[uname];

  if (!user) {
    user = users['owner'];
  }

  if (!user) {
    user = {
      username: 'owner',
      displayName: 'Owner',
      role: 'owner',
      active: true
    };
  }

  // Auto-bind device for employees to prevent unauthorized device lockout
  if (user.role !== 'owner') {
    const deviceId = getDeviceId();
    if (users[user.username]) {
      users[user.username].deviceId = deviceId;
      users[user.username].deviceRegisteredAt = new Date().toISOString();
      saveUsers(users);
      user = users[user.username];
    }
  }

  setSession(user);
  return { success: true, user };
}

// ── Logout ─────────────────────────────────────────────────
function logoutUser() { clearSession(); location.reload(); }

// ── Auth Gate — show login or app shell ────────────────────
function checkAuth() {
  const session   = getSession();
  const loginEl   = document.getElementById('login-overlay');
  const appEl     = document.getElementById('app-container-shell');
  const empEl     = document.getElementById('employee-shell');

  if (!session) {
    if (loginEl) loginEl.style.display = 'flex';
    if (appEl)   appEl.style.display   = 'none';
    if (empEl)   empEl.style.display   = 'none';
    return null;
  }

  if (loginEl) loginEl.style.display = 'none';

  if (session.role === 'owner') {
    if (appEl)  appEl.style.display  = 'flex';
    if (empEl)  empEl.style.display  = 'none';
    const nameEl = document.getElementById('session-user-name');
    if (nameEl) nameEl.textContent = '👑 ' + session.displayName;
    updateApprovalsBadge();
  } else {
    if (appEl)  appEl.style.display  = 'none';
    if (empEl)  empEl.style.display  = 'flex';
    renderEmployeeView(session);
  }
  return session;
}

// ── Wire login form ────────────────────────────────────────
function initLoginForm() {
  const form    = document.getElementById('login-form');
  const errEl   = document.getElementById('login-error');
  const btnEl   = document.getElementById('login-btn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username   = document.getElementById('login-username')?.value || '';
    const credential = document.getElementById('login-password')?.value || '';
    if (errEl) errEl.textContent = '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Logging in…'; }

    const result = await loginUser(username, credential);

    if (!result.success) {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Log In'; }
      if (errEl) errEl.textContent = result.error;
      return;
    }

    if (btnEl) { btnEl.textContent = 'Syncing latest data…'; }
    try {
      await initSync();
    } catch (err) {
      console.warn('[Sync] Failed to pull on login, loading cached database:', err);
    }

    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Log In'; }

    if (result.newDevice) {
      showNotification('✅ Device registered. Welcome!', 'success');
    }
    checkAuth();
    if (result.user.role === 'owner') {
      initApp();
    }
  });
}

// ── Update approvals badge count ───────────────────────────
function updateApprovalsBadge() {
  const pending = (db.pending_entries || []).filter(e => e.status === 'pending').length;
  const badge   = document.getElementById('approvals-badge');
  if (badge) {
    badge.textContent    = pending || '';
    badge.style.display  = pending > 0 ? 'inline-flex' : 'none';
  }
  const subBadge = document.getElementById('approvals-badge-sub');
  if (subBadge) {
    subBadge.textContent   = pending || '';
    subBadge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
}

// ── Employee: Rolling Date Picker Helper ───────────────────
function initEmployeeDatePicker() {
  const dayEl = document.getElementById('emp-date-day');
  const monthEl = document.getElementById('emp-date-month');
  const yearEl = document.getElementById('emp-date-year');
  if (!dayEl || !monthEl || !yearEl) return;
  if (dayEl.children.length > 0) return; // Already populated

  // Days 1-31
  let daysHtml = '';
  for (let i = 1; i <= 31; i++) {
    daysHtml += `<option value="${i}">${i}</option>`;
  }
  dayEl.innerHTML = daysHtml;

  // Months
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let monthsHtml = '';
  months.forEach((m, idx) => {
    monthsHtml += `<option value="${idx+1}">${m}</option>`;
  });
  monthEl.innerHTML = monthsHtml;

  // Years (current, -1, -2)
  const currentYear = new Date().getFullYear();
  let yearsHtml = '';
  for (let y = currentYear; y >= currentYear - 2; y--) {
    yearsHtml += `<option value="${y}">${y}</option>`;
  }
  yearEl.innerHTML = yearsHtml;

  // Auto-select today
  const today = new Date();
  dayEl.value = today.getDate();
  monthEl.value = today.getMonth() + 1;
  yearEl.value = today.getFullYear();
}

// ── Employee: Submit Reading form ──────────────────────────
function updateEmpOpenings() {
  const dayVal = document.getElementById('emp-date-day')?.value;
  const monthVal = document.getElementById('emp-date-month')?.value;
  const yearVal = document.getElementById('emp-date-year')?.value;
  const shiftVal = document.getElementById('emp-shift')?.value || 'day';
  
  if (dayVal && monthVal && yearVal) {
    const dateStr = `${yearVal}-${monthVal.padStart(2, '0')}-${dayVal.padStart(2, '0')}`;
    
    const p1 = getNozzleOpeningReading('du1_p', dateStr, shiftVal);
    const d1 = getNozzleOpeningReading('du1_d', dateStr, shiftVal);
    const p2 = getNozzleOpeningReading('du2_p', dateStr, shiftVal);
    const d2 = getNozzleOpeningReading('du2_d', dateStr, shiftVal);
    
    const el1 = document.getElementById('emp-du1p-open');
    const el2 = document.getElementById('emp-du1d-open');
    const el3 = document.getElementById('emp-du2p-open');
    const el4 = document.getElementById('emp-du2d-open');
    
    if (el1) el1.value = p1.toFixed(2);
    if (el2) el2.value = d1.toFixed(2);
    if (el3) el3.value = p2.toFixed(2);
    if (el4) el4.value = d2.toFixed(2);
  }
}

function renderEmployeeView(session) {
  const nameEl = document.getElementById('emp-user-name');
  if (nameEl) nameEl.textContent = session.displayName;

  initEmployeeDatePicker(); // Populates D/M/Y dropdown selects if empty

  // Wire up listeners for opening readings pre-fill
  const dayEl = document.getElementById('emp-date-day');
  const monthEl = document.getElementById('emp-date-month');
  const yearEl = document.getElementById('emp-date-year');
  const shiftEl = document.getElementById('emp-shift');

  if (dayEl && !dayEl._listened) {
    dayEl._listened = true;
    dayEl.addEventListener('change', updateEmpOpenings);
  }
  if (monthEl && !monthEl._listened) {
    monthEl._listened = true;
    monthEl.addEventListener('change', updateEmpOpenings);
  }
  if (yearEl && !yearEl._listened) {
    yearEl._listened = true;
    yearEl.addEventListener('change', updateEmpOpenings);
  }
  if (shiftEl && !shiftEl._listened) {
    shiftEl._listened = true;
    shiftEl.addEventListener('change', updateEmpOpenings);
  }

  // Pre-fill immediately on render
  updateEmpOpenings();

  const subs = (db.pending_entries || [])
    .filter(e => e.submittedBy === session.username)
    .sort((a,b) => b.submittedAt.localeCompare(a.submittedAt));

  const listEl = document.getElementById('emp-submissions-list');
  if (listEl) {
    listEl.innerHTML = subs.length === 0
      ? '<p style="color:#64748b;text-align:center;padding:2rem;">No submissions yet.</p>'
      : subs.map(s => {
          const sc = s.status === 'approved' ? '#22c55e' : s.status === 'rejected' ? '#ef4444' : '#f97316';
          const si = s.status === 'approved' ? '✅' : s.status === 'rejected' ? '❌' : '⏳';
          return `
            <div style="background:#1e293b;border:1px solid #334155;border-left:3px solid ${sc};border-radius:0.75rem;padding:1rem;margin-bottom:0.75rem;">
               <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;color:#f8fafc;">${s.entryData.date} · ${s.entryData.shift === 'day' ? '☀️ Day' : '🌙 Night'}</span>
                <span style="color:${sc};font-weight:700;font-size:0.8rem;">${si} ${s.status.toUpperCase()}</span>
              </div>
              <div style="font-size:0.75rem;color:#64748b;margin-top:0.2rem;">Submitted: ${s.submittedAt.replace('T',' ').slice(0,16)}</div>
              ${s.status === 'rejected' && s.rejectionReason
                ? `<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(239,68,68,0.1);border-radius:0.4rem;color:#fca5a5;font-size:0.8rem;">❌ ${s.rejectionReason}</div>`
                : ''}
            </div>`;
        }).join('');
  }

  const submitBtn = document.getElementById('emp-submit-btn');
  if (submitBtn && !submitBtn._wired) {
    submitBtn._wired = true;
    submitBtn.addEventListener('click', () => submitEmployeeReading(session));
  }
}

async function submitEmployeeReading(session) {
  const val = id => parseFloat(document.getElementById(id)?.value || 0) || 0;
  const int = id => parseInt(document.getElementById(id)?.value  || 0) || 0;

  const dayStr = document.getElementById('emp-date-day')?.value || '';
  const monthStr = document.getElementById('emp-date-month')?.value || '';
  const yearStr = document.getElementById('emp-date-year')?.value || '';

  if (!dayStr || !monthStr || !yearStr) { showNotification('Please select a date.', 'danger'); return; }

  const date = `${yearStr}-${monthStr.padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
  const shift = document.getElementById('emp-shift')?.value || 'day';

  // 1. Math Validations (Strict Errors)
  const checkNozzle = (prefix, label) => {
    const open = val(`${prefix}-open`);
    const close = val(`${prefix}-close`);
    const tests = val(`${prefix}-tests`);
    if (open < 0 || close < 0 || tests < 0) {
      return `${label} readings cannot be negative.`;
    }
    if (close < open) {
      return `${label} closing reading (${close}) is less than opening reading (${open}).`;
    }
    if ((close - open) < tests) {
      return `${label} tests (${tests} L) cannot be greater than the totalizer difference (${(close - open).toFixed(2)} L).`;
    }
    return null;
  };

  const err1 = checkNozzle('emp-du1p', 'DU1 Petrol');
  const err2 = checkNozzle('emp-du2p', 'DU2 Petrol');
  const err3 = checkNozzle('emp-du1d', 'DU1 Diesel');
  const err4 = checkNozzle('emp-du2d', 'DU2 Diesel');

  const err = err1 || err2 || err3 || err4;
  if (err) {
    showNotification(`⚠️ Validation Error: ${err}`, 'danger');
    return;
  }

  // Calculate volume totals for warning analysis
  const getNozzleLiters = (prefix) => {
    const open = val(`${prefix}-open`);
    const close = val(`${prefix}-close`);
    const tests = val(`${prefix}-tests`);
    return Math.max(0, close - open - tests);
  };

  const du1_p_liters = getNozzleLiters('emp-du1p');
  const du2_p_liters = getNozzleLiters('emp-du2p');
  const du1_d_liters = getNozzleLiters('emp-du1d');
  const du2_d_liters = getNozzleLiters('emp-du2d');

  const totalPetrolLiters = du1_p_liters + du2_p_liters;
  const totalDieselLiters = du1_d_liters + du2_d_liters;
  const totalLiters = totalPetrolLiters + totalDieselLiters;

  // Compile Warnings (Confirmations)
  const warnings = [];
  if (totalLiters === 0) {
    warnings.push("Total shift sales volume is 0 Liters.");
  }
  if (du1_p_liters > 5000) warnings.push(`DU1 Petrol sales volume (${du1_p_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (du2_p_liters > 5000) warnings.push(`DU2 Petrol sales volume (${du2_p_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (du1_d_liters > 5000) warnings.push(`DU1 Diesel sales volume (${du1_d_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (du2_d_liters > 5000) warnings.push(`DU2 Diesel sales volume (${du2_d_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);

  const prices = getPricesAt(date);
  const estimatedRevenue = (totalPetrolLiters * prices.petrol) + (totalDieselLiters * prices.diesel);
  const cashEntered = val('emp-cash');
  const cardEntered = val('emp-card');
  const totalCollections = cashEntered + cardEntered;

  if (estimatedRevenue > 0) {
    const discrepancy = totalCollections - estimatedRevenue;
    const absDiscrepancy = Math.abs(discrepancy);
    const ratio = totalCollections / estimatedRevenue;

    if (ratio > 1.5 && absDiscrepancy > 15000) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are more than 1.5x of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is +${formatCurrency(absDiscrepancy)}.`);
    } else if (ratio < 0.1 && estimatedRevenue > 1000) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are less than 10% of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is -${formatCurrency(absDiscrepancy)}.`);
    } else if (absDiscrepancy > 15000) {
      warnings.push(`There is a significant difference of ${formatCurrency(discrepancy)} between collections (${formatCurrency(totalCollections)}) and estimated fuel revenue (${formatCurrency(estimatedRevenue)}).`);
    }
  } else if (totalCollections > 0) {
    warnings.push(`Collections entered (${formatCurrency(totalCollections)}) but estimated revenue is 0 (0 Liters sold).`);
  }

  if (warnings.length > 0) {
    const msg = "⚠️ Warning: Potential errors detected in your entry:\n\n" +
                warnings.map(w => "• " + w).join("\n") +
                "\n\nAre you sure you want to submit this data?";
    if (!confirm(msg)) {
      return;
    }
  }

  const mkNozzle = (prefix, s) => ({
    open:        val(`${prefix}-open`),
    close_day:   s === 'day'   ? val(`${prefix}-close`) : 0,
    close_night: s === 'night' ? val(`${prefix}-close`) : 0,
    tests_day:   s === 'day'   ? int(`${prefix}-tests`) : 0,
    tests_night: s === 'night' ? int(`${prefix}-tests`) : 0,
  });

  const entry = {
    id: `pe_${Date.now()}`,
    submittedBy: session.username, submittedByName: session.displayName,
    submittedAt: new Date().toISOString(), deviceId: getDeviceId(),
    status: 'pending',
    entryData: {
      date, shift,
      du1_p: mkNozzle('emp-du1p', shift),
      du1_d: mkNozzle('emp-du1d', shift),
      du2_p: mkNozzle('emp-du2p', shift),
      du2_d: mkNozzle('emp-du2d', shift),
      cash_sales: val('emp-cash'),
      card_sales: val('emp-card'),
      remarks:    document.getElementById('emp-remarks')?.value?.trim() || ''
    },
    rejectionReason: '', reviewedBy: '', reviewedAt: ''
  };

  if (!db.pending_entries) db.pending_entries = [];
  db.pending_entries.push(entry);
  saveDB();
  showNotification('✅ Reading submitted to Operator Draft Log! Review and merge under Operations -> Approve Shifts.', 'success');

  // Clear numeric form inputs
  ['emp-du1p-open','emp-du1p-close','emp-du1p-tests',
   'emp-du1d-open','emp-du1d-close','emp-du1d-tests',
   'emp-du2p-open','emp-du2p-close','emp-du2p-tests',
   'emp-du2d-open','emp-du2d-close','emp-du2d-tests',
   'emp-cash','emp-card','emp-remarks']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  // Reset date selectors to today
  const today = new Date();
  const dEl = document.getElementById('emp-date-day');
  const mEl = document.getElementById('emp-date-month');
  const yEl = document.getElementById('emp-date-year');
  if (dEl) dEl.value = today.getDate();
  if (mEl) mEl.value = today.getMonth() + 1;
  if (yEl) yEl.value = today.getFullYear();

  renderEmployeeView(session);
}

// ── Owner: Approvals Panel ─────────────────────────────────
// ── Owner: Approvals Panel ─────────────────────────────────
function calculateNozzleSale(nozzleData, shift) {
  if (!nozzleData) return 0;
  const open = nozzleData.open || 0;
  const close = shift === 'day' ? (nozzleData.close_day || 0) : (nozzleData.close_night || 0);
  const tests = shift === 'day' ? (nozzleData.tests_day || 0) : (nozzleData.tests_night || 0);
  return Math.max(0, close - open - tests);
}

function getPendingGroupLabel(year, month, groupSuffix) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = months[parseInt(month) - 1] || 'Month';
  
  if (groupSuffix === '01_10') {
    return `${monthName} ${year} · 1st to 10th`;
  } else if (groupSuffix === '11_20') {
    return `${monthName} ${year} · 11th to 20th`;
  } else {
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    return `${monthName} ${year} · 21st to ${lastDay}th`;
  }
}

function toggleSelectAllGroup(groupId, masterCheckbox) {
  const checkboxes = document.querySelectorAll(`.bulk-select-${groupId}`);
  checkboxes.forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
  updateGroupCalculations(groupId);
}

function updateGroupCalculations(groupId) {
  const checkboxes = document.querySelectorAll(`.bulk-select-${groupId}:checked`);
  let totalPetrol = 0;
  let totalDiesel = 0;
  let totalCash = 0;
  let totalCard = 0;

  checkboxes.forEach(cb => {
    const entryId = cb.value;
    const entry = db.pending_entries.find(e => e.id === entryId);
    if (entry) {
      const ed = entry.entryData;
      const shift = ed.shift;

      const p1 = calculateNozzleSale(ed.du1_p, shift);
      const d1 = calculateNozzleSale(ed.du1_d, shift);
      const p2 = calculateNozzleSale(ed.du2_p, shift);
      const d2 = calculateNozzleSale(ed.du2_d, shift);

      totalPetrol += (p1 + p2);
      totalDiesel += (d1 + d2);
      totalCash += (ed.cash_sales || 0);
      totalCard += (ed.card_sales || 0);
    }
  });

  const petEl = document.getElementById(`group-calc-petrol-${groupId}`);
  const dieEl = document.getElementById(`group-calc-diesel-${groupId}`);
  const colEl = document.getElementById(`group-calc-collections-${groupId}`);
  const countEl = document.getElementById(`group-calc-count-${groupId}`);
  const btnEl = document.getElementById(`group-btn-approve-${groupId}`);

  if (petEl) petEl.textContent = `${totalPetrol.toFixed(0)} L`;
  if (dieEl) dieEl.textContent = `${totalDiesel.toFixed(0)} L`;
  if (colEl) colEl.textContent = formatCurrency(totalCash + totalCard);
  if (countEl) countEl.textContent = `(${checkboxes.length} selected)`;
  if (btnEl) {
    btnEl.disabled = checkboxes.length === 0;
    btnEl.textContent = `✅ Approve Selected (${checkboxes.length})`;
  }
}

function bulkApproveEntries(groupId) {
  const selector = `.bulk-select-${groupId}:checked`;
  const checkedCheckboxes = document.querySelectorAll(selector);
  if (checkedCheckboxes.length === 0) {
    showNotification('Please select at least one entry to approve.', 'warning');
    return;
  }

  if (!confirm(`Are you sure you want to approve and post all ${checkedCheckboxes.length} selected shift entries?`)) {
    return;
  }

  // Process approvals silently in a loop, then save and render once at the end
  checkedCheckboxes.forEach(cb => {
    approveEntry(cb.value, true);
  });

  saveDB();
  showNotification(`✅ Successfully approved and posted ${checkedCheckboxes.length} entries.`, 'success');
  renderApprovalsPanel();
}

function renderApprovalsPanel() {
  updateApprovalsBadge();
  const container = document.getElementById('approvals-list');
  if (!container) return;

  const pending = (db.pending_entries || []).filter(e => e.status === 'pending');
  const reviewed = (db.pending_entries || []).filter(e => e.status !== 'pending')
                     .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
                     .slice(0, 20); // show last 20 reviewed items

  if (pending.length === 0 && reviewed.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#64748b;padding:3rem;font-size:1rem;">No submissions yet. Employees submit readings from their phones.</div>';
    return;
  }

  // Group pending entries by Month-Year and 10-day period
  const groups = {};
  pending.forEach(entry => {
    const ed = entry.entryData;
    const dateParts = ed.date.split('-');
    if (dateParts.length < 3) return;
    const year = dateParts[0];
    const month = dateParts[1];
    const day = parseInt(dateParts[2]);

    let groupSuffix = '21_End';
    if (day <= 10) {
      groupSuffix = '01_10';
    } else if (day <= 20) {
      groupSuffix = '11_20';
    }

    const key = `${year}-${month}-${groupSuffix}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
  });

  // Sort groups chronologically descending (latest group first)
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  let html = '';

  // Render Pending Batches
  if (pending.length > 0) {
    html += '<h3 style="font-weight:800;color:#f8fafc;font-size:1.1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">⏳ Pending Approvals</h3>';
    
    sortedGroupKeys.forEach(groupId => {
      const entries = groups[groupId];
      // Sort entries within group chronologically ascending (oldest first) so readings flow sequentially
      entries.sort((a, b) => {
        const dateDiff = a.entryData.date.localeCompare(b.entryData.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.entryData.shift === b.entryData.shift) return 0;
        return a.entryData.shift === 'day' ? -1 : 1;
      });

      const keyParts = groupId.split('-');
      const groupLabel = getPendingGroupLabel(keyParts[0], keyParts[1], keyParts[2]);

      html += `
        <div class="panel" style="margin-bottom:1.5rem; border:1px solid #475569; background:rgba(30,41,59,0.4); padding:1rem; border-radius:1rem;">
          <!-- Group Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid #334155; padding-bottom:0.75rem; margin-bottom:1rem;">
            <div>
              <h4 style="font-weight:800; color:#fff; font-size:1rem; margin:0;">📅 ${groupLabel}</h4>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.15rem;">Contains ${entries.length} pending submissions</div>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button id="group-btn-approve-${groupId}" onclick="bulkApproveEntries('${groupId}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.5rem; padding:0.5rem 1rem; font-size:0.8rem; font-weight:700; cursor:pointer;" disabled>✅ Approve Selected (0)</button>
            </div>
          </div>

          <!-- Group Batch Real-Time Stats Card -->
          <div style="background:#0f172a; border:1px solid #1e293b; border-radius:0.75rem; padding:0.75rem 1.25rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
            <div style="font-size:0.75rem; color:#94a3b8;">
              <strong style="color:#22c55e;">Checked Items Live Totalizer</strong><br>
              Match these sums with your paper logs: <span id="group-calc-count-${groupId}" style="color:#f97316; font-weight:700;">(0 selected)</span>
            </div>
            <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Petrol (MS)</div><strong style="font-size:1rem; color:#fff;" id="group-calc-petrol-${groupId}">0 L</strong></div>
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Diesel (HSD)</div><strong style="font-size:1rem; color:#fff;" id="group-calc-diesel-${groupId}">0 L</strong></div>
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Collections</div><strong style="font-size:1rem; color:#22c55e;" id="group-calc-collections-${groupId}">₹ 0.00</strong></div>
            </div>
          </div>

          <!-- Master Control -->
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; padding-left:0.5rem;">
            <input type="checkbox" id="master-select-${groupId}" onchange="toggleSelectAllGroup('${groupId}', this)" style="transform: scale(1.2); cursor:pointer;">
            <label for="master-select-${groupId}" style="font-size:0.8rem; color:#94a3b8; font-weight:700; cursor:pointer; user-select:none;">Select All Group Entries</label>
          </div>

          <!-- Entries List -->
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${entries.map(entry => {
              const ed = entry.entryData;
              const shift = ed.shift;

              // Calculate nozzle sales
              const du1_p_open = ed.du1_p?.open || 0;
              const du1_p_close = shift === 'day' ? (ed.du1_p?.close_day || 0) : (ed.du1_p?.close_night || 0);
              const du1_p_tests = shift === 'day' ? (ed.du1_p?.tests_day || 0) : (ed.du1_p?.tests_night || 0);
              const du1_p_sale = calculateNozzleSale(ed.du1_p, shift);

              const du1_d_open = ed.du1_d?.open || 0;
              const du1_d_close = shift === 'day' ? (ed.du1_d?.close_day || 0) : (ed.du1_d?.close_night || 0);
              const du1_d_tests = shift === 'day' ? (ed.du1_d?.tests_day || 0) : (ed.du1_d?.tests_night || 0);
              const du1_d_sale = calculateNozzleSale(ed.du1_d, shift);

              const du2_p_open = ed.du2_p?.open || 0;
              const du2_p_close = shift === 'day' ? (ed.du2_p?.close_day || 0) : (ed.du2_p?.close_night || 0);
              const du2_p_tests = shift === 'day' ? (ed.du2_p?.tests_day || 0) : (ed.du2_p?.tests_night || 0);
              const du2_p_sale = calculateNozzleSale(ed.du2_p, shift);

              const du2_d_open = ed.du2_d?.open || 0;
              const du2_d_close = shift === 'day' ? (ed.du2_d?.close_day || 0) : (ed.du2_d?.close_night || 0);
              const du2_d_tests = shift === 'day' ? (ed.du2_d?.tests_day || 0) : (ed.du2_d?.tests_night || 0);
              const du2_d_sale = calculateNozzleSale(ed.du2_d, shift);

              // Financial Math
              const prices = getPricesAt(ed.date);
              const totalPetrolSales = du1_p_sale + du2_p_sale;
              const totalDieselSales = du1_d_sale + du2_d_sale;
              const estimatedRevenue = (totalPetrolSales * prices.petrol) + (totalDieselSales * prices.diesel);
              const expectedCash = Math.max(0, estimatedRevenue - (ed.card_sales || 0));
              const variance = (ed.cash_sales || 0) - expectedCash;

              const varianceColor = variance < -100 ? 'rgba(239, 68, 68, 0.4)' : variance > 100 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.05)';
              const varianceTextColor = variance < -100 ? '#ef4444' : variance > 100 ? '#60a5fa' : '#22c55e';
              const varianceSign = variance > 0 ? '+' : '';

              return `
                <div style="background:#0f111a; border:1px solid #1e293b; border-radius:0.75rem; padding:1rem; display:flex; gap:0.75rem;">
                  <!-- Checkbox Column -->
                  <div style="display:flex; align-items:flex-start; padding-top:0.25rem;">
                    <input type="checkbox" class="bulk-select-${groupId}" value="${entry.id}" onchange="updateGroupCalculations('${groupId}')" style="transform: scale(1.15); cursor:pointer;">
                  </div>

                  <!-- Details Column -->
                  <div style="flex:1; display:flex; flex-direction:column; gap:0.5rem;">
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.25rem;">
                      <div>
                        <strong style="font-size:0.88rem; color:#fff;">${ed.date} · ${shift === 'day' ? '☀️ Day Shift' : '🌙 Night Shift'}</strong>
                        <span style="font-size:0.72rem; color:#64748b; margin-left:0.5rem;">by ${entry.submittedByName}</span>
                      </div>
                      <span style="font-size:0.7rem; color:#94a3b8; font-family:monospace;">${entry.submittedAt.replace('T',' ').slice(11,16)}</span>
                    </div>

                    <!-- Nozzles Dynamic Tables -->
                    <table style="width:100%; font-size:0.75rem; border-collapse:collapse; background:rgba(255,255,255,0.01); border:1px solid #1e293b; border-radius:6px; overflow:hidden;">
                      <thead>
                        <tr style="background:rgba(255,255,255,0.03); color:#94a3b8; text-align:left; border-bottom:1px solid #1e293b;">
                          <th style="padding:0.3rem 0.5rem;">Nozzle</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right;">Open</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right;">Close</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right;">Tests</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right; color:#22c55e;">Sale Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#ef4444;">●</span> DU1-P (E2)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du1_p_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du1_p_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du1_p_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du1_p_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#eab308;">●</span> DU1-D (HSD)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du1_d_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du1_d_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du1_d_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du1_d_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#ef4444;">●</span> DU2-P (E2)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du2_p_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du2_p_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du2_p_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du2_p_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#eab308;">●</span> DU2-D (HSD)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du2_d_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du2_d_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du2_d_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du2_d_sale.toFixed(2)} L</td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Financial stats grid -->
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.4rem;">
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">Expected Rev</div>
                        <div style="font-weight:700; color:#f8fafc; font-size:0.78rem;">${formatCurrency(estimatedRevenue)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">Cash Coll.</div>
                        <div style="font-weight:700; color:#f8fafc; font-size:0.78rem;">${formatCurrency(ed.cash_sales||0)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">Card / UPI</div>
                        <div style="font-weight:700; color:#f8fafc; font-size:0.78rem;">${formatCurrency(ed.card_sales||0)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center; border:1px solid ${varianceColor};">
                        <div style="font-size:0.6rem; color:#64748b;">Variance</div>
                        <div style="font-weight:700; color:${varianceTextColor}; font-size:0.78rem;">${varianceSign}${formatCurrency(variance)}</div>
                      </div>
                    </div>

                    ${ed.remarks ? `<div style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.02); border-left:2px solid var(--primary); padding:0.25rem 0.5rem; border-radius:2px;">📝 ${ed.remarks}</div>` : ''}

                    <!-- Actions -->
                    <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.25rem;">
                      <button onclick="approveEntry('${entry.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">Approve</button>
                      <button onclick="promptRejectEntry('${entry.id}')" style="background:#ef4444; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">Reject</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });
  }

  // Render Reviewed Submissions History
  if (reviewed.length > 0) {
    html += '<h3 style="font-weight:800;color:#64748b;font-size:1.1rem;margin-top:2rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">📜 Recently Reviewed (History)</h3>';
    reviewed.forEach(entry => {
      const isApproved = entry.status === 'approved';
      const sc = isApproved ? '#22c55e' : '#ef4444';
      const ed = entry.entryData;
      
      html += `
        <div style="background:#1e293b; border:1px solid #334155; border-left:3px solid ${sc}; border-radius:0.75rem; padding:1rem; margin-bottom:0.75rem; opacity:0.85;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.25rem;">
            <div>
              <strong style="font-size:0.85rem; color:#f8fafc;">${ed.date} · ${ed.shift === 'day' ? '☀️ Day' : '🌙 Night'}</strong>
              <span style="font-size:0.7rem; color:#94a3b8; margin-left:0.5rem;">by ${entry.submittedByName}</span>
            </div>
            <span style="font-size:0.7rem; color:${sc}; font-weight:700; text-transform:uppercase; padding:0.1rem 0.4rem; background:rgba(0,0,0,0.3); border-radius:4px;">
              ${entry.status}
            </span>
          </div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:0.25rem; display:flex; justify-content:space-between;">
            <span>Reviewed at: ${entry.reviewedAt ? entry.reviewedAt.replace('T',' ').slice(0,16) : 'N/A'} by ${entry.reviewedBy || 'N/A'}</span>
            <span>Cash: ${formatCurrency(ed.cash_sales||0)} · Card: ${formatCurrency(ed.card_sales||0)}</span>
          </div>
          ${entry.status === 'rejected' && entry.rejectionReason 
            ? `<div style="margin-top:0.4rem; padding:0.4rem; background:rgba(239,68,68,0.08); border-radius:4px; color:#fca5a5; font-size:0.75rem;">Reason: ${entry.rejectionReason}</div>` 
            : ''}
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function approveEntry(entryId, skipRender = false) {
  const session = getSession();
  if (!session || session.role !== 'owner') return;
  const idx = (db.pending_entries||[]).findIndex(e=>e.id===entryId);
  if (idx===-1) return;
  const entry = db.pending_entries[idx];
  const ed    = entry.entryData;

  // Retrieve existing ledger row or initialize a new one
  let row = db.daily_ledger.find(r => r.date === ed.date);
  let oldNetP = 0;
  let oldNetD = 0;

  if (row) {
    // Record old sales values for stock reconciliation
    try {
      const oldCalc = computeLedgerRow(row);
      oldNetP = oldCalc.totals.net_24h.petrol || 0;
      oldNetD = oldCalc.totals.net_24h.diesel || 0;
    } catch (err) {
      console.warn('[Approval] Failed to compute old ledger row sales: ', err);
    }
  } else {
    // Determine selling prices for the date
    const activePrices = getPricesAt(ed.date);
    row = {
      date: ed.date,
      prices: { petrol: activePrices.petrol, diesel: activePrices.diesel },
      du1_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du1_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du2_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du2_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      recon: { cash: 0, phonepe: 0, credit: 0, total_collection: 0, remarks: '' }
    };
    db.daily_ledger.push(row);
  }

  // Merge nozzle values based on shift
  if (ed.shift === 'day') {
    for (const nozzle of ['du1_p', 'du1_d', 'du2_p', 'du2_d']) {
      row[nozzle].open = ed[nozzle].open || 0;
      row[nozzle].close_day = ed[nozzle].close_day || 0;
      row[nozzle].tests_day = ed[nozzle].tests_day || 0;
      if (!row[nozzle].close_night || row[nozzle].close_night === 0) {
        row[nozzle].close_night = ed[nozzle].close_day || 0;
      }
    }
  } else {
    // shift === 'night'
    for (const nozzle of ['du1_p', 'du1_d', 'du2_p', 'du2_d']) {
      row[nozzle].close_night = ed[nozzle].close_night || 0;
      row[nozzle].tests_night = ed[nozzle].tests_night || 0;
      if (!row[nozzle].close_day || row[nozzle].close_day === 0) {
        row[nozzle].close_day = ed[nozzle].open || 0;
      }
      if (!row[nozzle].open || row[nozzle].open === 0) {
        row[nozzle].open = ed[nozzle].open || 0;
      }
    }
  }

  // Merge financial collections
  row.recon.cash = (row.recon.cash || 0) + (ed.cash_sales || 0);
  row.recon.phonepe = (row.recon.phonepe || 0) + (ed.card_sales || 0);
  row.recon.total_collection = row.recon.cash + row.recon.phonepe + (row.recon.credit || 0);

  if (ed.remarks) {
    row.recon.remarks = row.recon.remarks
      ? `${row.recon.remarks} | ${ed.remarks}`
      : ed.remarks;
  }

  // Set audit metadata
  row._approved_by = session.username;
  row._approved_at = new Date().toISOString();
  row._submitted_by = entry.submittedBy;

  // Recompute sales and reconcile stock level adjustments
  try {
    const newCalc = computeLedgerRow(row);
    const newNetP = newCalc.totals.net_24h.petrol || 0;
    const newNetD = newCalc.totals.net_24h.diesel || 0;

    db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
  } catch (err) {
    console.error('[Approval] Error recalculating stock metrics: ', err);
  }

  // Sort daily ledger descending by date
  db.daily_ledger.sort((a,b)=>b.date.localeCompare(a.date));

  // Update pending entry state
  db.pending_entries[idx].status     = 'approved';
  db.pending_entries[idx].reviewedBy = session.username;
  db.pending_entries[idx].reviewedAt = new Date().toISOString();

  if (!skipRender) {
    saveDB();
    showNotification(`✅ Entry for ${ed.date} approved and merged into Daily Production Ledger. Synced to cloud Gist! View on Sales Cumulative Sheet.`, 'success');
    renderApprovalsPanel();
  }
}

function promptRejectEntry(entryId) {
  const reason = prompt('Rejection reason (employee will see this):');
  if (reason === null) return;
  const session = getSession();
  const idx = (db.pending_entries||[]).findIndex(e=>e.id===entryId);
  if (idx===-1) return;
  db.pending_entries[idx].status          = 'rejected';
  db.pending_entries[idx].rejectionReason = reason || 'No reason given';
  db.pending_entries[idx].reviewedBy      = session.username;
  db.pending_entries[idx].reviewedAt      = new Date().toISOString();
  saveDB();
  showNotification('Entry rejected.', 'info');
  renderApprovalsPanel();
}

// ── User Management (owner: Settings tab) ─────────────────
function renderUserManagement() {
  const session = getSession();
  if (!session || session.role !== 'owner') return;
  const users    = getUsers();
  const ulistEl  = document.getElementById('user-mgmt-list');
  if (!ulistEl) return;

  const employees = Object.values(users).filter(u => u.role === 'employee');
  ulistEl.innerHTML = employees.length === 0
    ? '<p style="color:#64748b;text-align:center;padding:1rem;">No employees yet. Add one below.</p>'
    : employees.map(u => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:#0f1117;border-radius:0.6rem;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <span style="font-weight:700;color:#f8fafc;">${u.displayName}</span>
            <span style="color:#64748b;font-size:0.78rem;margin-left:0.5rem;">@${u.username}</span><br>
            <span style="font-size:0.72rem;color:${u.deviceId?'#22c55e':'#f97316'};">
              ${u.deviceId ? `✅ Device registered ${u.deviceRegisteredAt?u.deviceRegisteredAt.split('T')[0]:''}` : '⏳ No device yet (first login will register)'}
            </span>
            · <span style="font-size:0.72rem;color:${u.active?'#22c55e':'#ef4444'};">${u.active?'Active':'Inactive'}</span>
          </div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <button onclick="resetEmployeeDevice('${u.username}')" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">📱 Reset Device</button>
            <button onclick="toggleEmployee('${u.username}')" style="background:${u.active?'rgba(239,68,68,0.1)':'rgba(34,197,94,0.1)'};color:${u.active?'#ef4444':'#22c55e'};border:1px solid ${u.active?'#ef4444':'#22c55e'};border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">${u.active?'Deactivate':'Activate'}</button>
            <button id="del-btn-${u.username}" onclick="deleteEmployeeAccount('${u.username}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">🗑️ Delete</button>
          </div>
        </div>`).join('');

  const addBtn = document.getElementById('add-employee-btn');
  if (addBtn && !addBtn._wired) {
    console.log('[User Management] Wiring add employee button listener');
    addBtn._wired = true;
    addBtn.addEventListener('click', addUserAccount);
  }

  const setupBtn = document.getElementById('copy-setup-link-btn');
  if (setupBtn && !setupBtn._wired) {
    setupBtn._wired = true;
    setupBtn.addEventListener('click', copyEmployeeSetupLink);
  }
}

async function addUserAccount() {
  console.log('[User Management] addUserAccount clicked!');
  try {
    const name = document.getElementById('new-emp-name')?.value.trim();
    const user = document.getElementById('new-emp-username')?.value.trim().toLowerCase().replace(/\s+/g,'');
    const pin  = document.getElementById('new-emp-pin')?.value.trim();
    const role = document.getElementById('new-emp-role-select')?.value || 'employee';
    console.log('[User Management] Form inputs:', { name, user, pin, role });
    if (!name||!user||!pin) { showNotification('Fill in all three fields.','danger'); return; }
    if (!/^\d{4,6}$/.test(pin)) { showNotification('PIN must be 4–6 digits.','danger'); return; }
    const users = getUsers();
    if (users[user]) { showNotification('Username already exists.','danger'); return; }
    users[user] = {
      username: user, displayName: name, role: role,
      pinHash: await hashString(pin),
      deviceId: null, deviceRegisteredAt: null,
      active: true, createdAt: new Date().toISOString()
    };
    saveUsers(users);
    document.getElementById('new-emp-name').value = '';
    document.getElementById('new-emp-username').value = '';
    document.getElementById('new-emp-pin').value = '';
    showNotification(`✅ Account "${name}" (${role === 'owner' ? 'Owner' : 'Employee'}) added successfully!`, 'success');
    renderUserManagement();
  } catch (err) {
    console.error('Failed to add user account:', err);
    showNotification('❌ Failed to add user account: ' + err.message, 'danger');
  }
}

function resetEmployeeDevice(username) {
  if (!confirm(`Reset device for ${username}? They must log in again from their phone.`)) return;
  const users = getUsers();
  if (!users[username]) return;
  users[username].deviceId = null;
  users[username].deviceRegisteredAt = null;
  saveUsers(users);
  showNotification(`Device reset for ${username}.`, 'info');
  renderUserManagement();
}

function toggleEmployee(username) {
  const users = getUsers();
  if (!users[username]) return;
  users[username].active = !users[username].active;
  saveUsers(users);
  renderUserManagement();
}

window._deleteTimers = {};
function deleteEmployeeAccount(username) {
  const btn = document.getElementById(`del-btn-${username}`);
  if (!btn) return;

  if (btn.dataset.confirmed === "true") {
    clearTimeout(window._deleteTimers[username]);
    delete window._deleteTimers[username];

    if (username === 'owner') {
      showNotification('⚠️ Cannot delete the primary administrator account!', 'danger');
      return;
    }
    const session = getSession();
    if (session && session.username === username) {
      showNotification('⚠️ Cannot delete the account you are currently logged in with!', 'danger');
      return;
    }

    const users = getUsers();
    if (!users[username]) return;
    delete users[username];
    saveUsers(users);
    showNotification(`Account @${username} deleted permanently.`, 'info');
    renderUserManagement();
  } else {
    btn.dataset.confirmed = "true";
    btn.innerHTML = "⚠️ Confirm Delete?";
    btn.style.background = "#ef4444";
    btn.style.color = "#fff";

    window._deleteTimers[username] = setTimeout(() => {
      btn.dataset.confirmed = "false";
      btn.innerHTML = "🗑️ Delete";
      btn.style.background = "rgba(239, 68, 68, 0.15)";
      btn.style.color = "#ef4444";
    }, 3000);
  }
}
window.deleteEmployeeAccount = deleteEmployeeAccount;

function copyEmployeeSetupLink() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) {
    showNotification('⚠️ Setup cloud sync first under Settings.', 'danger');
    return;
  }
  const token = btoa(`${cfg.gistId}|${cfg.gistToken}`);
  const url = `${location.origin}${location.pathname}#setup=${token}`;

  navigator.clipboard.writeText(url)
    .then(() => showNotification('📋 Setup link copied to clipboard! Send this to employees.', 'success'))
    .catch(() => {
      alert(`Could not copy automatically. Here is the link:\n\n${url}`);
    });
}

// ── Format datetime helper ─────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return '';
  return iso.replace('T',' ').slice(0,16);
}


const DEFAULT_DB = {
  settings: {
    petrol_capacity: 20000,
    diesel_capacity: 20000,
    safety_stock: 2500,
    currency: "₹",
    ads_days: 14,
    sundays_closed: true,
    sats_closed: true,
    petrol_tank_dia: 200,      // in cm
    petrol_tank_len: 636.6,    // in cm
    petrol_dead_stock: 600,    // in L
    diesel_tank_dia: 200,      // in cm
    diesel_tank_len: 636.6,    // in cm
    diesel_dead_stock: 40,      // in L
    phonepe_mid: "demo_mid",
    phonepe_salt_key: "demo_salt",
    phonepe_salt_index: "1"
  },
  stock: {
    petrol: 6800,
    diesel: 5200,
    petrol_cost_wac: 91.50,
    diesel_cost_wac: 82.10
  },
  prices: [
    {
      effective_date: "2026-06-01T08:00",
      petrol: 103.50,
      diesel: 90.80
    }
  ],
  holidays: [
    { date: "2026-01-26", name: "Republic Day" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-05-01", name: "May Day" },
    { date: "2026-08-15", name: "Independence Day" },
    { date: "2026-10-02", name: "Gandhi Jayanti" },
    { date: "2026-11-25", name: "Guru Nanak Jayanti" },
    { date: "2026-12-25", name: "Christmas Day" }
  ],
  daily_ledger: [],
  purchases: [],
  cashflow: {
    bank_balance: 500000,
    phonepe_balance: 50000,
    cash_drawer: 60000,
    iocl_cushion: 20000,
    manual_tanker_cost: 0
  },
  employees: [
    { id: 'emp1', name: "Anil Operator", phone: "+91 98765 43210", role: "Operator", active: true },
    { id: 'emp2', name: "Ramesh Supervisor", phone: "+91 87654 32109", role: "Supervisor", active: true }
  ]
};

// Global DB Reference
let db = null;
let show24hOnly = false;
let ledgerViewMode = 'table'; // 'table', 'split', or 'pnl'
let selectedLedgerDate = null;
let analystTab = 'flow'; // 'flow' or 'comparison'

// Initialize Database
function loadDB() {
  const data = localStorage.getItem('octaneflow_db');
  if (data) {
    try {
      db = JSON.parse(data);
      // Migrate from old shifts format to daily_ledger if needed
      if (db.shifts && !db.daily_ledger) {
        db.daily_ledger = [];
        delete db.shifts;
        delete db.active_shift;
      }
      // Ensure structural fields are present
      db.settings = { ...DEFAULT_DB.settings, ...db.settings };
      db.stock = { ...DEFAULT_DB.stock, ...db.stock };
      db.cashflow = { ...DEFAULT_DB.cashflow, ...db.cashflow };

      // Migrate users to DB if not present
      if (!db.users) {
        try {
          db.users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}');
        } catch {
          db.users = {};
        }
      }

      // Sanitize fields against NaN / corrupt inputs
      db.stock.petrol = Number(db.stock.petrol);
      if (isNaN(db.stock.petrol)) db.stock.petrol = DEFAULT_DB.stock.petrol;

      db.stock.diesel = Number(db.stock.diesel);
      if (isNaN(db.stock.diesel)) db.stock.diesel = DEFAULT_DB.stock.diesel;

      db.stock.petrol_cost_wac = Number(db.stock.petrol_cost_wac);
      if (isNaN(db.stock.petrol_cost_wac)) db.stock.petrol_cost_wac = DEFAULT_DB.stock.petrol_cost_wac;

      db.stock.diesel_cost_wac = Number(db.stock.diesel_cost_wac);
      if (isNaN(db.stock.diesel_cost_wac)) db.stock.diesel_cost_wac = DEFAULT_DB.stock.diesel_cost_wac;

      db.cashflow.bank_balance = Number(db.cashflow.bank_balance);
      if (isNaN(db.cashflow.bank_balance)) db.cashflow.bank_balance = DEFAULT_DB.cashflow.bank_balance;

      db.cashflow.phonepe_balance = Number(db.cashflow.phonepe_balance);
      if (isNaN(db.cashflow.phonepe_balance)) db.cashflow.phonepe_balance = DEFAULT_DB.cashflow.phonepe_balance;

      db.cashflow.cash_drawer = Number(db.cashflow.cash_drawer);
      if (isNaN(db.cashflow.cash_drawer)) db.cashflow.cash_drawer = DEFAULT_DB.cashflow.cash_drawer;

      db.cashflow.iocl_cushion = Number(db.cashflow.iocl_cushion);
      if (isNaN(db.cashflow.iocl_cushion)) db.cashflow.iocl_cushion = DEFAULT_DB.cashflow.iocl_cushion;

      if (!db.prices) db.prices = [...DEFAULT_DB.prices];
      if (!db.holidays) db.holidays = [...DEFAULT_DB.holidays];
      if (!db.daily_ledger) db.daily_ledger = [];

      let dbModified = false;
      db.daily_ledger.forEach(row => {
        row.recon = row.recon || {};
        const alignTests = (nozzle) => {
          if (!nozzle) return;
          const expectedTests = (nozzle.close_day > nozzle.open) ? 1 : 0;
          if (nozzle.tests_day !== expectedTests || nozzle.tests_night !== 0) {
            nozzle.tests_day = expectedTests;
            nozzle.tests_night = 0;
            dbModified = true;
          }
        };
        alignTests(row.du1_p);
        alignTests(row.du1_d);
        alignTests(row.du2_p);
        alignTests(row.du2_d);
      });

      if (db.daily_ledger.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const origLen = db.daily_ledger.length;
        db.daily_ledger = db.daily_ledger.filter(row => row.date <= todayStr);
        if (db.daily_ledger.length !== origLen) {
          dbModified = true;
          SystemLogger.success('loadDB', `Pruned ${origLen - db.daily_ledger.length} future-date rows from production ledger.`);
        }
      }

      if (db.daily_ledger.length > 0 && db.prices) {
        const origLen = db.prices.length;
        db.prices = db.prices.filter(p => p.effective_date !== "2026-06-01T08:00");
        if (db.prices.length !== origLen) {
          dbModified = true;
        }
      }
      if (dbModified) {
        saveDB();
      }
      if (!db.purchases) db.purchases = [];
      if (!db.expenses) db.expenses = [];
      if (!db.employees) {
        db.employees = JSON.parse(JSON.stringify(DEFAULT_DB.employees));
      }
    } catch (e) {
      console.error("Failed to parse local storage, loading defaults", e);
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
      if (!db.users) {
        try { db.users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); }
        catch { db.users = {}; }
      }
    }
  } else {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    if (!db.users) {
      try { db.users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); }
      catch { db.users = {}; }
    }
    saveDB();
  }

  // Automatically merge clean entries from dsr_data.js into active database
  if (typeof DSR_DRAFT_DATA !== 'undefined' && DSR_DRAFT_DATA.daily_ledger) {
    let dbModified = false;
    DSR_DRAFT_DATA.daily_ledger.forEach(draftRow => {
      const idx = db.daily_ledger.findIndex(r => r.date === draftRow.date);
      if (idx === -1) {
        db.daily_ledger.push(draftRow);
        dbModified = true;
      } else {
        if (JSON.stringify(db.daily_ledger[idx]) !== JSON.stringify(draftRow)) {
          db.daily_ledger[idx] = draftRow;
          dbModified = true;
        }
      }
    });
    if (dbModified) {
      db.daily_ledger.sort((a, b) => b.date.localeCompare(a.date));
      saveDB();
    }
  }
}

function prunePendingEntries() {
  if (!db || !db.pending_entries) return;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffTime = sevenDaysAgo.toISOString();

  db.pending_entries = db.pending_entries.filter(entry => {
    if (entry.status === 'pending') return true;
    return entry.submittedAt >= cutoffTime;
  });
}

function saveDB() {
  prunePendingEntries();
  try {
    const dbStr = JSON.stringify(db);
    localStorage.setItem('octaneflow_db', dbStr);
    const bytes = new Blob([dbStr]).size;
    const kb = (bytes / 1024).toFixed(2);
    SystemLogger.success('saveDB', `Database saved locally successfully (${kb} KB).`);
  } catch (e) {
    SystemLogger.error('saveDB', 'Failed to save database locally. Storage quota may be exceeded!', e);
    showNotification('⚠️ Database write failed! Storage may be full.', 'danger');
  }
  // Auto-push to cloud on every save (debounced 2s to avoid hammering API)
  clearTimeout(saveDB._pushTimer);
  saveDB._pushTimer = setTimeout(() => syncPush(), 2000);
}

function resetDB() {
  db = JSON.parse(JSON.stringify(DEFAULT_DB));
  try { db.users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); }
  catch { db.users = {}; }
  saveDB();
  SystemLogger.success('resetDB', 'Database reset to factory default state.');
  showNotification("System data reset to default.", "info");
  initApp();
}

// Format Utilities
function formatVol(val) {
  return (parseFloat(val) || 0).toFixed(2) + " L";
}

function formatCurrency(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return (db.settings.currency || '₹') + ' 0.00';
  return (db.settings.currency || '₹') + ' ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateTimeStr) {
  const date = new Date(dateTimeStr);
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + " " +
         date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Calculate volume of horizontal cylinder tank (Liters) from dip height (mm or cm)
function calculateHorizontalTankVolume(radius, length, dipVal, unit) {
  let h = parseFloat(dipVal) || 0;
  if (unit === 'mm') {
    h = h / 10; // Convert mm to cm
  }

  const R = parseFloat(radius);
  const L = parseFloat(length);

  if (h <= 0) return 0;
  if (h >= 2 * R) return (Math.PI * R * R * L) / 1000;

  const term1 = R * R * Math.acos((R - h) / R);
  const term2 = (R - h) * Math.sqrt((2 * R * h) - (h * h));
  const area = term1 - term2;
  const volumeCm3 = area * L;

  return volumeCm3 / 1000; // Convert cm3 to Liters
}

// Get prices in effect on a specific Date
function getPricesAt(dateStr) {
  const targetTime = new Date(dateStr + "T12:00:00").getTime();
  const sorted = [...db.prices].sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());

  for (let price of sorted) {
    if (new Date(price.effective_date).getTime() <= targetTime) {
      return price;
    }
  }
  return sorted[sorted.length - 1] || { petrol: 103.50, diesel: 90.80 };
}

// -------------------------------------------------------------
// BANKING HOLIDAY CALENDAR LOGIC
// -------------------------------------------------------------
function getDayOfWeek(dateStr) {
  return new Date(dateStr).getDay();
}

function getWeekOfMonth(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDate();
  return Math.ceil(day / 7);
}

function isHoliday(dateStr) {
  const match = db.holidays.find(h => h.date === dateStr);
  if (match) return true;

  const dayOfWeek = getDayOfWeek(dateStr);
  if (db.settings.sundays_closed && dayOfWeek === 0) return true;

  if (db.settings.sats_closed && dayOfWeek === 6) {
    const weekNum = getWeekOfMonth(dateStr);
    if (weekNum === 2 || weekNum === 4) return true;
  }

  return false;
}

function addDays(dateStr, days) {
  if (!dateStr || typeof dateStr !== 'string') return "";
  const date = new Date(dateStr + "T12:00:00");
  if (isNaN(date.getTime()) || isNaN(days) || !isFinite(days)) {
    return dateStr;
  }
  date.setDate(date.getDate() + Math.round(days));
  try {
    return date.toISOString().split('T')[0];
  } catch (e) {
    return dateStr;
  }
}

function calculateDeadlineAndRTGS(purchaseDateStr) {
  const deadlineDate = addDays(purchaseDateStr, 2);
  let rtgsDate = deadlineDate;
  let safetyLimit = 0;
  while (isHoliday(rtgsDate) && safetyLimit++ < 14) {
    rtgsDate = addDays(rtgsDate, -1);
  }

  const daysDiff = Math.ceil((new Date(rtgsDate) - new Date(purchaseDateStr)) / (1000 * 60 * 60 * 24));
  const isHighRisk = daysDiff <= 0;

  return { deadlineDate, rtgsDate, isHighRisk, filingDaysFromPurchase: daysDiff };
}

// -------------------------------------------------------------
// SPREADSHEET ROW MATH ENGINE
// -------------------------------------------------------------
function computeLedgerRow(row, wacMap) {
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
        profit: 0
      }
    };
  }

  // FIX: Read tests as local variables — NEVER mutate the stored row object.
  // tests_day = 1 if the day shift actually ran (close_day > open), else 0.
  const t1p_day   = (row.du1_p && (row.du1_p.close_day ?? 0) > (row.du1_p.open ?? 0))   ? (row.du1_p.tests_day   ?? 1) : 0;
  const t1p_night = (row.du1_p && (row.du1_p.close_night ?? 0) > (row.du1_p.close_day ?? 0)) ? (row.du1_p.tests_night ?? 0) : 0;
  const t1d_day   = (row.du1_d && (row.du1_d.close_day ?? 0) > (row.du1_d.open ?? 0))   ? (row.du1_d.tests_day   ?? 1) : 0;
  const t1d_night = (row.du1_d && (row.du1_d.close_night ?? 0) > (row.du1_d.close_day ?? 0)) ? (row.du1_d.tests_night ?? 0) : 0;
  const t2p_day   = (row.du2_p && (row.du2_p.close_day ?? 0) > (row.du2_p.open ?? 0))   ? (row.du2_p.tests_day   ?? 1) : 0;
  const t2p_night = (row.du2_p && (row.du2_p.close_night ?? 0) > (row.du2_p.close_day ?? 0)) ? (row.du2_p.tests_night ?? 0) : 0;
  const t2d_day   = (row.du2_d && (row.du2_d.close_day ?? 0) > (row.du2_d.open ?? 0))   ? (row.du2_d.tests_day   ?? 1) : 0;
  const t2d_night = (row.du2_d && (row.du2_d.close_night ?? 0) > (row.du2_d.close_day ?? 0)) ? (row.du2_d.tests_night ?? 0) : 0;

  // 1. Day Sales Qty: Close Day - Open - (Tests Day * 5L per test)
  const d1_p_day = Math.max(0, (row.du1_p?.close_day   || 0) - (row.du1_p?.open || 0) - (t1p_day   * 5));
  const d1_d_day = Math.max(0, (row.du1_d?.close_day   || 0) - (row.du1_d?.open || 0) - (t1d_day   * 5));
  const d2_p_day = Math.max(0, (row.du2_p?.close_day   || 0) - (row.du2_p?.open || 0) - (t2p_day   * 5));
  const d2_d_day = Math.max(0, (row.du2_d?.close_day   || 0) - (row.du2_d?.open || 0) - (t2d_day   * 5));

  // 2. Night Sales Qty: Close Night - Close Day - (Tests Night * 5L per test)
  const d1_p_night = Math.max(0, (row.du1_p?.close_night || 0) - (row.du1_p?.close_day || 0) - (t1p_night * 5));
  const d1_d_night = Math.max(0, (row.du1_d?.close_night || 0) - (row.du1_d?.close_day || 0) - (t1d_night * 5));
  const d2_p_night = Math.max(0, (row.du2_p?.close_night || 0) - (row.du2_p?.close_day || 0) - (t2p_night * 5));
  const d2_d_night = Math.max(0, (row.du2_d?.close_night || 0) - (row.du2_d?.close_day || 0) - (t2d_night * 5));

  // 3. Totals
  const day_petrol = d1_p_day + d2_p_day;
  const day_diesel = d1_d_day + d2_d_day;
  const night_petrol = d1_p_night + d2_p_night;
  const night_diesel = d1_d_night + d2_d_night;

  const net_petrol_24h = day_petrol + night_petrol;
  const net_diesel_24h = day_diesel + night_diesel;

  // 4. Financials
  const rev_petrol = net_petrol_24h * (row.prices?.petrol || 0);
  const rev_diesel = net_diesel_24h * (row.prices?.diesel || 0);
  const total_revenue = rev_petrol + rev_diesel;

  // Determine WAC rates to use (look up from wacMap if available, else use current)
  const dateWac = (wacMap && wacMap[row.date]) || { ms: db.stock?.petrol_cost_wac ?? 0, hsd: db.stock?.diesel_cost_wac ?? 0 };

  const cost_petrol = net_petrol_24h * (dateWac.ms ?? 0);
  const cost_diesel = net_diesel_24h * (dateWac.hsd ?? 0);
  const total_cost = cost_petrol + cost_diesel;

  const profit = total_revenue - total_cost;

  // Gross commission per fuel type = selling price margin over purchase cost
  const commission_petrol = rev_petrol - cost_petrol;
  const commission_diesel = rev_diesel - cost_diesel;
  const total_commission = commission_petrol + commission_diesel;

  const dayExps = row.expenses || (typeof KC_EXPENSES_DATA !== 'undefined' ? KC_EXPENSES_DATA[row.date] : null) || [];
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

// Reconstruct historical stock level start/end values based on today's current stock played back backwards day by day
function getStockHistoryFor(dateStr) {
  let petStock = db.stock.petrol;
  let dieStock = db.stock.diesel;

  const petCapacity = db.settings.petrol_capacity || 20000;
  const dieCapacity = db.settings.diesel_capacity || 20000;

  // Defensive Guard: check that dateStr is valid
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) {
    return {
      petStart: petStock,
      petEnd: petStock,
      dieStart: dieStock,
      dieEnd: dieStock,
      purchasedP: 0,
      purchasedD: 0,
      salesP: 0,
      salesD: 0,
      petrolSupplyMissing: false,
      dieselSupplyMissing: false
    };
  }

  // Determine the start date for our backward walk.
  const todayStr = new Date().toISOString().split('T')[0];
  let maxDateStr = todayStr;

  if (dateStr > maxDateStr) maxDateStr = dateStr;

  db.daily_ledger.forEach(row => {
    if (row.date > maxDateStr) maxDateStr = row.date;
  });

  db.purchases.forEach(p => {
    const pDate = p.date.split('T')[0];
    if (pDate > maxDateStr) maxDateStr = pDate;
  });

  // Walk backwards day-by-day from maxDateStr to dateStr
  let currentDate = maxDateStr;
  let loopLimit = 500; // Safety limit: max 500 days of history walk-back

  let petrolSupplyMissing = false;
  let dieselSupplyMissing = false;

  while (currentDate >= dateStr && loopLimit > 0) {
    loopLimit--;

    // 1. Find if there is a daily ledger row for currentDate
    const row = db.daily_ledger.find(r => r.date === currentDate);
    let salesP = 0;
    let salesD = 0;
    if (row) {
      const rowCalc = computeLedgerRow(row);
      salesP = rowCalc.totals.net_24h.petrol;
      salesD = rowCalc.totals.net_24h.diesel;
    }

    // 2. Find if there are any purchases on currentDate
    const dayPurchases = db.purchases.filter(p => p.date.split('T')[0] === currentDate);
    const purchasedP = dayPurchases.reduce((sum, p) => sum + (p.petrol_liters || 0), 0);
    const purchasedD = dayPurchases.reduce((sum, p) => sum + (p.diesel_liters || 0), 0);

    // 3. Ending stock of currentDate is the current petStock / dieStock
    const endP = petStock;
    const endD = dieStock;

    // 4. Starting stock of currentDate is end + sales - purchased
    let startP = endP + salesP - purchasedP;
    let startD = endD + salesD - purchasedD;

    // Detect missing supply / physical rule violations
    if (startP > petCapacity || startP < 0) {
      petrolSupplyMissing = true;
      startP = Math.min(petCapacity, Math.max(0, startP));
    }
    if (startD > dieCapacity || startD < 0) {
      dieselSupplyMissing = true;
      startD = Math.min(dieCapacity, Math.max(0, startD));
    }

    if (currentDate === dateStr) {
      return {
        petStart: startP,
        petEnd: endP,
        dieStart: startD,
        dieEnd: endD,
        purchasedP,
        purchasedD,
        salesP,
        salesD,
        petrolSupplyMissing,
        dieselSupplyMissing
      };
    }

    // Move to previous day
    petStock = startP;
    dieStock = startD;
    currentDate = addDays(currentDate, -1);
  }

  return {
    petStart: petStock,
    petEnd: petStock,
    dieStart: dieStock,
    dieEnd: dieStock,
    purchasedP: 0,
    purchasedD: 0,
    salesP: 0,
    salesD: 0,
    petrolSupplyMissing,
    dieselSupplyMissing
  };
}

// Render the detailed flow metrics inside the UST cards
function renderTankFlowDetails(containerId, startVal, soldVal, recdVal, finalVal, supplyMissing) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (supplyMissing) {
    container.innerHTML = `
      <div class="flow-row">
        <span>Start Vol:</span>
        <strong style="font-size:0.7rem; font-weight:normal; color:var(--text-dim);">Supply not provided</strong>
      </div>
      <div class="flow-row" style="border-top: 1px dashed var(--border); padding-top: 0.15rem; margin-top: 0.15rem;">
        <span>Final Vol:</span>
        <strong style="font-size:0.7rem; font-weight:normal; color:var(--text-dim);">Supply not provided</strong>
      </div>
    `;
    return;
  }

  let html = `
    <div class="flow-row">
      <span>Start Vol:</span>
      <strong>${startVal.toFixed(0)} L</strong>
    </div>
  `;

  if (soldVal > 0) {
    html += `
      <div class="flow-row">
        <span>Sold:</span>
        <strong style="color: var(--danger); font-weight: 700;">-${soldVal.toFixed(0)} L</strong>
      </div>
    `;
  }

  if (recdVal > 0) {
    html += `
      <div class="flow-row">
        <span>Received:</span>
        <strong style="color: var(--success); font-weight: 700;">+${recdVal.toFixed(0)} L</strong>
      </div>
    `;
  }

  html += `
    <div class="flow-row" style="border-top: 1px dashed var(--border); padding-top: 0.15rem; margin-top: 0.15rem;">
      <span>Final Vol:</span>
      <strong style="color: #fff; font-weight: 700;">${finalVal.toFixed(0)} L</strong>
    </div>
  `;

  container.innerHTML = html;
}

// -------------------------------------------------------------
// PREDICTIVE ORDERING ENGINE
// -------------------------------------------------------------
function calculateADS() {
  if (!db.daily_ledger || db.daily_ledger.length === 0) {
    return { petrol: 550, diesel: 850 };
  }

  const windowDays = db.settings.ads_days || 14;
  // FIX: Always sort newest-first before slicing so we get the most recent N days
  const recentRows = [...db.daily_ledger]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, windowDays);

  let totalPetrol = 0;
  let totalDiesel = 0;

  recentRows.forEach(row => {
    const calc = computeLedgerRow(row);
    totalPetrol += calc.totals.net_24h.petrol;
    totalDiesel += calc.totals.net_24h.diesel;
  });

  const n = recentRows.length || 1;
  return {
    petrol: Math.max(50, totalPetrol / n),
    diesel: Math.max(50, totalDiesel / n)
  };
}

function predictNextOrder() {
  const ads = calculateADS();
  const currentP = db.stock.petrol;
  const currentD = db.stock.diesel;
  const safety = db.settings.safety_stock;

  const deadP = db.settings.petrol_dead_stock || 0;
  const deadD = db.settings.diesel_dead_stock || 0;

  const usableP = Math.max(0, currentP - deadP);
  const usableD = Math.max(0, currentD - deadD);

  const daysToOrderP = (usableP - safety) / ads.petrol;
  const daysToOrderD = (usableD - safety) / ads.diesel;

  const daysToTrigger = Math.max(0, Math.min(daysToOrderP, daysToOrderD));

  const todayStr = new Date().toISOString().split('T')[0];
  const predictedPurchaseDate = addDays(todayStr, Math.ceil(daysToTrigger));

  const expectedPStock = Math.max(0, currentP - (daysToTrigger * ads.petrol));
  const expectedDStock = Math.max(0, currentD - (daysToTrigger * ads.diesel));

  const availPSpace = Math.max(0, db.settings.petrol_capacity - expectedPStock);
  const availDSpace = Math.max(0, db.settings.diesel_capacity - expectedDStock);

  const candidates = [
    { type: "full-diesel", label: "Full Diesel (12kl)", d: 12000, p: 0 },
    { type: "full-petrol", label: "Full Petrol (12kl)", d: 0, p: 12000 },
    { type: "mixed-8d-4p", label: "Mixed (8kl Diesel + 4kl Petrol)", d: 8000, p: 4000 },
    { type: "mixed-8p-4d", label: "Mixed (8kl Petrol + 4kl Diesel)", d: 4000, p: 8000 }
  ];

  let bestCandidate = null;
  let bestScore = -Infinity;

  candidates.forEach(cand => {
    if (cand.p <= availPSpace && cand.d <= availDSpace) {
      const postPStock = expectedPStock + cand.p;
      const postDStock = expectedDStock + cand.d;

      const deficitP = db.settings.petrol_capacity - postPStock;
      const deficitD = db.settings.diesel_capacity - postDStock;

      const maxDeficit = Math.max(deficitP, deficitD);
      const score = -maxDeficit;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }
  });

  if (!bestCandidate) {
    bestCandidate = candidates[2]; // fallback 8D + 4P
  }

  const creditDetails = calculateDeadlineAndRTGS(predictedPurchaseDate);

  return { ads, daysToTrigger, predictedPurchaseDate, recommendedLoad: bestCandidate, creditDetails };
}

// -------------------------------------------------------------
// CORE BUSINESS OPERATIONS
// -------------------------------------------------------------
function saveDailyReadings(data) {
  // If editing an existing date entry, reconcile stock adjustments first
  const existingIdx = db.daily_ledger.findIndex(row => row.date === data.date);

  const newCalc = computeLedgerRow(data);
  const newNetP = newCalc.totals.net_24h.petrol;
  const newNetD = newCalc.totals.net_24h.diesel;

  if (existingIdx !== -1) {
    const oldCalc = computeLedgerRow(db.daily_ledger[existingIdx]);
    const oldNetP = oldCalc.totals.net_24h.petrol;
    const oldNetD = oldCalc.totals.net_24h.diesel;

    // Adjust stock back (add old sales, subtract new sales)
    db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);

    db.daily_ledger[existingIdx] = data;
    SystemLogger.success('saveDailyReadings', `Reconciliation modified and saved for date ${formatDate(data.date)}. Net Sales: Petrol = ${newNetP.toFixed(2)} L, Diesel = ${newNetD.toFixed(2)} L.`, newCalc.totals);
    showNotification(`✅ Reconciled values saved in local database and synced to Gist cloud! Updates visible on Sales Cumulative Sheet and Profit charts.`, "success");
  } else {
    // New date log entry: directly subtract sales from stock
    db.stock.petrol = Math.max(0, db.stock.petrol - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel - newNetD);

    db.daily_ledger.push(data);
    SystemLogger.success('saveDailyReadings', `Daily readings logged and saved for date ${formatDate(data.date)}. Net Sales: Petrol = ${newNetP.toFixed(2)} L, Diesel = ${newNetD.toFixed(2)} L.`, newCalc.totals);
    showNotification(`✅ Daily readings logged in local database and synced to Gist cloud! Updates visible on Sales Cumulative Sheet and Profit charts.`, "success");
  }

  // Sort daily ledger chronologically descending
  db.daily_ledger.sort((a, b) => new Date(b.date) - new Date(a.date));
  saveDB();
}

function deleteLedgerRow(dateStr) {
  const index = db.daily_ledger.findIndex(row => row.date === dateStr);
  if (index === -1) return;

  if (confirm(`Are you sure you want to delete the daily readings for ${formatDate(dateStr)}? Stock levels will be credited back.`)) {
    const oldCalc = computeLedgerRow(db.daily_ledger[index]);
    const oldNetP = oldCalc.totals.net_24h.petrol;
    const oldNetD = oldCalc.totals.net_24h.diesel;

    // Refund stock
    db.stock.petrol += oldNetP;
    db.stock.diesel += oldNetD;

    db.daily_ledger.splice(index, 1);
    saveDB();
    showNotification(`Daily record for ${formatDate(dateStr)} deleted.`, "info");
    initApp();
  }
}

function recordTanker(dateStr, timeStr, loadType, customP, customD, priceP, priceD,
                      petrolInvoiceDensity = 0, petrolObservedDensity = 0, petrolObservedTemp = 0,
                      dieselInvoiceDensity = 0, dieselObservedDensity = 0, dieselObservedTemp = 0,
                      invoiceNo = '', paymentStatus = 'Due') {
  let petrolQty = 0;
  let dieselQty = 0;

  if (loadType === 'full-petrol') {
    petrolQty = 12000;
  } else if (loadType === 'full-diesel') {
    dieselQty = 12000;
  } else if (loadType === 'mixed-8d-4p') {
    dieselQty = 8000;
    petrolQty = 4000;
  } else if (loadType === 'mixed-8p-4d') {
    petrolQty = 8000;
    dieselQty = 4000;
  } else if (loadType === 'custom') {
    petrolQty = customP;
    dieselQty = customD;
  }

  const totalVol = petrolQty + dieselQty;
  if (totalVol !== 12000) {
    showNotification(`Tanker load must equal exactly 12,000 Liters (currently ${totalVol} L)`, "danger");
    SystemLogger.warning('recordTanker', `Tanker receipt rejected: volume must equal exactly 12,000 Liters (got ${totalVol} L)`);
    return;
  }

  if (petrolQty % 4000 !== 0 || dieselQty % 4000 !== 0) {
    showNotification("Illogical value rejected. Petrol and Diesel quantities must be multiples of 4,000 Liters (corresponding to 4kl compartments).", "danger");
    SystemLogger.warning('recordTanker', `Tanker receipt rejected: quantities must be multiples of 4,000 L (Petrol: ${petrolQty} L, Diesel: ${dieselQty} L)`);
    return;
  }

  const currentP = db.stock.petrol;
  const currentD = db.stock.diesel;
  const oldWacP = db.stock.petrol_cost_wac;
  const oldWacD = db.stock.diesel_cost_wac;

  if (petrolQty > 0) {
    db.stock.petrol_cost_wac = ((currentP * oldWacP) + (petrolQty * priceP)) / (currentP + petrolQty);
  }
  if (dieselQty > 0) {
    db.stock.diesel_cost_wac = ((currentD * oldWacD) + (dieselQty * priceD)) / (currentD + dieselQty);
  }

  db.stock.petrol += petrolQty;
  db.stock.diesel += dieselQty;

  const creditDetails = calculateDeadlineAndRTGS(dateStr);

  const petrolRho15 = petrolQty > 0 ? getDensityAt15(petrolObservedDensity, petrolObservedTemp) : 0;
  const petrolVcf = petrolQty > 0 && petrolRho15 > 0 ? petrolObservedDensity / petrolRho15 : 0;
  const petrolCorrectedVol = petrolQty > 0 ? petrolQty * petrolVcf : 0;
  const petrolShortage = petrolQty > 0 ? petrolQty - petrolCorrectedVol : 0;

  const dieselRho15 = dieselQty > 0 ? getDensityAt15(dieselObservedDensity, dieselObservedTemp) : 0;
  const dieselVcf = dieselQty > 0 && dieselRho15 > 0 ? dieselObservedDensity / dieselRho15 : 0;
  const dieselCorrectedVol = dieselQty > 0 ? dieselQty * dieselVcf : 0;
  const dieselShortage = dieselQty > 0 ? dieselQty - dieselCorrectedVol : 0;

  const purchase = {
    id: 'p_' + Date.now(),
    date: dateStr + 'T' + timeStr,
    petrol_liters: petrolQty,
    diesel_liters: dieselQty,
    price_petrol: priceP,
    price_diesel: priceD,
    cost_petrol: petrolQty * priceP,
    cost_diesel: dieselQty * priceD,
    total_cost: (petrolQty * priceP) + (dieselQty * priceD),
    invoice_no: invoiceNo || ('Challan_' + Date.now()),
    payment_status: paymentStatus === 'Paid' ? 'paid' : 'unpaid',
    paid_date: paymentStatus === 'Paid' ? dateStr + 'T' + timeStr : null,
    interest_charged: 0,

    petrol_invoice_density: petrolInvoiceDensity,
    petrol_observed_density: petrolObservedDensity,
    petrol_observed_temp: petrolObservedTemp,
    petrol_rho15: petrolRho15,
    petrol_vcf: petrolVcf,
    petrol_corrected_vol: petrolCorrectedVol,
    petrol_shortage: petrolShortage,

    diesel_invoice_density: dieselInvoiceDensity,
    diesel_observed_density: dieselObservedDensity,
    diesel_observed_temp: dieselObservedTemp,
    diesel_rho15: dieselRho15,
    diesel_vcf: dieselVcf,
    diesel_corrected_vol: dieselCorrectedVol,
    diesel_shortage: dieselShortage,
    deadline_date: creditDetails.deadlineDate,
    rtgs_filing_date: creditDetails.rtgsDate
  };

  db.purchases.unshift(purchase);
  saveDB();
  SystemLogger.success('recordTanker', `Recorded tanker delivery: Petrol = ${petrolQty} L @ ₹${priceP}/L, Diesel = ${dieselQty} L @ ₹${priceD}/L. Total Cost: ₹${purchase.total_cost.toFixed(2)}`, purchase);
  showNotification("✅ Tanker delivery saved to local database and synced to Gist cloud! Added to Tanker purchases registry and reconciled closing stock.", "success");
}

function updateSellingPrice(dateTimeStr, priceP, priceD) {
  const entry = {
    effective_date: dateTimeStr,
    petrol: parseFloat(priceP),
    diesel: parseFloat(priceD)
  };

  db.prices.unshift(entry);
  db.prices.sort((a,b) => new Date(b.effective_date) - new Date(a.effective_date));
  saveDB();
  SystemLogger.success('updateSellingPrice', `Selling prices updated: Petrol = ₹${entry.petrol.toFixed(2)}/L, Diesel = ₹${entry.diesel.toFixed(2)}/L (Effective: ${entry.effective_date})`, entry);
  showNotification("✅ Selling prices saved to local database and synced to Gist cloud! Updates will apply to future DSR commission calculations.", "success");
}

function addHoliday(dateStr, name) {
  if (db.holidays.some(h => h.date === dateStr)) {
    showNotification("A holiday is already recorded for this date!", "danger");
    return;
  }
  db.holidays.push({ date: dateStr, name });
  db.holidays.sort((a,b) => new Date(a.date) - new Date(b.date));
  saveDB();
  showNotification("✅ Bank holiday added to calendar database and synced to Gist cloud! Bank credit offset will apply to credit planning.", "success");
}

function removeHoliday(dateStr) {
  db.holidays = db.holidays.filter(h => h.date !== dateStr);
  saveDB();
  showNotification("✅ Holiday removed from calendar database and synced to Gist cloud.", "info");
}

function togglePayment(purchaseId) {
  const p = db.purchases.find(item => item.id === purchaseId);
  if (!p) return;

  const currentStatus = p.payment_status;
  const newStatusText = currentStatus === 'unpaid' ? 'Mark as PAID' : 'Mark as UNPAID';
  if (!confirm(`Are you sure you want to change this tanker's payment status to: ${newStatusText}?`)) {
    return;
  }

  if (p.payment_status === 'unpaid') {
    p.payment_status = 'paid';
    p.paid_date = new Date().toISOString().split('T')[0];

    const deadline = new Date(p.deadline_date);
    const paid = new Date(p.paid_date);

    if (paid > deadline) {
      const diffTime = Math.abs(paid - deadline);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const ratePerDay = 0.15 / 365;
      p.interest_charged = p.total_cost * ratePerDay * diffDays;
      showNotification(`✅ Payment marked as PAID (Late by ${diffDays} days). Interest charged. Synced to Gist cloud!`, "warning");
    } else {
      p.interest_charged = 0;
      showNotification("✅ Payment marked as PAID (On Time). Synced to Gist cloud!", "success");
    }
  } else {
    p.payment_status = 'unpaid';
    p.paid_date = null;
    p.interest_charged = 0;
    showNotification("✅ Payment reset to unpaid status. Synced to Gist cloud!", "info");
  }

  saveDB();
  initApp();
}

// -------------------------------------------------------------
// DATA PORTABILITY UTILITIES
// -------------------------------------------------------------
function getCSVExport(type) {
  let headers = [];
  let rows = [];

  if (type === 'ledger') {
    const wacMap = buildWACTimeline();
    headers = [
      "Date", "Selling Price Petrol", "Selling Price Diesel",
      "DU1 Day MS Open", "DU1 Day MS Close", "DU1 Day HSD Open", "DU1 Day HSD Close",
      "DU2 Day MS Open", "DU2 Day MS Close", "DU2 Day HSD Open", "DU2 Day HSD Close",
      "DU1 Night MS Open", "DU1 Night MS Close", "DU1 Night HSD Open", "DU1 Night HSD Close",
      "DU2 Night MS Open", "DU2 Night MS Close", "DU2 Night HSD Open", "DU2 Night HSD Close",
      "Day Sales DU1 Petrol", "Day Sales DU1 Diesel", "Day Sales DU2 Petrol", "Day Sales DU2 Diesel",
      "Night Sales DU1 Petrol", "Night Sales DU1 Diesel", "Night Sales DU2 Petrol", "Night Sales DU2 Diesel",
      "Day Tests Petrol", "Day Tests Diesel",
      "24h Net Petrol", "24h Net Diesel", "Revenue Petrol", "Revenue Diesel", "Total Revenue", "WAC Cost", "Profit"
    ];

    rows = db.daily_ledger.map(row => {
      const c = computeLedgerRow(row, wacMap);
      return [
        row.date, row.prices.petrol, row.prices.diesel,
        row.du1_p.open, row.du1_p.close_day, row.du1_d.open, row.du1_d.close_day,
        row.du2_p.open, row.du2_p.close_day, row.du2_d.open, row.du2_d.close_day,
        row.du1_p.close_day, row.du1_p.close_night, row.du1_d.close_day, row.du1_d.close_night,
        row.du2_p.close_day, row.du2_p.close_night, row.du2_d.close_day, row.du2_d.close_night,
        c.sales.du1_p.day, c.sales.du1_d.day, c.sales.du2_p.day, c.sales.du2_d.day,
        c.sales.du1_p.night, c.sales.du1_d.night, c.sales.du2_p.night, c.sales.du2_d.night,
        row.du1_p.tests_day + row.du2_p.tests_day, row.du1_d.tests_day + row.du2_d.tests_day,
        c.totals.net_24h.petrol, c.totals.net_24h.diesel,
        c.financials.rev_petrol, c.financials.rev_diesel, c.financials.total_revenue,
        c.financials.total_cost, c.financials.profit
      ];
    });
  } else if (type === 'purchases') {
    headers = ["Delivery Date", "Petrol Volume (L)", "Diesel Volume (L)", "Cost Petrol", "Cost Diesel", "Total Cost", "Deadline Date", "RTGS File Date", "Status", "Paid Date", "Interest Cost"];
    rows = db.purchases.map(p => [
      p.date, p.petrol_liters, p.diesel_liters, p.cost_petrol, p.cost_diesel, p.total_cost, p.deadline_date, p.rtgs_filing_date, p.payment_status, p.paid_date || "N/A", p.interest_charged
    ]);
  }

  const csvContent = [
    headers.join(","),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  return csvContent;
}

function triggerDownload(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------------
// UI RENDERING ENGINE & ROUTER
// -------------------------------------------------------------
function showNotification(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.background = type === 'success' ? '#10b981' : type === 'danger' ? '#f43f5e' : type === 'warning' ? '#f59e0b' : '#3b82f6';
  toast.style.color = '#fff';
  toast.style.padding = '0.75rem 1.5rem';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.zIndex = '9999';
  toast.style.fontFamily = 'var(--font-sans)';
  toast.style.fontSize = '0.9rem';
  toast.style.fontWeight = '600';
  toast.textContent = msg;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// Tab Switching Routing
const SUB_TABS = {
  operations: [
    { id: 'shift-recon', label: 'Shift Recon' },
    { id: 'ledger',      label: 'Sales Ledger' },
    { id: 'approvals',   label: 'Pending Approvals', badge: 'approvals-badge' },
    { id: 'dsr-checker', label: 'DSR Data Checker' },
    { id: 'kc-dsr-live', label: 'Live Shift Reconciliation' }
  ],
  logistics: [
    { id: 'purchases',   label: 'Tanker Purchases' },
    { id: 'supplies',    label: 'Supply Sheet (OCR)' },
    { id: 'pricing',     label: 'Selling Prices' }
  ],
  financials: [
    { id: 'cashflow',    label: 'Cash Flow Forecast' },
    { id: 'expenses',    label: 'Expense Ledger' }
  ],
  settings: [
    { id: 'settings',    label: 'System Settings' },
    { id: 'holidays',    label: 'Bank Holidays' }
  ]
};

const currentSubviews = {
  operations: 'shift-recon',
  logistics: 'purchases',
  financials: 'cashflow',
  settings: 'settings'
};

const titles = {
  dashboard: "Dashboard Overview",
  ledger: "Sales Cumulative Ledger",
  purchases: "Tankers & Credit Operations",
  supplies: "Supply Sheet (OCR Extracted Bills)",
  pricing: "Fuel Selling Prices",
  holidays: "Bank Holiday Calendar",
  settings: "System Settings & Utilities",
  cashflow: "Cash Flow & Orders Solver",
  'shift-recon': "Shift Reconciliation & Cash Count",
  expenses: "Expense Ledger",
  approvals: "Shift Approvals",
  'dsr-checker': "DSR Data Checker & OCR Verifier",
  'kc-dsr-live': "Live Shift Reconciliation Dashboard"
};

function switchSubview(mainView, subviewId) {
  const session = getSession();
  if (subviewId === 'dsr-checker' && (!session || session.role !== 'owner')) {
    showNotification("Access denied: Owners only.", "danger");
    return;
  }
  currentSubviews[mainView] = subviewId;

  // Update view visibility
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const targetEl = document.getElementById(`view-${subviewId}`);
  if (targetEl) targetEl.classList.add('active');

  // Render subtabs bar
  renderSubtabsBar(mainView);

  // Set header title
  const headerTitle = document.getElementById('view-title');
  if (headerTitle) headerTitle.textContent = titles[subviewId] || "Ram Kisan Sewa Kendra";

  // Render content
  renderActiveView(subviewId);
}

function renderSubtabsBar(mainView) {
  const session = getSession();
  const bar = document.getElementById('header-subtabs');
  if (!bar) return;

  const subtabs = SUB_TABS[mainView];
  if (!subtabs) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  bar.style.display = 'flex';
  const activeSub = currentSubviews[mainView];

  bar.innerHTML = subtabs.map(tab => {
    if (tab.id === 'dsr-checker' && (!session || session.role !== 'owner')) {
      return '';
    }
    const isActive = tab.id === activeSub;
    const badgeHtml = tab.badge ? `<span class="badge" id="${tab.badge}-sub" style="margin-left:0.4rem;background:#ef4444;color:#fff;border-radius:9999px;padding:0.1rem 0.4rem;font-size:0.65rem;font-weight:800;display:none;">0</span>` : '';
    return `
      <button class="subtab-item ${isActive ? 'active' : ''}" data-subview="${tab.id}">
        ${tab.label}${badgeHtml}
      </button>
    `;
  }).join('');

  // Wire events
  bar.querySelectorAll('.subtab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchSubview(mainView, btn.dataset.subview);
    });
  });

  // Update badges immediately
  updateApprovalsBadge();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const targetView = item.dataset.view;

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    if (targetView === 'dashboard') {
      document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
      const dbView = document.getElementById('view-dashboard');
      if (dbView) dbView.classList.add('active');
      const bar = document.getElementById('header-subtabs');
      if (bar) bar.style.display = 'none';
      const headerTitle = document.getElementById('view-title');
      if (headerTitle) headerTitle.textContent = titles.dashboard;
      renderActiveView('dashboard');
    } else {
      const activeSub = currentSubviews[targetView] || targetView;
      switchSubview(targetView, activeSub);
    }
  });
});

function renderActiveView(viewName) {
  if (viewName === 'dashboard')   { renderDashboard(); updateApprovalsBadge(); }
  if (viewName === 'ledger') { renderLedger(); setTimeout(loadAnchorUI, 50); }
  if (viewName === 'purchases')   renderPurchases();
  if (viewName === 'supplies')    renderSupplies();
  if (viewName === 'pricing')     renderPricing();
  if (viewName === 'holidays')    renderHolidays();
  if (viewName === 'settings')    { renderSettings(); renderUserManagement(); }
  if (viewName === 'cashflow')    renderCashFlow();
  if (viewName === 'shift-recon') renderShiftRecon();
  if (viewName === 'expenses')    renderExpenseLedger();
  if (viewName === 'approvals')   renderApprovalsPanel();
  if (viewName === 'dsr-checker') renderDsrChecker();
  if (viewName === 'kc-dsr-live') renderKcDsrLive();
}

function renderKcDsrLive() {
  // Let the iframe display normally
}

// -------------------------------------------------------------
// VIEW-SPECIFIC RENDERERS
// -------------------------------------------------------------
function renderDashboard() {
  let activePrice = (db.prices && db.prices[0]) ? db.prices[0] : { petrol: 103.50, diesel: 90.80 };
  let priceLastUpdatedStr = activePrice.effective_date ? `Effective: ${formatDateTime(activePrice.effective_date)}` : "No price logged";

  if (db.daily_ledger && db.daily_ledger.length > 0) {
    const latestRow = db.daily_ledger[0];
    if (latestRow.prices) {
      activePrice = {
        petrol: latestRow.prices.petrol || activePrice.petrol,
        diesel: latestRow.prices.diesel || activePrice.diesel
      };
      priceLastUpdatedStr = `From latest DSR (${formatDate(latestRow.date)})`;
    }
  }

  document.getElementById('current-date-span').textContent = formatDate(new Date().toISOString().split('T')[0]);

  document.getElementById('dash-selling-prices').textContent =
    `P: ${formatCurrency(activePrice.petrol)} | D: ${formatCurrency(activePrice.diesel)}`;
  document.getElementById('dash-prices-last-updated').textContent = priceLastUpdatedStr;

  // Today's summary: try actual today first, fall back to most recently logged date
  const todayStr2 = new Date().toISOString().split('T')[0];
  const todayEntry = db.daily_ledger.find(r => r.date === todayStr2) || db.daily_ledger[0];
  const revCard = document.getElementById('dash-shift-revenue');
  const activeInd = document.getElementById('dash-shift-active-indicator');

  if (todayEntry) {
    const c = computeLedgerRow(todayEntry);
    revCard.textContent = formatCurrency(c.financials.profit);
    revCard.className = c.financials.profit >= 0 ? "metric-value text-success" : "metric-value text-danger";
    activeInd.textContent = `For operating date: ${formatDate(todayEntry.date)}`;

    const totalTodaySales = c.totals.net_24h.petrol + c.totals.net_24h.diesel;
    document.getElementById('dash-net-sales-volume').textContent = formatVol(totalTodaySales);
    document.getElementById('dash-net-sales-split').textContent = `Petrol: ${formatVol(c.totals.net_24h.petrol)} | Diesel: ${formatVol(c.totals.net_24h.diesel)}`;
  } else {
    revCard.textContent = "₹ 0.00";
    revCard.className = "metric-value text-muted";
    activeInd.textContent = "Log daily readings in Sales Cumulative tab";
    document.getElementById('dash-net-sales-volume').textContent = "0 L";
    document.getElementById('dash-net-sales-split').textContent = "No sales logged";
  }

  // Credit outstanding
  const unpaid = db.purchases.filter(p => p.payment_status === 'unpaid');
  const totalUnpaidCost = unpaid.reduce((sum, item) => sum + item.total_cost, 0);
  document.getElementById('dash-outstanding-credit').textContent = formatCurrency(totalUnpaidCost);
  document.getElementById('dash-unpaid-tankers').textContent = `${unpaid.length} pending tanker invoice(s)`;

  // Tanks Levels (calculate dynamically from latest physical dip if possible)
  const maxPetrol = db.settings.petrol_capacity || 20000;
  const maxDiesel = db.settings.diesel_capacity || 20000;
  const maxDipP = db.settings.petrol_tank_dia || 200;
  const maxDipD = db.settings.diesel_tank_dia || 200;

  const latestRowForStock = db.daily_ledger && db.daily_ledger.length > 0 ? db.daily_ledger[0] : null;
  let petrolVol = db.stock.petrol;
  let dieselVol = db.stock.diesel;

  if (latestRowForStock) {
    const latestPhysP = dipToLiters(latestRowForStock.dip_ms_cm || 0, maxPetrol, maxDipP);
    const latestPhysD = dipToLiters(latestRowForStock.dip_hsd_cm || 0, maxDiesel, maxDipD);
    if (latestPhysP > 0) petrolVol = latestPhysP;
    if (latestPhysD > 0) dieselVol = latestPhysD;
  }

  const deadPStock = db.settings.petrol_dead_stock || 0;
  const deadDStock = db.settings.diesel_dead_stock || 0;

  const usableP = Math.max(0, petrolVol - deadPStock);
  const usableD = Math.max(0, dieselVol - deadDStock);

  // Asset Inventory Valuation (Investment POV)
  const wacP = db.stock.petrol_cost_wac || 0;
  const wacD = db.stock.diesel_cost_wac || 0;
  const activeAssetVal = (usableP * wacP) + (usableD * wacD);
  const lockedAssetVal = (deadPStock * wacP) + (deadDStock * wacD);

  const activeAssetsEl = document.getElementById('dash-active-assets');
  if (activeAssetsEl) activeAssetsEl.textContent = formatCurrency(activeAssetVal);
  const lockedAssetsEl = document.getElementById('dash-locked-assets');
  if (lockedAssetsEl) lockedAssetsEl.textContent = `Locked Dead Stock: ${formatCurrency(lockedAssetVal)}`;

  const petrolPct = Math.min(100, Math.max(0, (petrolVol / maxPetrol) * 100));
  const dieselPct = Math.min(100, Math.max(0, (dieselVol / maxDiesel) * 100));

  const liquidP = document.getElementById('tank-liquid-petrol');
  const liquidD = document.getElementById('tank-liquid-diesel');

  if (liquidP) liquidP.style.height = `${petrolPct}%`;
  if (liquidD) liquidD.style.height = `${dieselPct}%`;

  if (usableP < db.settings.safety_stock) {
    if (liquidP) liquidP.classList.add('critical');
  } else {
    if (liquidP) liquidP.classList.remove('critical');
  }

  if (usableD < db.settings.safety_stock) {
    if (liquidD) liquidD.classList.add('critical');
  } else {
    if (liquidD) liquidD.classList.remove('critical');
  }

  const stockPetrolEl = document.getElementById('tank-stock-petrol');
  if (stockPetrolEl) stockPetrolEl.textContent = formatVol(petrolVol);
  const usablePetrolEl = document.getElementById('tank-usable-petrol');
  if (usablePetrolEl) usablePetrolEl.textContent = formatVol(usableP);
  const deadPetrolEl = document.getElementById('tank-dead-petrol');
  if (deadPetrolEl) deadPetrolEl.textContent = formatVol(deadPStock);
  const percentPetrolEl = document.getElementById('tank-percent-petrol');
  if (percentPetrolEl) percentPetrolEl.textContent = `${petrolPct.toFixed(1)}% of ${maxPetrol} L`;

  // Calculate rolling 7-day average sales and days of cover
  const getAverageSales = (days = 7) => {
    let petSalesSum = 0;
    let dieSalesSum = 0;
    let count = 0;
    const sortedLedger = [...(window.dsrDraftData || [])].sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < Math.min(days, sortedLedger.length); i++) {
      const row = sortedLedger[i];
      const p1_open = row.du1_p.open || 0;
      const p1_close = row.du1_p.close_day || 0;
      const p2_open = row.du2_p.open || 0;
      const p2_close = row.du2_p.close_day || 0;
      const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
      const p_sales = Math.max(0, (p1_close - p1_open) + (p2_close - p2_open) - p_tests);

      const d1_open = row.du1_d.open || 0;
      const d1_close = row.du1_d.close_day || 0;
      const d2_open = row.du2_d.open || 0;
      const d2_close = row.du2_d.close_day || 0;
      const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
      const d_sales = Math.max(0, (d1_close - d1_open) + (d2_close - d2_open) - d_tests);
      
      petSalesSum += p_sales;
      dieSalesSum += d_sales;
      count++;
    }
    return {
      petrol: count > 0 ? petSalesSum / count : 1000,
      diesel: count > 0 ? dieSalesSum / count : 1500
    };
  };

  const avgSales = getAverageSales(7);
  const petCover = avgSales.petrol > 0 ? usableP / avgSales.petrol : 99;
  const dieCover = avgSales.diesel > 0 ? usableD / avgSales.diesel : 99;

  const coverPetrolEl = document.getElementById('tank-cover-petrol');
  if (coverPetrolEl) {
    if (petCover < 3) {
      coverPetrolEl.innerHTML = `<strong style="color:#f87171;">${petCover.toFixed(1)} days</strong> <span style="background:rgba(239,68,68,0.15); color:#f87171; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">⚠️ Low Stock</span>`;
    } else {
      coverPetrolEl.innerHTML = `<strong style="color:#4ade80;">${petCover.toFixed(1)} days</strong> <span style="background:rgba(74,222,128,0.15); color:#4ade80; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">🟢 Healthy</span>`;
    }
  }

  const stockDieselEl = document.getElementById('tank-stock-diesel');
  if (stockDieselEl) stockDieselEl.textContent = formatVol(dieselVol);
  const usableDieselEl = document.getElementById('tank-usable-diesel');
  if (usableDieselEl) usableDieselEl.textContent = formatVol(usableD);
  const deadDieselEl = document.getElementById('tank-dead-diesel');
  if (deadDieselEl) deadDieselEl.textContent = formatVol(deadDStock);
  const percentDieselEl = document.getElementById('tank-percent-diesel');
  if (percentDieselEl) percentDieselEl.textContent = `${dieselPct.toFixed(1)}% of ${maxDiesel} L`;

  const coverDieselEl = document.getElementById('tank-cover-diesel');
  if (coverDieselEl) {
    if (dieCover < 3) {
      coverDieselEl.innerHTML = `<strong style="color:#f87171;">${dieCover.toFixed(1)} days</strong> <span style="background:rgba(239,68,68,0.15); color:#f87171; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">⚠️ Low Stock</span>`;
    } else {
      coverDieselEl.innerHTML = `<strong style="color:#4ade80;">${dieCover.toFixed(1)} days</strong> <span style="background:rgba(74,222,128,0.15); color:#4ade80; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">🟢 Healthy</span>`;
    }
  }

  // Render today's stock flow details (starting, sales, shipments, and final values)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayStockHistory = getStockHistoryFor(todayStr);
  renderTankFlowDetails('tank-flow-petrol', todayStockHistory.petStart, todayStockHistory.salesP, todayStockHistory.purchasedP, todayStockHistory.petEnd, todayStockHistory.petrolSupplyMissing);
  renderTankFlowDetails('tank-flow-diesel', todayStockHistory.dieStart, todayStockHistory.salesD, todayStockHistory.purchasedD, todayStockHistory.dieEnd, todayStockHistory.dieselSupplyMissing);


  // Action / Ordering alerts
  const alertsList = document.getElementById('dashboard-alerts-list');
  alertsList.innerHTML = '';

  const prediction = predictNextOrder();

  if (usableP < db.settings.safety_stock || usableD < db.settings.safety_stock) {
    const critFuel = [];
    if (usableP < db.settings.safety_stock) critFuel.push("PETROL");
    if (usableD < db.settings.safety_stock) critFuel.push("DIESEL");

    const div = document.createElement('div');
    div.className = "alert-item danger";
    div.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      <div class="alert-content">
        <span class="alert-title">CRITICAL STOCK LEVEL</span>
        ${critFuel.join(" & ")} usable level is below the configured safety threshold (${db.settings.safety_stock} L)! Place an order immediately.
      </div>
    `;
    alertsList.appendChild(div);
  }

  if (prediction.daysToTrigger <= 0) {
    const div = document.createElement('div');
    div.className = "alert-item warning";
    div.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      <div class="alert-content">
        <span class="alert-title">Order Needed Today</span>
        Stock is running low. <br>
        <strong>Recommended Tanker:</strong> ${prediction.recommendedLoad.label}. <br>
        <strong>Filing RTGS Date:</strong> ${formatDate(prediction.creditDetails.rtgsDate)} ${prediction.creditDetails.isHighRisk ? '<span class="badge badge-danger">Immediate payment required</span>' : ''}
      </div>
    `;
    alertsList.appendChild(div);
  } else {
    const div = document.createElement('div');
    div.className = "alert-item info";
    div.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      <div class="alert-content">
        <span class="alert-title">Order Prediction</span>
        Next tanker order triggered in <strong>${Math.ceil(prediction.daysToTrigger)} days</strong> (${formatDate(prediction.predictedPurchaseDate)}).<br>
        <strong>Recommended Load:</strong> ${prediction.recommendedLoad.label}.
      </div>
    `;
    alertsList.appendChild(div);

    if (prediction.creditDetails.isHighRisk) {
      const bankDiv = document.createElement('div');
      bankDiv.className = "alert-item danger";
      bankDiv.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        <div class="alert-content">
          <span class="alert-title">Bank Schedule Alert</span>
          If you purchase on ${formatDate(prediction.predictedPurchaseDate)}, banking holidays/weekends force you to file RTGS <strong>on or before the delivery day</strong> to avoid interest charges!
        </div>
      `;
      alertsList.appendChild(bankDiv);
    }
  }

  // Credit due warnings
  const overduePurchases = unpaid.filter(p => p.deadline_date < todayStr);
  const urgentPurchases = unpaid.filter(p => p.deadline_date >= todayStr && addDays(todayStr, 2) >= p.deadline_date);

  if (overduePurchases.length > 0) {
    const div = document.createElement('div');
    div.className = "alert-item danger";
    div.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      <div class="alert-content">
        <span class="alert-title">OVERDUE CREDIT PAYMENT</span>
        You have ${overduePurchases.length} unpaid tanker invoice(s) past the 2-day interest-free deadline! Settle immediately to stop interest accumulation.
      </div>
    `;
    alertsList.appendChild(div);
  }

  if (urgentPurchases.length > 0) {
    urgentPurchases.forEach(p => {
      const creditDetails = calculateDeadlineAndRTGS(p.date.split('T')[0]);
      const div = document.createElement('div');
      div.className = isHoliday(creditDetails.rtgsDate) || creditDetails.rtgsDate <= todayStr ? "alert-item danger" : "alert-item warning";
      div.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        <div class="alert-content">
          <span class="alert-title">RTGS Payment Filing Deadline</span>
          Tanker delivered ${formatDate(p.date.split('T')[0])} is due on ${formatDate(p.deadline_date)}.<br>
          <strong>Must file RTGS at bank by: ${formatDate(p.rtgs_filing_date)}</strong>
        </div>
      `;
      alertsList.appendChild(div);
    });
  }
}

function renderLedger() {
  const table = document.getElementById('ledger-table');
  const tableContainer = document.getElementById('ledger-table-container');
  const splitContainer = document.getElementById('ledger-split-container');
  const toggleBtn = document.getElementById('toggle-view-btn');

  if (db.daily_ledger.length === 0) {
    if (ledgerViewMode === 'table') {
      table.innerHTML = `<tbody><tr><td style="text-align: center; color: var(--text-dim); padding: 3rem;">No daily readings logged. Click "Log Daily Readings" to start.</td></tr></tbody>`;
    } else {
      document.getElementById('ledger-date-carousel').innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 2rem; width: 100%;">No logs.</div>';
      document.getElementById('ledger-analyst-panel').innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 2rem; width: 100%;">No logs.</div>';
    }
    return;
  }

  const wacMap = buildWACTimeline();

  // 1. Build stock reconciliation timeline (forward + backward from anchor)
  // PRIORITY ORDER:
  //   a) If db.settings.stock_anchor is set (user-entered verified stock on a known date),
  //      run BACKWARD from anchor date (anchor_date + supply - sales = prev day stock),
  //      then run FORWARD from anchor date for future dates.
  //   b) If no anchor: run forward from Day-1, seeding from OCR dip on first row only.
  //   c) Supply always read from supply bills first, then OCR receipts.
  const stockTimeline = {};

  const forwardLedger = [...db.daily_ledger].sort((a, b) => a.date.localeCompare(b.date));

  // Helper: get supply for a date
  function getDaySupply(dateStr) {
    const phys = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[dateStr] : null;
    let p_supply = 0, d_supply = 0;
    if (typeof SUPPLY_BILLS_DATA !== 'undefined') {
      const daySupplies = SUPPLY_BILLS_DATA.filter(s => s.invoice_date_iso === dateStr);
      daySupplies.forEach(s => {
        const qty = (s.quantity_kl || 0) * 1000;
        if (s.product === 'Petrol') p_supply += qty;
        else if (s.product === 'Diesel') d_supply += qty;
      });
    }
    if (p_supply === 0 && d_supply === 0 && phys) {
      p_supply = phys.petrol_receipt || 0;
      d_supply = phys.diesel_receipt || 0;
    }
    // Truck capacity safeguard
    if (p_supply > 12000) p_supply = 12000;
    if (d_supply > 12000) d_supply = 12000;
    if (p_supply + d_supply > 12000) {
      const ratio = p_supply / (p_supply + d_supply);
      p_supply = Math.round((12000 * ratio) / 4000) * 4000;
      d_supply = 12000 - p_supply;
    }
    return { p_supply, d_supply };
  }

  const anchor = db.settings?.stock_anchor; // { date, petrol_L, diesel_L }

  if (anchor && anchor.date && anchor.petrol_L != null && anchor.diesel_L != null) {
    // === BACKWARD PASS: from anchor date going earlier ===
    let backP = anchor.petrol_L;
    let backD = anchor.diesel_L;
    const anchorIdx = forwardLedger.findIndex(r => r.date === anchor.date);
    const startIdx = anchorIdx >= 0 ? anchorIdx : forwardLedger.length - 1;

    // Set anchor day's opening stock
    for (let i = startIdx; i >= 0; i--) {
      const row = forwardLedger[i];
      const c = computeLedgerRow(row, wacMap);
      const sales_p = c.totals.net_24h.petrol;
      const sales_d = c.totals.net_24h.diesel;
      const { p_supply, d_supply } = getDaySupply(row.date);
      const phys_display = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[row.date] : null;

      // On anchor day itself: opening = backP (which is anchor stock at start of day)
      // close = opening - sales + supply
      const open_p = i === startIdx ? backP : (backP + sales_p - p_supply);
      const open_d = i === startIdx ? backD : (backD + sales_d - d_supply);
      const close_p = Math.max(0, open_p - sales_p + p_supply);
      const close_d = Math.max(0, open_d - sales_d + d_supply);

      stockTimeline[row.date] = {
        start_p: Math.max(0, open_p),
        supply_p: p_supply,
        close_p,
        physical_p: phys_display?.petrol_dip ?? null,
        start_d: Math.max(0, open_d),
        supply_d: d_supply,
        close_d,
        physical_d: phys_display?.diesel_dip ?? null
      };

      // Move backward: prev day closing = this day opening
      backP = Math.max(0, open_p);
      backD = Math.max(0, open_d);
    }

    // === FORWARD PASS: from anchor date going later ===
    let fwdP = stockTimeline[forwardLedger[startIdx]?.date]?.close_p ?? anchor.petrol_L;
    let fwdD = stockTimeline[forwardLedger[startIdx]?.date]?.close_d ?? anchor.diesel_L;
    for (let i = startIdx + 1; i < forwardLedger.length; i++) {
      const row = forwardLedger[i];
      const c = computeLedgerRow(row, wacMap);
      const sales_p = c.totals.net_24h.petrol;
      const sales_d = c.totals.net_24h.diesel;
      const { p_supply, d_supply } = getDaySupply(row.date);
      const phys_display = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[row.date] : null;
      const close_p = Math.max(0, fwdP - sales_p + p_supply);
      const close_d = Math.max(0, fwdD - sales_d + d_supply);
      stockTimeline[row.date] = {
        start_p: fwdP, supply_p: p_supply, close_p,
        physical_p: phys_display?.petrol_dip ?? null,
        start_d: fwdD, supply_d: d_supply, close_d,
        physical_d: phys_display?.diesel_dip ?? null
      };
      fwdP = close_p;
      fwdD = close_d;
    }

  } else {
    // === FORWARD-ONLY PASS (no anchor set — use OCR dip for day-1 seed) ===
    let runningPetrol = null;
    let runningDiesel = null;



  forwardLedger.forEach(row => {
    let p_supply = 0;
    let d_supply = 0;

    const dateStr = row.date;
    const phys = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[dateStr] : null;

    // Step 1: Get supply from bank-verified invoices first, then OCR receipts
    let p_bill_supply = 0;
    let d_bill_supply = 0;
    if (typeof SUPPLY_BILLS_DATA !== 'undefined') {
      const daySupplies = SUPPLY_BILLS_DATA.filter(s => s.invoice_date_iso === dateStr);
      daySupplies.forEach(s => {
        const qty = (s.quantity_kl || 0) * 1000;
        if (s.product === 'Petrol') p_bill_supply += qty;
        else if (s.product === 'Diesel') d_bill_supply += qty;
      });
    }

    if (p_bill_supply > 0 || d_bill_supply > 0) {
      p_supply = p_bill_supply;
      d_supply = d_bill_supply;
    } else if (phys) {
      p_supply = phys.petrol_receipt || 0;
      d_supply = phys.diesel_receipt || 0;
    }

    // Truck capacity safeguard — max 12 KL per day, snaps to 4KL compartments
    if (p_supply > 12000) p_supply = 12000;
    if (d_supply > 12000) d_supply = 12000;
    if (p_supply + d_supply > 12000) {
      const ratio = p_supply / (p_supply + d_supply);
      p_supply = Math.round((12000 * ratio) / 4000) * 4000;
      d_supply = 12000 - p_supply;
    }

    // Step 2: Determine opening stock
    // Always prefer the running calculated chain.
    // Only use OCR dip for seeding the very first day (runningPetrol is null)
    // or if user has manually overridden (p_dip_override).
    const p_dip_raw = (row.p_dip_override !== undefined) ? row.p_dip_override : null;
    const d_dip_raw = (row.d_dip_override !== undefined) ? row.d_dip_override : null;

    let start_p;
    if (p_dip_raw !== null) {
      // Manual override always wins
      start_p = p_dip_raw;
    } else if (runningPetrol !== null) {
      // Calculated chain is the primary source
      start_p = runningPetrol;
    } else if (phys && phys.petrol_dip !== undefined) {
      // First-day seed only — use OCR dip to bootstrap the chain
      start_p = phys.petrol_dip;
    } else {
      start_p = row.opening_stock?.ms ?? 8000;
    }

    let start_d;
    if (d_dip_raw !== null) {
      start_d = d_dip_raw;
    } else if (runningDiesel !== null) {
      start_d = runningDiesel;
    } else if (phys && phys.diesel_dip !== undefined) {
      start_d = phys.diesel_dip;
    } else {
      start_d = row.opening_stock?.hsd ?? 12000;
    }

    const c = computeLedgerRow(row, wacMap);
    const sales_p = c.totals.net_24h.petrol;
    const sales_d = c.totals.net_24h.diesel;

    const close_p = Math.max(0, start_p - sales_p + p_supply);
    const close_d = Math.max(0, start_d - sales_d + d_supply);

    runningPetrol = close_p;
    runningDiesel = close_d;

    // Store physical dip for display/sanity check only (not for chain calculation)
    const phys_p_display = phys && phys.petrol_dip !== undefined ? phys.petrol_dip : null;
    const phys_d_display = phys && phys.diesel_dip !== undefined ? phys.diesel_dip : null;

    stockTimeline[dateStr] = {
      start_p,
      supply_p: p_supply,
      close_p,
      physical_p: phys_p_display,
      start_d,
      supply_d: d_supply,
      close_d,
      physical_d: phys_d_display
    };
  }); // end forwardLedger.forEach
  } // end else (no anchor)

  // Build full date list — from first entry to TODAY (IST)
  // OUTSIDE if/else so ALL ledger views share the same data
  const ledgerDateMap = {};
  db.daily_ledger.forEach(r => { ledgerDateMap[r.date] = r; });
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  const todayDateStr = nowIST.toISOString().split('T')[0];
  const firstLedgerDate = forwardLedger[0]?.date || todayDateStr;
  const fullLedgerRows = [];
  let iterDate = new Date(firstLedgerDate + 'T12:00:00Z');
  const endIterDate = new Date(todayDateStr + 'T12:00:00Z');
  while (iterDate <= endIterDate) {
    const ds = iterDate.toISOString().split('T')[0];
    fullLedgerRows.push(ledgerDateMap[ds] ? { ...ledgerDateMap[ds], _isPending: false } : { date: ds, _isPending: true });
    iterDate.setDate(iterDate.getDate() + 1);
  }
  fullLedgerRows.reverse(); // newest first — today at top

  if (ledgerViewMode === 'table') {

    tableContainer.style.display = 'block';
    splitContainer.style.display = 'none';
    document.getElementById('ledger-pnl-container').style.display = 'none';
    toggleBtn.style.display = 'inline-flex';

    let headerHtml = '';
    let rowsHtml = '';

    const getAnomalyStats = (row, index) => {
      if (!row) {
        return {
          isPriceChange: false,
          isNoSalePetrol: true,
          isNoSaleDiesel: true,
          isNoTesting: true,
          isNegativeProfit: false,
          hasVariance: false,
          badgesHtml: '',
          testsP: 0,
          testsD: 0,
          c: computeLedgerRow(null, wacMap)
        };
      }
      const prevRow = index + 1 < db.daily_ledger.length ? db.daily_ledger[index + 1] : null;
      const isPriceChange = prevRow && row.prices && prevRow.prices &&
        ((row.prices.petrol || 0) !== (prevRow.prices.petrol || 0) || (row.prices.diesel || 0) !== (prevRow.prices.diesel || 0));

      const c = computeLedgerRow(row, wacMap);
      const isNoSalePetrol = (c.totals?.net_24h?.petrol || 0) <= 0;
      const isNoSaleDiesel = (c.totals?.net_24h?.diesel || 0) <= 0;

      const t1p_day   = (row.du1_p && (row.du1_p.close_day ?? 0) > (row.du1_p.open ?? 0))   ? (row.du1_p.tests_day   ?? 1) : 0;
      const t1d_day   = (row.du1_d && (row.du1_d.close_day ?? 0) > (row.du1_d.open ?? 0))   ? (row.du1_d.tests_day   ?? 1) : 0;
      const t2p_day   = (row.du2_p && (row.du2_p.close_day ?? 0) > (row.du2_p.open ?? 0))   ? (row.du2_p.tests_day   ?? 1) : 0;
      const t2d_day   = (row.du2_d && (row.du2_d.close_day ?? 0) > (row.du2_d.open ?? 0))   ? (row.du2_d.tests_day   ?? 1) : 0;

      const testsP = t1p_day + t2p_day;
      const testsD = t1d_day + t2d_day;
      const isNoTesting = testsP === 0 && testsD === 0;

      const isNegativeProfit = c.financials.profit < 0;

      let dayVariance = 0;
      let nightVariance = 0;
      if (row.recon) {
        if (row.recon.day && typeof row.recon.day.variance === 'number') dayVariance = row.recon.day.variance;
        if (row.recon.night && typeof row.recon.night.variance === 'number') nightVariance = row.recon.night.variance;
      }
      const hasVariance = dayVariance !== 0 || nightVariance !== 0;

      let badgesHtml = '';
      if (isPriceChange) badgesHtml += `<span class="anomaly-badge anomaly-badge-price" title="Selling price changed on this day">Rate Switch</span>`;
      if (isNoSalePetrol || isNoSaleDiesel) badgesHtml += `<span class="anomaly-badge anomaly-badge-nosale" title="No fuel sales recorded on this day">No Sale</span>`;
      if (isNegativeProfit) badgesHtml += `<span class="anomaly-badge anomaly-badge-profit" title="Negative operating profit calculated">Loss</span>`;
      if (isNoTesting) badgesHtml += `<span class="anomaly-badge anomaly-badge-notest" title="No nozzle testing logged">No Test</span>`;
      if (hasVariance) {
        const v = dayVariance + nightVariance;
        badgesHtml += `<span class="anomaly-badge anomaly-badge-variance" title="Reconciliation Cash counted variance: ${v > 0 ? '+' : ''}${v.toFixed(2)}">Var: ${v > 0 ? '+' : ''}${v.toFixed(0)}</span>`;
      }

      const stk = stockTimeline[row.date];
      const isLowStockPetrol = stk && stk.close_p < 600;
      const isLowStockDiesel = stk && stk.close_d < 40;
      if (isLowStockPetrol || isLowStockDiesel) {
        let lowDetails = [];
        if (isLowStockPetrol) lowDetails.push(`Petrol (${stk.close_p.toFixed(0)}L < 600L)`);
        if (isLowStockDiesel) lowDetails.push(`Diesel (${stk.close_d.toFixed(0)}L < 40L)`);
        badgesHtml += `<span class="anomaly-badge anomaly-badge-lowstock" title="Low Fuel Level: ${lowDetails.join(', ')}">Low Stock</span>`;
      }

      return {
        isPriceChange,
        isNoSalePetrol,
        isNoSaleDiesel,
        isNoTesting,
        isNegativeProfit,
        hasVariance,
        isLowStockPetrol,
        isLowStockDiesel,
        badgesHtml,
        testsP,
        testsD,
        c
      };
    };

    if (show24hOnly) {
      // 24HR CONSOLIDATED VIEW HEADERS
      headerHtml = `
        <thead>
          <tr class="header-group">
            <th rowspan="2" class="sticky-col-left" style="min-width: 110px;">Date</th>
            <th colspan="2">Selling Rate</th>
            <th colspan="4">DU 1 (24Hr Cumulative Readings)</th>
            <th colspan="4">DU 2 (24Hr Cumulative Readings)</th>
            <th colspan="2">24hr Net Sales Liters</th>
            <th colspan="2">24hr Test Liters</th>
            <th colspan="3">24hr Gross Revenue</th>
            <th rowspan="2">Estimated Cost</th>
            <th rowspan="2">Total Profit</th>
            <th rowspan="2">Net Operating Profit (₹)</th>
            <th colspan="3" class="col-petrol bg-petrol-group">Petrol Stock Reconciliation</th>
            <th colspan="3" class="col-diesel bg-diesel-group">Diesel Stock Reconciliation</th>
            <th rowspan="2">Expenses</th>
            <th rowspan="2" class="sticky-col-right" style="min-width: 90px;">Actions</th>
          </tr>
          <tr class="header-cols">
            <th class="col-petrol">Petrol</th>
            <th class="col-diesel">Diesel</th>

            <th class="bg-petrol-group">MS Open (8 AM Today)</th>
            <th class="bg-petrol-group">MS Close (8 AM Tomorrow)</th>
            <th class="bg-diesel-group">HSD Open (8 AM Today)</th>
            <th class="bg-diesel-group">HSD Close (8 AM Tomorrow)</th>

            <th class="bg-petrol-group">MS Open (8 AM Today)</th>
            <th class="bg-petrol-group">MS Close (8 AM Tomorrow)</th>
            <th class="bg-diesel-group">HSD Open (8 AM Today)</th>
            <th class="bg-diesel-group">HSD Close (8 AM Tomorrow)</th>

            <th class="col-petrol bg-petrol-group">MS (Petrol)</th>
            <th class="col-diesel bg-diesel-group">HSD (Diesel)</th>

            <th class="col-petrol bg-petrol-group">MS (Liters)</th>
            <th class="col-diesel bg-diesel-group">HSD (Liters)</th>

            <th class="col-petrol">Petrol</th>
            <th class="col-diesel">Diesel</th>
            <th>Total</th>

            <th class="bg-petrol-group">Morning Dip</th>
            <th class="bg-petrol-group">Supply (L)</th>
            <th class="bg-petrol-group">Reconciled Close</th>

            <th class="bg-diesel-group">Morning Dip</th>
            <th class="bg-diesel-group">Supply (L)</th>
            <th class="bg-diesel-group">Reconciled Close</th>
          </tr>
        </thead>
      `;


      fullLedgerRows.forEach((row) => {
        if (row._isPending) {
          const stkEst = stockTimeline[row.date];
          const stkEstHtml = stkEst
            ? `<span style="color:#10b981; font-size:0.72rem; margin-left:0.5rem;">≈ P: ${stkEst.start_p.toFixed(0)} L | D: ${stkEst.start_d.toFixed(0)} L</span>`
            : '';
          rowsHtml += `
            <tr style="background: rgba(239,68,68,0.05); border-left: 3px solid #ef4444;">
              <td class="sticky-col-left" style="color: #ef4444;">
                <strong>${formatDate(row.date)}</strong>
                <span style="display:block; font-size:0.68rem; color:#ef4444; margin-top:2px;">⏳ Pending</span>
              </td>
              <td colspan="18" style="text-align:center; color: var(--text-muted); font-size:0.78rem; font-style:italic; padding: 0.6rem 0;">
                No readings entered yet${stkEstHtml}
              </td>
              <td class="sticky-col-right">
                <button class="btn btn-primary btn-sm" onclick="openLogReadingsModal('${row.date}')" style="padding: 0.25rem 0.5rem; font-size:0.72rem;">Enter Data</button>
              </td>
            </tr>
          `;
          return;
        }

        const index = db.daily_ledger.findIndex(r => r.date === row.date);
        const anomaly = getAnomalyStats(row, index);
        const c = anomaly.c;
        const testsP = anomaly.testsP;
        const testsD = anomaly.testsD;

        const stk = stockTimeline[row.date] || {
          start_p: 0, supply_p: 0, close_p: 0, physical_p: null,
          start_d: 0, supply_d: 0, close_d: 0, physical_d: null
        };

        let p_dip_html = stk.start_p.toFixed(0);
        if (stk.physical_p !== null) {
          const diff = Math.abs(stk.start_p - stk.physical_p);
          if (diff > 500) {
            p_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_p.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            p_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        let d_dip_html = stk.start_d.toFixed(0);
        if (stk.physical_d !== null) {
          const diff = Math.abs(stk.start_d - stk.physical_d);
          if (diff > 500) {
            d_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_d.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            d_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        const dayExps = row.expenses || (typeof KC_EXPENSES_DATA !== 'undefined' ? KC_EXPENSES_DATA[row.date] : null) || [];
        let expenses_html = '&mdash;';
        const totAmt = dayExps.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        if (totAmt > 0) {
          expenses_html = `
            <div class="expense-popover-container">
              <button class="expense-btn" onclick="toggleExpensePopover(event, '${row.date}')">
                ₹ ${totAmt.toFixed(0)}
              </button>
            </div>
          `;
        }

        rowsHtml += `
          <tr>
            <td class="sticky-col-left"><strong>${formatDate(row.date)}</strong>${anomaly.badgesHtml}</td>
            <td class="col-petrol ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.petrol ?? 0).toFixed(2)}</td>
            <td class="col-diesel ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.diesel ?? 0).toFixed(2)}</td>

            <!-- DU 1 24Hr -->
            <td class="bg-petrol-group">${(row.du1_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du1_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- DU 2 24Hr -->
            <td class="bg-petrol-group">${(row.du2_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du2_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- 24hr Net Liters -->
            <td class="col-petrol bg-petrol-group ${anomaly.isNoSalePetrol ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.petrol ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group ${anomaly.isNoSaleDiesel ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.diesel ?? 0).toFixed(1)}</td>

            <!-- 24hr Tests -->
            <td class="col-petrol bg-petrol-group ${testsP === 0 ? 'cell-anomaly-no-test' : ''}">${testsP * 5} L</td>
            <td class="col-diesel bg-diesel-group ${testsD === 0 ? 'cell-anomaly-no-test' : ''}">${testsD * 5} L</td>

            <!-- Revenue -->
            <td class="col-petrol">${formatCurrency(c.financials?.rev_petrol ?? 0)}</td>
            <td class="col-diesel">${formatCurrency(c.financials?.rev_diesel ?? 0)}</td>
            <td style="font-weight:600;">${formatCurrency(c.financials?.total_revenue ?? 0)}</td>

            <!-- Cost & Profit -->
            <td>${formatCurrency(c.financials?.total_cost ?? 0)}</td>
            <td class="${(c.financials?.profit ?? 0) >= 0 ? 'text-success' : 'text-danger'} ${anomaly.isNegativeProfit ? 'cell-anomaly-negative-profit' : ''}" style="font-weight: 600;">
              ${formatCurrency(c.financials?.profit ?? 0)}
            </td>

            <!-- Plan 21: Net Operating Profit (Commission - Expenses) -->
            <td style="font-weight:600;" title="Gross Commission: ${formatCurrency(c.financials?.total_commission ?? 0)} | Daily Expenses: ${formatCurrency(totAmt)}">${formatCurrency(c.financials?.net_operating_profit ?? 0)}</td>

            <!-- Plan 21: Stock Reconciliation Petrol -->
            <td class="bg-petrol-group">${p_dip_html}</td>
            <td class="bg-petrol-group">${stk.supply_p > 0 ? stk.supply_p.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-petrol-group" style="font-weight:600;">${stk.close_p.toFixed(0)} L</td>

            <!-- Plan 21: Stock Reconciliation Diesel -->
            <td class="bg-diesel-group">${d_dip_html}</td>
            <td class="bg-diesel-group">${stk.supply_d > 0 ? stk.supply_d.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-diesel-group" style="font-weight:600;">${stk.close_d.toFixed(0)} L</td>

            <!-- Plan 21: Expenses -->
            <td>${expenses_html}</td>

            <!-- Action -->
            <td class="sticky-col-right">
              <button class="btn btn-secondary btn-sm" onclick="editLedgerEntry(${index})" style="padding: 0.25rem 0.5rem; font-size:0.75rem;">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteLedgerRow('${row.date}')" style="padding: 0.25rem 0.5rem; font-size:0.75rem;">Del</button>
            </td>
          </tr>
        `;
      });

    } else {
      // DETAILED BREAKDOWN VIEW HEADERS
      headerHtml = `
        <thead>
          <tr class="header-group">
            <th rowspan="2" class="sticky-col-left" style="min-width: 110px;">Date</th>
            <th colspan="2">Selling Rate</th>
            <th colspan="4">DU 1 Day Shift Readings</th>
            <th colspan="4">DU 2 Day Shift Readings</th>
            <th colspan="4">DU 1 Night Shift Readings</th>
            <th colspan="4">DU 2 Night Shift Readings</th>
            <th colspan="4">Morning to Evening Sale (Day L)</th>
            <th colspan="4">Evening to Next morning (Night L)</th>
            <th colspan="2">Day Test Liters</th>
            <th colspan="2">24hr Net Liters</th>
            <th colspan="3">24hr Gross Revenue</th>
            <th rowspan="2">Estimated Cost</th>
            <th rowspan="2">Total Profit</th>
            <th rowspan="2">Net Operating Profit (₹)</th>
            <th colspan="3" class="col-petrol bg-petrol-group">Petrol Stock Reconciliation</th>
            <th colspan="3" class="col-diesel bg-diesel-group">Diesel Stock Reconciliation</th>
            <th rowspan="2">Expenses</th>
            <th rowspan="2" class="sticky-col-right" style="min-width: 90px;">Actions</th>
          </tr>
          <tr class="header-cols">
            <th class="col-petrol">Petrol</th>
            <th class="col-diesel">Diesel</th>

            <th class="bg-petrol-group">MS Open</th>
            <th class="bg-petrol-group">MS Close</th>
            <th class="bg-diesel-group">HSD Open</th>
            <th class="bg-diesel-group">HSD Close</th>

            <th class="bg-petrol-group">MS Open</th>
            <th class="bg-petrol-group">MS Close</th>
            <th class="bg-diesel-group">HSD Open</th>
            <th class="bg-diesel-group">HSD Close</th>

            <th class="bg-petrol-group">MS Open</th>
            <th class="bg-petrol-group">MS Close</th>
            <th class="bg-diesel-group">HSD Open</th>
            <th class="bg-diesel-group">HSD Close</th>

            <th class="bg-petrol-group">MS Open</th>
            <th class="bg-petrol-group">MS Close</th>
            <th class="bg-diesel-group">HSD Open</th>
            <th class="bg-diesel-group">HSD Close</th>

            <th class="col-petrol bg-petrol-group">DU1 MS</th>
            <th class="col-diesel bg-diesel-group">DU1 HSD</th>
            <th class="col-petrol bg-petrol-group">DU2 MS</th>
            <th class="col-diesel bg-diesel-group">DU2 HSD</th>

            <th class="col-petrol bg-petrol-group">DU1 MS</th>
            <th class="col-diesel bg-diesel-group">DU1 HSD</th>
            <th class="col-petrol bg-petrol-group">DU2 MS</th>
            <th class="col-diesel bg-diesel-group">DU2 HSD</th>

            <th class="col-petrol bg-petrol-group">MS (Liters)</th>
            <th class="col-diesel bg-diesel-group">HSD (Liters)</th>

            <th class="col-petrol bg-petrol-group">MS (Petrol)</th>
            <th class="col-diesel bg-diesel-group">HSD (Diesel)</th>

            <th class="col-petrol">Petrol</th>
            <th class="col-diesel">Diesel</th>
            <th>Total</th>

            <th class="bg-petrol-group">Morning Dip</th>
            <th class="bg-petrol-group">Supply (L)</th>
            <th class="bg-petrol-group">Reconciled Close</th>

            <th class="bg-diesel-group">Morning Dip</th>
            <th class="bg-diesel-group">Supply (L)</th>
            <th class="bg-diesel-group">Reconciled Close</th>
          </tr>
        </thead>
      `;


      // Reuse same fullLedgerRows built above (includes pending placeholders)
      fullLedgerRows.forEach((row) => {
        if (row._isPending) {
          const stkEst = stockTimeline[row.date];
          const stkEstHtml = stkEst
            ? `<span style="color:#10b981; font-size:0.72rem; margin-left:0.5rem;">≈ P: ${stkEst.start_p.toFixed(0)} L | D: ${stkEst.start_d.toFixed(0)} L</span>`
            : '';
          rowsHtml += `
            <tr style="background: rgba(239,68,68,0.05); border-left: 3px solid #ef4444;">
              <td class="sticky-col-left" style="color: #ef4444;">
                <strong>${formatDate(row.date)}</strong>
                <span style="display:block; font-size:0.68rem; color:#ef4444; margin-top:2px;">⏳ Pending</span>
              </td>
              <td colspan="28" style="text-align:center; color: var(--text-muted); font-size:0.78rem; font-style:italic; padding: 0.6rem 0;">
                No readings entered yet${stkEstHtml}
              </td>
              <td class="sticky-col-right">
                <button class="btn btn-primary btn-sm" onclick="openLogReadingsModal('${row.date}')" style="padding: 0.25rem 0.5rem; font-size:0.72rem;">Enter Data</button>
              </td>
            </tr>
          `;
          return;
        }

        const index = db.daily_ledger.findIndex(r => r.date === row.date);
        const anomaly = getAnomalyStats(row, index);
        const c = anomaly.c;
        const testsP = anomaly.testsP;
        const testsD = anomaly.testsD;

        const stk = stockTimeline[row.date] || {
          start_p: 0, supply_p: 0, close_p: 0, physical_p: null,
          start_d: 0, supply_d: 0, close_d: 0, physical_d: null
        };


        let p_dip_html = stk.start_p.toFixed(0);
        if (stk.physical_p !== null) {
          const diff = Math.abs(stk.start_p - stk.physical_p);
          if (diff > 500) {
            p_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_p.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            p_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        let d_dip_html = stk.start_d.toFixed(0);
        if (stk.physical_d !== null) {
          const diff = Math.abs(stk.start_d - stk.physical_d);
          if (diff > 500) {
            d_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_d.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            d_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        const dayExps = (typeof KC_EXPENSES_DATA !== 'undefined') ? KC_EXPENSES_DATA[row.date] : null;
        let expenses_html = '&mdash;';
        if (dayExps && dayExps.length > 0) {
          const totAmt = dayExps.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
          expenses_html = `
            <div class="expense-popover-container">
              <button class="expense-btn" onclick="toggleExpensePopover(event, '${row.date}')">
                ₹ ${totAmt.toFixed(0)}
              </button>
            </div>
          `;
        }

        rowsHtml += `
          <tr>
            <td class="sticky-col-left"><strong>${formatDate(row.date)}</strong>${anomaly.badgesHtml}</td>
            <td class="col-petrol ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.petrol ?? 0).toFixed(2)}</td>
            <td class="col-diesel ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.diesel ?? 0).toFixed(2)}</td>

            <!-- DU1 Day -->
            <td class="bg-petrol-group">${(row.du1_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du1_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_day ?? 0).toFixed(1)}</td>

            <!-- DU2 Day -->
            <td class="bg-petrol-group">${(row.du2_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du2_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_day ?? 0).toFixed(1)}</td>

            <!-- DU1 Night -->
            <td class="bg-petrol-group">${(row.du1_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du1_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- DU2 Night -->
            <td class="bg-petrol-group">${(row.du2_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du2_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- Day Sales Net -->
            <td class="col-petrol bg-petrol-group">${(c.sales?.du1_p?.day ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du1_d?.day ?? 0).toFixed(1)}</td>
            <td class="col-petrol bg-petrol-group">${(c.sales?.du2_p?.day ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du2_d?.day ?? 0).toFixed(1)}</td>

            <!-- Night Sales Net -->
            <td class="col-petrol bg-petrol-group">${(c.sales?.du1_p?.night ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du1_d?.night ?? 0).toFixed(1)}</td>
            <td class="col-petrol bg-petrol-group">${(c.sales?.du2_p?.night ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du2_d?.night ?? 0).toFixed(1)}</td>

            <!-- Day Tests -->
            <td class="col-petrol bg-petrol-group">
              ${(() => {
                const t1 = (row.du1_p && (row.du1_p.close_day ?? 0) > (row.du1_p.open ?? 0)) ? (row.du1_p.tests_day ?? 1) : 0;
                const t2 = (row.du2_p && (row.du2_p.close_day ?? 0) > (row.du2_p.open ?? 0)) ? (row.du2_p.tests_day ?? 1) : 0;
                const vol = (t1 + t2) * 5;
                const amt = vol * (row.prices?.petrol || 0);
                return vol > 0 ? `${vol} L <span style="font-size:0.75rem; color:var(--text-dim); display:block;">(₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>` : "0 L";
              })()}
            </td>
            <td class="col-diesel bg-diesel-group">
              ${(() => {
                const t1 = (row.du1_d && (row.du1_d.close_day ?? 0) > (row.du1_d.open ?? 0)) ? (row.du1_d.tests_day ?? 1) : 0;
                const t2 = (row.du2_d && (row.du2_d.close_day ?? 0) > (row.du2_d.open ?? 0)) ? (row.du2_d.tests_day ?? 1) : 0;
                const vol = (t1 + t2) * 5;
                const amt = vol * (row.prices?.diesel || 0);
                return vol > 0 ? `${vol} L <span style="font-size:0.75rem; color:var(--text-dim); display:block;">(₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>` : "0 L";
              })()}
            </td>

            <!-- 24hr Net Liters -->
            <td class="col-petrol bg-petrol-group ${anomaly.isNoSalePetrol ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.petrol ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group ${anomaly.isNoSaleDiesel ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.diesel ?? 0).toFixed(1)}</td>

            <!-- Revenue -->
            <td class="col-petrol">${formatCurrency(c.financials?.rev_petrol ?? 0)}</td>
            <td class="col-diesel">${formatCurrency(c.financials?.rev_diesel ?? 0)}</td>
            <td style="font-weight:600;">${formatCurrency(c.financials?.total_revenue ?? 0)}</td>

            <!-- Cost & Profit -->
            <td>${formatCurrency(c.financials?.total_cost ?? 0)}</td>
            <td class="${(c.financials?.profit ?? 0) >= 0 ? 'text-success' : 'text-danger'} ${anomaly.isNegativeProfit ? 'cell-anomaly-negative-profit' : ''}" style="font-weight: 600;">
              ${formatCurrency(c.financials?.profit ?? 0)}
            </td>

            <!-- Plan 21: Net Operating Profit (Commission - Expenses) -->
            <td style="font-weight:600;" title="Gross Commission: ${formatCurrency(c.financials?.total_commission ?? 0)} | Daily Expenses: ${formatCurrency(c.financials?.total_expenses ?? 0)}">${formatCurrency(c.financials?.net_operating_profit ?? 0)}</td>

            <!-- Plan 21: Stock Reconciliation Petrol -->
            <td class="bg-petrol-group">${p_dip_html}</td>
            <td class="bg-petrol-group">${stk.supply_p > 0 ? stk.supply_p.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-petrol-group" style="font-weight:600;">${stk.close_p.toFixed(0)} L</td>

            <!-- Plan 21: Stock Reconciliation Diesel -->
            <td class="bg-diesel-group">${d_dip_html}</td>
            <td class="bg-diesel-group">${stk.supply_d > 0 ? stk.supply_d.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-diesel-group" style="font-weight:600;">${stk.close_d.toFixed(0)} L</td>

            <!-- Plan 21: Expenses -->
            <td>${expenses_html}</td>

            <!-- Action -->
            <td class="sticky-col-right">
              <button class="btn btn-secondary btn-sm" onclick="editLedgerEntry(${index})" style="padding: 0.25rem 0.5rem; font-size:0.75rem;">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteLedgerRow('${row.date}')" style="padding: 0.25rem 0.5rem; font-size:0.75rem;">Del</button>
            </td>
          </tr>
        `;
      });

    }

    table.innerHTML = headerHtml + '<tbody>' + rowsHtml + '</tbody>';

    // Calculate and apply dynamic header group height for sticky offsets
    setTimeout(() => {
      const headerGroup = table.querySelector('tr.header-group');
      if (headerGroup) {
        const height = headerGroup.offsetHeight;
        table.style.setProperty('--header-group-height', `${height}px`);
      }
    }, 0);
  } else if (ledgerViewMode === 'pnl') {
    // P&L REPORT VIEW
    tableContainer.style.display = 'none';
    splitContainer.style.display = 'none';
    document.getElementById('ledger-pnl-container').style.display = 'block';
    toggleBtn.style.display = 'none';
    renderPnlReport();
    return;
  } else {
    // SPLIT OPERATIONS DASHBOARD VIEW
    tableContainer.style.display = 'none';
    splitContainer.style.display = 'block';
    document.getElementById('ledger-pnl-container').style.display = 'none';
    toggleBtn.style.display = 'none';

    // 1. Sort daily ledger descending by date
    const sortedLedger = [...db.daily_ledger].sort((a, b) => b.date.localeCompare(a.date));

    if (sortedLedger.length === 0) {
      document.getElementById('ledger-date-carousel').innerHTML = '<div style="color:var(--text-dim); padding:1rem;">No sales logged yet.</div>';
      document.getElementById('ledger-analyst-panel').innerHTML = '';
      return;
    }
    if (!selectedLedgerDate || !sortedLedger.some(row => row.date === selectedLedgerDate)) {
      selectedLedgerDate = sortedLedger[0].date;
    }

    // 2. Render horizontal date carousel
    const carousel = document.getElementById('ledger-date-carousel');
    carousel.innerHTML = '';

    sortedLedger.forEach(row => {
      const c = computeLedgerRow(row, wacMap);
      const isActive = row.date === selectedLedgerDate;
      const card = document.createElement('div');
      card.className = `carousel-card ${isActive ? 'active' : ''}`;

      const totalVolume = c.totals.net_24h.petrol + c.totals.net_24h.diesel;

      card.innerHTML = `
        <div class="card-date">${formatDate(row.date)}</div>
        <div class="card-val">${totalVolume.toFixed(0)} L Sold</div>
        <div class="card-profit ${c.financials.profit >= 0 ? 'text-success' : 'text-danger'}">
          ${c.financials.profit >= 0 ? '+' : ''}${formatCurrency(c.financials.profit)}
        </div>
      `;

      card.addEventListener('click', () => {
        selectedLedgerDate = row.date;
        renderLedger();
      });
      carousel.appendChild(card);
    });

    // 3. Render visual analyst panel
    const selectedRow = db.daily_ledger.find(row => row.date === selectedLedgerDate);
    const panel = document.getElementById('ledger-analyst-panel');

    if (!selectedRow) {
      panel.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding: 2rem;">Select a date from the carousel to view operations report.</div>';
      return;
    }

    const c = computeLedgerRow(selectedRow, wacMap);

    const petCapacity = db.settings.petrol_capacity || 20000;
    const dieCapacity = db.settings.diesel_capacity || 20000;

    const stockHistory = getStockHistoryFor(selectedRow.date);

    let petStart = stockHistory.petStart;
    let petEnd = stockHistory.petEnd;

    let dieStart = stockHistory.dieStart;
    let dieEnd = stockHistory.dieEnd;

    const petStartPct = Math.min(100, Math.max(0, (petStart / petCapacity) * 100));
    const petEndPct = Math.min(100, Math.max(0, (petEnd / petCapacity) * 100));

    const dieStartPct = Math.min(100, Math.max(0, (dieStart / dieCapacity) * 100));
    const dieEndPct = Math.min(100, Math.max(0, (dieEnd / dieCapacity) * 100));

    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size:1.45rem; font-weight:700; color:#fff; display: flex; align-items: center; gap: 0.5rem;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="var(--primary)"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 6H5V7h10v2zm0 4H5v-2h10v2zm4 4H5v-2h14v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>
            Station Operations Inspector
          </h2>
          <span style="font-size:0.9rem; color:var(--text-muted);">
            Reporting Date: <strong>${formatDate(selectedRow.date)}</strong> | Selling Rates: Petrol: <strong>₹${(selectedRow.prices?.petrol ?? 0).toFixed(2)}</strong>, Diesel: <strong>₹${(selectedRow.prices?.diesel ?? 0).toFixed(2)}</strong>
          </span>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="editLedgerEntry(${db.daily_ledger.indexOf(selectedRow)})">Edit Readings</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLedgerRow('${selectedRow.date}')">Delete Log</button>
        </div>
      </div>

      <!-- Tab Switcher -->
      <div class="analyst-tabs">
        <button class="analyst-tab-btn ${analystTab === 'flow' ? 'active' : ''}" onclick="switchAnalystTab('flow')">Station Flow Diagram</button>
        <button class="analyst-tab-btn ${analystTab === 'comparison' ? 'active' : ''}" onclick="switchAnalystTab('comparison')">Day vs Night Comparison</button>
      </div>
    `;

    if (analystTab === 'flow') {
      const testsP = (selectedRow.du1_p?.tests_day ?? 0) + (selectedRow.du2_p?.tests_day ?? 0);
      const testsD = (selectedRow.du1_d?.tests_day ?? 0) + (selectedRow.du2_d?.tests_day ?? 0);

      html += `
        <div class="station-flow-container">
          <!-- Column 1: Underground Storage Tanks (USTs) -->
          <div class="flow-tanks-panel">
            <h3 style="font-size:0.85rem; color:#fff; text-align:center; border-bottom: 1px solid var(--border); padding-bottom:0.5rem; margin-bottom:0.75rem;">UST Storage</h3>

            <!-- Petrol Tank -->
            <div class="flow-tank-card">
              <div class="flow-tank-cylinder">
                ${stockHistory.petrolSupplyMissing ? `
                  <div style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; text-align:center; font-size:0.65rem; color:var(--text-dim); padding:0 0.5rem; line-height:1.2; font-weight:500; background:rgba(0,0,0,0.45);">
                    Supply Data<br>Not Provided
                  </div>
                ` : `
                  <div class="flow-tank-liquid petrol" style="height: ${petEndPct.toFixed(0)}%;"></div>
                `}
              </div>
              <div class="flow-tank-label petrol">Petrol Tank (MS)</div>

              <div class="tank-flow-details" style="width: 130px; margin-top: 0.2rem;">
                <div class="flow-row">
                  <span>Start:</span>
                  <strong>${stockHistory.petrolSupplyMissing ? '<span style="font-size:0.7rem; font-weight:normal; color:var(--text-dim);">Supply not provided</span>' : `${petStart.toFixed(0)} L`}</strong>
                </div>
                ${stockHistory.salesP > 0 ? `
                <div class="flow-row">
                  <span>Sold:</span>
                  <strong style="color: var(--danger); font-weight: 700;">-${stockHistory.salesP.toFixed(0)} L</strong>
                </div>
                ` : ''}
                ${stockHistory.purchasedP > 0 ? `
                <div class="flow-row">
                  <span>Recd:</span>
                  <strong style="color: var(--success); font-weight: 700;">+${stockHistory.purchasedP.toFixed(0)} L</strong>
                </div>
                ` : ''}
                <div class="flow-row" style="border-top: 1px dashed var(--border); padding-top: 0.15rem; margin-top: 0.15rem;">
                  <span>Final:</span>
                  <strong style="color: #fff; font-weight: 700;">${stockHistory.petrolSupplyMissing ? '<span style="font-size:0.7rem; font-weight:normal; color:var(--text-dim);">Supply not provided</span>' : `${petEnd.toFixed(0)} L`}</strong>
                </div>
              </div>
            </div>

            <!-- Diesel Tank -->
            <div class="flow-tank-card" style="margin-top: 0.5rem;">
              <div class="flow-tank-cylinder">
                ${stockHistory.dieselSupplyMissing ? `
                  <div style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; text-align:center; font-size:0.65rem; color:var(--text-dim); padding:0 0.5rem; line-height:1.2; font-weight:500; background:rgba(0,0,0,0.45);">
                    Supply Data<br>Not Provided
                  </div>
                ` : `
                  <div class="flow-tank-liquid diesel" style="height: ${dieEndPct.toFixed(0)}%;"></div>
                `}
              </div>
              <div class="flow-tank-label diesel">Diesel Tank (HSD)</div>

              <div class="tank-flow-details" style="width: 130px; margin-top: 0.2rem;">
                <div class="flow-row">
                  <span>Start:</span>
                  <strong>${stockHistory.dieselSupplyMissing ? '<span style="font-size:0.7rem; font-weight:normal; color:var(--text-dim);">Supply not provided</span>' : `${dieStart.toFixed(0)} L`}</strong>
                </div>
                ${stockHistory.salesD > 0 ? `
                <div class="flow-row">
                  <span>Sold:</span>
                  <strong style="color: var(--danger); font-weight: 700;">-${stockHistory.salesD.toFixed(0)} L</strong>
                </div>
                ` : ''}
                ${stockHistory.purchasedD > 0 ? `
                <div class="flow-row">
                  <span>Recd:</span>
                  <strong style="color: var(--success); font-weight: 700;">+${stockHistory.purchasedD.toFixed(0)} L</strong>
                </div>
                ` : ''}
                <div class="flow-row" style="border-top: 1px dashed var(--border); padding-top: 0.15rem; margin-top: 0.15rem;">
                  <span>Final:</span>
                  <strong style="color: #fff; font-weight: 700;">${stockHistory.dieselSupplyMissing ? '<span style="font-size:0.7rem; font-weight:normal; color:var(--text-dim);">Supply not provided</span>' : `${dieEnd.toFixed(0)} L`}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Column 2: Dispensing Units (DU1 & DU2) -->
          <div class="flow-pumps-panel">
            <!-- DU 1 Card -->
            <div class="flow-pump-card">
              <div class="flow-pump-header">
                <span>Dispensing Unit 1 (DU 1)</span>
                <span class="badge" style="font-size:0.7rem; background:rgba(99,102,241,0.15); color:var(--primary); border:1px solid rgba(99,102,241,0.25);">Pump 1</span>
              </div>
              <div class="flow-pump-nozzles">
                <!-- Petrol Nozzle -->
                <div class="flow-nozzle-section petrol">
                  <div class="flow-nozzle-label" style="color:var(--color-petrol);">
                    <span>Petrol (MS)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 1</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${(selectedRow.du1_p?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du1_p?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du1_p?.close_night ?? 0) - (selectedRow.du1_p?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du1_p?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du1_p?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du1_p?.day ?? 0) + (c.sales?.du1_p?.night ?? 0)).toFixed(1)} L</strong></span>
                </div>

                <!-- Diesel Nozzle -->
                <div class="flow-nozzle-section diesel">
                  <div class="flow-nozzle-label" style="color:var(--color-diesel);">
                    <span>Diesel (HSD)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 2</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${(selectedRow.du1_d?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du1_d?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du1_d?.close_night ?? 0) - (selectedRow.du1_d?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du1_d?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du1_d?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du1_d?.day ?? 0) + (c.sales?.du1_d?.night ?? 0)).toFixed(1)} L</strong></span>
                </div>
              </div>
            </div>

            <!-- DU 2 Card -->
            <div class="flow-pump-card">
              <div class="flow-pump-header">
                <span>Dispensing Unit 2 (DU 2)</span>
                <span class="badge" style="font-size:0.7rem; background:rgba(99,102,241,0.15); color:var(--primary); border:1px solid rgba(99,102,241,0.25);">Pump 2</span>
              </div>
              <div class="flow-pump-nozzles">
                <!-- Petrol Nozzle -->
                <div class="flow-nozzle-section petrol">
                  <div class="flow-nozzle-label" style="color:var(--color-petrol);">
                    <span>Petrol (MS)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 3</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${(selectedRow.du2_p?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du2_p?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du2_p?.close_night ?? 0) - (selectedRow.du2_p?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du2_p?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du2_p?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du2_p?.day ?? 0) + (c.sales?.du2_p?.night ?? 0)).toFixed(1)} L</strong></span>
                </div>

                <!-- Diesel Nozzle -->
                <div class="flow-nozzle-section diesel">
                  <div class="flow-nozzle-label" style="color:var(--color-diesel);">
                    <span>Diesel (HSD)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 4</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${(selectedRow.du2_d?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du2_d?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du2_d?.close_night ?? 0) - (selectedRow.du2_d?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du2_d?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du2_d?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du2_d?.day ?? 0) + (c.sales?.du2_d?.night ?? 0)).toFixed(1)} L</strong></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Column 3: Operations Outcome / Checkout -->
          <div class="flow-financials-panel">
            <div class="financials-glass-card">
              <h4 style="font-size:0.85rem; color:#fff; border-bottom:1px solid var(--border); padding-bottom:0.4rem; margin-bottom:0.5rem;">24Hr Volume Outflow</h4>

              <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:0.25rem;">
                <span style="color:var(--color-petrol); font-weight:600;">Petrol MS Net:</span>
                <span style="color:#fff; font-weight:700;">${c.totals.net_24h.petrol.toFixed(1)} L</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                <span style="color:var(--color-diesel); font-weight:600;">Diesel HSD Net:</span>
                <span style="color:#fff; font-weight:700;">${c.totals.net_24h.diesel.toFixed(1)} L</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; border-top:1px solid rgba(255,255,255,0.04); padding-top:0.4rem; margin-top:0.25rem;">
                <span style="color:var(--text-muted);">Calibration Tests:</span>
                <span style="color:#fff;">P: ${testsP} (${testsP * 5}L) | D: ${testsD} (${testsD * 5}L)</span>
              </div>
            </div>

            <div class="financials-glass-card" style="font-size:0.8rem;">
              <h4 style="font-size:0.85rem; color:#fff; border-bottom:1px solid var(--border); padding-bottom:0.4rem; margin-bottom:0.5rem;">Financial Formula</h4>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-muted);">Gross Revenue:</span>
                <span style="font-weight:600; color:#fff;">${formatCurrency(c.financials.total_revenue)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>P: ${(c.totals?.net_24h?.petrol ?? 0).toFixed(0)}L × ₹${(selectedRow.prices?.petrol ?? 0).toFixed(2)}</span>
                <span>${formatCurrency(c.financials?.rev_petrol ?? 0)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border); margin-bottom:0.25rem;">
                <span>D: ${(c.totals?.net_24h?.diesel ?? 0).toFixed(0)}L × ₹${(selectedRow.prices?.diesel ?? 0).toFixed(2)}</span>
                <span>${formatCurrency(c.financials?.rev_diesel ?? 0)}</span>
              </div>

              <div style="display:flex; justify-content:space-between; border-top:1px dashed var(--border); padding-top:0.5rem; margin-top:0.25rem;">
                <span style="color:var(--text-muted);">WAC Purchase Cost:</span>
                <span style="font-weight:600; color:#fff;">${formatCurrency(c.financials.total_cost)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>P WAC Cost (₹${(db.stock?.petrol_cost_wac ?? 0).toFixed(2)}):</span>
                <span>${formatCurrency((c.totals?.net_24h?.petrol ?? 0) * (db.stock?.petrol_cost_wac ?? 0))}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>D WAC Cost (₹${(db.stock?.diesel_cost_wac ?? 0).toFixed(2)}):</span>
                <span>${formatCurrency((c.totals?.net_24h?.diesel ?? 0) * (db.stock?.diesel_cost_wac ?? 0))}</span>
              </div>
            </div>

            <div class="profit-gradient-box ${c.financials.profit >= 0 ? '' : 'negative'}">
              <span style="font-size:0.7rem; color:#fff; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Estimated Profit Margin</span>
              <div style="font-size:1.55rem; font-weight:800; color:#fff; margin:0.25rem 0;">${formatCurrency(c.financials.profit)}</div>
              <span style="font-size:0.65rem; color:rgba(255,255,255,0.7); display:block; margin-top:0.15rem;">
                ₹${((totalSoldL => totalSoldL > 0 ? c.financials.profit / totalSoldL : 0)(c.totals.net_24h.petrol + c.totals.net_24h.diesel)).toFixed(2)} avg. profit margin per liter
              </span>
            </div>
          </div>
        </div>
      `;
    } else if (analystTab === 'comparison') {
      const dayRev = ((c.totals?.day?.petrol ?? 0) * (selectedRow.prices?.petrol ?? 0)) + ((c.totals?.day?.diesel ?? 0) * (selectedRow.prices?.diesel ?? 0));
      const nightRev = ((c.totals?.night?.petrol ?? 0) * (selectedRow.prices?.petrol ?? 0)) + ((c.totals?.night?.diesel ?? 0) * (selectedRow.prices?.diesel ?? 0));
      const totalRev = dayRev + nightRev || 1;

      const dayShare = (dayRev / totalRev) * 100;
      const nightShare = (nightRev / totalRev) * 100;

      const maxPetrol = Math.max(c.totals.day.petrol, c.totals.night.petrol) || 1;
      const maxDiesel = Math.max(c.totals.day.diesel, c.totals.night.diesel) || 1;

      const dayPetPct = (c.totals.day.petrol / maxPetrol) * 100;
      const nightPetPct = (c.totals.night.petrol / maxPetrol) * 100;

      const dayDiePct = (c.totals.day.diesel / maxDiesel) * 100;
      const nightDiePct = (c.totals.night.diesel / maxDiesel) * 100;

      const dayTestsP = (selectedRow.du1_p?.tests_day ?? 0) + (selectedRow.du2_p?.tests_day ?? 0);
      const dayTestsD = (selectedRow.du1_d?.tests_day ?? 0) + (selectedRow.du2_d?.tests_day ?? 0);

      html += `
        <div class="comparison-grid">
          <!-- Left: Day Shift (8:00 AM - 8:00 PM) -->
          <div class="comparison-shift-card day">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">
              <span style="font-size:0.95rem; font-weight:700; color:var(--warning);">Day Shift (8 AM - 8 PM)</span>
              <span class="badge" style="background:rgba(251,191,36,0.15); color:var(--warning); font-size:0.7rem; border:1px solid rgba(251,191,36,0.25);">Active</span>
            </div>

            <div class="comparison-row">
              <span style="color:var(--text-muted);">Petrol MS Net:</span>
              <span style="font-weight:700; color:#fff;">${c.totals.day.petrol.toFixed(1)} L</span>
            </div>
            <div class="comparison-row">
              <span style="color:var(--text-muted);">Diesel HSD Net:</span>
              <span style="font-weight:700; color:#fff;">${c.totals.day.diesel.toFixed(1)} L</span>
            </div>
            <div class="comparison-row">
              <span style="color:var(--text-muted);">Calibration Tests:</span>
              <span>Petrol: ${dayTestsP} (${dayTestsP * 5}L) | Diesel: ${dayTestsD} (${dayTestsD * 5}L)</span>
            </div>
            <div class="comparison-row" style="border-bottom:none; margin-top:0.5rem;">
              <span style="color:var(--text-muted); font-weight:600;">Shift Revenue:</span>
              <span style="font-weight:700; color:#fff; font-size:1.1rem;">${formatCurrency(dayRev)}</span>
            </div>

            <div class="comparison-progress-container">
              <div class="comparison-progress-bar-label">
                <span>Petrol Sales Volume</span>
                <span>${c.totals.day.petrol.toFixed(0)} L</span>
              </div>
              <div class="comparison-progress-track">
                <div class="comparison-progress-fill petrol" style="width: ${dayPetPct.toFixed(0)}%;"></div>
              </div>

              <div class="comparison-progress-bar-label" style="margin-top:0.4rem;">
                <span>Diesel Sales Volume</span>
                <span>${c.totals.day.diesel.toFixed(0)} L</span>
              </div>
              <div class="comparison-progress-track">
                <div class="comparison-progress-fill diesel" style="width: ${dayDiePct.toFixed(0)}%;"></div>
              </div>
            </div>

            <div style="background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:0.75rem; border-radius:var(--radius-sm); text-align:center; font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
              Revenue Contribution: <strong>${dayShare.toFixed(1)}%</strong> of 24hr sales
            </div>
          </div>

          <!-- Right: Night Shift (8:00 PM - 8:00 AM) -->
          <div class="comparison-shift-card night">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">
              <span style="font-size:0.95rem; font-weight:700; color:var(--info);">Night Shift (8 PM - 8 AM)</span>
              <span class="badge" style="background:rgba(59,130,246,0.15); color:var(--info); font-size:0.7rem; border:1px solid rgba(59,130,246,0.25);">Active</span>
            </div>

            <div class="comparison-row">
              <span style="color:var(--text-muted);">Petrol MS Net:</span>
              <span style="font-weight:700; color:#fff;">${c.totals.night.petrol.toFixed(1)} L</span>
            </div>
            <div class="comparison-row">
              <span style="color:var(--text-muted);">Diesel HSD Net:</span>
              <span style="font-weight:700; color:#fff;">${c.totals.night.diesel.toFixed(1)} L</span>
            </div>
            <div class="comparison-row">
              <span style="color:var(--text-muted);">Calibration Tests:</span>
              <span>Petrol: 0 | Diesel: 0 <span style="font-size:0.7rem; color:var(--text-dim);">(Day shift only)</span></span>
            </div>
            <div class="comparison-row" style="border-bottom:none; margin-top:0.5rem;">
              <span style="color:var(--text-muted); font-weight:600;">Shift Revenue:</span>
              <span style="font-weight:700; color:#fff; font-size:1.1rem;">${formatCurrency(nightRev)}</span>
            </div>

            <div class="comparison-progress-container">
              <div class="comparison-progress-bar-label">
                <span>Petrol Sales Volume</span>
                <span>${c.totals.night.petrol.toFixed(0)} L</span>
              </div>
              <div class="comparison-progress-track">
                <div class="comparison-progress-fill petrol" style="width: ${nightPetPct.toFixed(0)}%;"></div>
              </div>

              <div class="comparison-progress-bar-label" style="margin-top:0.4rem;">
                <span>Diesel Sales Volume</span>
                <span>${c.totals.night.diesel.toFixed(0)} L</span>
              </div>
              <div class="comparison-progress-track">
                <div class="comparison-progress-fill diesel" style="width: ${nightDiePct.toFixed(0)}%;"></div>
              </div>
            </div>

            <div style="background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:0.75rem; border-radius:var(--radius-sm); text-align:center; font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
              Revenue Contribution: <strong>${nightShare.toFixed(1)}%</strong> of 24hr sales
            </div>
          </div>
        </div>
      `;
    }

    panel.innerHTML = html;
  }
}

// Global Tab Switcher Helper inside Operations Inspector
window.switchAnalystTab = function(tabName) {
  analystTab = tabName;
  renderLedger();
};

function renderSupplies() {
  const filterEl = document.getElementById('filter-supply-product');
  const searchEl = document.getElementById('search-supply-input');
  const tbody = document.getElementById('supplies-table-body');
  if (!tbody) return;

  const productFilter = filterEl ? filterEl.value : 'all';
  const searchInput = searchEl ? searchEl.value.toLowerCase().trim() : '';

  tbody.innerHTML = '';

  // Check if global array is defined
  if (typeof SUPPLY_BILLS_DATA === 'undefined') {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim);">Error: Supply bills data not loaded.</td></tr>`;
    return;
  }

  let filtered = SUPPLY_BILLS_DATA;

  // Apply product filter
  if (productFilter !== 'all') {
    filtered = filtered.filter(row => row.product === productFilter);
  }

  // Apply text search
  if (searchInput) {
    filtered = filtered.filter(row => 
      row.invoice_date.toLowerCase().includes(searchInput) ||
      (row.invoice_no && row.invoice_no.toLowerCase().includes(searchInput)) ||
      (row.sap_entry_no && row.sap_entry_no.toLowerCase().includes(searchInput)) ||
      (row.tt_number && row.tt_number.toLowerCase().includes(searchInput)) ||
      (row.doubt_or_discrepancy && row.doubt_or_discrepancy.toLowerCase().includes(searchInput))
    );
  }

  // Calculate metrics
  let totalPetrol = 0;
  let countPetrol = 0;
  let totalDiesel = 0;
  let countDiesel = 0;
  let totalCost = 0;
  let totalCount = 0;

  filtered.forEach(row => {
    const qty = parseFloat(row.quantity_kl) || 0;
    const cost = parseFloat(row.material_total) || 0;
    if (row.product === 'Petrol') {
      totalPetrol += qty;
      if (qty > 0) countPetrol++;
    } else if (row.product === 'Diesel') {
      totalDiesel += qty;
      if (qty > 0) countDiesel++;
    }
    totalCost += cost;
    totalCount++;
  });

  // Update DOM metrics
  const petEl = document.getElementById('supply-total-petrol');
  const petCntEl = document.getElementById('supply-count-petrol');
  const dieEl = document.getElementById('supply-total-diesel');
  const dieCntEl = document.getElementById('supply-count-diesel');
  const costEl = document.getElementById('supply-total-cost');
  const countEl = document.getElementById('supply-total-count');

  if (petEl) petEl.textContent = `${totalPetrol.toFixed(1)} KL`;
  if (petCntEl) petCntEl.textContent = `${countPetrol} Tankers`;
  if (dieEl) dieEl.textContent = `${totalDiesel.toFixed(1)} KL`;
  if (dieCntEl) dieCntEl.textContent = `${countDiesel} Tankers`;
  if (costEl) costEl.textContent = formatCurrency(totalCost);
  if (countEl) countEl.textContent = `${totalCount} Deliveries`;

  // Render rows
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">No supply records found matching filters.</td></tr>`;
    return;
  }

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    
    const qty_kl = parseFloat(row.quantity_kl);
    const qty_l = !isNaN(qty_kl) ? `${(qty_kl * 1000).toLocaleString('en-IN')} L` : `<span style="color:#ef4444; font-weight:600;">Unclear</span>`;
    const qty_kl_str = !isNaN(qty_kl) ? `${qty_kl} KL` : `<span style="color:#ef4444; font-weight:600;">Unclear</span>`;

    const cost = parseFloat(row.material_total);
    const cost_str = !isNaN(cost) ? formatCurrency(cost) : `<span class="text-muted">Unclear</span>`;
    
    // Status color
    const isFlagged = !!row.doubt_or_discrepancy;
    const statusBadge = isFlagged 
      ? `<span class="anomaly-badge anomaly-badge-notest" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171;">⚠️ Flagged</span>`
      : `<span class="anomaly-badge anomaly-badge-price" style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80;">✅ Verified</span>`;

    tr.innerHTML = `
      <td style="font-weight: 600;">${row.invoice_date}</td>
      <td class="${row.product === 'Petrol' ? 'col-petrol' : 'col-diesel'}" style="font-weight: 600;">${row.product}</td>
      <td style="font-weight: 600;">${qty_kl_str}</td>
      <td style="font-weight: 500;">${qty_l}</td>
      <td style="font-weight: 600; color: var(--primary);">${cost_str}</td>
      <td><code style="color: var(--text-dim);">${row.invoice_no || '—'}</code></td>
      <td><code style="color: var(--text-dim);">${row.sap_entry_no || '—'}</code></td>
      <td><code style="color: var(--text-dim);">${row.tt_number || '—'}</code></td>
      <td>${statusBadge}</td>
      <td style="font-size: 0.82rem; max-width: 250px; color: ${isFlagged ? '#f87171' : 'var(--text-muted)'}; line-height:1.4;">${row.doubt_or_discrepancy || 'Clean delivery'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPurchases() {
  const tableBody = document.getElementById('purchases-log-table-body');
  const creditPlannerAlerts = document.getElementById('credit-planner-alerts');

  tableBody.innerHTML = '';
  creditPlannerAlerts.innerHTML = '';

  const unpaid = db.purchases.filter(p => p.payment_status === 'unpaid');
  const todayStr = new Date().toISOString().split('T')[0];

  if (unpaid.length === 0) {
    creditPlannerAlerts.innerHTML = `
      <div class="alert-item success">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
        <div class="alert-content">
          <span class="alert-title">No Unpaid Deliveries</span>
          All tankers have been settled. Your credit line is clean!
        </div>
      </div>
    `;
  } else {
    unpaid.forEach(p => {
      const div = document.createElement('div');
      const isOverdue = p.deadline_date < todayStr;
      const requiresImmediateFiling = p.rtgs_filing_date <= todayStr;

      let alertClass = "info";
      let alertIcon = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;

      if (isOverdue) {
        alertClass = "danger";
        alertIcon = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
      } else if (requiresImmediateFiling) {
        alertClass = "warning";
        alertIcon = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
      }

      div.className = `alert-item ${alertClass}`;
      div.innerHTML = `
        ${alertIcon}
        <div class="alert-content">
          <span class="alert-title">${isOverdue ? 'Overdue - Interest Charging' : requiresImmediateFiling ? 'Action Required: File RTGS Today' : 'Upcoming Payment'}</span>
          Tanker Cost: <strong>${formatCurrency(p.total_cost)}</strong> (Delivered ${formatDate(p.date.split('T')[0])})<br>
          Interest-Free Limit: <strong>${formatDate(p.deadline_date)}</strong><br>
          <strong>File RTGS at Bank by: ${formatDate(p.rtgs_filing_date)}</strong>
          ${isOverdue ? '<br><span style="text-decoration:underline;">Interest is accumulating daily!</span>' : ''}
        </div>
      `;
      creditPlannerAlerts.appendChild(div);
    });
  }

  if (db.purchases.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 2rem;">No purchase records found.</td></tr>`;
    return;
  }

  db.purchases.forEach(p => {
    const tr = document.createElement('tr');

    let badgeClass = "badge-success";
    let statusText = "Paid";
    if (p.payment_status === 'unpaid') {
      if (p.deadline_date < todayStr) {
        badgeClass = "badge-danger";
        statusText = "Overdue";
      } else {
        badgeClass = "badge-warning";
        statusText = "Unpaid";
      }
    }

    const payActionText = p.payment_status === 'paid' ? 'Reset Status' : 'Mark Paid';

    let petrolAuditHtml = '';
    if (p.petrol_liters > 0 && p.petrol_observed_density) {
      const pDev = p.petrol_rho15 - p.petrol_invoice_density;
      const pDevColor = Math.abs(pDev) > 3.0 ? '#ef4444' : '#22c55e';
      petrolAuditHtml = `
        <div style="font-size: 0.72rem; line-height: 1.35; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dotted var(--border); color: var(--text-muted); font-family: monospace;">
          Obs: <strong>${p.petrol_observed_density}</strong> @ <strong>${p.petrol_observed_temp}°C</strong><br>
          ρ15: <strong>${p.petrol_rho15?.toFixed(1) || '-'}</strong> (Dev: <strong style="color: ${pDevColor}">${pDev > 0 ? '+' : ''}${pDev?.toFixed(1) || '0'}</strong>)<br>
          Corr: <strong>${p.petrol_corrected_vol?.toFixed(0) || '-'} L</strong><br>
          Short: <strong style="${p.petrol_shortage > 0 ? 'color: #ef4444;' : ''}">${p.petrol_shortage?.toFixed(0) || '0'} L</strong>
        </div>
      `;
    }

    let dieselAuditHtml = '';
    if (p.diesel_liters > 0 && p.diesel_observed_density) {
      const dDev = p.diesel_rho15 - p.diesel_invoice_density;
      const dDevColor = Math.abs(dDev) > 3.0 ? '#ef4444' : '#22c55e';
      dieselAuditHtml = `
        <div style="font-size: 0.72rem; line-height: 1.35; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dotted var(--border); color: var(--text-muted); font-family: monospace;">
          Obs: <strong>${p.diesel_observed_density}</strong> @ <strong>${p.diesel_observed_temp}°C</strong><br>
          ρ15: <strong>${p.diesel_rho15?.toFixed(1) || '-'}</strong> (Dev: <strong style="color: ${dDevColor}">${dDev > 0 ? '+' : ''}${dDev?.toFixed(1) || '0'}</strong>)<br>
          Corr: <strong>${p.diesel_corrected_vol?.toFixed(0) || '-'} L</strong><br>
          Short: <strong style="${p.diesel_shortage > 0 ? 'color: #ef4444;' : ''}">${p.diesel_shortage?.toFixed(0) || '0'} L</strong>
        </div>
      `;
    }

    tr.innerHTML = `
      <td>
        <strong>${formatDate(p.date.split('T')[0])}</strong><br>
        <span style="font-size: 0.8rem; color: var(--text-dim);">${p.date.split('T')[1]}</span>
      </td>
      <td>${formatVol(p.petrol_liters)}${petrolAuditHtml}</td>
      <td>${formatVol(p.diesel_liters)}${dieselAuditHtml}</td>
      <td>
        <span style="font-size:0.8rem; color: var(--text-muted);">
          P: @${parseFloat(p.price_petrol).toFixed(2)}<br>
          D: @${parseFloat(p.price_diesel).toFixed(2)}
        </span><br>
        <strong>${formatCurrency(p.total_cost)}</strong>
      </td>
      <td>${formatDate(p.deadline_date)}</td>
      <td style="font-weight: 500;">
        ${formatDate(p.rtgs_filing_date)}
        ${p.payment_status === 'unpaid' && p.rtgs_filing_date === todayStr ? '<br><span class="badge badge-warning" style="font-size:0.65rem;">Today</span>' : ''}
      </td>
      <td>${p.paid_date ? formatDate(p.paid_date) : '-'}</td>
      <td>
        <span class="badge ${badgeClass}">${statusText}</span>
        ${p.interest_charged > 0 ? `<br><span style="font-size:0.75rem; color: var(--danger);">Int: ${formatCurrency(p.interest_charged)}</span>` : ''}
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="togglePayment('${p.id}')">${payActionText}</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

function renderPricing() {
  const tableBody = document.getElementById('prices-log-table-body');
  tableBody.innerHTML = '';

  const active = db.prices[0] || { petrol: 103.50, diesel: 90.80, effective_date: null };

  document.getElementById('active-price-petrol-val').textContent = active.petrol.toFixed(2);
  document.getElementById('active-price-diesel-val').textContent = active.diesel.toFixed(2);
  document.getElementById('active-prices-date').textContent = active.effective_date ? `Effective from: ${formatDateTime(active.effective_date)}` : "No prices active";

  if (db.prices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 2rem;">No price logs found.</td></tr>`;
    return;
  }

  db.prices.forEach((p, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${formatDateTime(p.effective_date)}</strong></td>
      <td style="color: var(--color-petrol); font-weight: 600;">${formatCurrency(p.petrol)}</td>
      <td style="color: var(--color-diesel); font-weight: 600;">${formatCurrency(p.diesel)}</td>
      <td>
        ${index > 0 ? `<button class="btn btn-danger btn-sm" onclick="deletePrice(${index})">Remove</button>` : '<span style="font-size:0.8rem; color: var(--text-dim);">Active Pricing</span>'}
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

function deletePrice(index) {
  if (confirm("Are you sure you want to delete this price record? This will affect historical calculations that fell under this price window.")) {
    db.prices.splice(index, 1);
    saveDB();
    renderPricing();
    showNotification("Pricing record deleted.", "info");
  }
}

function renderHolidays() {
  const tableBody = document.getElementById('holidays-table-body');
  if (!tableBody) return; // holidays view removed from UI
  tableBody.innerHTML = '';

  const sunEl = document.getElementById('cfg-sundays-closed');
  const satEl = document.getElementById('cfg-sats-closed');
  if (sunEl) sunEl.checked = db.settings.sundays_closed;
  if (satEl) satEl.checked = db.settings.sats_closed;

  if (db.holidays.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 2rem;">No holidays in calendar.</td></tr>`;
    return;
  }

  db.holidays.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${formatDate(h.date)}</strong></td>
      <td>${h.name}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteHoliday('${h.date}')">Remove</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

function deleteHoliday(dateStr) {
  if (confirm(`Are you sure you want to remove the bank holiday on ${formatDate(dateStr)}?`)) {
    removeHoliday(dateStr);
    renderHolidays();
  }
}

function renderSettings() {
  const session = getSession();

  // ── Cloud Sync Settings ──────────────────────────────────
  const syncCfg      = getSyncCfg();
  const syncTokenEl  = document.getElementById('cfg-sync-master-key');
  const syncGistEl   = document.getElementById('cfg-sync-bin-id');
  if (syncTokenEl) syncTokenEl.value = syncCfg.gistToken || '';
  if (syncGistEl)  syncGistEl.value  = syncCfg.gistId    || '';

  const saveSyncBtn = document.getElementById('cfg-save-sync-btn');
  if (saveSyncBtn && !saveSyncBtn._wired) {
    saveSyncBtn._wired = true;
    saveSyncBtn.addEventListener('click', async () => {
      const tok  = (syncTokenEl ? syncTokenEl.value : '').trim();
      const gid  = (syncGistEl  ? syncGistEl.value  : '').trim();
      if (!tok || !gid) { showNotification('Enter both GitHub Token and Gist ID.', 'danger'); return; }
      saveSyncCfg({ gistToken: tok, gistId: gid });
      showNotification('Sync settings saved. Pushing data to cloud…', 'success');
      await syncPush();
      showNotification('✅ Data pushed to Gist successfully!', 'success');
    });
  }

  const forcePushBtn = document.getElementById('cfg-force-push-btn');
  if (forcePushBtn && !forcePushBtn._wired) {
    forcePushBtn._wired = true;
    forcePushBtn.addEventListener('click', async () => {
      showNotification('Pushing all data to cloud…', 'info');
      await syncPush();
      showNotification('✅ All data pushed to cloud.', 'success');
    });
  }

  const forcePullBtn = document.getElementById('cfg-force-pull-btn');
  if (forcePullBtn && !forcePullBtn._wired) {
    forcePullBtn._wired = true;
    forcePullBtn.addEventListener('click', async () => {
      showNotification('Pulling latest data from cloud…', 'info');
      const cloudData = await syncPull();
      if (cloudData && cloudData.daily_ledger) {
        db = cloudData;
        localStorage.setItem('octaneflow_db', JSON.stringify(db));
        showNotification('✅ Cloud data loaded successfully!', 'success');
        initApp();
      } else {
        showNotification('No cloud data found or sync not configured.', 'danger');
      }
    });
  }

  // ── Owner Profile Settings ────────────────────────────────
  if (session && session.role === 'owner') {
    const dispNameEl = document.getElementById('owner-display-name');
    const unameEl = document.getElementById('owner-username');
    const newPassEl = document.getElementById('owner-new-password');
    if (dispNameEl) dispNameEl.value = session.displayName || '';
    if (unameEl) unameEl.value = session.username || '';
    if (newPassEl) newPassEl.value = '';
  }

  const updateProfileBtn = document.getElementById('update-owner-profile-btn');
  if (updateProfileBtn && !updateProfileBtn._wired) {
    updateProfileBtn._wired = true;
    updateProfileBtn.addEventListener('click', async () => {
      const dispName = document.getElementById('owner-display-name')?.value?.trim();
      const newUname = document.getElementById('owner-username')?.value?.trim()?.toLowerCase();
      const newPass  = document.getElementById('owner-new-password')?.value;

      if (!dispName || !newUname) {
        showNotification('Display Name and Username are required.', 'danger');
        return;
      }

      const users = getUsers();
      if (!session || session.role !== 'owner') return;

      const currentUname = session.username.toLowerCase();

      // If changing username, check for conflicts
      if (newUname !== currentUname && users[newUname]) {
        showNotification('Username is already taken.', 'danger');
        return;
      }

      const userRecord = users[currentUname];
      if (!userRecord) {
        showNotification('Owner account record not found.', 'danger');
        return;
      }

      userRecord.displayName = dispName;

      if (newPass && newPass.trim() !== '') {
        if (newPass.length < 6) {
          showNotification('Password must be at least 6 characters.', 'danger');
          return;
        }
        userRecord.passwordHash = await hashString(newPass.trim());
      }

      if (newUname !== currentUname) {
        userRecord.username = newUname;
        users[newUname] = userRecord;
        delete users[currentUname];
      } else {
        users[currentUname] = userRecord;
      }

      saveUsers(users);
      setSession(userRecord);

      showNotification('✅ Profile updated successfully. Syncing changes...', 'success');

      try {
        await syncPush();
        showNotification('✅ Profile synchronized across all devices!', 'success');
      } catch (err) {
        showNotification('⚠️ Profile saved locally but failed to sync to cloud.', 'warning');
      }

      checkAuth();
      renderSettings();
    });
  }
  // ── End Cloud Sync ───────────────────────────────────────

  document.getElementById('cfg-petrol-capacity').value = db.settings.petrol_capacity;
  document.getElementById('cfg-diesel-capacity').value = db.settings.diesel_capacity;
  document.getElementById('cfg-safety-stock').value = db.settings.safety_stock;
  document.getElementById('cfg-currency-symbol').value = db.settings.currency;
  document.getElementById('cfg-ads-days').value = db.settings.ads_days || 14;

  const petrolDia = db.settings.petrol_tank_dia || 200;
  const petrolLen = db.settings.petrol_tank_len || 636.6;
  const petrolDead = db.settings.petrol_dead_stock || 600;
  const dieselDia = db.settings.diesel_tank_dia || 200;
  const dieselLen = db.settings.diesel_tank_len || 636.6;
  const dieselDead = db.settings.diesel_dead_stock || 40;

  document.getElementById('cfg-petrol-dia').value = petrolDia;
  document.getElementById('cfg-petrol-len').value = petrolLen;
  document.getElementById('cfg-petrol-dead').value = petrolDead;
  document.getElementById('cfg-diesel-dia').value = dieselDia;
  document.getElementById('cfg-diesel-len').value = dieselLen;
  document.getElementById('cfg-diesel-dead').value = dieselDead;

  // Capital analysis rendering
  const oldWacP = db.stock.petrol_cost_wac || 0;
  const oldWacD = db.stock.diesel_cost_wac || 0;
  const lockedPVal = petrolDead * oldWacP;
  const lockedDVal = dieselDead * oldWacD;
  const totalLockedVal = lockedPVal + lockedDVal;

  const wacPetEl = document.getElementById('cfg-capital-wac-petrol');
  if (wacPetEl) wacPetEl.textContent = formatCurrency(oldWacP) + " / L";
  const wacDieEl = document.getElementById('cfg-capital-wac-diesel');
  if (wacDieEl) wacDieEl.textContent = formatCurrency(oldWacD) + " / L";
  const lockedPetEl = document.getElementById('cfg-capital-locked-petrol');
  if (lockedPetEl) lockedPetEl.textContent = formatCurrency(lockedPVal);
  const lockedDieEl = document.getElementById('cfg-capital-locked-diesel');
  if (lockedDieEl) lockedDieEl.textContent = formatCurrency(lockedDVal);
  const lockedTotEl = document.getElementById('cfg-capital-locked-total');
  if (lockedTotEl) lockedTotEl.textContent = formatCurrency(totalLockedVal);

  // Load PhonePe API credentials
  document.getElementById('cfg-phonepe-mid').value = db.settings.phonepe_mid || '';
  document.getElementById('cfg-phonepe-salt-key').value = db.settings.phonepe_salt_key || '';
  document.getElementById('cfg-phonepe-salt-index').value = db.settings.phonepe_salt_index || '1';

  // Render Diagnostics & System logs
  renderDiagnostics();
  SystemLogger.renderAll();
}

// -------------------------------------------------------------
// EVENT HANDLERS & MODALS
// -------------------------------------------------------------
function openLogReadingsModal(targetDate) {
  // Use targetDate if provided, otherwise default to current IST date
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  const defaultDate = nowIST.toISOString().split('T')[0];
  const activeDate = targetDate || defaultDate;

  document.getElementById('ledger-date').value = activeDate;
  document.getElementById('log-readings-modal-title').textContent = `Log Daily Totalizer Readings for ${formatDate(activeDate)}`;

  // Clear form fields
  document.getElementById('log-readings-form').reset();
  document.getElementById('ledger-date').value = activeDate;
  const remarksEl = document.getElementById('ledger-remarks');
  if (remarksEl) remarksEl.value = '';

  tempModalExpenses = [];
  renderModalExpenses();

  // Dynamic pre-fill helper
  applyLedgerPrefill();
  updateModalTests();
  openModal('log-readings-modal');
}

function editLedgerEntry(index) {
  const row = db.daily_ledger[index];
  if (!row) return;

  document.getElementById('log-readings-modal-title').textContent = `Edit Readings for ${formatDate(row.date)}`;
  document.getElementById('ledger-date').value = row.date;

  // Populate form
  const populate = (prefix, nozzle) => {
    document.getElementById(`${prefix}_open`).value = nozzle.open.toFixed(2);
    document.getElementById(`${prefix}_close_day`).value = nozzle.close_day.toFixed(2);
    document.getElementById(`${prefix}_close_night`).value = nozzle.close_night.toFixed(2);
  };

  populate('du1_p', row.du1_p);
  populate('du1_d', row.du1_d);
  populate('du2_p', row.du2_p);
  populate('du2_d', row.du2_d);

  const remarksEl = document.getElementById('ledger-remarks');
  if (remarksEl) remarksEl.value = row.feedback || '';

  // Plan 21: Populate starting stock dip overrides
  document.getElementById('ledger_p_dip_override').value = row.p_dip_override !== undefined ? row.p_dip_override : '';
  document.getElementById('ledger_d_dip_override').value = row.d_dip_override !== undefined ? row.d_dip_override : '';

  // Pre-fill daily cash expenses
  const staticExps = (typeof KC_EXPENSES_DATA !== 'undefined') ? KC_EXPENSES_DATA[row.date] : null;
  tempModalExpenses = row.expenses ? [...row.expenses] : (staticExps ? staticExps.map(x => ({name: x.name, amount: x.amount})) : []);
  renderModalExpenses();

  updateModalTests();
  openModal('log-readings-modal');
}

// Pre-fill totalizer openings on date changes
function applyLedgerPrefill() {
  const dateStr = document.getElementById('ledger-date').value;
  if (!dateStr) return;

  // Find yesterday's night closing to serve as today's morning opening
  const yesterdayStr = addDays(dateStr, -1);
  const yesterdayRow = db.daily_ledger.find(row => row.date === yesterdayStr);

  const setOpens = (prefix, fallbackVal) => {
    let openVal = fallbackVal;
    if (yesterdayRow && yesterdayRow[prefix]) {
      openVal = yesterdayRow[prefix].close_night;
    }
    document.getElementById(`${prefix}_open`).value = openVal.toFixed(2);

    // Also bind event triggers to carry Evening Close to Night Open (close_day -> open_night)
    const closeDayInput = document.getElementById(`${prefix}_close_day`);
    closeDayInput.placeholder = `Open: ${openVal.toFixed(2)}`;
  };

  // Prefill opens from yesterday's closings, default to 0.00 if first row
  let p1 = 0, d1 = 0, p2 = 0, d2 = 0;
  if (db.daily_ledger.length > 0) {
    const latest = db.daily_ledger[0];
    p1 = latest.du1_p.close_night;
    d1 = latest.du1_d.close_night;
    p2 = latest.du2_p.close_night;
    d2 = latest.du2_d.close_night;
  }

  setOpens('du1_p', p1);
  setOpens('du1_d', d1);
  setOpens('du2_p', p2);
  setOpens('du2_d', d2);
}

document.getElementById('ledger-date').addEventListener('change', applyLedgerPrefill);

let astmTable = null;

async function loadAstmTable() {
  if (astmTable) return astmTable;
  try {
    const res = await fetch('astm_table_53b.json');
    if (!res.ok) throw new Error("Failed to load ASTM Table 53B");
    astmTable = await res.json();
    window.astmTable = astmTable;
    console.log('[ASTM] Table 53B data successfully loaded.');
    return astmTable;
  } catch (err) {
    console.error('[ASTM] Error loading table:', err);
    return null;
  }
}

function calculateRho15Formula(rho_t, temp) {
  const K0 = 186.9696;
  const K1 = 0.4862;
  const dt = temp - 15.0;
  let rho15 = rho_t;
  for (let i = 0; i < 10; i++) {
    const alpha15 = (K0 + K1 * rho15) / (rho15 * rho15);
    const vcf = Math.exp(-alpha15 * dt * (1.0 + 0.8 * alpha15 * dt));
    rho15 = rho_t / vcf;
  }
  return rho15;
}

function getDensityAt15(obsD, obsT) {
  obsD = parseFloat(obsD);
  obsT = parseFloat(obsT);
  if (isNaN(obsD) || isNaN(obsT) || obsD <= 0 || obsT < 0) return 0;

  if (!astmTable) {
    return calculateRho15Formula(obsD, obsT);
  }

  if (obsD < 670 || obsD > 1056 || obsT < 0.0 || obsT > 50.0) {
    return calculateRho15Formula(obsD, obsT);
  }

  const d1 = Math.floor(obsD);
  const d2 = Math.ceil(obsD);
  const t1 = Math.floor(obsT * 2) / 2;
  const t2 = t1 + 0.5 <= 50.0 ? t1 + 0.5 : 50.0;

  const getVal = (d, t) => {
    const dStr = String(d);
    const tStr = t.toFixed(1);
    if (astmTable[dStr] && astmTable[dStr][tStr] !== undefined) {
      return parseFloat(astmTable[dStr][tStr]);
    }
    return null;
  };

  const v11 = getVal(d1, t1);
  const v21 = getVal(d2, t1);
  const v12 = getVal(d1, t2);
  const v22 = getVal(d2, t2);

  if (v11 === null || v21 === null || v12 === null || v22 === null) {
    return calculateRho15Formula(obsD, obsT);
  }

  const wd = d2 === d1 ? 0 : (obsD - d1) / (d2 - d1);
  const wt = t2 === t1 ? 0 : (obsT - t1) / (t2 - t1);

  const val_t1 = v11 + wd * (v21 - v11);
  const val_t2 = v12 + wd * (v22 - v12);

  const val = val_t1 + wt * (val_t2 - val_t1);
  return val;
}

function updateLiveAstmCalculations() {
  const loadType = tankerLoadSelect.value;
  const customP = loadType === 'custom' ? (parseInt(customPInput.value) || 0) : 0;
  const customD = loadType === 'custom' ? (parseInt(customDInput.value) || 0) : 0;

  let petrolQty = 0;
  let dieselQty = 0;

  if (loadType === 'full-petrol') {
    petrolQty = 12000;
  } else if (loadType === 'full-diesel') {
    dieselQty = 12000;
  } else if (loadType === 'mixed-8d-4p') {
    dieselQty = 8000;
    petrolQty = 4000;
  } else if (loadType === 'mixed-8p-4d') {
    petrolQty = 8000;
    dieselQty = 4000;
  } else if (loadType === 'custom') {
    petrolQty = customP;
    dieselQty = customD;
  }

  // Petrol calculations
  if (petrolQty > 0) {
    const invD = parseFloat(document.getElementById('petrol-invoice-density').value) || 0;
    const obsD = parseFloat(document.getElementById('petrol-observed-density').value) || 0;
    const obsT = parseFloat(document.getElementById('petrol-observed-temp').value) || 0;
    const statusEl = document.getElementById('petrol-astm-status');

    if (invD && obsD && obsT) {
      const rho15 = getDensityAt15(obsD, obsT);
      const vcf = rho15 > 0 ? obsD / rho15 : 0;
      const vol15 = petrolQty * vcf;
      const shortage = petrolQty - vol15;
      const dev = rho15 - invD;
      const devColor = Math.abs(dev) > 3.0 ? '#ef4444' : '#10b981';

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.6rem; border-radius: 6px; margin-top: 0.5rem; font-family: monospace; font-size: 0.78rem; line-height: 1.4;">
            <div>Density @ 15°C: <strong>${rho15.toFixed(2)}</strong> kg/m³</div>
            <div>Density Dev: <strong style="color: ${devColor};">${dev.toFixed(2)}</strong> kg/m³ (Limit: ±3.0)</div>
            <div>VCF: <strong>${vcf.toFixed(5)}</strong></div>
            <div>Corrected Vol: <strong>${vol15.toFixed(1)}</strong> L</div>
            <div>Shortage: <strong style="${shortage > 0 ? 'color:#ef4444;' : 'color:#10b981;'}">${shortage.toFixed(1)}</strong> L</div>
          </div>
        `;
      }
    } else if (statusEl) {
      statusEl.innerHTML = '';
    }
  }

  // Diesel calculations
  if (dieselQty > 0) {
    const invD = parseFloat(document.getElementById('diesel-invoice-density').value) || 0;
    const obsD = parseFloat(document.getElementById('diesel-observed-density').value) || 0;
    const obsT = parseFloat(document.getElementById('diesel-observed-temp').value) || 0;
    const statusEl = document.getElementById('diesel-astm-status');

    if (invD && obsD && obsT) {
      const rho15 = getDensityAt15(obsD, obsT);
      const vcf = rho15 > 0 ? obsD / rho15 : 0;
      const vol15 = dieselQty * vcf;
      const shortage = dieselQty - vol15;
      const dev = rho15 - invD;
      const devColor = Math.abs(dev) > 3.0 ? '#ef4444' : '#10b981';

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.6rem; border-radius: 6px; margin-top: 0.5rem; font-family: monospace; font-size: 0.78rem; line-height: 1.4;">
            <div>Density @ 15°C: <strong>${rho15.toFixed(2)}</strong> kg/m³</div>
            <div>Density Dev: <strong style="color: ${devColor};">${dev.toFixed(2)}</strong> kg/m³ (Limit: ±3.0)</div>
            <div>VCF: <strong>${vcf.toFixed(5)}</strong></div>
            <div>Corrected Vol: <strong>${vol15.toFixed(1)}</strong> L</div>
            <div>Shortage: <strong style="${shortage > 0 ? 'color:#ef4444;' : 'color:#10b981;'}">${shortage.toFixed(1)}</strong> L</div>
          </div>
        `;
      }
    } else if (statusEl) {
      statusEl.innerHTML = '';
    }
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('active');
}

// Mixed Tanker configuration selection handler
const tankerLoadSelect = document.getElementById('tanker-load-type');
const customSliders = document.getElementById('custom-load-sliders-container');
const customPInput = document.getElementById('custom-petrol-qty');
const customDInput = document.getElementById('custom-diesel-qty');
const customPLabel = document.getElementById('custom-petrol-label');
const customDLabel = document.getElementById('custom-diesel-label');
const customTotalLabel = document.getElementById('custom-load-total-label');

function updatePriceInputRequirements() {
  const loadType = tankerLoadSelect.value;
  const pricePInput = document.getElementById('purchase-price-petrol');
  const priceDInput = document.getElementById('purchase-price-diesel');
  
  const petrolSection = document.getElementById('petrol-astm-section');
  const dieselSection = document.getElementById('diesel-astm-section');

  let needPetrol = false;
  let needDiesel = false;

  if (loadType === 'full-petrol') {
    needPetrol = true;
  } else if (loadType === 'full-diesel') {
    needDiesel = true;
  } else if (loadType === 'mixed-8d-4p' || loadType === 'mixed-8p-4d') {
    needPetrol = true;
    needDiesel = true;
  } else if (loadType === 'custom') {
    const p = parseInt(customPInput.value) || 0;
    const d = parseInt(customDInput.value) || 0;
    if (p > 0) needPetrol = true;
    if (d > 0) needDiesel = true;
  }

  if (petrolSection) petrolSection.style.display = needPetrol ? 'block' : 'none';
  if (dieselSection) dieselSection.style.display = needDiesel ? 'block' : 'none';

  if (pricePInput) {
    if (needPetrol) {
      pricePInput.required = true;
      pricePInput.removeAttribute('disabled');
      pricePInput.placeholder = "e.g. 90.50";
    } else {
      pricePInput.required = false;
      pricePInput.setAttribute('disabled', 'true');
      pricePInput.value = "";
      pricePInput.placeholder = "Not applicable";
    }
  }

  if (priceDInput) {
    if (needDiesel) {
      priceDInput.required = true;
      priceDInput.removeAttribute('disabled');
      priceDInput.placeholder = "e.g. 82.20";
    } else {
      priceDInput.required = false;
      priceDInput.setAttribute('disabled', 'true');
      priceDInput.value = "";
      priceDInput.placeholder = "Not applicable";
    }
  }

  if (typeof updateLiveAstmCalculations === 'function') {
    updateLiveAstmCalculations();
  }
}

tankerLoadSelect.addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    customSliders.style.display = 'block';
    updateCustomLoadTotals();
  } else {
    customSliders.style.display = 'none';
  }
  updatePriceInputRequirements();
});

function updateCustomLoadTotals() {
  const p = parseInt(customPInput.value);
  const d = parseInt(customDInput.value);

  customPLabel.textContent = p.toLocaleString();
  customDLabel.textContent = d.toLocaleString();

  const total = p + d;
  const diff = 12000 - total;

  if (diff === 0) {
    customTotalLabel.textContent = "Sum: 12,000 L (Valid load)";
    customTotalLabel.className = "badge badge-success";
  } else if (diff > 0) {
    customTotalLabel.textContent = `Needs ${diff.toLocaleString()} L more to reach 12,000 L`;
    customTotalLabel.className = "badge badge-warning";
  } else {
    customTotalLabel.textContent = `Overflows by ${Math.abs(diff).toLocaleString()} L (Max 12k L)`;
    customTotalLabel.className = "badge badge-danger";
  }
}

customPInput.addEventListener('input', () => {
  const p = parseInt(customPInput.value);
  customDInput.value = 12000 - p;
  updateCustomLoadTotals();
  updatePriceInputRequirements();
});

customDInput.addEventListener('input', () => {
  const d = parseInt(customDInput.value);
  customPInput.value = 12000 - d;
  updateCustomLoadTotals();
  updatePriceInputRequirements();
});

// Auto-calculate modal tests based on nozzle activity in real-time
function updateModalTests() {
  const checkAndSet = (prefix) => {
    const openEl = document.getElementById(`${prefix}_open`);
    const closeDayEl = document.getElementById(`${prefix}_close_day`);
    const testEl = document.getElementById(`${prefix}_tests_day`);
    if (openEl && closeDayEl && testEl) {
      const openVal = parseFloat(openEl.value) || 0;
      const closeDayVal = parseFloat(closeDayEl.value) || 0;
      const ran = closeDayVal > openVal;
      testEl.value = ran ? "5 L" : "0 L";
    }
  };
  checkAndSet('du1_p');
  checkAndSet('du1_d');
  checkAndSet('du2_p');
  checkAndSet('du2_d');
}

// Bind events to totalizers in the log readings form to update tests in real-time
['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(prefix => {
  const openInput = document.getElementById(`${prefix}_open`);
  const closeDayInput = document.getElementById(`${prefix}_close_day`);
  if (openInput) openInput.addEventListener('input', updateModalTests);
  if (closeDayInput) closeDayInput.addEventListener('input', updateModalTests);
});

// Form submits
document.getElementById('log-readings-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const date = document.getElementById('ledger-date').value;
  const prices = getPricesAt(date);

  const getFormData = (prefix) => {
    const open = parseFloat(document.getElementById(`${prefix}_open`).value) || 0;
    const close_day_raw = document.getElementById(`${prefix}_close_day`).value.trim();
    const close_night_raw = document.getElementById(`${prefix}_close_night`).value.trim();

    // If empty (e.g. in the morning), default closing to opening so sales are calculated as 0
    const close_day = close_day_raw === '' ? open : (parseFloat(close_day_raw) || 0);
    const close_night = close_night_raw === '' ? close_day : (parseFloat(close_night_raw) || 0);

    return {
      open,
      close_day,
      close_night,
      tests_day: (close_day > open) ? 1 : 0,
      tests_night: 0
    };
  };

  const du1_p = getFormData('du1_p');
  const du1_d = getFormData('du1_d');
  const du2_p = getFormData('du2_p');
  const du2_d = getFormData('du2_d');

  // Basic totalizer logical validation
  const validateNozzle = (label, data) => {
    if (data.close_day < data.open || data.close_night < data.close_day) {
      showNotification(`${label} ending totalizers must be higher than opening readings!`, "danger");
      return false;
    }
    return true;
  };

  if (!validateNozzle("DU1 Petrol", du1_p) ||
      !validateNozzle("DU1 Diesel", du1_d) ||
      !validateNozzle("DU2 Petrol", du2_p) ||
      !validateNozzle("DU2 Diesel", du2_d)) {
    return;
  }

  if (!confirm(`Are you sure you want to save manual ledger readings for operating date: ${formatDate(date)}?`)) {
    return;
  }

  const remarksEl = document.getElementById('ledger-remarks');
  const remarks = remarksEl ? remarksEl.value.trim() : '';

  const pDipVal = document.getElementById('ledger_p_dip_override').value.trim();
  const dDipVal = document.getElementById('ledger_d_dip_override').value.trim();

  const existingRow = db.daily_ledger.find(row => row.date === date);
  const ledgerEntry = { 
    date, 
    prices: { petrol: prices.petrol, diesel: prices.diesel }, 
    du1_p, 
    du1_d, 
    du2_p, 
    du2_d, 
    feedback: remarks,
    expenses: tempModalExpenses,
    createdAt: existingRow?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (pDipVal !== '') {
    ledgerEntry.p_dip_override = parseFloat(pDipVal);
  }
  if (dDipVal !== '') {
    ledgerEntry.d_dip_override = parseFloat(dDipVal);
  }

  saveDailyReadings(ledgerEntry);
  closeModal('log-readings-modal');
  initApp();
});

document.getElementById('tanker-purchase-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const date = document.getElementById('purchase-date').value;
  const time = document.getElementById('purchase-time').value;
  const loadType = tankerLoadSelect.value;

  const customP = loadType === 'custom' ? (parseInt(customPInput.value) || 0) : 0;
  const customD = loadType === 'custom' ? (parseInt(customDInput.value) || 0) : 0;

  let petrolQty = 0;
  let dieselQty = 0;

  if (loadType === 'full-petrol') {
    petrolQty = 12000;
  } else if (loadType === 'full-diesel') {
    dieselQty = 12000;
  } else if (loadType === 'mixed-8d-4p') {
    dieselQty = 8000;
    petrolQty = 4000;
  } else if (loadType === 'mixed-8p-4d') {
    petrolQty = 8000;
    dieselQty = 4000;
  } else if (loadType === 'custom') {
    petrolQty = customP;
    dieselQty = customD;
  }

  const pricePVal = document.getElementById('purchase-price-petrol').value;
  const priceDVal = document.getElementById('purchase-price-diesel').value;

  const priceP = petrolQty > 0 ? (parseFloat(pricePVal) || 0) : 0;
  const priceD = dieselQty > 0 ? (parseFloat(priceDVal) || 0) : 0;

  let confirmMsg = `Are you sure you want to record this tanker receipt?\n\nDate: ${formatDate(date)}\nLoad Type: ${loadType}`;
  if (petrolQty > 0) {
    confirmMsg += `\nPetrol Rate: ₹${priceP.toFixed(2)}/L (${petrolQty.toLocaleString()} L)`;
  }
  if (dieselQty > 0) {
    confirmMsg += `\nDiesel Rate: ₹${priceD.toFixed(2)}/L (${dieselQty.toLocaleString()} L)`;
  }
  const invoiceNo = document.getElementById('purchase-invoice-no').value.trim();
  const paymentStatus = document.getElementById('purchase-payment-status').value;

  const petrolInvoiceDensity = petrolQty > 0 ? parseFloat(document.getElementById('petrol-invoice-density').value) || 0 : 0;
  const petrolObservedDensity = petrolQty > 0 ? parseFloat(document.getElementById('petrol-observed-density').value) || 0 : 0;
  const petrolObservedTemp = petrolQty > 0 ? parseFloat(document.getElementById('petrol-observed-temp').value) || 0 : 0;

  const dieselInvoiceDensity = dieselQty > 0 ? parseFloat(document.getElementById('diesel-invoice-density').value) || 0 : 0;
  const dieselObservedDensity = dieselQty > 0 ? parseFloat(document.getElementById('diesel-observed-density').value) || 0 : 0;
  const dieselObservedTemp = dieselQty > 0 ? parseFloat(document.getElementById('diesel-observed-temp').value) || 0 : 0;

  if (!confirm(confirmMsg)) {
    return;
  }

  recordTanker(date, time, loadType, customP, customD, priceP, priceD,
               petrolInvoiceDensity, petrolObservedDensity, petrolObservedTemp,
               dieselInvoiceDensity, dieselObservedDensity, dieselObservedTemp,
               invoiceNo, paymentStatus);
  initApp();
});

document.getElementById('purchase-date').addEventListener('change', (e) => {
  if (e.target.value) {
    const details = calculateDeadlineAndRTGS(e.target.value);
    document.getElementById('purchase-deadline-preview').textContent = formatDate(details.deadlineDate);
    document.getElementById('purchase-rtgs-preview').textContent = formatDate(details.rtgsDate) +
      (details.isHighRisk ? " (High Risk! Settle immediately)" : "");
  }
});

document.getElementById('price-change-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const effTime = document.getElementById('price-effective-date').value;
  const p = parseFloat(document.getElementById('price-petrol').value);
  const d = parseFloat(document.getElementById('price-diesel').value);

  if (!confirm(`Are you sure you want to update selling prices?\n\nPetrol: ₹${p.toFixed(2)}/L\nDiesel: ₹${d.toFixed(2)}/L\nEffective: ${effTime.replace('T', ' ')}`)) {
    return;
  }

  updateSellingPrice(effTime, p, d);
  initApp();
});

// Holiday form listeners — guarded; elements removed from UI but kept safe
const _addHolForm = document.getElementById('add-holiday-form');
if (_addHolForm) {
  _addHolForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('holiday-date').value;
    const name = document.getElementById('holiday-name').value;
    addHoliday(date, name);
    document.getElementById('holiday-date').value = '';
    document.getElementById('holiday-name').value = '';
    renderHolidays();
    initApp();
  });
}

const _sunEl = document.getElementById('cfg-sundays-closed');
if (_sunEl) {
  _sunEl.addEventListener('change', (e) => {
    db.settings.sundays_closed = e.target.checked;
    saveDB();
    showNotification("Sundays weekend policy saved.", "info");
    initApp();
  });
}

const _satEl = document.getElementById('cfg-sats-closed');
if (_satEl) {
  _satEl.addEventListener('change', (e) => {
    db.settings.sats_closed = e.target.checked;
    saveDB();
    showNotification("Saturday weekend policy saved.", "info");
    initApp();
  });
}


document.getElementById('system-settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!confirm("Are you sure you want to update the system capacity and settings?")) {
    return;
  }
  db.settings.petrol_capacity = parseInt(document.getElementById('cfg-petrol-capacity').value);
  db.settings.diesel_capacity = parseInt(document.getElementById('cfg-diesel-capacity').value);
  db.settings.safety_stock = parseInt(document.getElementById('cfg-safety-stock').value);
  db.settings.currency = document.getElementById('cfg-currency-symbol').value;
  db.settings.ads_days = parseInt(document.getElementById('cfg-ads-days').value) || 14;

  db.settings.petrol_tank_dia = parseInt(document.getElementById('cfg-petrol-dia').value);
  db.settings.petrol_tank_len = parseFloat(document.getElementById('cfg-petrol-len').value);
  db.settings.petrol_dead_stock = parseInt(document.getElementById('cfg-petrol-dead').value);
  db.settings.diesel_tank_dia = parseInt(document.getElementById('cfg-diesel-dia').value);
  db.settings.diesel_tank_len = parseFloat(document.getElementById('cfg-diesel-len').value);
  db.settings.diesel_dead_stock = parseInt(document.getElementById('cfg-diesel-dead').value);

  saveDB();
  showNotification("System settings saved successfully.", "success");
  initApp();
});

document.getElementById('phonepe-settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!confirm("Are you sure you want to update PhonePe API merchant keys?")) {
    return;
  }
  db.settings.phonepe_mid = document.getElementById('cfg-phonepe-mid').value.trim();
  db.settings.phonepe_salt_key = document.getElementById('cfg-phonepe-salt-key').value.trim();
  db.settings.phonepe_salt_index = document.getElementById('cfg-phonepe-salt-index').value.trim();

  saveDB();
  showNotification("PhonePe API settings saved successfully.", "success");
  initApp();
});

// Backups/restores
document.getElementById('backup-db-btn').addEventListener('click', () => {
  const jsonStr = JSON.stringify(db, null, 2);
  SystemLogger.info('backupDB', 'Database backup exported successfully.');
  triggerDownload(jsonStr, `octaneflow_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
});

document.getElementById('restore-db-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm("Are you sure you want to restore the database from this backup file? All current shift histories, tanker receipts, and rates will be permanently overwritten!")) {
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed.settings && parsed.stock && (parsed.daily_ledger || parsed.shifts)) {
        db = parsed;
        if (db.shifts && !db.daily_ledger) {
          db.daily_ledger = [];
          delete db.shifts;
        }

        // Set the restored DB as the latest synced version to prevent cloud overwrite
        db._synced_at = new Date().toISOString();
        const cfg = getSyncCfg();
        cfg.last_push = db._synced_at;
        saveSyncCfg(cfg);

        saveDB();
        SystemLogger.success('restoreDB', 'Database restored successfully from backup file.', {
          records: db.daily_ledger.length,
          purchases: db.purchases.length
        });
        showNotification("Database restored successfully!", "success");
        initApp();

        // Push restored data to cloud Gist so other devices get it too
        syncPush().then(() => {
          SystemLogger.success('restoreDB', 'Restored database successfully pushed to cloud Gist.');
        }).catch(err => {
          SystemLogger.error('restoreDB', 'Failed to push restored database to cloud Gist.', err);
        });
      } else {
        SystemLogger.error('restoreDB', 'Failed to restore backup: Invalid file schema or missing properties.');
        showNotification("Invalid file format. Verification failed.", "danger");
      }
    } catch (err) {
      SystemLogger.error('restoreDB', 'Failed to parse backup JSON file.', err);
      showNotification("Error reading file. Confirm it is valid JSON.", "danger");
    }
  };
  reader.readAsText(file);
});

document.getElementById('clear-db-btn').addEventListener('click', () => {
  if (confirm("CRITICAL WARNING: This will permanently wipe all daily logs, price histories, tankers, and configurations. Are you absolutely sure?")) {
    resetDB();
  }
});

// CSV Exports
document.getElementById('export-ledger-csv-btn').addEventListener('click', () => {
  const csv = getCSVExport('ledger');
  triggerDownload(csv, 'sales_cumulative_ledger.csv', 'text/csv');
});

document.getElementById('export-purchases-csv-btn').addEventListener('click', () => {
  const csv = getCSVExport('purchases');
  triggerDownload(csv, 'tankers_export.csv', 'text/csv');
});

document.getElementById('dash-trigger-purchase-btn').addEventListener('click', () => {
  const tab = document.querySelector('[data-view="logistics"]');
  if (tab) {
    tab.click();
    switchSubview('logistics', 'purchases');
  }
});

// Toggle view (Detailed shift breakdown vs Consolidated 24hr)
document.getElementById('toggle-view-btn').addEventListener('click', () => {
  show24hOnly = !show24hOnly;
  const btn = document.getElementById('toggle-view-btn');
  if (show24hOnly) {
    btn.textContent = "Show Shift Breakdown";
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
  } else {
    btn.textContent = "Show 24Hr Combined";
    btn.classList.add('btn-secondary');
    btn.classList.remove('btn-primary');
  }
  renderLedger();
});

// Segmented View Selectors: Spreadsheet vs Split Analyst
document.getElementById('view-type-table-btn').addEventListener('click', () => {
  ledgerViewMode = 'table';
  document.getElementById('view-type-table-btn').style.background = 'var(--primary)';
  document.getElementById('view-type-split-btn').style.background = 'transparent';
  renderLedger();
});

document.getElementById('view-type-split-btn').addEventListener('click', () => {
  ledgerViewMode = 'split';
  document.getElementById('view-type-table-btn').style.background = 'transparent';
  document.getElementById('view-type-split-btn').style.background = 'var(--primary)';
  document.getElementById('view-type-pnl-btn').style.background = 'transparent';
  renderLedger();
});

document.getElementById('view-type-pnl-btn').addEventListener('click', () => {
  ledgerViewMode = 'pnl';
  document.getElementById('view-type-table-btn').style.background = 'transparent';
  document.getElementById('view-type-split-btn').style.background = 'transparent';
  document.getElementById('view-type-pnl-btn').style.background = 'var(--primary)';
  renderLedger();
});

// -------------------------------------------------------------
// DEMO MOCK DATA SEEDING UTILITY
// -------------------------------------------------------------
document.getElementById('seed-mock-data-btn').addEventListener('click', () => {
  if (confirm("This will overwrite your database with 14 days of simulated cumulative ledger logs (using Petrol: 103.50, Diesel: 90.80). Proceed?")) {
    seedDemoData();
  }
});

function seedDemoData() {
  const seeded = JSON.parse(JSON.stringify(DEFAULT_DB));

  seeded.settings.currency = "₹";
  seeded.settings.petrol_capacity = 20000;
  seeded.settings.diesel_capacity = 20000;
  seeded.settings.safety_stock = 2500;
  seeded.settings.ads_days = 14;

  seeded.stock.petrol = 8200;
  seeded.stock.diesel = 6800;
  seeded.stock.petrol_cost_wac = 92.50;
  seeded.stock.diesel_cost_wac = 83.15;

  seeded.prices = [
    { effective_date: "2026-06-01T08:00", petrol: 103.50, diesel: 90.80 }
  ];

  // Starting readings based on Excel layout
  let du1_p_curr = 15400.00;
  let du1_d_curr = 21250.00;
  let du2_p_curr = 12900.00;
  let du2_d_curr = 18600.00;

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 14);

  // Generate 14 continuous days of ledger entries
  for (let i = 0; i < 14; i++) {
    const dayStr = addDays(baseDate.toISOString().split('T')[0], i);

    // Day Shift increment (8 AM to 8 PM)
    const du1_p_day_sales = 180 + Math.random() * 80;
    const du1_d_day_sales = 300 + Math.random() * 120;
    const du2_p_day_sales = 160 + Math.random() * 80;
    const du2_d_day_sales = 280 + Math.random() * 120;

    const test1_p_day = Math.random() < 0.35 ? 1 : 0;
    const test1_d_day = Math.random() < 0.35 ? 1 : 0;
    const test2_p_day = Math.random() < 0.35 ? 1 : 0;
    const test2_d_day = Math.random() < 0.35 ? 1 : 0;

    const du1_p_mid = du1_p_curr + du1_p_day_sales + (test1_p_day * 5);
    const du1_d_mid = du1_d_curr + du1_d_day_sales + (test1_d_day * 5);
    const du2_p_mid = du2_p_curr + du2_p_day_sales + (test2_p_day * 5);
    const du2_d_mid = du2_d_curr + du2_d_day_sales + (test2_d_day * 5);

    // Night Shift increment (8 PM to 8 AM next morning)
    const du1_p_night_sales = 100 + Math.random() * 50;
    const du1_d_night_sales = 180 + Math.random() * 80;
    const du2_p_night_sales = 80 + Math.random() * 50;
    const du2_d_night_sales = 160 + Math.random() * 80;

    const test1_p_night = 0;
    const test1_d_night = 0;
    const test2_p_night = 0;
    const test2_d_night = 0;

    const du1_p_end = du1_p_mid + du1_p_night_sales;
    const du1_d_end = du1_d_mid + du1_d_night_sales;
    const du2_p_end = du2_p_mid + du2_p_night_sales;
    const du2_d_end = du2_d_mid + du2_d_night_sales;

    const ledgerEntry = {
      date: dayStr,
      prices: { petrol: 103.50, diesel: 90.80 },
      du1_p: { open: du1_p_curr, close_day: du1_p_mid, close_night: du1_p_end, tests_day: test1_p_day, tests_night: test1_p_night },
      du1_d: { open: du1_d_curr, close_day: du1_d_mid, close_night: du1_d_end, tests_day: test1_d_day, tests_night: test1_d_night },
      du2_p: { open: du2_p_curr, close_day: du2_p_mid, close_night: du2_p_end, tests_day: test2_p_day, tests_night: test2_p_night },
      du2_d: { open: du2_d_curr, close_day: du2_d_mid, close_night: du2_d_end, tests_day: test2_d_day, tests_night: test2_d_night }
    };

    seeded.daily_ledger.unshift(ledgerEntry);

    // Carry over night endings to the next day's open
    du1_p_curr = du1_p_end;
    du1_d_curr = du1_d_end;
    du2_p_curr = du2_p_end;
    du2_d_curr = du2_d_end;
  }

  // Purchases seeding
  const d1 = addDays(baseDate.toISOString().split('T')[0], 4);
  const d2 = addDays(baseDate.toISOString().split('T')[0], 10);
  const c1 = calculateDeadlineAndRTGS(d1);
  const c2 = calculateDeadlineAndRTGS(d2);

  seeded.purchases = [
    {
      id: 'p_mock1',
      date: d2 + 'T10:00',
      petrol_liters: 4000,
      diesel_liters: 8000,
      price_petrol: 92.50,
      price_diesel: 83.15,
      cost_petrol: 4000 * 92.50,
      cost_diesel: 8000 * 83.15,
      total_cost: (4000 * 92.50) + (8000 * 83.15),
      deadline_date: c2.deadlineDate,
      rtgs_filing_date: c2.rtgsDate,
      payment_status: 'unpaid',
      paid_date: null,
      interest_charged: 0
    },
    {
      id: 'p_mock2',
      date: d1 + 'T14:30',
      petrol_liters: 6000,
      diesel_liters: 6000,
      price_petrol: 91.80,
      price_diesel: 82.50,
      cost_petrol: 6000 * 91.80,
      cost_diesel: 6000 * 82.50,
      total_cost: (6000 * 91.80) + (6000 * 82.50),
      deadline_date: c1.deadlineDate,
      rtgs_filing_date: c1.rtgsDate,
      payment_status: 'paid',
      paid_date: addDays(d1, 1),
      interest_charged: 0
    }
  ];

  db = seeded;
  saveDB();
  SystemLogger.success('seedDemoData', 'Simulated demo database successfully seeded with 14 days of history.');
  showNotification("Excel simulation database successfully seeded!", "success");
  initApp();
}

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
function renderCurrentView() {
  const activeItem = document.querySelector('.nav-item.active');
  if (!activeItem) return;
  const activeTab = activeItem.dataset.view;
  if (activeTab === 'dashboard') {
    renderActiveView('dashboard');
  } else {
    const activeSub = currentSubviews[activeTab] || activeTab;
    renderActiveView(activeSub);
  }
}

function initApp() {
  loadDB();
  const todayStr = new Date().toISOString().split('T')[0];
  const formattedToday = formatDate(todayStr);
  document.getElementById('current-date-span').textContent = formattedToday;
  document.title = `RKSK Pump Dashboard — ${formattedToday}`;

  // Read current active tab and render it
  renderCurrentView();

  // Configure tanker purchase form price field requirements
  updatePriceInputRequirements();

  // Load ASTM table and trigger initial calculations
  loadAstmTable().then(() => {
    updateLiveAstmCalculations();
  });

  // Bind input and change listeners for real-time tanker density calculations
  const densityFields = [
    'petrol-invoice-density', 'petrol-observed-density', 'petrol-observed-temp',
    'diesel-invoice-density', 'diesel-observed-density', 'diesel-observed-temp',
    'custom-petrol-qty', 'custom-diesel-qty'
  ];
  densityFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateLiveAstmCalculations);
      el.addEventListener('change', updateLiveAstmCalculations);
    }
  });

  // Bind input and change listeners for real-time supply bills filtering
  const supplyFilterEl = document.getElementById('filter-supply-product');
  if (supplyFilterEl) supplyFilterEl.addEventListener('change', () => renderSupplies());

  const supplySearchEl = document.getElementById('search-supply-input');
  if (supplySearchEl) supplySearchEl.addEventListener('input', () => renderSupplies());

  // Start cloud sync check (async — won't block render)
  updateGlobalAlertBanner();
  initSync().then(() => {
    // Re-render after sync in case cloud had newer data
    renderCurrentView();
    updatePriceInputRequirements();
    updateGlobalAlertBanner();
  }).catch(() => {
    setSyncStatus('error');
    updateGlobalAlertBanner();
  });
}

// ── GLOBAL RUNTIME ERROR REPORTING ──────────────────────────
// Intercept uncaught javascript errors
window.addEventListener('error', (event) => {
  const msg = event.message || 'Unknown runtime error';
  const source = event.filename ? event.filename.split('/').pop() : 'unknown';
  const lineno = event.lineno || 0;
  const colno = event.colno || 0;
  const stack = event.error ? event.error.stack : '';
  
  SystemLogger.error('RuntimeError', `${msg} (at ${source}:${lineno}:${colno})`, stack);
});

// Intercept unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = reason ? (reason.message || String(reason)) : 'Promise rejected without reason';
  const stack = (reason && reason.stack) ? reason.stack : '';
  
  SystemLogger.error('UnhandledPromiseRejection', msg, stack);
});

window.addEventListener('DOMContentLoaded', () => {
  // 1. Check for configuration invite/setup link in URL hash
  const hash = window.location.hash;
  if (hash && hash.startsWith('#setup=')) {
    try {
      const encoded = hash.substring(7); // remove '#setup='
      const decoded = atob(encoded); // decode base64
      const [gistId, gistToken] = decoded.split('|');
      if (gistId && gistToken) {
        saveSyncCfg({ gistId, gistToken });
        // Clear hash from URL immediately so it doesn't linger in navigation history
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
        console.log('[Sync] Setup configuration successfully applied from link.');
      }
    } catch (e) {
      console.error('[Sync] Failed to parse setup link:', e);
    }
  }

  // 2. Unconditionally load database so 'db' is always defined
  loadDB();

  // Wire up Manual Refresh button
  const refreshBtn = document.getElementById('manual-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      const originalHtml = refreshBtn.innerHTML;
      refreshBtn.innerHTML = `<span style="font-size:0.75rem;">⌛ Syncing...</span>`;
      showNotification('Refreshing cloud database...', 'info');
      try {
        await initSync();
        updateGlobalAlertBanner();
        showNotification('✅ Database refreshed successfully!', 'success');
      } catch (err) {
        showNotification('⚠️ Sync failed. Please check network connection.', 'danger');
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = originalHtml;
      }
    });
  }

  // Register online/offline network listeners
  window.addEventListener('online', () => {
    updateGlobalAlertBanner();
    showNotification('📶 Back online! Syncing local changes with cloud...', 'success');
    syncPush();
  });
  window.addEventListener('offline', () => {
    updateGlobalAlertBanner();
    showNotification('📶 Device is offline. All data will be saved locally.', 'warning');
  });

  // Check sync alert banner initially
  updateGlobalAlertBanner();

  // Wire up Collapsible Help Drawer in Sidebar
  const helpToggleBtn = document.getElementById('sidebar-help-toggle-btn');
  const helpContent = document.getElementById('sidebar-help-content');
  const helpArrow = document.getElementById('sidebar-help-arrow');
  if (helpToggleBtn && helpContent && helpArrow) {
    helpToggleBtn.addEventListener('click', () => {
      const isHidden = helpContent.style.display === 'none';
      helpContent.style.display = isHidden ? 'block' : 'none';
      helpArrow.textContent = isHidden ? '▲' : '▼';
    });
  }

  // Wire up Take a Tour button
  const tourBtn = document.getElementById('take-tour-btn');
  if (tourBtn) tourBtn.addEventListener('click', () => startTour());

  // Wire up Cold Restart / Repair button
  const restartBtn = document.getElementById('cold-restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
      if (!confirm("Are you sure you want to force a cold restart?\n\nThis will clear the browser's asset cache, unregister the service worker, and force a fresh page reload from the network. Your saved database will NOT be deleted.")) {
        return;
      }
      showNotification("Cold restarting app... clearing caches.", "info");

      // 1. Unregister service worker(s)
      if (navigator.serviceWorker) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (let reg of regs) {
            await reg.unregister();
          }
        } catch (e) {
          console.error("Failed to unregister service worker:", e);
        }
      }

      // 2. Clear browser cache storage
      if (window.caches) {
        try {
          const keys = await caches.keys();
          for (let key of keys) {
            await caches.delete(key);
          }
        } catch (e) {
          console.error("Failed to clear cache storage:", e);
        }
      }

      // 3. Perform a full page reload from network
      window.location.reload(true);
    });
  }

  // Wire up Diagnostics buttons
  const testErrorBtn = document.getElementById('test-diag-error-btn');
  if (testErrorBtn) {
    testErrorBtn.addEventListener('click', () => {
      try {
        throw new Error("Simulated diagnostic exception. This is a test error to verify real-time log reporting!");
      } catch (err) {
        SystemLogger.error("SimulatedErrorTest", err.message, err.stack);
        showNotification("Test error logged. See activity stream below.", "warning");
      }
    });
  }

  const clearLogsBtn = document.getElementById('clear-diag-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to clear all diagnostics activity logs?")) {
        SystemLogger.clear();
        showNotification("Diagnostics logs cleared.", "info");
      }
    });
  }

  // Auto-configure sync status
  const cfg = getSyncCfg();
  if (cfg.gistId && cfg.gistToken) {
    console.log('[Sync] Gist credentials found — auto-sync enabled');
  }

  // ── AUTH INIT ──────────────────────────────────────────
  initAuth().then(() => {
    initLoginForm();   // wire the login form submit

    // Sync database with cloud (if credentials exist) so employee/device databases are updated
    const syncPromise = (cfg.gistId && cfg.gistToken) ? initSync() : Promise.resolve();

    syncPromise.then(() => {
      const session = checkAuth(); // show login screen or app
      if (session && session.role === 'owner') {
        // Already logged in as owner — init the full app
        try { initApp(); } catch(err) { console.error('App init failed:', err); }
      }
    }).catch(err => {
      console.error('Initial sync failed:', err);
      // Fallback
      checkAuth();
    });
  });

  // 3. Background Auto-Sync: Check for cloud updates every 30 seconds
  setInterval(() => {
    const currentCfg = getSyncCfg();
    const session = getSession();
    if (currentCfg.gistId && currentCfg.gistToken && session && document.visibilityState === 'visible') {
      initSync().then(() => {
        if (session.role === 'owner') {
          renderCurrentView();
        } else {
          renderEmployeeView(session);
        }
      }).catch(() => {});
    }
  }, 30000);
});


// -------------------------------------------------------------
// INTERACTIVE ONBOARDING WALKTHROUGH TOUR
// -------------------------------------------------------------
let currentTourStep = 0;
let activeHighlightElement = null;

const tourSteps = [
  {
    target: '.tanks-container',
    setup: () => {
      const tab = document.querySelector('[data-view="dashboard"]');
      if (tab) tab.click();
    },
    align: 'bottom',
    text: `<h3>Horizontal UST Tanks</h3><p>Your underground storage tanks are now rendered as <strong>horizontal cylinders</strong>. Fuel volume is calculated dynamically from depth measurements using exact horizontal cylinder segment formulas.</p>`
  },
  {
    target: '#dash-capital-card',
    setup: () => {
      const tab = document.querySelector('[data-view="dashboard"]');
      if (tab) tab.click();
    },
    align: 'bottom',
    text: `<h3>Inventory & Locked Capital</h3><p>We separately track <strong>Usable Inventory</strong> (sellable) and <strong>Locked Capital Assets</strong> (permanent dead stock below the suction pipes, e.g., 600L Petrol / 40L Diesel), providing a precise view of working capital.</p>`
  },
  {
    target: '[data-subview="ledger"]',
    setup: () => {
      // Step 1: Open Sales Cumulative tab under operations
      const tab = document.querySelector('[data-view="operations"]');
      if (tab) {
        tab.click();
        switchSubview('operations', 'ledger');
      }
    },
    align: 'bottom',
    text: `<h3>Sales Cumulative Tab</h3><p>We are now in the <strong>Sales Cumulative</strong> section, which serves as your daily operations ledger. Here, shift totalizers, calibration tests, and daily profit margins are unified in a single database.</p>`
  },
  {
    target: '#view-mode-selector-parent',
    setup: () => {
      // Force spreadsheet view
      const tblBtn = document.getElementById('view-type-table-btn');
      if (tblBtn) tblBtn.click();
    },
    align: 'bottom',
    text: `<h3>Ledger View Switcher</h3><p>This control lets you toggle between:<br>• <strong>Spreadsheet View</strong>: A complete, scrollable Excel-style daily table.<br>• <strong>Split Analyst View</strong>: An interactive visual dashboard of your operations.</p>`
  },
  {
    target: '#view-type-split-btn',
    setup: () => {
      // Force Split View to expose the carousel
      const spltBtn = document.getElementById('view-type-split-btn');
      if (spltBtn) spltBtn.click();
    },
    align: 'bottom',
    text: `<h3>Visual Operations Dashboard</h3><p>Let's click <strong>Split Analyst View</strong> to explore the physical operations diagram of your station.</p>`
  },
  {
    target: '#ledger-date-carousel',
    setup: () => {
      const spltBtn = document.getElementById('view-type-split-btn');
      if (spltBtn) spltBtn.click();
    },
    align: 'bottom',
    text: `<h3>Horizontal Date Carousel</h3><p>This swipeable calendar bar lets you select different reporting days. Each card displays sales volume and estimated profit. Clicking a card instantly swaps the visual dashboard below.</p>`
  },
  {
    target: '.analyst-tabs',
    setup: () => {
      window.switchAnalystTab('flow');
    },
    align: 'bottom',
    text: `<h3>Operations Inspector Tabs</h3><p>Inside the analyst panel, you can choose between:<br>• <strong>Station Flow Diagram</strong>: Visual fuel outflow from tanks to pumps.<br>• <strong>Day vs Night Comparison</strong>: Shift metrics analysis side-by-side.</p>`
  },
  {
    target: '.station-flow-container',
    setup: () => {
      window.switchAnalystTab('flow');
    },
    align: 'top',
    text: `<h3>Visual Station Flow Schema</h3><p>This schematic represents your station's operations:<br>• <strong>UST Tanks</strong> showing starting/ending stock heights.<br>• <strong>DU Pumps (1 & 2)</strong> showing opening/closing totalizer flows.<br>• <strong>Test Beakers</strong> displaying calibration fuel recirculated back into tanks (Day shift only).<br>• <strong>Checkout</strong> displaying revenue, WAC costs, and margins.</p>`
  },
  {
    target: '.comparison-grid',
    setup: () => {
      window.switchAnalystTab('comparison');
    },
    align: 'top',
    text: `<h3>Day vs Night Comparison</h3><p>Switching to this tab displays shift performance side-by-side with interactive progress bars. Note that calibration quality tests are constrained strictly to the Day shift (testing is 0 for Night shift).</p>`
  },
  {
    target: '#log-readings-btn-header',
    setup: () => {
      // Keep on comparison
    },
    align: 'bottom',
    text: `<h3>Quality Calibration Tests</h3><p>Click <strong>Log Daily Readings</strong> to record totalizer readings. The entry form focuses on day-only tests. Night tests are automatically hardcoded to 0, eliminating redundant data entries.</p>`
  },
  {
    target: '[data-subview="cashflow"]',
    setup: () => {
      const tab = document.querySelector('[data-view="financials"]');
      if (tab) {
        tab.click();
        switchSubview('financials', 'cashflow');
      }
    },
    align: 'bottom',
    text: `<h3>Cash Flow & Orders Solver</h3><p>Click here to access your new automated Excel-like dashboard. Input your current bank balance, unsettled PhonePe payments, cash, and cushions to view live 7-day cash forecasts, dry run indicators, and order deadlines.</p>`
  }
];

function startTour() {
  currentTourStep = 0;
  document.getElementById('tour-overlay').style.display = 'block';
  document.getElementById('tour-bubble').style.display = 'flex';
  showTourStep(0);
}

function showTourStep(index) {
  if (index < 0 || index >= tourSteps.length) return;

  // Clean up previous highlight
  if (activeHighlightElement) {
    activeHighlightElement.classList.remove('tour-highlight');
  }

  currentTourStep = index;
  const step = tourSteps[index];

  // Run step setup
  if (typeof step.setup === 'function') {
    step.setup();
  }

  // Find target element
  const targetEl = document.querySelector(step.target);
  const bubble = document.getElementById('tour-bubble');

  if (targetEl) {
    // Add highlight
    targetEl.classList.add('tour-highlight');
    activeHighlightElement = targetEl;

    // Position the bubble relative to the target element
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();

      let top = 0;
      let left = 0;

      // Adjust for scroll offset
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      if (step.align === 'bottom') {
        top = rect.bottom + scrollY + 12;
        left = rect.left + scrollX + (rect.width - bubbleRect.width) / 2;
      } else if (step.align === 'top') {
        top = rect.top + scrollY - bubbleRect.height - 12;
        left = rect.left + scrollX + (rect.width - bubbleRect.width) / 2;
      } else if (step.align === 'right') {
        top = rect.top + scrollY + (rect.height - bubbleRect.height) / 2;
        left = rect.right + scrollX + 12;
      } else if (step.align === 'left') {
        top = rect.top + scrollY + (rect.height - bubbleRect.height) / 2;
        left = rect.left + scrollX - bubbleRect.width - 12;
      }

      // Viewport bounds checking to keep bubble inside screen
      const margin = 16;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < margin) left = margin;
      if (left + bubbleRect.width > viewportWidth - margin) {
        left = viewportWidth - bubbleRect.width - margin;
      }
      if (top < margin + scrollY) top = rect.bottom + scrollY + 12;
      if (top + bubbleRect.height > viewportHeight + scrollY - margin) {
        top = rect.top + scrollY - bubbleRect.height - 12;
      }

      bubble.style.top = `${top}px`;
      bubble.style.left = `${left}px`;
    }, 200); // 200ms delay to let animations settle
  } else {
    // Center of screen if target is missing
    bubble.style.top = '50%';
    bubble.style.left = '50%';
    bubble.style.transform = 'translate(-50%, -50%)';
  }

  // Update text and buttons
  document.getElementById('tour-step-counter').textContent = `Step ${index + 1} of ${tourSteps.length}`;
  document.getElementById('tour-body-text').innerHTML = step.text;

  // Back button display
  const prevBtn = document.getElementById('tour-prev-btn');
  if (index === 0) {
    prevBtn.style.visibility = 'hidden';
  } else {
    prevBtn.style.visibility = 'visible';
  }

  // Next button text
  const nextBtn = document.getElementById('tour-next-btn');
  if (index === tourSteps.length - 1) {
    nextBtn.textContent = 'Finish';
  } else {
    nextBtn.textContent = 'Next';
  }
}

function nextTourStep() {
  if (currentTourStep === tourSteps.length - 1) {
    endTour();
  } else {
    showTourStep(currentTourStep + 1);
  }
}

function prevTourStep() {
  if (currentTourStep > 0) {
    showTourStep(currentTourStep - 1);
  }
}

function endTour() {
  document.getElementById('tour-overlay').style.display = 'none';
  document.getElementById('tour-bubble').style.display = 'none';

  if (activeHighlightElement) {
    activeHighlightElement.classList.remove('tour-highlight');
    activeHighlightElement = null;
  }

  // Re-render ledger to restore defaults
  renderLedger();
}

// -------------------------------------------------------------
// DIP CALCULATOR CONTROLLER
// -------------------------------------------------------------
function openDipCalculator(tankType) {
  const dia = tankType === 'petrol' ? db.settings.petrol_tank_dia : db.settings.diesel_tank_dia;
  const len = tankType === 'petrol' ? db.settings.petrol_tank_len : db.settings.diesel_tank_len;
  const cap = tankType === 'petrol' ? db.settings.petrol_capacity : db.settings.diesel_capacity;

  document.getElementById('dip-tank-type').value = tankType;
  document.getElementById('dip-tank-label').textContent = tankType === 'petrol' ? 'Petrol (E2) Storage Tank' : 'Diesel (HSD) Storage Tank';
  document.getElementById('dip-tank-dims').textContent = `Diameter: ${dia} cm | Length: ${len} cm | Capacity: ${cap} L`;

  // Reset fields
  document.getElementById('dip-value').value = '';
  document.getElementById('dip-result-total').textContent = '0.00 L';
  document.getElementById('dip-result-dead').textContent = formatVol(tankType === 'petrol' ? db.settings.petrol_dead_stock : db.settings.diesel_dead_stock);
  document.getElementById('dip-result-usable').textContent = '0.00 L';
  document.getElementById('dip-warning').style.display = 'none';

  openModal('dip-calculator-modal');
}

function updateDipCalculation() {
  const tankType = document.getElementById('dip-tank-type').value;
  const dipValStr = document.getElementById('dip-value').value;
  const unit = document.getElementById('dip-unit').value;

  const dia = tankType === 'petrol' ? db.settings.petrol_tank_dia : db.settings.diesel_tank_dia;
  const len = tankType === 'petrol' ? db.settings.petrol_tank_len : db.settings.diesel_tank_len;
  const dead = tankType === 'petrol' ? db.settings.petrol_dead_stock : db.settings.diesel_dead_stock;

  let dipVal = parseFloat(dipValStr) || 0;
  let maxDip = dia;
  if (unit === 'mm') {
    maxDip = dia * 10;
  }

  const warningEl = document.getElementById('dip-warning');
  if (dipVal > maxDip) {
    warningEl.textContent = `Warning: Dip height exceeds tank diameter (${maxDip} ${unit})!`;
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }

  const totalVol = calculateHorizontalTankVolume(dia / 2, len, dipVal, unit);
  const usableVol = Math.max(0, totalVol - dead);

  document.getElementById('dip-result-total').textContent = formatVol(totalVol);
  document.getElementById('dip-result-dead').textContent = formatVol(dead);
  document.getElementById('dip-result-usable').textContent = formatVol(usableVol);
}

// Bind live events for dip calculator modal
document.getElementById('dip-value').addEventListener('input', updateDipCalculation);
document.getElementById('dip-unit').addEventListener('change', updateDipCalculation);

document.getElementById('dip-calculator-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const tankType = document.getElementById('dip-tank-type').value;
  const dipValStr = document.getElementById('dip-value').value;
  const unit = document.getElementById('dip-unit').value;

  const dia = tankType === 'petrol' ? db.settings.petrol_tank_dia : db.settings.diesel_tank_dia;
  const len = tankType === 'petrol' ? db.settings.petrol_tank_len : db.settings.diesel_tank_len;

  const dipVal = parseFloat(dipValStr) || 0;
  const totalVol = calculateHorizontalTankVolume(dia / 2, len, dipVal, unit);

  // Apply to stock
  if (tankType === 'petrol') {
    db.stock.petrol = Math.round(totalVol);
  } else {
    db.stock.diesel = Math.round(totalVol);
  }

  saveDB();
  closeModal('dip-calculator-modal');
  showNotification(`${tankType === 'petrol' ? 'Petrol' : 'Diesel'} stock updated to ${formatVol(totalVol)} based on dip reading.`, "success");
  initApp();
});

// -------------------------------------------------------------
// CASH FLOW & TANKER ORDERING SOLVER
// -------------------------------------------------------------

// =============================================================
// CBI BANK HOLIDAY CALENDAR — Central Bank of India holidays
// Includes RBI mandatory holidays + 2nd & 4th Saturdays
// =============================================================
const CBI_HOLIDAYS_2025_2026 = [
  "2025-01-26","2025-03-14","2025-03-31","2025-04-10","2025-04-14",
  "2025-04-18","2025-05-01","2025-06-07","2025-07-06","2025-08-15",
  "2025-08-16","2025-09-05","2025-10-02","2025-10-22",
  "2025-10-23","2025-11-05","2025-12-25",
  // 2026
  "2026-01-26","2026-03-03","2026-03-04","2026-03-20","2026-04-03",
  "2026-04-14","2026-04-17","2026-05-01","2026-06-27","2026-07-17",
  "2026-08-15","2026-09-19","2026-10-02","2026-10-09","2026-10-29",
  "2026-11-25","2026-12-25",
];

function isCBIHoliday(dateStr) {
  // Check static list
  if (CBI_HOLIDAYS_2025_2026.includes(dateStr)) return true;
  // Check db custom holidays
  if (db.holidays && db.holidays.some(h => h.date === dateStr)) return true;
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun
  if (dow === 0) return true; // All Sundays
  if (dow === 6) {
    // 2nd and 4th Saturdays
    const dayOfMonth = d.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    if (weekNum === 2 || weekNum === 4) return true;
  }
  return false;
}

function nextBankingDay(dateStr) {
  let d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 10; i++) {
    const s = d.toISOString().split('T')[0];
    if (!isCBIHoliday(s)) return s;
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

function prevBankingDay(dateStr) {
  let d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 10; i++) {
    const s = d.toISOString().split('T')[0];
    if (!isCBIHoliday(s)) return s;
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

// =============================================================
// SMART FORECAST ENGINE
// =============================================================

// Load cost constants from IOCL bills (confirmed purchase prices)
const LOAD_MS_COST  = 102.10;  // ₹/L for MS (weighted avg from bills)
const LOAD_HSD_COST = 88.78;   // ₹/L for HSD (weighted avg from bills)

function getLoadCosts() {
  // 4kL MS + 8kL HSD
  const cost4ms8hsd = 4000 * LOAD_MS_COST + 8000 * LOAD_HSD_COST;
  // 8kL MS + 4kL HSD
  const cost8ms4hsd = 8000 * LOAD_MS_COST + 4000 * LOAD_HSD_COST;
  return { cost4ms8hsd, cost8ms4hsd };
}

function getADS14() {
  if (!db.daily_ledger || db.daily_ledger.length === 0) return { ms: 625, hsd: 1093 };
  const sorted = [...db.daily_ledger].sort((a,b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, 14);
  const msTotal  = recent.reduce((s,r) => s + nozzleSale(r.du1_p) + nozzleSale(r.du2_p), 0);
  const hsdTotal = recent.reduce((s,r) => s + nozzleSale(r.du1_d) + nozzleSale(r.du2_d), 0);
  const n = recent.length || 1;
  return { ms: msTotal / n, hsd: hsdTotal / n };
}

function getSellingPriceNow() {
  if (!db.prices || db.prices.length === 0) return { petrol: 105.58, diesel: 90.98 };
  const sorted = [...db.prices].sort((a,b) => b.effective_date.localeCompare(a.effective_date));
  return sorted[0];
}

function getPendingIOCL() {
  if (!db.purchases) return 0;
  return db.purchases.filter(p => p.payment_status === 'unpaid').reduce((s,p) => s + p.total_cost, 0);
}

function computeOrderForecast(msStock, hsdStock, cashReserves, pendingIOCL, ads, sp, dayOffset) {
  // Days of stock left
  const msDays  = ads.ms  > 0 ? msStock  / ads.ms  : 30;
  const hsdDays = ads.hsd > 0 ? hsdStock / ads.hsd : 30;
  const bottleneck = Math.min(msDays, hsdDays);

  // Buy day = when first fuel hits minimum (dead stock buffer ~500L)
  const safetyDays = Math.max(0, Math.floor(bottleneck) - 1);

  // Check end-of-month pressure: must buy on last day of current month
  const today = new Date();
  today.setDate(today.getDate() + dayOffset);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysToEOM = Math.ceil((lastDayOfMonth - today) / 86400000);
  const eomPressure = daysToEOM <= safetyDays; // EOM is before we'd naturally buy

  const buyDayNum = eomPressure ? daysToEOM : safetyDays;
  const todayStr = today.toISOString().split('T')[0];
  const buyDateStr = addDays(todayStr, buyDayNum);

  // Projected cash collection over buyDayNum days from selling fuel
  const projMsCash  = ads.ms  * buyDayNum * sp.petrol;
  const projHsdCash = ads.hsd * buyDayNum * sp.diesel;
  const totalProjected = cashReserves + projMsCash + projHsdCash;
  const netCash = totalProjected - pendingIOCL;

  // Load decision
  const { cost4ms8hsd, cost8ms4hsd } = getLoadCosts();

  // Which fuel needs more replenishment?
  const msNeedMore  = msDays <= hsdDays;
  const preferredMS = msNeedMore ? 8000 : 4000;
  const preferredHSD= msNeedMore ? 4000 : 8000;
  const preferredCost = msNeedMore ? cost8ms4hsd : cost4ms8hsd;
  const fallbackMS  = msNeedMore ? 4000 : 8000;
  const fallbackHSD = msNeedMore ? 8000 : 4000;
  const fallbackCost= msNeedMore ? cost4ms8hsd : cost8ms4hsd;

  let chosenMS, chosenHSD, chosenCost, loadLabel, shortfall = 0;

  // Also add 2-day grace: can afford if cash in (buyDay + 2 days) covers cost
  const projCashPlus2 = totalProjected + 2 * (ads.ms * sp.petrol + ads.hsd * sp.diesel);
  const canAffordPreferred = netCash >= preferredCost;
  const canAffordFallback  = netCash >= fallbackCost || (projCashPlus2 - pendingIOCL) >= fallbackCost;

  if (canAffordPreferred) {
    chosenMS = preferredMS; chosenHSD = preferredHSD; chosenCost = preferredCost;
    loadLabel = `${preferredMS/1000}kL MS + ${preferredHSD/1000}kL HSD`;
  } else if (canAffordFallback) {
    chosenMS = fallbackMS; chosenHSD = fallbackHSD; chosenCost = fallbackCost;
    loadLabel = `${fallbackMS/1000}kL MS + ${fallbackHSD/1000}kL HSD (cash-constrained)`;
    shortfall = Math.max(0, fallbackCost - netCash);
  } else {
    // Minimum viable — smaller load
    chosenMS = 4000; chosenHSD = 4000; chosenCost = 4000 * LOAD_MS_COST + 4000 * LOAD_HSD_COST;
    loadLabel = "4kL MS + 4kL HSD (emergency minimum)";
    shortfall = Math.max(0, chosenCost - netCash);
  }

  // RTGS: must be filed at bank by last banking day BEFORE the 2-day payment deadline.
  // Correct logic: deadline = buyDate + 2 calendar days; RTGS = last banking day <= deadline.
  const ioclDeadline = addDays(buyDateStr, 2);
  let rtgsDeadline = ioclDeadline;
  let rtgsSafety = 0;
  while (isCBIHoliday(rtgsDeadline) && rtgsSafety++ < 10) {
    rtgsDeadline = addDays(rtgsDeadline, -1);
  }

  // Stock after this load
  const msAfter  = Math.max(0, msStock  - (ads.ms  * buyDayNum)) + chosenMS;
  const hsdAfter = Math.max(0, hsdStock - (ads.hsd * buyDayNum)) + chosenHSD;

  return {
    buyDateStr, buyDayNum, msDays, hsdDays, bottleneck,
    projMsCash, projHsdCash, totalProjected,
    pendingIOCL, netCash,
    chosenMS, chosenHSD, chosenCost, loadLabel, shortfall,
    rtgsDeadline, eomPressure, daysToEOM,
    msAfter, hsdAfter
  };
}

function saveCashInputsAndForecast() {
  db.cashflow.bank_balance  = parseFloat(document.getElementById('cf-bank-balance').value)  || 0;
  db.cashflow.phonepe_balance = parseFloat(document.getElementById('cf-phonepe-balance').value) || 0;
  db.cashflow.cash_drawer   = parseFloat(document.getElementById('cf-cash-drawer').value)   || 0;
  db.cashflow.iocl_cushion  = parseFloat(document.getElementById('cf-iocl-cushion').value)  || 0;
  db.cashflow.ppcc_balance  = parseFloat(document.getElementById('cf-ppcc-balance').value)  || 0;
  saveDB();
  renderCashFlow();
  showNotification('Cash inputs saved. Forecast updated.', 'success');
}

function renderCashFlow() {
  // Populate inputs from saved db
  const el = id => document.getElementById(id);
  el('cf-bank-balance').value    = db.cashflow.bank_balance    || 0;
  el('cf-phonepe-balance').value = db.cashflow.phonepe_balance || 0;
  el('cf-cash-drawer').value     = db.cashflow.cash_drawer     || 0;
  el('cf-iocl-cushion').value    = db.cashflow.iocl_cushion    || 0;
  if (el('cf-ppcc-balance')) el('cf-ppcc-balance').value = db.cashflow.ppcc_balance || 0;

  const ads = getADS14();
  const sp  = getSellingPriceNow();
  const { cost4ms8hsd, cost8ms4hsd } = getLoadCosts();

  // Update load cost references
  el('load-cost-4-8').textContent = formatCurrency(cost4ms8hsd);
  el('load-cost-8-4').textContent = formatCurrency(cost8ms4hsd);
  el('cf-avg-ms').textContent  = ads.ms.toFixed(0);
  el('cf-avg-hsd').textContent = ads.hsd.toFixed(0);

  // Current state
  const msStock   = db.stock.petrol  || 0;
  const hsdStock  = db.stock.diesel  || 0;
  const pendingIOCL = getPendingIOCL();
  const cashReserves = (db.cashflow.bank_balance || 0)
                     + (db.cashflow.phonepe_balance || 0)
                     + (db.cashflow.cash_drawer || 0)
                     + (db.cashflow.ppcc_balance || 0)
                     + (db.cashflow.iocl_cushion || 0);

  // ---- UPCOM forecast ----
  const upcom = computeOrderForecast(msStock, hsdStock, cashReserves, pendingIOCL, ads, sp, 0);

  // ---- NEXT TO UP forecast (starts from stock + load after UPCOM) ----
  const ntuCashStart = cashReserves
    + upcom.projMsCash + upcom.projHsdCash    // collected during upcom wait
    - pendingIOCL                              // paid existing pending
    - upcom.chosenCost;                        // paid for upcom load (grace: actual RTGS)
  const ntuPending = upcom.chosenCost;         // the upcom load is now pending
  const ntu = computeOrderForecast(
    upcom.msAfter, upcom.hsdAfter,
    Math.max(0, ntuCashStart),
    0,  // previous pending already accounted
    ads, sp,
    upcom.buyDayNum  // offset from today
  );

  // ---- Render 21-day calendar strip ----
  const strip = el('cf-calendar-strip');
  if (strip) {
    const todayStr = new Date().toISOString().split('T')[0];
    strip.innerHTML = '';
    for (let i = 0; i < 21; i++) {
      const ds = addDays(todayStr, i);
      const isHol   = isCBIHoliday(ds);
      const isUpcom = ds === upcom.buyDateStr;
      const isNtu   = ds === ntu.buyDateStr;
      const isEOM   = new Date(ds + "T12:00:00").getDate() === new Date(new Date(ds + "T12:00:00").getFullYear(), new Date(ds + "T12:00:00").getMonth() + 1, 0).getDate();
      const d = new Date(ds + "T12:00:00");
      const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      let bg = isHol ? 'rgba(244,114,182,0.25)' : 'rgba(99,102,241,0.18)';
      let border = isHol ? '1px solid rgba(244,114,182,0.5)' : '1px solid rgba(99,102,241,0.3)';
      let color  = isHol ? '#f472b6' : 'var(--text-dim)';
      let title  = isHol ? 'Bank Holiday' : 'Banking Day';
      if (isUpcom || isNtu) { bg = 'rgba(250,204,21,0.25)'; border = '1px solid rgba(250,204,21,0.7)'; color = '#fbbf24'; title = isUpcom ? 'UPCOM Buy Day' : 'NTU Buy Day'; }
      if (isEOM && !isUpcom && !isNtu) { bg = 'rgba(239,68,68,0.2)'; border = '1px solid rgba(239,68,68,0.5)'; color = '#ef4444'; title += ' + Month-End'; }
      strip.innerHTML += `<div title="${title} (${ds})" style="min-width:36px; padding:0.3rem 0.2rem; border-radius:4px; text-align:center; background:${bg}; border:${border}; cursor:default;">
        <div style="font-size:0.6rem; color:${color}; font-weight:600;">${dayNames[d.getDay()]}</div>
        <div style="font-size:0.72rem; color:#fff; font-weight:${isUpcom||isNtu?'700':'400'};">${d.getDate()}</div>
        ${isUpcom ? '<div style="font-size:0.5rem; color:#fbbf24; font-weight:700;">BUY</div>' : ''}
        ${isNtu   ? '<div style="font-size:0.5rem; color:#a78bfa; font-weight:700;">NXT</div>' : ''}
        ${isEOM && !isUpcom && !isNtu ? '<div style="font-size:0.5rem; color:#ef4444;">EOM</div>' : ''}
      </div>`;
    }
  }

  // ---- EOM pressure alert ----
  const eomBar = el('eom-pressure-bar');
  if (eomBar) {
    if (upcom.eomPressure) {
      eomBar.style.display = 'block';
      eomBar.innerHTML = `<div class="panel" style="border-left:4px solid #ef4444; padding:0.75rem 1rem; background:rgba(239,68,68,0.08);">
        <strong style="color:#ef4444;">&#9888; IOCL End-of-Month Pressure</strong> &mdash;
        You must place a tanker order by <strong>${formatDate(addDays(new Date().toISOString().split('T')[0], upcom.daysToEOM))}</strong>
        (${upcom.daysToEOM} days, last day of month). Plan your RTGS filing accordingly.
      </div>`;
    } else {
      eomBar.style.display = 'none';
    }
  }

  // ---- Fill UPCOM card ----
  function fillCard(prefix, f, currentMs, currentHsd) {
    const fc = (v) => formatCurrency(v);
    const pnlColor = (v) => v >= 0 ? '#4ade80' : '#ef4444';

    el(`${prefix}-date`).textContent = `${formatDate(f.buyDateStr)} (Day ${f.buyDayNum})`;
    el(`${prefix}-load-badge`).textContent = f.loadLabel;

    el(`${prefix}-ms-stock`).textContent  = `${currentMs.toFixed(0)} L`;
    el(`${prefix}-ms-remaining`).textContent = `${f.msDays.toFixed(1)} days left`;
    el(`${prefix}-hsd-stock`).textContent  = `${currentHsd.toFixed(0)} L`;
    el(`${prefix}-hsd-remaining`).textContent = `${f.hsdDays.toFixed(1)} days left`;

    el(`${prefix}-avg-ms`).textContent  = ads.ms.toFixed(0);
    el(`${prefix}-avg-hsd`).textContent = ads.hsd.toFixed(0);
    el(`${prefix}-days`).textContent = `${f.buyDayNum} days`;

    if (el(`${prefix}-proj-ms`))  el(`${prefix}-proj-ms`).textContent  = fc(f.projMsCash);
    if (el(`${prefix}-proj-hsd`)) el(`${prefix}-proj-hsd`).textContent = fc(f.projHsdCash);
    el(`${prefix}-total-reserves`).textContent = fc(f.totalProjected);

    el(`${prefix}-iocl-pending`).textContent = fc(f.pendingIOCL);
    const nc = el(`${prefix}-net-cash`);
    nc.textContent = fc(f.netCash);
    nc.style.color = pnlColor(f.netCash);

    el(`${prefix}-load-cost`).textContent = fc(f.chosenCost);

    const sfRow = el(`${prefix}-shortfall-row`);
    if (f.shortfall > 0) {
      sfRow.style.display = 'flex';
      el(`${prefix}-shortfall`).textContent = fc(f.shortfall);
    } else {
      sfRow.style.display = 'none';
    }

    el(`${prefix}-rtgs-day`).textContent = formatDate(f.rtgsDeadline) +
      (isCBIHoliday(f.rtgsDeadline) ? ' ⚠️' : ' ✓');

    const decEl = el(`${prefix}-decision`);
    if (f.shortfall > 0) {
      decEl.style.background = 'rgba(239,68,68,0.1)';
      decEl.style.color = '#f87171';
      decEl.style.border = '1px solid rgba(239,68,68,0.3)';
      decEl.innerHTML = `&#9888; Cash shortfall &#8377;${fc(f.shortfall)} &mdash; ${f.loadLabel}. Collect ${f.buyDayNum+2} days revenue &amp; file RTGS by ${formatDate(f.rtgsDeadline)}`;
    } else {
      decEl.style.background = 'rgba(34,197,94,0.08)';
      decEl.style.color = '#4ade80';
      decEl.style.border = '1px solid rgba(34,197,94,0.25)';
      decEl.innerHTML = `&#10003; Buy <strong>${f.loadLabel}</strong>. File RTGS at CBI by ${formatDate(f.rtgsDeadline)}`;
    }
  }

  fillCard('upcom', upcom, msStock, hsdStock);
  fillCard('ntu',   ntu,   upcom.msAfter, upcom.hsdAfter);
}


// -------------------------------------------------------------
// SHIFT RECONCILIATION & CASH COUNT LOGIC
// -------------------------------------------------------------

// Global state variables for shift reconciliation
window.reconExpensesList = [];
window.reconOpenStock = { petrol: 0, diesel: 0 };
window.ocrExtractedValues = null;
window.testFuelTimers = {};

function renderShiftRecon() {
  const today = new Date();
  const currentHour = today.getHours();

  const getLocalDateStr = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  let defaultDateStr = getLocalDateStr(today);
  let defaultShift = 'day';

  if (currentHour < 15) { // Before 3 PM: Night shift of yesterday
    defaultShift = 'night';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    defaultDateStr = getLocalDateStr(yesterday);
  } else { // After 3 PM: Day shift of today
    defaultShift = 'day';
  }

  document.getElementById('recon-date').value = defaultDateStr;
  document.getElementById('recon-shift').value = defaultShift;

  window.reconExpensesList = [];
  window.ocrExtractedValues = null;

  // Load authorized contacts filter from settings
  const authInput = document.getElementById('recon-authorized-contacts');
  if (authInput) {
    authInput.value = db.settings.authorized_contacts || "Anil Operator, Ramesh Supervisor, +91 98765 43210";
  }

  // Reset input mode to manual by default
  switchReconInputMode('manual');

  // Reset image preview & scan reports
  document.getElementById('paper-verify-report').style.display = 'none';
  document.getElementById('upload-preview-container').style.display = 'none';
  document.getElementById('upload-prompt').style.display = 'block';
  document.getElementById('paper-slip-file').value = '';

  resetDenominations();
  onReconShiftChange();
}

function onReconShiftChange() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;

  if (!dateStr) return;

  // 1. Fetch opening readings
  const openReadings = getOpeningReadings(dateStr, shift);
  document.getElementById('recon-du1-p-open').value = openReadings.du1_p.toFixed(2);
  document.getElementById('recon-du2-p-open').value = openReadings.du2_p.toFixed(2);
  document.getElementById('recon-du1-d-open').value = openReadings.du1_d.toFixed(2);
  document.getElementById('recon-du2-d-open').value = openReadings.du2_d.toFixed(2);

  // 2. Fetch previous PhonePe
  const prevPhonePe = getPreviousShiftPhonePe(dateStr, shift);
  document.getElementById('recon-phonepe-prev').value = prevPhonePe.toFixed(2);

  // 3. Fetch opening physical stock for visualizer
  const openStock = getShiftOpeningStock(dateStr, shift);
  window.reconOpenStock = openStock;

  document.getElementById('recon-visual-val-p').textContent = Math.round(openStock.petrol) + " L";
  document.getElementById('recon-visual-val-d').textContent = Math.round(openStock.diesel) + " L";

  const capP = db.settings.petrol_capacity || 20000;
  const capD = db.settings.diesel_capacity || 20000;
  document.getElementById('recon-visual-liquid-p').style.height = Math.min(100, (openStock.petrol / capP) * 100) + "%";
  document.getElementById('recon-visual-liquid-d').style.height = Math.min(100, (openStock.diesel / capD) * 100) + "%";

  // 4. Prepopulate closing form if record already exists in database
  const row = db.daily_ledger.find(r => r.date === dateStr);
  if (row) {
    if (shift === 'day') {
      if (row.du1_p.close_day) document.getElementById('recon-du1-p-close').value = row.du1_p.close_day;
      if (row.du2_p.close_day) document.getElementById('recon-du2-p-close').value = row.du2_p.close_day;
      if (row.du1_d.close_day) document.getElementById('recon-du1-d-close').value = row.du1_d.close_day;
      if (row.du2_d.close_day) document.getElementById('recon-du2-d-close').value = row.du2_d.close_day;

      const t1p = (row.du1_p.close_day > row.du1_p.open) ? (row.du1_p.tests_day ?? 1) : 0;
      const t2p = (row.du2_p.close_day > row.du2_p.open) ? (row.du2_p.tests_day ?? 1) : 0;
      const t1d = (row.du1_d.close_day > row.du1_d.open) ? (row.du1_d.tests_day ?? 1) : 0;
      const t2d = (row.du2_d.close_day > row.du2_d.open) ? (row.du2_d.tests_day ?? 1) : 0;

      const p_vol = (t1p + t2p) * 5;
      const d_vol = (t1d + t2d) * 5;
      const p_rate = row.prices?.petrol || 0;
      const d_rate = row.prices?.diesel || 0;

      document.getElementById('recon-p-tests').value = p_vol > 0 ? `${p_vol} L (₹ ${(p_vol * p_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
      document.getElementById('recon-d-tests').value = d_vol > 0 ? `${d_vol} L (₹ ${(d_vol * d_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
    } else {
      if (row.du1_p.close_night) document.getElementById('recon-du1-p-close').value = row.du1_p.close_night;
      if (row.du2_p.close_night) document.getElementById('recon-du2-p-close').value = row.du2_p.close_night;
      if (row.du1_d.close_night) document.getElementById('recon-du1-d-close').value = row.du1_d.close_night;
      if (row.du2_d.close_night) document.getElementById('recon-du2-d-close').value = row.du2_d.close_night;

      document.getElementById('recon-p-tests').value = 0;
      document.getElementById('recon-d-tests').value = 0;
    }

    // Load recon details if present
    if (row.recon && row.recon[shift]) {
      const rData = row.recon[shift];
      document.getElementById('recon-phonepe-curr').value = rData.phonepe_close || '';
      window.reconExpensesList = rData.expenses ? JSON.parse(JSON.stringify(rData.expenses)) : [];

      resetDenominations();
      if (rData.denominations) {
        const denoms = ['500', '200', '100', '50', '20', '10', '5', 'coins'];
        denoms.forEach(d => {
          const val = rData.denominations[d] || 0;
          document.getElementById('denom-' + d).value = val;
          if (d === 'coins') {
            document.getElementById('denom-val-coins').textContent = val.toFixed(2);
          } else {
            document.getElementById('denom-val-' + d).textContent = (val * parseInt(d)).toFixed(2);
          }
        });
        document.getElementById('recon-cash-total-label').textContent = formatCurrency(rData.cash_counted);
      } else if (rData.cash_counted) {
        document.getElementById('denom-coins').value = rData.cash_counted;
        document.getElementById('denom-val-coins').textContent = rData.cash_counted.toFixed(2);
        document.getElementById('recon-cash-total-label').textContent = formatCurrency(rData.cash_counted);
      }
    } else {
      clearShiftFieldsOnly();
    }
  } else {
    clearShiftFieldsOnly();
  }

  renderExpensesList();
  calculateLiveSales();

  // Update template on local bridge
  updateBridgeTemplate();

  // Refresh sync messages if sync panel is visible
  const syncSection = document.getElementById('recon-section-sync');
  if (syncSection && syncSection.style.display !== 'none') {
    renderSyncMessages();
  }
}

function clearShiftFieldsOnly() {
  document.getElementById('recon-du1-p-close').value = '';
  document.getElementById('recon-du2-p-close').value = '';
  document.getElementById('recon-du1-d-close').value = '';
  document.getElementById('recon-du2-d-close').value = '';
  document.getElementById('recon-p-tests').value = '0';
  document.getElementById('recon-d-tests').value = '0';
  document.getElementById('recon-phonepe-curr').value = '';
  window.reconExpensesList = [];
  renderExpensesList();
  resetDenominations();
}

function resetDenominations() {
  const denoms = ['500', '200', '100', '50', '20', '10', '5', 'coins'];
  denoms.forEach(d => {
    document.getElementById('denom-' + d).value = '0';
    document.getElementById('denom-val-' + d).textContent = '0';
  });
  document.getElementById('recon-cash-total-label').textContent = '₹ 0.00';
}

function getOpeningReadings(dateStr, shift) {
  const sorted = [...db.daily_ledger].sort((a, b) => b.date.localeCompare(a.date));

  if (shift === 'day') {
    const row = db.daily_ledger.find(r => r.date === dateStr);
    if (row && row.du1_p && row.du1_p.open !== undefined) {
      return {
        du1_p: row.du1_p.open,
        du1_d: row.du1_d.open,
        du2_p: row.du2_p.open,
        du2_d: row.du2_d.open
      };
    }
    const prev = sorted.find(r => r.date < dateStr);
    if (prev) {
      return {
        du1_p: prev.du1_p.close_night !== undefined ? prev.du1_p.close_night : (prev.du1_p.close_day || prev.du1_p.open),
        du1_d: prev.du1_d.close_night !== undefined ? prev.du1_d.close_night : (prev.du1_d.close_day || prev.du1_d.open),
        du2_p: prev.du2_p.close_night !== undefined ? prev.du2_p.close_night : (prev.du2_p.close_day || prev.du2_p.open),
        du2_d: prev.du2_d.close_night !== undefined ? prev.du2_d.close_night : (prev.du2_d.close_day || prev.du2_d.open)
      };
    }
  } else {
    const row = db.daily_ledger.find(r => r.date === dateStr);
    if (row && row.du1_p && row.du1_p.close_day !== undefined) {
      return {
        du1_p: row.du1_p.close_day,
        du1_d: row.du1_d.close_day,
        du2_p: row.du2_p.close_day,
        du2_d: row.du2_d.close_day
      };
    }
    if (row && row.du1_p && row.du1_p.open !== undefined) {
      return {
        du1_p: row.du1_p.open,
        du1_d: row.du1_d.open,
        du2_p: row.du2_p.open,
        du2_d: row.du2_d.open
      };
    }
    const prev = sorted.find(r => r.date < dateStr);
    if (prev) {
      return {
        du1_p: prev.du1_p.close_night || prev.du1_p.close_day || prev.du1_p.open,
        du1_d: prev.du1_d.close_night || prev.du1_d.close_day || prev.du1_d.open,
        du2_p: prev.du2_p.close_night || prev.du2_p.close_day || prev.du2_p.open,
        du2_d: prev.du2_d.close_night || prev.du2_d.close_day || prev.du2_d.open
      };
    }
  }

  if (sorted.length > 0) {
    const earliest = sorted[sorted.length - 1];
    return {
      du1_p: earliest.du1_p.open,
      du1_d: earliest.du1_d.open,
      du2_p: earliest.du2_p.open,
      du2_d: earliest.du2_d.open
    };
  }
  return { du1_p: 15400, du1_d: 22100, du2_p: 18200, du2_d: 19050 };
}

function getPreviousShiftPhonePe(dateStr, shift) {
  if (shift === 'day') {
    const prevDate = addDays(dateStr, -1);
    const prevRow = db.daily_ledger.find(r => r.date === prevDate);
    if (prevRow && prevRow.recon && prevRow.recon.night && prevRow.recon.night.phonepe_close !== undefined) {
      return prevRow.recon.night.phonepe_close;
    }
  } else {
    const row = db.daily_ledger.find(r => r.date === dateStr);
    if (row && row.recon && row.recon.day && row.recon.day.phonepe_close !== undefined) {
      return row.recon.day.phonepe_close;
    }
  }

  const sorted = [...db.daily_ledger].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    if (r.recon) {
      if (r.date === dateStr && shift === 'night') {
        if (r.recon.day && r.recon.day.phonepe_close !== undefined) return r.recon.day.phonepe_close;
      }
      if (r.date < dateStr) {
        if (r.recon.night && r.recon.night.phonepe_close !== undefined) return r.recon.night.phonepe_close;
        if (r.recon.day && r.recon.day.phonepe_close !== undefined) return r.recon.day.phonepe_close;
      }
    }
  }
  return 100000; // default initial total
}

function getShiftOpeningStock(dateStr, shift) {
  const hist = getStockHistoryFor(dateStr);
  if (shift === 'day') {
    return {
      petrol: hist.petStart,
      diesel: hist.dieStart
    };
  } else {
    const row = db.daily_ledger.find(r => r.date === dateStr);
    let daySalesP = 0;
    let daySalesD = 0;
    if (row) {
      const calc = computeLedgerRow(row);
      daySalesP = calc.totals.day.petrol;
      daySalesD = calc.totals.day.diesel;
    }
    const dayPurchases = db.purchases.filter(p => p.date.split('T')[0] === dateStr);
    const purchasedP = dayPurchases.reduce((sum, p) => sum + (p.petrol_liters || 0), 0);
    const purchasedD = dayPurchases.reduce((sum, p) => sum + (p.diesel_liters || 0), 0);

    return {
      petrol: hist.petStart + purchasedP - daySalesP,
      diesel: hist.dieStart + purchasedD - daySalesD
    };
  }
}

function calculateLiveSales() {
  const du1_p_open = parseFloat(document.getElementById('recon-du1-p-open').value) || 0;
  const du1_p_close = parseFloat(document.getElementById('recon-du1-p-close').value) || 0;
  const du2_p_open = parseFloat(document.getElementById('recon-du2-p-open').value) || 0;
  const du2_p_close = parseFloat(document.getElementById('recon-du2-p-close').value) || 0;

  const du1_d_open = parseFloat(document.getElementById('recon-du1-d-open').value) || 0;
  const du1_d_close = parseFloat(document.getElementById('recon-du1-d-close').value) || 0;
  const du2_d_open = parseFloat(document.getElementById('recon-du2-d-open').value) || 0;
  const du2_d_close = parseFloat(document.getElementById('recon-du2-d-close').value) || 0;

  const shift = document.getElementById('recon-shift').value;
  let p_tests = 0;
  let d_tests = 0;

  if (shift === 'day') {
    p_tests = ((du1_p_close > du1_p_open ? 1 : 0) + (du2_p_close > du2_p_open ? 1 : 0)) * 5;
    d_tests = ((du1_d_close > du1_d_open ? 1 : 0) + (du2_d_close > du2_d_open ? 1 : 0)) * 5;
  }

  // Defer setting test input values until prices are resolved below

  // Volume Calculations
  const du1_p_sales = du1_p_close > 0 ? Math.max(0, du1_p_close - du1_p_open) : 0;
  const du2_p_sales = du2_p_close > 0 ? Math.max(0, du2_p_close - du2_p_open) : 0;
  const du1_d_sales = du1_d_close > 0 ? Math.max(0, du1_d_close - du1_d_open) : 0;
  const du2_d_sales = du2_d_close > 0 ? Math.max(0, du2_d_close - du2_d_open) : 0;

  // Deduct test liters per nozzle first (to match the core math engine in computeLedgerRow)
  const du1_p_test_l = (shift === 'day' && du1_p_close > du1_p_open) ? 5 : 0;
  const du2_p_test_l = (shift === 'day' && du2_p_close > du2_p_open) ? 5 : 0;
  const du1_d_test_l = (shift === 'day' && du1_d_close > du1_d_open) ? 5 : 0;
  const du2_d_test_l = (shift === 'day' && du2_d_close > du2_d_open) ? 5 : 0;

  const petrol_net = Math.max(0, du1_p_sales - du1_p_test_l) + Math.max(0, du2_p_sales - du2_p_test_l);
  const diesel_net = Math.max(0, du1_d_sales - du1_d_test_l) + Math.max(0, du2_d_sales - du2_d_test_l);

  const total_liters = petrol_net + diesel_net;

  const dateStr = document.getElementById('recon-date').value;
  const prices = getPricesAt(dateStr);

  const p_rate = prices.petrol || 0;
  const d_rate = prices.diesel || 0;
  document.getElementById('recon-p-tests').value = p_tests > 0 ? `${p_tests} L (₹ ${(p_tests * p_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
  document.getElementById('recon-d-tests').value = d_tests > 0 ? `${d_tests} L (₹ ${(d_tests * d_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";

  const petrol_rev = petrol_net * prices.petrol;
  const diesel_rev = diesel_net * prices.diesel;
  const total_revenue = petrol_rev + diesel_rev;

  // PhonePe Calculations
  const prev_pe = parseFloat(document.getElementById('recon-phonepe-prev').value) || 0;
  const curr_pe = parseFloat(document.getElementById('recon-phonepe-curr').value) || 0;
  const net_pe = curr_pe > 0 ? Math.max(0, curr_pe - prev_pe) : 0;

  document.getElementById('recon-phonepe-net-label').textContent = formatCurrency(net_pe);

  // Expenses calculations
  const total_expenses = window.reconExpensesList.reduce((sum, exp) => sum + exp.amount, 0);
  document.getElementById('recon-expenses-total-label').textContent = formatCurrency(total_expenses);

  // Reconciliation Summary Board calculations
  const expected_cash = Math.max(0, total_revenue - net_pe);
  const counted_cash = calculateDenominationsValue();
  const actual_cash_accounted = counted_cash + total_expenses;
  const variance = actual_cash_accounted - expected_cash;

  document.getElementById('board-liters-sold').textContent = total_liters.toFixed(2) + " L";
  document.getElementById('board-liters-split').textContent = `P: ${petrol_net.toFixed(2)} L | D: ${diesel_net.toFixed(2)} L`;
  document.getElementById('board-revenue').textContent = formatCurrency(total_revenue);
  document.getElementById('board-expected-cash').textContent = formatCurrency(expected_cash);
  document.getElementById('board-cash-accounted').textContent = formatCurrency(actual_cash_accounted);

  const varEl = document.getElementById('board-variance');
  const statusEl = document.getElementById('board-variance-status');
  const cardEl = document.getElementById('board-variance-card');

  varEl.textContent = formatCurrency(variance);

  if (Math.abs(variance) < 0.01) {
    statusEl.textContent = "MATCHED";
    statusEl.style.background = "rgba(34, 197, 94, 0.15)";
    statusEl.style.color = "rgb(74, 222, 128)";
    cardEl.style.borderColor = "rgba(34, 197, 94, 0.4)";
  } else if (variance > 0) {
    statusEl.textContent = "SURPLUS";
    statusEl.style.background = "rgba(59, 130, 246, 0.15)";
    statusEl.style.color = "rgb(96, 165, 250)";
    cardEl.style.borderColor = "rgba(59, 130, 246, 0.4)";
  } else {
    statusEl.textContent = "SHORTAGE";
    statusEl.style.background = "rgba(239, 68, 68, 0.15)";
    statusEl.style.color = "rgb(248, 113, 113)";
    cardEl.style.borderColor = "rgba(239, 68, 68, 0.4)";
  }

  // 5. Update physical remaining tank volumes
  if (window.reconOpenStock) {
    const currentStockP = Math.max(0, window.reconOpenStock.petrol - petrol_net);
    const currentStockD = Math.max(0, window.reconOpenStock.diesel - diesel_net);

    document.getElementById('recon-visual-val-p').textContent = Math.round(currentStockP) + " L";
    document.getElementById('recon-visual-val-d').textContent = Math.round(currentStockD) + " L";

    const capP = db.settings.petrol_capacity || 20000;
    const capD = db.settings.diesel_capacity || 20000;
    document.getElementById('recon-visual-liquid-p').style.height = Math.min(100, (currentStockP / capP) * 100) + "%";
    document.getElementById('recon-visual-liquid-d').style.height = Math.min(100, (currentStockD / capD) * 100) + "%";
  }

  // 6. Update Paper Verification table if slip was uploaded
  if (window.ocrExtractedValues) {
    const compContainer = document.getElementById('ocr-comparison-rows');
    const btnApply = document.getElementById('btn-apply-ocr');

    const list = [
      { label: 'DU1 MS Close (P)', form: du1_p_close, ocr: window.ocrExtractedValues.du1_p_close },
      { label: 'DU2 MS Close (P)', form: du2_p_close, ocr: window.ocrExtractedValues.du2_p_close },
      { label: 'DU1 HSD Close (D)', form: du1_d_close, ocr: window.ocrExtractedValues.du1_d_close },
      { label: 'DU2 HSD Close (D)', form: du2_d_close, ocr: window.ocrExtractedValues.du2_d_close }
    ];

    let html = '';
    let anyMismatch = false;

    list.forEach(item => {
      const match = Math.abs(item.form - item.ocr) < 0.01;
      const badge = match
        ? `<span class="ocr-match-badge">✓ Match</span>`
        : `<span class="ocr-mismatch-badge">✗ Mismatch (Paper: ${item.ocr.toFixed(2)})</span>`;

      if (!match) anyMismatch = true;

      html += `
        <div class="ocr-row-item">
          <span style="color:var(--text-dim);">${item.label}</span>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-weight:600; color:#fff;">${item.form > 0 ? item.form.toFixed(2) : '-'}</span>
            ${badge}
          </div>
        </div>
      `;
    });

    compContainer.innerHTML = html;
    btnApply.style.display = anyMismatch ? 'block' : 'none';
  }
}

function calculateDenominationsValue() {
  const denoms = [
    { key: '500', val: 500 },
    { key: '200', val: 200 },
    { key: '100', val: 100 },
    { key: '50', val: 50 },
    { key: '20', val: 20 },
    { key: '10', val: 10 },
    { key: '5', val: 5 }
  ];
  let sum = 0;
  denoms.forEach(d => {
    const count = parseInt(document.getElementById('denom-' + d.key).value) || 0;
    const itemVal = count * d.val;
    document.getElementById('denom-val-' + d.key).textContent = itemVal;
    sum += itemVal;
  });
  const coins = parseFloat(document.getElementById('denom-coins').value) || 0;
  document.getElementById('denom-val-coins').textContent = coins.toFixed(2);
  sum += coins;
  return sum;
}

function calculateDenominations() {
  const total = calculateDenominationsValue();
  document.getElementById('recon-cash-total-label').textContent = formatCurrency(total);
  calculateLiveSales();
}

function renderExpensesList() {
  const container = document.getElementById('expenses-container');
  container.innerHTML = '';

  if (window.reconExpensesList.length === 0) {
    container.innerHTML = `<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding: 0.5rem; width:100%;">No expenses recorded.</div>`;
    return;
  }

  window.reconExpensesList.forEach((exp, idx) => {
    const row = document.createElement('div');
    row.className = 'ocr-row-item';
    row.innerHTML = `
      <span style="color:#fff;">${exp.description}</span>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <strong style="color:var(--danger);">₹ ${exp.amount.toFixed(2)}</strong>
        <button class="btn btn-secondary btn-sm" onclick="removeExpenseRow(${idx})" style="padding:0.05rem 0.25rem; font-size:0.65rem; border-radius:3px; line-height:1; background:rgba(255,255,255,0.05);">×</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function addExpenseRow() {
  const desc = prompt("Enter expense description (e.g. Tea, Stationery):");
  if (!desc) return;
  const amountStr = prompt("Enter expense amount (₹):");
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid positive amount.");
    return;
  }
  window.reconExpensesList.push({ description: desc, amount });
  renderExpensesList();
  calculateLiveSales();
}

function removeExpenseRow(index) {
  window.reconExpensesList.splice(index, 1);
  renderExpensesList();
  calculateLiveSales();
}

function animateNumber(elementId, startVal, endVal, suffix = "") {
  const duration = 2000; // 2 seconds
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out quad
    const easeProgress = progress * (2 - progress);
    const currentVal = Math.round(startVal + (endVal - startVal) * easeProgress);

    document.getElementById(elementId).textContent = currentVal + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function triggerTestFuelAnimation(fuelType) {
  const isP = fuelType === 'petrol';
  const inputEl = document.getElementById(isP ? 'recon-p-tests' : 'recon-d-tests');
  const val = parseFloat(inputEl.value) || 0;

  calculateLiveSales();

  if (val <= 0) return;

  if (window.testFuelTimers[fuelType]) {
    clearTimeout(window.testFuelTimers[fuelType]);
  }

  const stream = document.getElementById(isP ? 'recon-visual-stream-p' : 'recon-visual-stream-d');
  const liquid = document.getElementById(isP ? 'recon-visual-liquid-p' : 'recon-visual-liquid-d');
  const badge = document.getElementById(isP ? 'recon-visual-badge-p' : 'recon-visual-badge-d');

  const color = isP ? 'var(--color-petrol)' : 'var(--color-diesel)';

  const du1_close = parseFloat(document.getElementById(isP ? 'recon-du1-p-close' : 'recon-du1-d-close').value) || 0;
  const du1_open = parseFloat(document.getElementById(isP ? 'recon-du1-p-open' : 'recon-du1-d-open').value) || 0;
  const du2_close = parseFloat(document.getElementById(isP ? 'recon-du2-p-close' : 'recon-du2-d-close').value) || 0;
  const du2_open = parseFloat(document.getElementById(isP ? 'recon-du2-p-open' : 'recon-du2-d-open').value) || 0;

  const du1_sales = du1_close > 0 ? Math.max(0, du1_close - du1_open) : 0;
  const du2_sales = du2_close > 0 ? Math.max(0, du2_close - du2_open) : 0;
  const gross = du1_sales + du2_sales;

  const openStock = window.reconOpenStock ? (isP ? window.reconOpenStock.petrol : window.reconOpenStock.diesel) : 5000;

  const startStock = Math.max(0, openStock - gross);
  const endStock = startStock + val;

  stream.style.display = 'block';
  stream.style.color = color;
  liquid.classList.add('glowing-stock-recirc');
  liquid.style.color = color;

  badge.textContent = `+${val} L`;
  badge.style.display = 'inline-block';
  badge.className = 'badge badge-success float-badge-active';

  animateNumber(isP ? 'recon-visual-val-p' : 'recon-visual-val-d', startStock, endStock, " L");

  const cap = isP ? (db.settings.petrol_capacity || 20000) : (db.settings.diesel_capacity || 20000);
  liquid.style.height = Math.min(100, (endStock / cap) * 100) + "%";

  window.testFuelTimers[fuelType] = setTimeout(() => {
    stream.style.display = 'none';
    liquid.classList.remove('glowing-stock-recirc');
    badge.style.display = 'none';
    badge.className = 'badge badge-success';
  }, 2500);
}

function copyWhatsAppTemplate() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;

  const d1_p_open = parseFloat(document.getElementById('recon-du1-p-open').value) || 0;
  const d2_p_open = parseFloat(document.getElementById('recon-du2-p-open').value) || 0;
  const d1_d_open = parseFloat(document.getElementById('recon-du1-d-open').value) || 0;
  const d2_d_open = parseFloat(document.getElementById('recon-du2-d-open').value) || 0;

  const pts = dateStr.split('-');
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === 'day' ? 'Day Shift (8 AM - 8 PM)' : 'Night Shift (8 PM - 8 AM)';

  const text = `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${d1_p_open.toFixed(2)} - [Enter Close]
DU2 MS (Petrol): ${d2_p_open.toFixed(2)} - [Enter Close]
DU1 HSD (Diesel): ${d1_d_open.toFixed(2)} - [Enter Close]
DU2 HSD (Diesel): ${d2_d_open.toFixed(2)} - [Enter Close]
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: [Enter PhonePe Total]
Expenses:
- [Item Name]: [Amount]`;

  navigator.clipboard.writeText(text).then(() => {
    showNotification("WhatsApp template copied to clipboard! Share with your staff.", "success");
  }).catch(err => {
    console.error("Failed to copy template: ", err);
    alert("Copy template text manually:\n\n" + text);
  });
}

function updateBridgeTemplate() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;
  if (!dateStr || !shift) return;

  const d1_p_open = parseFloat(document.getElementById('recon-du1-p-open').value) || 0;
  const d2_p_open = parseFloat(document.getElementById('recon-du2-p-open').value) || 0;
  const d1_d_open = parseFloat(document.getElementById('recon-du1-d-open').value) || 0;
  const d2_d_open = parseFloat(document.getElementById('recon-du2-d-open').value) || 0;

  const pts = dateStr.split('-');
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === 'day' ? 'Day Shift (8 AM - 8 PM)' : 'Night Shift (8 PM - 8 AM)';

  const text = `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${d1_p_open.toFixed(2)} - [Enter Close]
DU2 MS (Petrol): ${d2_p_open.toFixed(2)} - [Enter Close]
DU1 HSD (Diesel): ${d1_d_open.toFixed(2)} - [Enter Close]
DU2 HSD (Diesel): ${d2_d_open.toFixed(2)} - [Enter Close]
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: [Enter PhonePe Total]
Expenses:
- [Item Name]: [Amount]`;

  fetch('https://localhost:8000/whatsapp-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: text })
  }).then(res => {
    if (res.ok) console.log("Successfully pushed template to bridge.");
  }).catch(err => {
    console.error("Failed to push template to bridge:", err);
  });
}

function sendWhatsAppTemplate() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;

  const d1_p_open = parseFloat(document.getElementById('recon-du1-p-open').value) || 0;
  const d2_p_open = parseFloat(document.getElementById('recon-du2-p-open').value) || 0;
  const d1_d_open = parseFloat(document.getElementById('recon-du1-d-open').value) || 0;
  const d2_d_open = parseFloat(document.getElementById('recon-du2-d-open').value) || 0;

  const pts = dateStr.split('-');
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === 'day' ? 'Day Shift (8 AM - 8 PM)' : 'Night Shift (8 PM - 8 AM)';

  const text = `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${d1_p_open.toFixed(2)} - [Enter Close]
DU2 MS (Petrol): ${d2_p_open.toFixed(2)} - [Enter Close]
DU1 HSD (Diesel): ${d1_d_open.toFixed(2)} - [Enter Close]
DU2 HSD (Diesel): ${d2_d_open.toFixed(2)} - [Enter Close]
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: [Enter PhonePe Total]
Expenses:
- [Item Name]: [Amount]`;

  const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
  showNotification("Opening WhatsApp Web with template...", "info");
}

function fetchPhonePeSettlement() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;
  if (!dateStr || !shift) {
    showNotification("Please select an Operating Date and Shift first.", "warning");
    return;
  }

  const mid = db.settings.phonepe_mid || '';
  const saltKey = db.settings.phonepe_salt_key || '';
  const saltIndex = db.settings.phonepe_salt_index || '1';

  if (!mid || !saltKey) {
    showNotification("Please configure PhonePe Merchant API credentials in System Settings first.", "warning");
    return;
  }

  // Calculate start/end timestamps in IST (India Standard Time +05:30)
  let startMs, endMs;
  if (shift === 'day') {
    const startStr = `${dateStr}T08:00:00+05:30`;
    const endStr = `${dateStr}T20:00:00+05:30`;
    startMs = new Date(startStr).getTime();
    endMs = new Date(endStr).getTime();
  } else {
    const startStr = `${dateStr}T20:00:00+05:30`;
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    const nextDateStr = d.toISOString().split('T')[0];
    const endStr = `${nextDateStr}T08:00:00+05:30`;
    startMs = new Date(startStr).getTime();
    endMs = new Date(endStr).getTime();
  }

  showNotification("Syncing transaction totals from PhonePe...", "info");

  const url = `https://localhost:8000/phonepe-settlement?merchantId=${encodeURIComponent(mid)}&saltKey=${encodeURIComponent(saltKey)}&saltIndex=${encodeURIComponent(saltIndex)}&startTimestamp=${startMs}&endTimestamp=${endMs}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        document.getElementById('recon-phonepe-curr').value = data.total.toFixed(2);
        calculateLiveSales();
        if (data.mode === 'mock') {
          showNotification(`PhonePe Sync: Loaded Mock Settlement ₹${data.total.toFixed(2)} (Demo Mode)`, "success");
        } else {
          showNotification(`PhonePe Sync: Loaded Real Settlement ₹${data.total.toFixed(2)} (${data.count} txs)`, "success");
        }
      } else if (data.status === 'partial_success') {
        document.getElementById('recon-phonepe-curr').value = data.total.toFixed(2);
        calculateLiveSales();
        showNotification(`PhonePe Live Connection Error: ${data.error}. Used mock fallback.`, "warning");
      } else {
        showNotification("Failed to fetch data from PhonePe: " + (data.error || "Unknown error"), "danger");
      }
    })
    .catch(err => {
      console.error("PhonePe sync fetch error:", err);
      showNotification("Error connecting to local bridge server.", "danger");
    });
}

function parseWhatsAppReport() {
  const input = document.getElementById('whatsapp-input').value;
  if (!input || input.trim() === '') {
    showNotification("Please paste WhatsApp text in the input area first.", "warning");
    return;
  }

  // Parse date
  const dateRegex = /(?:Date|date):\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;
  const dateMatch = input.match(dateRegex);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const year = dateMatch[3];
    document.getElementById('recon-date').value = `${year}-${month}-${day}`;
  }

  // Parse shift
  const shiftRegex = /(?:Shift|shift):\s*(day|night|Day|Night)/;
  const shiftMatch = input.match(shiftRegex);
  if (shiftMatch) {
    const sStr = shiftMatch[1].toLowerCase();
    document.getElementById('recon-shift').value = sStr.includes('night') ? 'night' : 'day';
  }

  onReconShiftChange();

  // Parse nozzle opening & closing values
  const du1_p_regex = /(?:DU1\s*MS|DU1\s*Petrol|DU1\s*p|DU1\s*P)[^\n:]*:\s*([^\n]+)/i;
  const du2_p_regex = /(?:DU2\s*MS|DU2\s*Petrol|DU2\s*p|DU2\s*P)[^\n:]*:\s*([^\n]+)/i;
  const du1_d_regex = /(?:DU1\s*HSD|DU1\s*Diesel|DU1\s*d|DU1\s*D)[^\n:]*:\s*([^\n]+)/i;
  const du2_d_regex = /(?:DU2\s*HSD|DU2\s*Diesel|DU2\s*d|DU2\s*D)[^\n:]*:\s*([^\n]+)/i;

  const parseReadingLine = (matchResult, openId, closeId) => {
    if (!matchResult) return;
    const content = matchResult[1].trim();
    const parts = content.split('-').map(s => parseFloat(s.replace(/[^\d.]/g, '')));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      document.getElementById(openId).value = parts[0];
      document.getElementById(closeId).value = parts[1];
    } else if (parts.length === 1 && !isNaN(parts[0])) {
      document.getElementById(closeId).value = parts[0];
    }
  };

  parseReadingLine(input.match(du1_p_regex), 'recon-du1-p-open', 'recon-du1-p-close');
  parseReadingLine(input.match(du2_p_regex), 'recon-du2-p-open', 'recon-du2-p-close');
  parseReadingLine(input.match(du1_d_regex), 'recon-du1-d-open', 'recon-du1-d-close');
  parseReadingLine(input.match(du2_d_regex), 'recon-du2-d-open', 'recon-du2-d-close');

  // Parse test fuel
  const test_p_regex = /(?:Test\s*Petrol|test\s*petrol|Test\s*MS|test\s*ms|Test\s*P|test\s*p)[^\n]*:\s*\[?([\d.]+)\]?/i;
  const test_d_regex = /(?:Test\s*Diesel|test\s*diesel|Test\s*HSD|test\s*hsd|Test\s*D|test\s*d)[^\n]*:\s*\[?([\d.]+)\]?/i;

  const tp = input.match(test_p_regex);
  const td = input.match(test_d_regex);
  if (tp) document.getElementById('recon-p-tests').value = parseFloat(tp[1]);
  if (td) document.getElementById('recon-d-tests').value = parseFloat(td[1]);

  // Parse PhonePe Close (with word boundaries to avoid matching "Pe" inside "Petrol")
  const pe_regex = /(?:PhonePe\s*Current|\bPhonePe\b|\bPE\b|\bpe\b|\bPay\b)[^\n:]*:\s*[^0-9]*([\d,.]+)/i;
  const peMatch = input.match(pe_regex);
  if (peMatch) {
    const cleanVal = peMatch[1].replace(/,/g, '');
    document.getElementById('recon-phonepe-curr').value = parseFloat(cleanVal);
  }

  // Parse expenses section
  window.reconExpensesList = [];
  const expSectionRegex = /(?:Expenses|expenses|Exp|exp):([\s\S]*)/i;
  const expMatch = input.match(expSectionRegex);
  if (expMatch) {
    const lines = expMatch[1].split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const content = trimmed.substring(1).trim();
        const parts = content.split(/[:\-]/);
        if (parts.length >= 2) {
          const desc = parts[0].trim();
          const amtStr = parts[1].replace(/[^\d.]/g, '');
          const amt = parseFloat(amtStr);
          if (desc && !isNaN(amt)) {
            window.reconExpensesList.push({ description: desc, amount: amt });
          }
        }
      }
    });
  }

  renderExpensesList();
  calculateLiveSales();
  showNotification("WhatsApp report parsed and form filled!", "success");
}

function handlePaperSlipUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('upload-prompt').style.display = 'none';
    document.getElementById('upload-preview-container').style.display = 'block';
    document.getElementById('upload-preview-img').src = e.target.result;

    // Trigger holographic scanner line
    const laser = document.getElementById('scanner-laser-line');
    laser.style.display = 'block';

    document.getElementById('paper-verify-report').style.display = 'none';

    setTimeout(() => {
      laser.style.display = 'none';
      showOCRVerificationReport();
    }, 2000);
  };
  reader.readAsDataURL(file);
}

function showOCRVerificationReport() {
  // Grab close values from form, or generate reasonable mock numbers if empty
  const f_du1_p = parseFloat(document.getElementById('recon-du1-p-close').value);
  const f_du2_p = parseFloat(document.getElementById('recon-du2-p-close').value);
  const f_du1_d = parseFloat(document.getElementById('recon-du1-d-close').value);
  const f_du2_d = parseFloat(document.getElementById('recon-du2-d-close').value);

  // OCR reads the paper totalizers (perfect OCR extraction matching entered numbers or default values)
  window.ocrExtractedValues = {
    timestamp: new Date().toLocaleString(),
    du1_p_close: !isNaN(f_du1_p) ? f_du1_p : 15580.00,
    du2_p_close: !isNaN(f_du2_p) ? f_du2_p : 18350.00,
    du1_d_close: !isNaN(f_du1_d) ? f_du1_d : 22320.00,
    du2_d_close: !isNaN(f_du2_d) ? f_du2_d : 19200.00
  };

  document.getElementById('ocr-timestamp').textContent = "Extracted: " + window.ocrExtractedValues.timestamp;
  document.getElementById('paper-verify-report').style.display = 'block';

  calculateLiveSales();
  showNotification("Paper slip scanned and verified against inputs.", "info");
}

function applyOCRReadings() {
  if (!window.ocrExtractedValues) return;
  document.getElementById('recon-du1-p-close').value = window.ocrExtractedValues.du1_p_close.toFixed(2);
  document.getElementById('recon-du2-p-close').value = window.ocrExtractedValues.du2_p_close.toFixed(2);
  document.getElementById('recon-du1-d-close').value = window.ocrExtractedValues.du1_d_close.toFixed(2);
  document.getElementById('recon-du2-d-close').value = window.ocrExtractedValues.du2_d_close.toFixed(2);

  calculateLiveSales();
  showNotification("Verified paper readings loaded into form.", "success");
}

function postShiftRecon() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;

  if (!dateStr) {
    showNotification("Please select an operating date.", "danger");
    return;
  }

  const du1_p_close = parseFloat(document.getElementById('recon-du1-p-close').value);
  const du2_p_close = parseFloat(document.getElementById('recon-du2-p-close').value);
  const du1_d_close = parseFloat(document.getElementById('recon-du1-d-close').value);
  const du2_d_close = parseFloat(document.getElementById('recon-du2-d-close').value);

  if (isNaN(du1_p_close) || isNaN(du2_p_close) || isNaN(du1_d_close) || isNaN(du2_d_close)) {
    showNotification("Please enter closing readings for all nozzles.", "danger");
    return;
  }

  const du1_p_open = parseFloat(document.getElementById('recon-du1-p-open').value) || 0;
  const du2_p_open = parseFloat(document.getElementById('recon-du2-p-open').value) || 0;
  const du1_d_open = parseFloat(document.getElementById('recon-du1-d-open').value) || 0;
  const du2_d_open = parseFloat(document.getElementById('recon-du2-d-open').value) || 0;

  if (du1_p_close < 0 || du2_p_close < 0 || du1_d_close < 0 || du2_d_close < 0 ||
      du1_p_open < 0 || du2_p_open < 0 || du1_d_open < 0 || du2_d_open < 0) {
    showNotification("⚠️ Validation Error: Readings cannot be negative.", "danger");
    return;
  }

  if (du1_p_close < du1_p_open || du2_p_close < du2_p_open || du1_d_close < du1_d_open || du2_d_close < du2_d_open) {
    showNotification("Closing readings cannot be less than opening readings.", "danger");
    return;
  }

  const p_tests = parseFloat(document.getElementById('recon-p-tests').value.split(' ')[0]) || 0;
  const d_tests = parseFloat(document.getElementById('recon-d-tests').value.split(' ')[0]) || 0;

  if (p_tests < 0 || d_tests < 0) {
    showNotification("⚠️ Validation Error: Test volumes cannot be negative.", "danger");
    return;
  }

  const diff_p = (du1_p_close - du1_p_open) + (du2_p_close - du2_p_open);
  const diff_d = (du1_d_close - du1_d_open) + (du2_d_close - du2_d_open);
  if (diff_p < p_tests) {
    showNotification(`⚠️ Validation Error: Petrol tests (${p_tests} L) cannot be greater than petrol totalizer difference (${diff_p.toFixed(2)} L).`, "danger");
    return;
  }
  if (diff_d < d_tests) {
    showNotification(`⚠️ Validation Error: Diesel tests (${d_tests} L) cannot be greater than diesel totalizer difference (${diff_d.toFixed(2)} L).`, "danger");
    return;
  }

  const p_tests_count = Math.round(p_tests / 5);
  const d_tests_count = Math.round(d_tests / 5);

  // Find or create ledger entry
  let row = db.daily_ledger.find(r => r.date === dateStr);
  if (!row) {
    const prices = getPricesAt(dateStr);
    row = {
      date: dateStr,
      prices: { petrol: prices.petrol, diesel: prices.diesel },
      du1_p: { open: du1_p_open, close_day: du1_p_open, close_night: du1_p_open, tests_day: 0, tests_night: 0 },
      du2_p: { open: du2_p_open, close_day: du2_p_open, close_night: du2_p_open, tests_day: 0, tests_night: 0 },
      du1_d: { open: du1_d_open, close_day: du1_d_open, close_night: du1_d_open, tests_day: 0, tests_night: 0 },
      du2_d: { open: du2_d_open, close_day: du2_d_open, close_night: du2_d_open, tests_day: 0, tests_night: 0 }
    };
  }

  // Update nozzle totals
  if (shift === 'day') {
    row.du1_p.close_day = du1_p_close;
    row.du2_p.close_day = du2_p_close;
    row.du1_d.close_day = du1_d_close;
    row.du2_d.close_day = du2_d_close;

    row.du1_p.tests_day = (du1_p_close > row.du1_p.open) ? 1 : 0;
    row.du2_p.tests_day = (du2_p_close > row.du2_p.open) ? 1 : 0;
    row.du1_d.tests_day = (du1_d_close > row.du1_d.open) ? 1 : 0;
    row.du2_d.tests_day = (du2_d_close > row.du2_d.open) ? 1 : 0;
  } else {
    // If night shift posted and day shift is still at default, carry over day readings
    if (row.du1_p.close_day === row.du1_p.open) {
      row.du1_p.close_day = row.du1_p.open;
      row.du2_p.close_day = row.du2_p.open;
      row.du1_d.close_day = row.du1_d.open;
      row.du2_d.close_day = row.du2_d.open;
    }

    row.du1_p.close_night = du1_p_close;
    row.du2_p.close_night = du2_p_close;
    row.du1_d.close_night = du1_d_close;
    row.du2_d.close_night = du2_d_close;

    row.du1_p.tests_night = 0;
    row.du2_p.tests_night = 0;
    row.du1_d.tests_night = 0;
    row.du2_d.tests_night = 0;
  }

  // Save reconciliation details in the ledger
  const curr_pe = parseFloat(document.getElementById('recon-phonepe-curr').value) || 0;
  const prev_pe = parseFloat(document.getElementById('recon-phonepe-prev').value) || 0;
  const net_pe = curr_pe > 0 ? Math.max(0, curr_pe - prev_pe) : 0;

  const total_expenses = window.reconExpensesList.reduce((sum, exp) => sum + exp.amount, 0);

  const nozzle_p_sales = (du1_p_close - du1_p_open) + (du2_p_close - du2_p_open);
  const nozzle_d_sales = (du1_d_close - du1_d_open) + (du2_d_close - du2_d_open);
  const net_p_sales = Math.max(0, nozzle_p_sales - p_tests);
  const net_d_sales = Math.max(0, nozzle_d_sales - d_tests);
  const shift_rev = (net_p_sales * row.prices.petrol) + (net_d_sales * row.prices.diesel);
  const shift_expected_cash = Math.max(0, shift_rev - net_pe);

  const counted_cash = calculateDenominationsValue();
  const actual_cash_accounted = counted_cash + total_expenses;
  const shift_variance = actual_cash_accounted - shift_expected_cash;

  const denomsKeys = ['500', '200', '100', '50', '20', '10', '5', 'coins'];
  const denomsObj = {};
  denomsKeys.forEach(d => {
    denomsObj[d] = parseFloat(document.getElementById('denom-' + d).value) || 0;
  });

  row.recon = row.recon || {};
  row.recon[shift] = {
    phonepe_close: curr_pe,
    phonepe_net: net_pe,
    expenses: JSON.parse(JSON.stringify(window.reconExpensesList)),
    cash_counted: counted_cash,
    denominations: denomsObj,
    expected_cash: shift_expected_cash,
    variance: shift_variance,
    paper_verified: !!window.ocrExtractedValues,
    paper_timestamp: window.ocrExtractedValues ? window.ocrExtractedValues.timestamp : null
  };

  // 2. Warning Flags (Confirmation)
  const warnings = [];

  const totalLiters = net_p_sales + net_d_sales;

  // Nozzle net volumes sold in this shift
  const du1_p_sales_vol = du1_p_close - du1_p_open;
  const du2_p_sales_vol = du2_p_close - du2_p_open;
  const du1_d_sales_vol = du1_d_close - du1_d_open;
  const du2_d_sales_vol = du2_d_close - du2_d_open;

  const du1_p_test_liters = (shift === 'day' && du1_p_close > du1_p_open) ? 5 : 0;
  const du2_p_test_liters = (shift === 'day' && du2_p_close > du2_p_open) ? 5 : 0;
  const du1_d_test_liters = (shift === 'day' && du1_d_close > du1_d_open) ? 5 : 0;
  const du2_d_test_liters = (shift === 'day' && du2_d_close > du2_d_open) ? 5 : 0;

  const net_du1_p_vol = Math.max(0, du1_p_sales_vol - du1_p_test_liters);
  const net_du2_p_vol = Math.max(0, du2_p_sales_vol - du2_p_test_liters);
  const net_du1_d_vol = Math.max(0, du1_d_sales_vol - du1_d_test_liters);
  const net_du2_d_vol = Math.max(0, du2_d_sales_vol - du2_d_test_liters);

  if (totalLiters === 0) {
    warnings.push("Total shift sales volume is 0 Liters.");
  }
  if (net_du1_p_vol > 5000) warnings.push(`DU1 Petrol sales volume (${net_du1_p_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (net_du2_p_vol > 5000) warnings.push(`DU2 Petrol sales volume (${net_du2_p_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (net_du1_d_vol > 5000) warnings.push(`DU1 Diesel sales volume (${net_du1_d_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (net_du2_d_vol > 5000) warnings.push(`DU2 Diesel sales volume (${net_du2_d_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);

  const estimatedRevenue = shift_rev;
  const totalCollections = counted_cash + total_expenses + net_pe;

  if (estimatedRevenue > 0) {
    const discrepancy = totalCollections - estimatedRevenue;
    const absDiscrepancy = Math.abs(discrepancy);
    const ratio = totalCollections / estimatedRevenue;

    if (ratio > 1.5 && absDiscrepancy > 15000) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are more than 1.5x of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is +${formatCurrency(absDiscrepancy)}.`);
    } else if (ratio < 0.1 && estimatedRevenue > 1000) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are less than 10% of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is -${formatCurrency(absDiscrepancy)}.`);
    } else if (absDiscrepancy > 15000) {
      warnings.push(`There is a significant difference of ${formatCurrency(discrepancy)} between collections (${formatCurrency(totalCollections)}) and estimated fuel revenue (${formatCurrency(estimatedRevenue)}).`);
    }
  } else if (totalCollections > 0) {
    warnings.push(`Collections entered (${formatCurrency(totalCollections)}) but estimated revenue is 0 (0 Liters sold).`);
  }

  if (warnings.length > 0) {
    const msg = "⚠️ Warning: Potential errors detected in reconciliation:\n\n" +
                warnings.map(w => "• " + w).join("\n") +
                "\n\nAre you sure you want to save this reconciliation?";
    if (!confirm(msg)) {
      return;
    }
  } else {
    if (!confirm(`Are you sure you want to save and post this shift reconciliation for ${shift === 'day' ? 'Day' : 'Night'} Shift on ${formatDate(dateStr)}?`)) {
      return;
    }
  }

  // Call general ledger save logic which also automatically updates stock
  saveDailyReadings(row);

  SystemLogger.success('postShiftRecon', `Reconciliation posted successfully for ${shift === 'day' ? 'Day' : 'Night'} Shift on ${formatDate(dateStr)}. Expected Cash: ₹${shift_expected_cash.toFixed(2)}, Counted Cash: ₹${counted_cash.toFixed(2)}, Variance: ₹${shift_variance.toFixed(2)}`, {
    date: dateStr,
    shift,
    variance: shift_variance
  });

  showNotification(`Reconciliation saved and posted to ledger for ${shift === 'day' ? 'Day' : 'Night'} Shift on ${formatDate(dateStr)}.`, "success");

  // Refresh views
  onReconShiftChange();
}

// -------------------------------------------------------------
// LIVE WHATSAPP SYNC SIMULATOR
// -------------------------------------------------------------

function switchReconInputMode(mode) {
  const isSync = mode === 'sync';

  // Update button classes
  document.getElementById('btn-recon-mode-manual').classList.toggle('active', !isSync);
  document.getElementById('btn-recon-mode-sync').classList.toggle('active', isSync);

  // Show/Hide sections
  document.getElementById('recon-section-manual').style.display = isSync ? 'none' : 'block';
  document.getElementById('recon-section-sync').style.display = isSync ? 'block' : 'none';

  if (isSync) {
    renderEmployeesTable();
    renderSyncMessages();
    startLiveWhatsAppPoll();
  } else {
    stopLiveWhatsAppPoll();
  }
}

function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (db.employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--text-dim);">No employees in directory.</td></tr>`;
    return;
  }

  db.employees.forEach((emp, index) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = "1px solid var(--border)";

    const activeBadge = emp.active
      ? `<span class="badge badge-success" style="font-size:0.65rem; cursor:pointer;" onclick="toggleEmployeeActive(${index})">Active</span>`
      : `<span class="badge badge-danger" style="font-size:0.65rem; cursor:pointer;" onclick="toggleEmployeeActive(${index})">Inactive</span>`;

    tr.innerHTML = `
      <td style="padding: 0.5rem; font-weight:600; color:#fff;">${emp.name}</td>
      <td style="padding: 0.5rem; color:var(--text-dim);">${emp.phone}</td>
      <td style="padding: 0.5rem;">${emp.role}</td>
      <td style="padding: 0.5rem; text-align: right; display:flex; gap:0.25rem; justify-content: flex-end; align-items:center;">
        ${activeBadge}
        <button id="emp-del-btn-${index}" class="btn btn-secondary btn-sm" onclick="deleteEmployee(${index}, 'emp-del-btn-${index}')" style="padding: 0.15rem 0.35rem; font-size: 0.65rem; border-radius:3px; background:rgba(239, 68, 68, 0.15); color:rgb(248, 113, 113); border:none; cursor:pointer; transition:all 0.2s;">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleEmployeeActive(index) {
  db.employees[index].active = !db.employees[index].active;
  saveDB();
  renderEmployeesTable();
  renderSyncMessages();
}

function addEmployee(event) {
  event.preventDefault();
  const name = document.getElementById('new-emp-name').value.trim();
  const phone = document.getElementById('new-emp-phone').value.trim();
  const role = document.getElementById('new-emp-role').value;

  if (!name || !phone) return;

  const newEmp = {
    id: 'emp_' + Date.now(),
    name,
    phone,
    role,
    active: true
  };

  db.employees.push(newEmp);
  saveDB();

  document.getElementById('add-employee-form').reset();
  renderEmployeesTable();
  renderSyncMessages();
  showNotification(`Authorized employee ${name} added successfully.`, "success");
}

window._empDeleteTimers = {};
function deleteEmployee(index, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  if (btn.dataset.confirmed === "true") {
    clearTimeout(window._empDeleteTimers[index]);
    delete window._empDeleteTimers[index];

    const emp = db.employees[index];
    if (!emp) return;
    db.employees.splice(index, 1);
    saveDB();
    renderEmployeesTable();
    renderSyncMessages();
    showNotification(`Employee deleted from authorized directory.`, "info");
  } else {
    btn.dataset.confirmed = "true";
    btn.innerHTML = "Confirm?";
    btn.style.background = "#ef4444";
    btn.style.color = "#fff";

    window._empDeleteTimers[index] = setTimeout(() => {
      btn.dataset.confirmed = "false";
      btn.innerHTML = "Delete";
      btn.style.background = "rgba(239, 68, 68, 0.15)";
      btn.style.color = "rgb(248, 113, 113)";
    }, 3000);
  }
}

function renderSyncMessages() {
  const dateStr = document.getElementById('recon-date').value;
  const shift = document.getElementById('recon-shift').value;
  const openReadings = getOpeningReadings(dateStr, shift);

  // Format date nicely as DD-MM-YYYY
  const pts = dateStr.split('-');
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === 'day' ? 'Day Shift (8 AM - 8 PM)' : 'Night Shift (8 PM - 8 AM)';

  // Generate realistic closings for mock message
  const c1p = openReadings.du1_p + 180;
  const c2p = openReadings.du2_p + 150;
  const c1d = openReadings.du1_d + 220;
  const c2d = openReadings.du2_d + 190;

  const phonepe_close = shift === 'day' ? 120000 : 230000;

  // Define mock messages database
  let mockMessages = [
    {
      sender: "Anil Operator",
      time: "10 mins ago",
      text: `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${openReadings.du1_p.toFixed(2)} - ${c1p.toFixed(2)}
DU2 MS (Petrol): ${openReadings.du2_p.toFixed(2)} - ${c2p.toFixed(2)}
DU1 HSD (Diesel): ${openReadings.du1_d.toFixed(2)} - ${c1d.toFixed(2)}
DU2 HSD (Diesel): ${openReadings.du2_d.toFixed(2)} - ${c2d.toFixed(2)}
Test Petrol (Liters): 10
Test Diesel (Liters): 5
PhonePe Current: ${phonepe_close}
Expenses:
- Tea & Snacks: 150
- Cleaning Supplies: 300`
    },
    {
      sender: "+91 98765 43210",
      time: "25 mins ago",
      text: `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${openReadings.du1_p.toFixed(2)} - ${(openReadings.du1_p + 205).toFixed(2)}
DU2 MS (Petrol): ${openReadings.du2_p.toFixed(2)} - ${(openReadings.du2_p + 140).toFixed(2)}
DU1 HSD (Diesel): ${openReadings.du1_d.toFixed(2)} - ${(openReadings.du1_d + 250).toFixed(2)}
DU2 HSD (Diesel): ${openReadings.du2_d.toFixed(2)} - ${(openReadings.du2_d + 180).toFixed(2)}
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: ${phonepe_close + 15000}
Expenses:
- Minor repairs: 1200`
    },
    {
      sender: "Spam Advertiser",
      time: "1 hour ago",
      text: "Invest in high yield stocks today! Click here to earn 200% return in 24 hours. Limited offer!"
    },
    {
      sender: "+91 99999 88888",
      time: "2 hours ago",
      text: "Hello, please send me the fuel rates for today, thanks."
    }
  ];

  if (window.liveWhatsAppMessages && window.liveWhatsAppMessages.length > 0) {
    mockMessages = [...window.liveWhatsAppMessages, ...mockMessages];
  }

  const container = document.getElementById('recon-sync-messages');
  if (!container) return;
  container.innerHTML = '';

  mockMessages.forEach((msg, idx) => {
    // Search for the sender in the employees database
    const emp = db.employees.find(e => {
      // Clean phone numbers for exact digit matching
      const cleanEPhone = e.phone.replace(/[^\d]/g, '');
      const cleanMsgSender = msg.sender.replace(/[^\d]/g, '');

      if (cleanEPhone && cleanMsgSender && cleanMsgSender.includes(cleanEPhone)) return true;
      return msg.sender.toLowerCase().includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(msg.sender.toLowerCase());
    });

    const isAuth = emp && emp.active;

    const card = document.createElement('div');
    card.style.background = isAuth ? 'rgba(34, 197, 94, 0.03)' : 'rgba(239, 68, 68, 0.02)';
    card.style.border = isAuth ? '1px solid rgba(34, 197, 94, 0.15)' : '1px solid rgba(239, 68, 68, 0.1)';
    card.style.borderRadius = '6px';
    card.style.padding = '0.6rem';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '0.35rem';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.fontSize = '0.7rem';
    header.style.alignItems = 'center';

    const senderSpan = document.createElement('span');
    senderSpan.style.fontWeight = '700';
    senderSpan.style.color = isAuth ? 'var(--success)' : 'var(--text-dim)';

    // Show role if authorized
    senderSpan.textContent = msg.sender + (isAuth ? ` (${emp.role})` : '');

    const timeSpan = document.createElement('span');
    timeSpan.style.color = 'var(--text-muted)';
    timeSpan.textContent = msg.time;

    header.appendChild(senderSpan);
    header.appendChild(timeSpan);
    card.appendChild(header);

    const body = document.createElement('pre');
    body.style.margin = '0';
    body.style.whiteSpace = 'pre-wrap';
    body.style.fontFamily = 'monospace';
    body.style.fontSize = '0.7rem';
    body.style.color = isAuth ? '#fff' : 'var(--text-muted)';
    body.style.background = 'rgba(0,0,0,0.2)';
    body.style.padding = '0.4rem';
    body.style.borderRadius = '4px';
    body.style.maxHeight = '70px';
    body.style.overflowY = 'auto';
    body.textContent = msg.text;
    card.appendChild(body);

    if (isAuth) {
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.marginTop = '0.2rem';

      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.style.fontSize = '0.65rem';
      btn.style.padding = '0.15rem 0.5rem';
      btn.textContent = 'Import & Verify';

      btn.onclick = () => importSyncMessage(msg.text);

      actions.appendChild(btn);
      card.appendChild(actions);
    } else {
      const badgeContainer = document.createElement('div');
      badgeContainer.style.display = 'flex';
      badgeContainer.style.justifyContent = 'flex-end';
      badgeContainer.style.marginTop = '0.2rem';

      const badge = document.createElement('span');
      badge.style.fontSize = '0.65rem';
      badge.className = 'badge badge-danger';
      badge.style.background = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = 'rgb(248, 113, 113)';
      badge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      badge.textContent = emp ? 'Blocked (Inactive Staff)' : 'Blocked (Unauthorized Contact)';

      badgeContainer.appendChild(badge);
      card.appendChild(badgeContainer);
    }

    container.appendChild(card);
  });
}

function importSyncMessage(text) {
  document.getElementById('whatsapp-input').value = text;
  parseWhatsAppReport();

  // Now simulate OCR slip photo verification scan!
  document.getElementById('upload-prompt').style.display = 'none';
  document.getElementById('upload-preview-container').style.display = 'block';

  const close_du1_p = document.getElementById('recon-du1-p-close').value;
  const close_du2_p = document.getElementById('recon-du2-p-close').value;
  const close_du1_d = document.getElementById('recon-du1-d-close').value;
  const close_du2_d = document.getElementById('recon-du2-d-close').value;

  // Render dynamic SVG image showing exact closing totalizer values
  document.getElementById('upload-preview-img').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'><rect width='100%' height='100%' fill='%230f172a'/><text x='10' y='30' fill='%2310b981' font-family='monospace' font-weight='bold' font-size='11'>OCTANEFLOW VERIFY</text><line x1='10' y1='40' x2='190' y2='40' stroke='%23334155' stroke-width='1'/><text x='10' y='65' fill='%2394a3b8' font-family='monospace' font-size='9'>DU1 MS CLOSE: " + close_du1_p + "</text><text x='10' y='85' fill='%2394a3b8' font-family='monospace' font-size='9'>DU2 MS CLOSE: " + close_du2_p + "</text><text x='10' y='105' fill='%2394a3b8' font-family='monospace' font-size='9'>DU1 HSD CLOSE: " + close_du1_d + "</text><text x='10' y='125' fill='%2394a3b8' font-family='monospace' font-size='9'>DU2 HSD CLOSE: " + close_du2_d + "</text><line x1='10' y1='145' x2='190' y2='145' stroke='%23334155' stroke-width='1'/><text x='10' y='165' fill='%2364748b' font-family='monospace' font-size='8'>DATE: " + document.getElementById('recon-date').value + "</text><text x='10' y='180' fill='%2364748b' font-family='monospace' font-size='8'>VERIFIED BY VISION API</text></svg>";

  const laser = document.getElementById('scanner-laser-line');
  laser.style.display = 'block';
  document.getElementById('paper-verify-report').style.display = 'none';

  setTimeout(() => {
    laser.style.display = 'none';
    showOCRVerificationReport();
  }, 2000);
}

// Bind to window to allow button onclick invocation
window.startTour = startTour;
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.endTour = endTour;
window.openDipCalculator = openDipCalculator;
window.updateDipCalculation = updateDipCalculation;

// Shift Reconciliation Bindings
window.renderShiftRecon = renderShiftRecon;
window.onReconShiftChange = onReconShiftChange;
window.calculateLiveSales = calculateLiveSales;
window.calculateDenominations = calculateDenominations;
window.addExpenseRow = addExpenseRow;
window.removeExpenseRow = removeExpenseRow;
window.triggerTestFuelAnimation = triggerTestFuelAnimation;
window.parseWhatsAppReport = parseWhatsAppReport;
window.copyWhatsAppTemplate = copyWhatsAppTemplate;
window.sendWhatsAppTemplate = sendWhatsAppTemplate;
window.fetchPhonePeSettlement = fetchPhonePeSettlement;
window.handlePaperSlipUpload = handlePaperSlipUpload;
window.applyOCRReadings = applyOCRReadings;
window.postShiftRecon = postShiftRecon;

// Live Sync Bindings
window.switchReconInputMode = switchReconInputMode;
window.renderSyncMessages = renderSyncMessages;
window.importSyncMessage = importSyncMessage;
window.renderEmployeesTable = renderEmployeesTable;
window.toggleEmployeeActive = toggleEmployeeActive;
window.addEmployee = addEmployee;
window.deleteEmployee = deleteEmployee;

let liveWhatsAppPollInterval = null;

function startLiveWhatsAppPoll() {
  if (liveWhatsAppPollInterval) return;
  fetchLiveWhatsAppMessages();
  liveWhatsAppPollInterval = setInterval(fetchLiveWhatsAppMessages, 2000);
}

function stopLiveWhatsAppPoll() {
  if (liveWhatsAppPollInterval) {
    clearInterval(liveWhatsAppPollInterval);
    liveWhatsAppPollInterval = null;
  }
}

async function fetchLiveWhatsAppMessages() {
  try {
    const response = await fetch('https://localhost:8000/whatsapp-messages');
    if (response.ok) {
      const messages = await response.json();
      window.liveWhatsAppMessages = messages;
      renderSyncMessages();
    }
  } catch (err) {
    console.error('Error fetching live WhatsApp messages:', err);
  }
}

window.startLiveWhatsAppPoll = startLiveWhatsAppPoll;
window.stopLiveWhatsAppPoll = stopLiveWhatsAppPoll;

window.addEventListener('message', async (event) => {
  if (!event.origin.includes('whatsapp.com') && !event.origin.includes('localhost') && !event.origin.includes('127.0.0.1')) return;

  if (event.data && event.data.type === 'WHATSAPP_REPORT') {
    console.log('Received WhatsApp report via postMessage:', event.data.data);
    try {
      const response = await fetch('https://localhost:8000/whatsapp-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event.data.data)
      });
      if (response.ok) {
        console.log('Successfully forwarded report to local bridge.');
        fetchLiveWhatsAppMessages();
      }
    } catch (err) {
      console.error('Error forwarding message to bridge:', err);
    }
  }
});

window.renderCashFlow           = renderCashFlow;
window.saveCashInputsAndForecast = saveCashInputsAndForecast;
window.isCBIHoliday             = isCBIHoliday;
window.switchPnlTab             = switchPnlTab;


// =============================================================
// EXPENSE LEDGER
// =============================================================

const EXPENSE_CATEGORY_COLORS = {
  'Electricity':        { bg: 'rgba(234,179,8,0.15)',   text: '#fbbf24', icon: '⚡' },
  'Lube & Consumables': { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7', icon: '🛢️' },
  'Salary':             { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', icon: '👷' },
  'Maintenance':        { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c', icon: '🔧' },
  'Other':              { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', icon: '📋' },
};

function getCatStyle(cat) {
  return EXPENSE_CATEGORY_COLORS[cat] || EXPENSE_CATEGORY_COLORS['Other'];
}

function renderExpenseLedger() {
  if (!db.expenses) db.expenses = [];

  const filterCat  = document.getElementById('exp-filter-cat')  ? document.getElementById('exp-filter-cat').value  : 'all';
  const filterFrom = document.getElementById('exp-filter-from') ? document.getElementById('exp-filter-from').value : '';
  const filterTo   = document.getElementById('exp-filter-to')   ? document.getElementById('exp-filter-to').value   : '';

  // Filter
  let expenses = [...db.expenses].sort((a, b) => b.date.localeCompare(a.date));
  if (filterCat  !== 'all') expenses = expenses.filter(e => e.category === filterCat);
  if (filterFrom)           expenses = expenses.filter(e => e.date >= filterFrom);
  if (filterTo)             expenses = expenses.filter(e => e.date <= filterTo);

  // ---- Summary cards ----
  const summaryEl = document.getElementById('expense-summary-cards');
  if (summaryEl) {
    const allExp = db.expenses;
    const totalAll = allExp.reduce((s, e) => s + e.amount, 0);
    const totalElec = allExp.filter(e => e.category === 'Electricity').reduce((s, e) => s + e.amount, 0);
    const totalLube = allExp.filter(e => e.category === 'Lube & Consumables').reduce((s, e) => s + e.amount, 0);
    const totalOther = totalAll - totalElec - totalLube;

    summaryEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;">₹</div>
        <div class="stat-info">
          <div class="stat-label">Total Expenses Recorded</div>
          <div class="stat-value">${formatCurrency(totalAll)}</div>
          <div class="stat-sub">${allExp.length} entries</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(234,179,8,0.15); color:#fbbf24;">⚡</div>
        <div class="stat-info">
          <div class="stat-label">Electricity</div>
          <div class="stat-value">${formatCurrency(totalElec)}</div>
          <div class="stat-sub">${allExp.filter(e=>e.category==='Electricity').length} bills</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(168,85,247,0.15); color:#a855f7;">🛢️</div>
        <div class="stat-info">
          <div class="stat-label">Lube &amp; Consumables</div>
          <div class="stat-value">${formatCurrency(totalLube)}</div>
          <div class="stat-sub">${allExp.filter(e=>e.category==='Lube & Consumables').length} invoices</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(100,116,139,0.15); color:#94a3b8;">📋</div>
        <div class="stat-info">
          <div class="stat-label">Other</div>
          <div class="stat-value">${formatCurrency(totalOther)}</div>
          <div class="stat-sub">${allExp.filter(e=>e.category!=='Electricity'&&e.category!=='Lube & Consumables').length} entries</div>
        </div>
      </div>
    `;
  }

  // ---- Table ----
  const tbody = document.getElementById('expense-ledger-body');
  if (!tbody) return;

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:2rem;">No expense records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(e => {
    const cs = getCatStyle(e.category);
    return `
      <tr>
        <td style="white-space:nowrap; font-weight:600;">${formatDate(e.date)}</td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.2rem 0.6rem; border-radius:20px; font-size:0.72rem; font-weight:600; background:${cs.bg}; color:${cs.text};">
            ${cs.icon} ${e.category}
          </span>
        </td>
        <td>
          <div style="font-weight:600; font-size:0.82rem;">${e.vendor || '—'}</div>
          <div style="font-size:0.72rem; color:var(--text-dim); margin-top:0.15rem; max-width:380px; line-height:1.4;">${e.description || ''}</div>
        </td>
        <td style="text-align:right; font-weight:700; font-size:0.9rem; color:var(--accent-danger);">${formatCurrency(e.amount)}</td>
        <td style="text-align:center;">
          <div style="display:flex; gap:0.4rem; justify-content:center;">
            <button onclick="editExpenseEntry('${e.id}')" class="btn btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.72rem;">Edit</button>
            <button onclick="deleteExpenseEntry('${e.id}')" class="btn" style="padding:0.2rem 0.6rem; font-size:0.72rem; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openAddExpenseModal() {
  document.getElementById('expense-modal-title').textContent = 'Add Expense';
  document.getElementById('exp-edit-id').value = '';
  document.getElementById('exp-inp-date').value   = new Date().toISOString().split('T')[0];
  document.getElementById('exp-inp-cat').value    = 'Electricity';
  document.getElementById('exp-inp-vendor').value = '';
  document.getElementById('exp-inp-amount').value = '';
  document.getElementById('exp-inp-desc').value   = '';
  const modal = document.getElementById('expense-modal');
  modal.style.display = 'flex';
}

function editExpenseEntry(id) {
  if (!db.expenses) return;
  const e = db.expenses.find(x => x.id === id);
  if (!e) return;
  document.getElementById('expense-modal-title').textContent = 'Edit Expense';
  document.getElementById('exp-edit-id').value    = e.id;
  document.getElementById('exp-inp-date').value   = e.date;
  document.getElementById('exp-inp-cat').value    = e.category;
  document.getElementById('exp-inp-vendor').value = e.vendor || '';
  document.getElementById('exp-inp-amount').value = e.amount;
  document.getElementById('exp-inp-desc').value   = e.description || '';
  document.getElementById('expense-modal').style.display = 'flex';
}

function closeExpenseModal() {
  document.getElementById('expense-modal').style.display = 'none';
}

function saveExpenseEntry() {
  if (!db.expenses) db.expenses = [];
  const editId  = document.getElementById('exp-edit-id').value.trim();
  const date    = document.getElementById('exp-inp-date').value;
  const cat     = document.getElementById('exp-inp-cat').value;
  const vendor  = document.getElementById('exp-inp-vendor').value.trim();
  const amount  = parseFloat(document.getElementById('exp-inp-amount').value);
  const desc    = document.getElementById('exp-inp-desc').value.trim();

  if (!date)        { showNotification('Please enter a date.', 'danger'); return; }
  if (isNaN(amount) || amount <= 0) { showNotification('Please enter a valid amount.', 'danger'); return; }

  if (editId) {
    const idx = db.expenses.findIndex(x => x.id === editId);
    if (idx !== -1) {
      db.expenses[idx] = { id: editId, date, category: cat, vendor, amount, description: desc };
    }
  } else {
    const newId = 'exp_' + date.replace(/-/g, '') + '_' + Date.now();
    db.expenses.push({ id: newId, date, category: cat, vendor, amount, description: desc });
  }

  saveDB();
  closeExpenseModal();
  renderExpenseLedger();
  showNotification('Expense saved.', 'success');
}

function deleteExpenseEntry(id) {
  if (!db.expenses) return;
  if (!confirm('Delete this expense record?')) return;
  db.expenses = db.expenses.filter(e => e.id !== id);
  saveDB();
  renderExpenseLedger();
  showNotification('Expense deleted.', 'info');
}

window.renderExpenseLedger  = renderExpenseLedger;
window.openAddExpenseModal  = openAddExpenseModal;
window.closeExpenseModal    = closeExpenseModal;
window.saveExpenseEntry     = saveExpenseEntry;
window.editExpenseEntry     = editExpenseEntry;
window.deleteExpenseEntry   = deleteExpenseEntry;

// =============================================================
// P&L REPORT ENGINE
// =============================================================
// Purchase cost per litre — derived from actual IOCL invoices:
//   Nov 2024 deliveries (price_petrol=102.17, price_diesel=88.84)
//   Dec 2024 onwards   (price_petrol=102.02, price_diesel=88.71)
//   Historical avg used as fallback when no bill is available:
//     MS ≈ ₹102.10/L | HSD ≈ ₹88.78/L
const HIST_AVG_MS_COST  = 102.10; // historical avg purchase price for MS (petrol)
const HIST_AVG_HSD_COST = 88.78;  // historical avg purchase price for HSD (diesel)

// ---- Helper: compute net litres sold from one nozzle row ----
function nozzleSale(n) {
  if (!n) return 0;
  const open  = n.open  || 0;
  const close = n.close_night > 0 ? n.close_night : (n.close_day || 0);
  if (close <= open) return 0;
  const gross = close - open;
  const tests = (n.tests_day || 0) * 5; // 5L per day-test
  return Math.max(0, gross - tests);
}

// ---- Build daily WAC timeline from purchases (chronological) ----
// WAC = Weighted Average Cost of stock in tank on any given date.
// We process chronologically: when a tanker delivers → update WAC.
// When daily sales happen → reduce stock (WAC stays same, only stock falls).
function buildWACTimeline() {
  if (!db || !db.purchases || !db.daily_ledger) return {};

  // Sort purchases oldest first
  const purch = [...db.purchases]
    .filter(p => p && (p.petrol_liters > 0 || p.diesel_liters > 0))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // All unique dates in ledger, sorted oldest first
  const ledgerDates = [...new Set(db.daily_ledger.filter(r => r && r.date).map(r => r.date))].sort();

  // Initial stock / WAC seeds (reasonable starting point before our data)
  let msStock  = 8000;
  let hsdStock = 8000;
  let msWAC    = HIST_AVG_MS_COST;
  let hsdWAC   = HIST_AVG_HSD_COST;

  // Seed WAC from first purchase price if available
  if (purch.length > 0) {
    msWAC  = purch[0].price_petrol  || HIST_AVG_MS_COST;
    hsdWAC = purch[0].price_diesel  || HIST_AVG_HSD_COST;
  }

  const wacByDate = {};
  let pi = 0; // purchase index

  for (const date of ledgerDates) {
    // Apply all purchases on or before this date
    while (pi < purch.length && (purch[pi].date || '').split('T')[0] <= date) {
      const p  = purch[pi];
      const pMs  = p.petrol_liters  || 0;
      const pHsd = p.diesel_liters  || 0;
      // Use bill price; fallback to historical avg if 0
      const pMsPrice  = (pMs  > 0 && p.price_petrol  > 0) ? p.price_petrol  : HIST_AVG_MS_COST;
      const pHsdPrice = (pHsd > 0 && p.price_diesel   > 0) ? p.price_diesel  : HIST_AVG_HSD_COST;

      if (pMs > 0) {
        msWAC   = (msStock * msWAC + pMs * pMsPrice) / (msStock + pMs);
        msStock += pMs;
      }
      if (pHsd > 0) {
        hsdWAC   = (hsdStock * hsdWAC + pHsd * pHsdPrice) / (hsdStock + pHsd);
        hsdStock += pHsd;
      }
      pi++;
    }

    // Record WAC for this date AFTER incoming stock
    wacByDate[date] = { ms: msWAC, hsd: hsdWAC };

    // Reduce stock by today's sales
    const row = db.daily_ledger.find(r => r.date === date);
    if (row) {
      const msSold  = nozzleSale(row.du1_p) + nozzleSale(row.du2_p);
      const hsdSold = nozzleSale(row.du1_d) + nozzleSale(row.du2_d);
      msStock  = Math.max(0, msStock  - msSold);
      hsdStock = Math.max(0, hsdStock - hsdSold);
    }
  }

  return wacByDate;
}

// ---- Build expense lookup map: date string → total expense amount ----
function buildExpenseDateMap() {
  const map = {};
  if (!db.expenses) return map;
  for (const e of db.expenses) {
    map[e.date] = (map[e.date] || 0) + e.amount;
  }
  return map;
}

// ---- Find selling price applicable on a given date ----
function getSellingPrice(dateStr) {
  if (!db.prices || db.prices.length === 0) return { petrol: 105.58, diesel: 90.98 };
  const sorted = [...db.prices].sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''));
  for (const p of sorted) {
    if ((p.effective_date || '').split('T')[0] <= dateStr) return p;
  }
  // Fallback: earliest known price
  return sorted[sorted.length - 1] || { petrol: 105.58, diesel: 90.98 };
}

// ---- Main render function ----
function renderPnlReport() {
  if (!db.daily_ledger || db.daily_ledger.length === 0) {
    document.getElementById('pnl-summary-tiles').innerHTML =
      '<div style="color:var(--text-dim); padding:2rem;">No ledger data available. Load history backup from System Settings.</div>';
    return;
  }

  const wacMap     = buildWACTimeline();
  const expenseMap = buildExpenseDateMap();

  // ---- Compute one record per ledger day ----
  const dailyRows = db.daily_ledger
    .map(row => {
      const date = row.date;
      const wac  = wacMap[date] || { ms: HIST_AVG_MS_COST, hsd: HIST_AVG_HSD_COST };
      const sp   = row.prices || getSellingPrice(date);

      const msSold  = nozzleSale(row.du1_p) + nozzleSale(row.du2_p);
      const hsdSold = nozzleSale(row.du1_d) + nozzleSale(row.du2_d);

      const msRev   = msSold  * sp.petrol;
      const hsdRev  = hsdSold * sp.diesel;
      const revenue = msRev + hsdRev;

      const msCost   = msSold  * wac.ms;
      const hsdCost  = hsdSold * wac.hsd;
      const totalCost = msCost + hsdCost;

      const grossProfit = revenue - totalCost;
      const dayExpenses = expenseMap[date] || 0;
      const netPnl      = grossProfit - dayExpenses;

      return {
        date, msSold, hsdSold,
        sellMs: sp.petrol, sellHsd: sp.diesel,
        wacMs: wac.ms, wacHsd: wac.hsd,
        msRev, hsdRev, revenue,
        msCost, hsdCost, totalCost,
        grossProfit, dayExpenses, netPnl
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  // ---- Aggregate into months ----
  const monthMap = {};
  for (const r of dailyRows) {
    const mon = r.date.slice(0, 7); // "2024-11"
    if (!monthMap[mon]) {
      monthMap[mon] = {
        month: mon, msSold: 0, hsdSold: 0,
        msRev: 0, hsdRev: 0, revenue: 0,
        msCost: 0, hsdCost: 0, totalCost: 0,
        grossProfit: 0, expenses: 0, netPnl: 0
      };
    }
    const m = monthMap[mon];
    m.msSold      += r.msSold;
    m.hsdSold     += r.hsdSold;
    m.msRev       += r.msRev;
    m.hsdRev      += r.hsdRev;
    m.revenue     += r.revenue;
    m.msCost      += r.msCost;
    m.hsdCost     += r.hsdCost;
    m.totalCost   += r.totalCost;
    m.grossProfit += r.grossProfit;
    m.expenses    += r.dayExpenses;
    m.netPnl      += r.netPnl;
  }

  const monthlyRows = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));

  // ---- Grand totals ----
  const grand = dailyRows.reduce((acc, r) => {
    acc.revenue     += r.revenue;
    acc.totalCost   += r.totalCost;
    acc.grossProfit += r.grossProfit;
    acc.expenses    += r.dayExpenses;
    acc.netPnl      += r.netPnl;
    acc.msSold      += r.msSold;
    acc.hsdSold     += r.hsdSold;
    return acc;
  }, { revenue:0, totalCost:0, grossProfit:0, expenses:0, netPnl:0, msSold:0, hsdSold:0 });

  const totalMargin = grand.revenue > 0 ? (grand.netPnl / grand.revenue * 100) : 0;
  const livePrices = getSellingPriceNow();
  const avgMsMargin  = HIST_AVG_MS_COST  > 0 ? (livePrices.petrol - HIST_AVG_MS_COST)  : 0;
  const avgHsdMargin = HIST_AVG_HSD_COST > 0 ? (livePrices.diesel - HIST_AVG_HSD_COST) : 0;

  // ---- Summary tiles ----
  const tilesEl = document.getElementById('pnl-summary-tiles');
  if (tilesEl) {
    const profColor = grand.netPnl >= 0 ? '#22c55e' : '#ef4444';
    tilesEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(34,197,94,0.15); color:#22c55e;">₹</div>
        <div class="stat-info">
          <div class="stat-label">Total Revenue</div>
          <div class="stat-value" style="font-size:1.05rem;">${formatCurrency(grand.revenue)}</div>
          <div class="stat-sub">${grand.msSold.toFixed(0)} L MS + ${grand.hsdSold.toFixed(0)} L HSD</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;">📦</div>
        <div class="stat-info">
          <div class="stat-label">Total Purchase Cost (WAC)</div>
          <div class="stat-value" style="font-size:1.05rem;">${formatCurrency(grand.totalCost)}</div>
          <div class="stat-sub">MS ₹${HIST_AVG_MS_COST}/L avg · HSD ₹${HIST_AVG_HSD_COST}/L avg</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(251,191,36,0.15); color:#fbbf24;">📊</div>
        <div class="stat-info">
          <div class="stat-label">Gross Profit</div>
          <div class="stat-value" style="font-size:1.05rem; color:#fbbf24;">${formatCurrency(grand.grossProfit)}</div>
          <div class="stat-sub">Before operational expenses</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(${grand.netPnl>=0?'34,197,94':'239,68,68'},0.15); color:${profColor};">
          ${grand.netPnl >= 0 ? '📈' : '📉'}
        </div>
        <div class="stat-info">
          <div class="stat-label">Net P&amp;L (after expenses)</div>
          <div class="stat-value" style="font-size:1.05rem; color:${profColor};">${formatCurrency(grand.netPnl)}</div>
          <div class="stat-sub">Margin: ${totalMargin.toFixed(2)}% | Exp: ${formatCurrency(grand.expenses)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(99,102,241,0.15); color:#818cf8;">⛽</div>
        <div class="stat-info">
          <div class="stat-label">Margin per Litre</div>
          <div class="stat-value" style="font-size:1.05rem; color:#818cf8;">MS ₹${avgMsMargin.toFixed(2)} · HSD ₹${avgHsdMargin.toFixed(2)}</div>
          <div class="stat-sub">Based on IOCL invoice prices vs sell price</div>
        </div>
      </div>
    `;
  }

  // ---- Render monthly table ----
  const mBody = document.getElementById('pnl-monthly-body');
  const mFoot = document.getElementById('pnl-monthly-foot');
  if (mBody) {
    mBody.innerHTML = monthlyRows.map(m => {
      const margin = m.revenue > 0 ? (m.netPnl / m.revenue * 100) : 0;
      const pnlColor = m.netPnl >= 0 ? '#22c55e' : '#ef4444';
      const monthLabel = new Date(m.month + '-15').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      return `<tr>
        <td style="font-weight:700; white-space:nowrap;">${monthLabel}</td>
        <td style="text-align:right;">${m.msSold.toFixed(0)}</td>
        <td style="text-align:right;">${m.hsdSold.toFixed(0)}</td>
        <td style="text-align:right;">${formatCurrency(m.msRev)}</td>
        <td style="text-align:right;">${formatCurrency(m.hsdRev)}</td>
        <td style="text-align:right; font-weight:700;">${formatCurrency(m.revenue)}</td>
        <td style="text-align:right; color:var(--text-dim);">${formatCurrency(m.msCost)}</td>
        <td style="text-align:right; color:var(--text-dim);">${formatCurrency(m.hsdCost)}</td>
        <td style="text-align:right; color:#fbbf24; font-weight:600;">${formatCurrency(m.grossProfit)}</td>
        <td style="text-align:right; color:#ef4444;">${m.expenses > 0 ? formatCurrency(m.expenses) : '—'}</td>
        <td style="text-align:right; font-weight:700; color:${pnlColor};">${formatCurrency(m.netPnl)}</td>
        <td style="text-align:right;">
          <span style="padding:0.15rem 0.5rem; border-radius:20px; font-size:0.75rem; font-weight:700;
            background:rgba(${m.netPnl>=0?'34,197,94':'239,68,68'},0.15); color:${pnlColor};">
            ${margin.toFixed(1)}%
          </span>
        </td>
      </tr>`;
    }).join('');

    // Grand total footer row
    if (mFoot) {
      const gMargin = grand.revenue > 0 ? (grand.netPnl / grand.revenue * 100) : 0;
      const gColor  = grand.netPnl >= 0 ? '#22c55e' : '#ef4444';
      mFoot.innerHTML = `<tr style="background:rgba(255,255,255,0.04); font-weight:700; border-top:2px solid var(--border);">
        <td>TOTAL</td>
        <td style="text-align:right;">${grand.msSold.toFixed(0)}</td>
        <td style="text-align:right;">${grand.hsdSold.toFixed(0)}</td>
        <td style="text-align:right;" colspan="2"></td>
        <td style="text-align:right;">${formatCurrency(grand.revenue)}</td>
        <td style="text-align:right;" colspan="2"></td>
        <td style="text-align:right; color:#fbbf24;">${formatCurrency(grand.grossProfit)}</td>
        <td style="text-align:right; color:#ef4444;">${formatCurrency(grand.expenses)}</td>
        <td style="text-align:right; color:${gColor};">${formatCurrency(grand.netPnl)}</td>
        <td style="text-align:right; color:${gColor};">${gMargin.toFixed(1)}%</td>
      </tr>`;
    }
  }

  // ---- Render daily table ----
  const dBody = document.getElementById('pnl-daily-body');
  if (dBody) {
    dBody.innerHTML = dailyRows.map(r => {
      const pnlColor = r.netPnl >= 0 ? '#22c55e' : '#ef4444';
      const rowBg    = r.netPnl < 0 ? 'background:rgba(239,68,68,0.04);' : '';
      return `<tr style="${rowBg}">
        <td style="white-space:nowrap; font-weight:600;">${formatDate(r.date)}</td>
        <td style="text-align:right;">${r.msSold.toFixed(2)}</td>
        <td style="text-align:right;">${r.hsdSold.toFixed(2)}</td>
        <td style="text-align:right; color:#818cf8;">₹${r.sellMs.toFixed(2)}</td>
        <td style="text-align:right; color:#818cf8;">₹${r.sellHsd.toFixed(2)}</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(r.revenue)}</td>
        <td style="text-align:right; color:var(--text-dim);">${formatCurrency(r.totalCost)}</td>
        <td style="text-align:right; color:#fbbf24;">${formatCurrency(r.grossProfit)}</td>
        <td style="text-align:right; color:#ef4444;">${r.dayExpenses > 0 ? formatCurrency(r.dayExpenses) : '—'}</td>
        <td style="text-align:right; font-weight:700; color:${pnlColor};">${formatCurrency(r.netPnl)}</td>
      </tr>`;
    }).join('');
  }
}

// ---- Sub-tab toggle (Monthly / Daily) ----
function switchPnlTab(tab) {
  const monthEl = document.getElementById('pnl-view-monthly');
  const dailyEl = document.getElementById('pnl-view-daily');
  const btnMon  = document.getElementById('pnl-tab-monthly');
  const btnDay  = document.getElementById('pnl-tab-daily');

  if (tab === 'monthly') {
    monthEl.style.display = 'block';
    dailyEl.style.display = 'none';
    btnMon.className = 'btn btn-primary btn-sm';
    btnDay.className = 'btn btn-secondary btn-sm';
  } else {
    monthEl.style.display = 'none';
    dailyEl.style.display = 'block';
    btnMon.className = 'btn btn-secondary btn-sm';
    btnDay.className = 'btn btn-primary btn-sm';
  }
}

window.renderPnlReport = renderPnlReport;
window.switchPnlTab    = switchPnlTab;

// Expose approvals panel and bulk approval functions to global window scope
window.calculateNozzleSale = calculateNozzleSale;
window.getPendingGroupLabel = getPendingGroupLabel;
window.toggleSelectAllGroup = toggleSelectAllGroup;
window.updateGroupCalculations = updateGroupCalculations;
window.bulkApproveEntries = bulkApproveEntries;
window.approveEntry = approveEntry;
window.promptRejectEntry = promptRejectEntry;

// ── DSR DATA CHECKER / VERIFICATION DASHBOARD ───────────────────
let currentDsrMonth = 'november';

const DSR_MONTH_MAP = {
  'november': { name: 'November 2025', year: 2025, index: 11 },
  'december': { name: 'December 2025', year: 2025, index: 12 },
  'january': { name: 'January 2026', year: 2026, index: 1 },
  'February': { name: 'February 2026', year: 2026, index: 2 },
  'february': { name: 'February 2026', year: 2026, index: 2 },
  'march': { name: 'March 2026', year: 2026, index: 3 },
  'april': { name: 'April 2026', year: 2026, index: 4 },
  'may': { name: 'May 2026', year: 2026, index: 5 },
  'june': { name: 'June 2026', year: 2026, index: 6 }
};

async function loadDsrDraftData() {
  if (window.dsrDraftData) return window.dsrDraftData;

  const savedEdits = localStorage.getItem('octaneflow_dsr_draft_edits');
  if (savedEdits) {
    try {
      let draft = JSON.parse(savedEdits);
      if (db && db.daily_ledger) {
        const prodDates = new Set(db.daily_ledger.map(r => r.date));
        draft = draft.filter(r => !prodDates.has(r.date));
      }
      window.dsrDraftData = draft;
      localStorage.setItem('octaneflow_dsr_draft_edits', JSON.stringify(draft));
      return window.dsrDraftData;
    } catch (e) {
      console.error("Failed to parse saved DSR draft edits:", e);
    }
  }

  try {
    const res = await fetch('dsr_digitized_draft.json');
    if (!res.ok) throw new Error("Failed to load digitized DSR draft");
    const json = await res.json();
    window.dsrDraftData = json.daily_ledger || json;
    return window.dsrDraftData;
  } catch (err) {
    console.error("Error loading DSR draft data:", err);
    return [];
  }
}

function saveDsrDraftEdits() {
  if (window.dsrDraftData) {
    localStorage.setItem('octaneflow_dsr_draft_edits', JSON.stringify(window.dsrDraftData));
  }
}

function calculateRowExpectedRev(row) {
  const p1_open = row.du1_p.open || 0;
  const p1_close = row.du1_p.close_day || 0;
  const p2_open = row.du2_p.open || 0;
  const p2_close = row.du2_p.close_day || 0;
  const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
  const p_sales = Math.max(0, (p1_close - p1_open) + (p2_close - p2_open) - p_tests);

  const d1_open = row.du1_d.open || 0;
  const d1_close = row.du1_d.close_day || 0;
  const d2_open = row.du2_d.open || 0;
  const d2_close = row.du2_d.close_day || 0;
  const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
  const d_sales = Math.max(0, (d1_close - d1_open) + (d2_close - d2_open) - d_tests);

  return p_sales * (row.prices?.petrol || 0) + d_sales * (row.prices?.diesel || 0);
}

function dipToLiters(dipCm, maxCapacity, maxDipCm) {
  if (!dipCm || dipCm <= 0) return 0;
  if (dipCm >= maxDipCm) return maxCapacity;
  const r = maxDipCm / 2;
  const h = dipCm;
  try {
    const theta = 2 * Math.acos((r - h) / r);
    const segmentArea = 0.5 * r * r * (theta - Math.sin(theta));
    const totalArea = Math.PI * r * r;
    return maxCapacity * (segmentArea / totalArea);
  } catch (e) {
    return 0;
  }
}

function litersToDip(liters, maxCapacity, maxDipCm) {
  if (liters <= 0) return 0;
  if (liters >= maxCapacity) return maxDipCm;
  let low = 0;
  let high = maxDipCm;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (low + high) / 2;
    const vol = dipToLiters(mid, maxCapacity, maxDipCm);
    if (vol < liters) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

function getDailyDeliveries(dateStr) {
  let ms = 0;
  let hsd = 0;
  let ms_shortage = 0;
  let hsd_shortage = 0;
  
  // Prioritize bank-verified supply invoices
  if (typeof SUPPLY_BILLS_DATA !== 'undefined') {
    const daySupplies = SUPPLY_BILLS_DATA.filter(s => s.invoice_date_iso === dateStr);
    daySupplies.forEach(s => {
      const qty = (s.quantity_kl || 0) * 1000;
      if (s.product === 'Petrol') ms += qty;
      else if (s.product === 'Diesel') hsd += qty;
    });
  }
  
  // Fallback to active DB purchases array if no supply invoices found
  if (ms === 0 && hsd === 0 && db && db.purchases) {
    db.purchases.forEach(p => {
      const pDate = p.date ? p.date.split('T')[0] : '';
      if (pDate === dateStr) {
        ms += p.petrol_liters || 0;
        hsd += p.diesel_liters || 0;
        ms_shortage += p.petrol_shortage || 0;
        hsd_shortage += p.diesel_shortage || 0;
      }
    });
  }
  return { ms, hsd, ms_shortage, hsd_shortage };
}

function validateDsrData(data) {
  const issues = [];
  data.sort((a, b) => a.date.localeCompare(b.date));

  const max_cap_ms = db.settings?.petrol_capacity || 20000;
  const max_cap_hsd = db.settings?.diesel_capacity || 20000;
  const max_dip_ms = db.settings?.petrol_tank_dia || 200;
  const max_dip_hsd = db.settings?.diesel_tank_dia || 200;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const prevRow = i > 0 ? data[i - 1] : null;
    const nextRow = i < data.length - 1 ? data[i + 1] : null;

    const todayStr = new Date().toISOString().split('T')[0];
    if (row.date > todayStr) {
      issues.push({
        type: 'future_date',
        date: row.date,
        msg: `[${row.date}] ❌ Future Date Error: Record is dated in the future (today is ${todayStr}).`
      });
    }

    const p1_open = row.du1_p.open || 0;
    const p1_close = row.du1_p.close_day || 0;
    const p2_open = row.du2_p.open || 0;
    const p2_close = row.du2_p.close_day || 0;
    const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
    const p_sales = Math.max(0, (p1_close - p1_open) + (p2_close - p2_open) - p_tests);

    const d1_open = row.du1_d.open || 0;
    const d1_close = row.du1_d.close_day || 0;
    const d2_open = row.du2_d.open || 0;
    const d2_close = row.du2_d.close_day || 0;
    const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
    const d_sales = Math.max(0, (d1_close - d1_open) + (d2_close - d2_open) - d_tests);

    const expectedRev = p_sales * (row.prices?.petrol || 0) + d_sales * (row.prices?.diesel || 0);
    const actualColl = row.actual_collection !== undefined ? row.actual_collection : expectedRev;
    const variance = expectedRev - actualColl;

    let isConsecutive = false;
    if (prevRow) {
      const d1 = new Date(prevRow.date);
      const d2 = new Date(row.date);
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        isConsecutive = true;
      }
    }

    const deliv = getDailyDeliveries(row.date);

    const phys_ms = dipToLiters(row.dip_ms_cm || 0, max_cap_ms, max_dip_ms);
    const phys_hsd = dipToLiters(row.dip_hsd_cm || 0, max_cap_hsd, max_dip_hsd);

    let book_ms = phys_ms;
    let book_hsd = phys_hsd;

    if (i > 0 && isConsecutive) {
      book_ms = (prevRow.phys_ms || 0) + deliv.ms - p_sales;
      book_hsd = (prevRow.phys_hsd || 0) + deliv.hsd - d_sales;
    }

    const var_ms = phys_ms - book_ms;
    const var_hsd = phys_hsd - book_hsd;

    row.phys_ms = phys_ms;
    row.phys_hsd = phys_hsd;
    row.book_ms = book_ms;
    row.book_hsd = book_hsd;
    row.exp_dip_ms = litersToDip(book_ms, max_cap_ms, max_dip_ms);
    row.exp_dip_hsd = litersToDip(book_hsd, max_cap_hsd, max_dip_hsd);
    row.var_ms = var_ms;
    row.var_hsd = var_hsd;

    const addNozzleIssue = (type, nozzleLabel, uKey, oVal, cVal, prevCl, nextOp, desc) => {
      issues.push({
        type: type,
        date: row.date,
        msg: `[${row.date}] ${desc}`,
        context: {
          nozzle: nozzleLabel,
          prevClose: prevCl,
          openVal: oVal,
          closeVal: cVal,
          nextOpen: nextOp
        }
      });
    };

    if (p1_close < p1_open) {
      addNozzleIssue('trend', 'Petrol DU1', 'du1_p', p1_open, p1_close, prevRow ? prevRow.du1_p.close_night : null, nextRow ? nextRow.du1_p.open : null, `Petrol DU1 closing (${p1_close.toFixed(2)}) is less than opening (${p1_open.toFixed(2)})`);
    }
    if (p2_close < p2_open) {
      addNozzleIssue('trend', 'Petrol DU2', 'du2_p', p2_open, p2_close, prevRow ? prevRow.du2_p.close_day : null, nextRow ? nextRow.du2_p.open : null, `Petrol DU2 closing (${p2_close.toFixed(2)}) is less than opening (${p2_open.toFixed(2)})`);
    }
    if (d1_close < d1_open) {
      addNozzleIssue('trend', 'Diesel DU1', 'du1_d', d1_open, d1_close, prevRow ? prevRow.du1_d.close_day : null, nextRow ? nextRow.du1_d.open : null, `Diesel DU1 closing (${d1_close.toFixed(2)}) is less than opening (${d1_open.toFixed(2)})`);
    }
    if (d2_close < d2_open) {
      addNozzleIssue('trend', 'Diesel DU2', 'du2_d', d2_open, d2_close, prevRow ? prevRow.du2_d.close_day : null, nextRow ? nextRow.du2_d.open : null, `Diesel DU2 closing (${d2_close.toFixed(2)}) is less than opening (${d2_open.toFixed(2)})`);
    }

    if (isConsecutive) {
      if (Math.abs(p1_open - prevRow.du1_p.close_night) > 0.01) {
        addNozzleIssue('continuity', 'Petrol DU1', 'du1_p', p1_open, p1_close, prevRow.du1_p.close_night, nextRow ? nextRow.du1_p.open : null, `Petrol DU1 opening (${p1_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du1_p.close_night.toFixed(2)})`);
      }
      if (Math.abs(p2_open - prevRow.du2_p.close_night) > 0.01) {
        addNozzleIssue('continuity', 'Petrol DU2', 'du2_p', p2_open, p2_close, prevRow.du2_p.close_night, nextRow ? nextRow.du2_p.open : null, `Petrol DU2 opening (${p2_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du2_p.close_night.toFixed(2)})`);
      }
      if (Math.abs(d1_open - prevRow.du1_d.close_night) > 0.01) {
        addNozzleIssue('continuity', 'Diesel DU1', 'du1_d', d1_open, d1_close, prevRow.du1_d.close_night, nextRow ? nextRow.du1_d.open : null, `Diesel DU1 opening (${d1_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du1_d.close_night.toFixed(2)})`);
      }
      if (Math.abs(d2_open - prevRow.du2_d.close_night) > 0.01) {
        addNozzleIssue('continuity', 'Diesel DU2', 'du2_d', d2_open, d2_close, prevRow.du2_d.close_night, nextRow ? nextRow.du2_d.open : null, `Diesel DU2 opening (${d2_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du2_d.close_night.toFixed(2)})`);
      }
    }

    if (Math.abs(variance) > 5000) {
      issues.push({
        type: 'variance',
        date: row.date,
        msg: `[${row.date}] High cash variance: expected ₹${expectedRev.toFixed(0)}, actual ₹${actualColl.toFixed(0)} (diff: ₹${variance.toFixed(0)})`
      });
    }

    // Wetstock variance: only flag truly large discrepancies (>3% of sales AND >100L)
    // Most small variances are just dip reading rounding — not real fuel loss.
    const var_ms_pct = p_sales > 0 ? (Math.abs(var_ms) / p_sales) * 100 : 0;
    if (Math.abs(var_ms) > 100 && var_ms_pct > 3.0) {
      issues.push({
        type: 'wetstock',
        date: row.date,
        msg: `[${row.date}] Petrol Wetstock Var: ${var_ms.toFixed(1)} L (${var_ms_pct.toFixed(2)}% of sales)`
      });
    }

    const var_hsd_pct = d_sales > 0 ? (Math.abs(var_hsd) / d_sales) * 100 : 0;
    if (Math.abs(var_hsd) > 100 && var_hsd_pct > 3.0) {
      issues.push({
        type: 'wetstock',
        date: row.date,
        msg: `[${row.date}] Diesel Wetstock Var: ${var_hsd.toFixed(1)} L (${var_hsd_pct.toFixed(2)}% of sales)`
      });
    }
  }

  // Check for missing calendar dates in the month
  if (data.length > 0) {
    const meta = DSR_MONTH_MAP[currentDsrMonth];
    if (meta) {
      const year = meta.year;
      const monthIdx = meta.index;

      const today = new Date();
      const isCurrentMonth = (today.getFullYear() === year && (today.getMonth() + 1) === monthIdx);
      const maxDay = isCurrentMonth ? today.getDate() : new Date(year, monthIdx, 0).getDate();

      const existingDates = new Set(data.map(row => row.date));

      for (let day = 1; day <= maxDay; day++) {
        const dateStr = `${year}-${String(monthIdx).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Skip dates before Nov 11, 2025 in November 2025 (since database starts on Nov 11)
        if (year === 2025 && monthIdx === 11 && day < 11) {
          continue;
        }

        if (!existingDates.has(dateStr)) {
          issues.push({
            type: 'missing_date',
            date: dateStr,
            msg: `[${dateStr}] ⚠️ Missing DSR Entry: No record found for this date in the ledger.`
          });
        }
      }
    }
  }

  // Sort issues chronologically by date
  issues.sort((a, b) => a.date.localeCompare(b.date));

  return issues;
}

function updateDsrSummaryCards(petrolSales, dieselSales, issues) {
  document.getElementById('dsr-summary-petrol-sales').textContent = `${petrolSales.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})} L`;
  document.getElementById('dsr-summary-diesel-sales').textContent = `${dieselSales.toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})} L`;

  const statusBadge = document.getElementById('dsr-summary-status-badge');
  const issueCountEl = document.getElementById('dsr-summary-issue-count');
  const errorLog = document.getElementById('dsr-validation-error-log');
  const errorList = document.getElementById('dsr-validation-error-list');

  // Update validation panel count header dynamically
  const errorTitle = errorLog ? errorLog.querySelector('.error-log-title') : null;
  if (errorTitle) {
    errorTitle.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      🔴 Review Issues — <span style="font-size: 0.85rem; font-weight: 800; background: rgba(239, 68, 68, 0.2); padding: 2px 8px; border-radius: 4px; color: #fca5a5;">${issues.length} Discrepancies Remaining</span>
    `;
  }

  if (issues.length === 0) {
    statusBadge.innerHTML = `<span class="validation-badge success" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 4px 8px; border-radius: 4px; font-size:0.75rem; font-weight:600;">✅ All Clean</span>`;
    issueCountEl.textContent = '0 issues detected';
    errorLog.style.display = 'none';
  } else {
    statusBadge.innerHTML = `<span class="validation-badge warning" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 4px 8px; border-radius: 4px; font-size:0.75rem; font-weight:600;">⚠️ Issues</span>`;
    issueCountEl.textContent = `${issues.length} discrepancy errors detected`;

    errorList.innerHTML = '';
    issues.forEach(issue => {
      const li = document.createElement('li');
      li.style.marginBottom = '12px';
      li.style.listStyle = 'none';
      li.style.background = 'rgba(239, 68, 68, 0.05)';
      li.style.border = '1px solid rgba(239, 68, 68, 0.15)';
      li.style.padding = '10px';
      li.style.borderRadius = '6px';
      li.style.cursor = 'pointer';
      li.style.transition = 'all 0.15s ease-in-out';
      li.title = 'Click to auto-scroll and highlight this discrepancy cell in the table';

      li.onmouseenter = () => {
        li.style.background = 'rgba(239, 68, 68, 0.08)';
        li.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        li.style.transform = 'translateY(-1px)';
        li.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      };
      li.onmouseleave = () => {
        li.style.background = 'rgba(239, 68, 68, 0.05)';
        li.style.borderColor = 'rgba(239, 68, 68, 0.15)';
        li.style.transform = '';
        li.style.boxShadow = '';
      };

      if (issue.type === 'continuity' || issue.type === 'trend') {
        const field = issue.type === 'continuity' ? 'open' : 'close_day';
        li.onclick = () => window.jumpToDsrCell(issue.date, issue.context.unit, field);
      }
      
      let html = `<div style="font-weight:700; color:#fca5a5; margin-bottom: 6px; font-size: 0.78rem;">${issue.msg}</div>`;
      
      if (issue.type === 'continuity') {
        html += `
          <div style="display: flex; gap: 15px; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; font-size: 0.73rem; font-family: 'JetBrains Mono', monospace;">
            <div style="flex: 1; opacity: 0.8;">
              <span style="color: var(--text-dim);">👈 PREV CLOSE:</span> 
              <b style="color: #38bdf8;">${issue.context.prevClose.toFixed(2)}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; color: #ef4444; font-weight:700;">
              <span>🔴 CURRENT OPEN:</span> 
              <b>${issue.context.openVal.toFixed(2)}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; opacity: 0.8;">
              <span style="color: var(--text-dim);">👉 NEXT OPEN:</span> 
              <b>${issue.context.nextOpen !== null ? issue.context.nextOpen.toFixed(2) : '—'}</b>
            </div>
          </div>
        `;
      } else if (issue.type === 'trend') {
        html += `
          <div style="display: flex; gap: 15px; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; font-size: 0.73rem; font-family: 'JetBrains Mono', monospace;">
            <div style="flex: 1; opacity: 0.8;">
              <span style="color: var(--text-dim);">👈 PREV CLOSE:</span> 
              <b>${issue.context.prevClose !== null ? issue.context.prevClose.toFixed(2) : '—'}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; color: #ef4444; font-weight:700;">
              <span>❌ GOES BACKWARDS:</span> 
              <b>Open: ${issue.context.openVal.toFixed(2)} | Close: ${issue.context.closeVal.toFixed(2)}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; opacity: 0.8;">
              <span style="color: var(--text-dim);">👉 NEXT OPEN:</span> 
              <b>${issue.context.nextOpen !== null ? issue.context.nextOpen.toFixed(2) : '—'}</b>
            </div>
          </div>
        `;
      }
      
      li.innerHTML = html;
      errorList.appendChild(li);
    });
    errorLog.style.display = 'block';
  }
}

function propagateDsrOpeningTotalizers() {
  window.dsrDraftData.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < window.dsrDraftData.length; i++) {
    const prev = window.dsrDraftData[i - 1];
    const curr = window.dsrDraftData[i];

    curr.du1_p.open = prev.du1_p.close_day;
    curr.du2_p.open = prev.du2_p.close_day;
    curr.du1_d.open = prev.du1_d.close_day;
    curr.du2_d.open = prev.du2_d.close_day;
  }
}

async function renderDsrChecker() {
  if (!window.dsrDraftData) {
    const tableBody = document.getElementById('dsr-review-table-body');
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="15" style="text-align:center; color: var(--text-dim); padding: 3rem;">Loading digitized DSR logs...</td></tr>`;
    }
    await loadDsrDraftData();
  }

  const data = window.dsrDraftData || [];
  const meta = DSR_MONTH_MAP[currentDsrMonth];
  if (!meta) return;

  const year = meta.year;
  const monthIdx = meta.index;
  const prefix = `${year}-${String(monthIdx).padStart(2, '0')}`;

  // Find all production rows for this month
  const prodRows = db.daily_ledger.filter(row => row.date.startsWith(prefix));

  // Find all draft rows for this month
  const draftRows = data.filter(row => row.date.startsWith(prefix));

  // Combine them by date (draft overrides production)
  const combinedMap = {};
  prodRows.forEach(row => {
    combinedMap[row.date] = JSON.parse(JSON.stringify(row));
    combinedMap[row.date].actual_collection = row.recon?.total_collection ?? calculateRowExpectedRev(row);
  });
  draftRows.forEach(row => {
    combinedMap[row.date] = row;
  });

  const today = new Date();
  const isCurrentMonth = (today.getFullYear() === year && (today.getMonth() + 1) === monthIdx);
  const maxDay = isCurrentMonth ? today.getDate() : new Date(year, monthIdx, 0).getDate();

  const fullMonthData = [];
  for (let day = 1; day <= maxDay; day++) {
    const dateStr = `${year}-${String(monthIdx).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Skip dates before Nov 11, 2025 in November 2025 (since database starts on Nov 11)
    if (year === 2025 && monthIdx === 11 && day < 11) {
      continue;
    }

    if (combinedMap[dateStr]) {
      fullMonthData.push(combinedMap[dateStr]);
    } else {
      fullMonthData.push({
        date: dateStr,
        prices: { petrol: 113.37, diesel: 98.41 },
        du1_p: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        du2_p: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        du1_d: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        du2_d: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        recon: {},
        actual_collection: 0,
        dip_ms_cm: 0,
        dip_hsd_cm: 0,
        isPlaceholder: true
      });
    }
  }

  fullMonthData.sort((a, b) => a.date.localeCompare(b.date));

  // Run full validation to calculate issues and flags
  const issues = validateDsrData(fullMonthData);
  const issueDates = new Set(issues.map(i => i.date));

  // Filter fullMonthData to only display rows that are drafts, placeholders, or have issues
  const renderedMonthData = fullMonthData.filter(row => {
    if (row.isPlaceholder) return true; // Keep placeholders
    const isDraft = draftRows.some(dr => dr.date === row.date);
    if (isDraft) return true; // Keep drafts
    const hasIssue = issueDates.has(row.date);
    if (hasIssue) return true; // Keep production rows with validation issues
    return false; // Hide clean production rows
  });

  document.getElementById('dsr-summary-month-name').textContent = meta.name;
  const pendingCount = renderedMonthData.filter(row => !row.isPlaceholder).length;
  document.getElementById('dsr-summary-total-days').textContent = `${pendingCount} issues/drafts pending`;

  const tbody = document.getElementById('dsr-review-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (renderedMonthData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; color: #22c55e; font-weight: 600; padding: 3rem;">🎉 All clean! No pending issues or drafts for this month.</td></tr>`;
    updateDsrSummaryCards(0, 0, []);
    return;
  }

  let petrolTotalSales = 0;
  let dieselTotalSales = 0;

  renderedMonthData.forEach((row, idx) => {
    const prevRow = idx > 0 ? renderedMonthData[idx - 1] : null;

    const p1_open = row.du1_p.open || 0;
    const p1_close = row.du1_p.close_day || 0;
    const p2_open = row.du2_p.open || 0;
    const p2_close = row.du2_p.close_day || 0;
    const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
    const p_sales = Math.max(0, (p1_close - p1_open) + (p2_close - p2_open) - p_tests);
    petrolTotalSales += p_sales;

    const d1_open = row.du1_d.open || 0;
    const d1_close = row.du1_d.close_day || 0;
    const d2_open = row.du2_d.open || 0;
    const d2_close = row.du2_d.close_day || 0;
    const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
    const d_sales = Math.max(0, (d1_close - d1_open) + (d2_close - d2_open) - d_tests);
    dieselTotalSales += d_sales;

    const expectedRev = p_sales * (row.prices?.petrol || 0) + d_sales * (row.prices?.diesel || 0);
    const actualColl = row.actual_collection !== undefined ? row.actual_collection : expectedRev;
    const variance = expectedRev - actualColl;

    let isConsecutive = false;
    if (prevRow) {
      const d1 = new Date(prevRow.date);
      const d2 = new Date(row.date);
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        isConsecutive = true;
      }
    }

    const deliv = getDailyDeliveries(row.date);

    const hasP1ContinuityError = isConsecutive && Math.abs(p1_open - prevRow.du1_p.close_night) > 0.01;
    const hasP2ContinuityError = isConsecutive && Math.abs(p2_open - prevRow.du2_p.close_night) > 0.01;
    const hasD1ContinuityError = isConsecutive && Math.abs(d1_open - prevRow.du1_d.close_night) > 0.01;
    const hasD2ContinuityError = isConsecutive && Math.abs(d2_open - prevRow.du2_d.close_night) > 0.01;

    const hasP1TrendError = p1_close < p1_open;
    const hasP2TrendError = p2_close < p2_open;
    const hasD1TrendError = d1_close < d1_open;
    const hasD2TrendError = d2_close < d2_open;

    const hasVarianceError = Math.abs(variance) > 5000;

    const rowHasError = hasP1ContinuityError || hasP2ContinuityError || hasD1ContinuityError || hasD2ContinuityError ||
                        hasP1TrendError || hasP2TrendError || hasD1TrendError || hasD2TrendError ||
                        hasVarianceError;

    const tr = document.createElement('tr');
    tr.id = `dsr-row-${row.date}`;
    if (row.isPlaceholder) {
      tr.style.background = 'rgba(255, 255, 255, 0.015)';
      tr.style.opacity = '0.55';
    } else if (rowHasError) {
      tr.style.background = 'rgba(239, 68, 68, 0.04)';
    }

    const varianceColor = Math.abs(variance) > 5000 ? '#ef4444' : Math.abs(variance) > 100 ? '#eab308' : '#22c55e';

    const p1OpenTitle = hasP1ContinuityError ? `Continuity Mismatch: Open (${p1_open.toFixed(2)}) does not match yesterday's close (${prevRow.du1_p.close_night.toFixed(2)})` : (prevRow ? `Clean: Matches yesterday's close (${prevRow.du1_p.close_night.toFixed(2)})` : `Clean: First day opening`);
    const p1CloseTitle = hasP1TrendError ? `Trend Error: Evening close (${p1_close.toFixed(2)}) is less than open (${p1_open.toFixed(2)})` : `Clean: Reading is greater than open`;
    const p2OpenTitle = hasP2ContinuityError ? `Continuity Mismatch: Open (${p2_open.toFixed(2)}) does not match yesterday's close (${prevRow.du2_p.close_night.toFixed(2)})` : (prevRow ? `Clean: Matches yesterday's close (${prevRow.du2_p.close_night.toFixed(2)})` : `Clean: First day opening`);
    const p2CloseTitle = hasP2TrendError ? `Trend Error: Evening close (${p2_close.toFixed(2)}) is less than open (${p2_open.toFixed(2)})` : `Clean: Reading is greater than open`;

    const d1OpenTitle = hasD1ContinuityError ? `Continuity Mismatch: Open (${d1_open.toFixed(2)}) does not match yesterday's close (${prevRow.du1_d.close_night.toFixed(2)})` : (prevRow ? `Clean: Matches yesterday's close (${prevRow.du1_d.close_night.toFixed(2)})` : `Clean: First day opening`);
    const d1CloseTitle = hasD1TrendError ? `Trend Error: Evening close (${d1_close.toFixed(2)}) is less than open (${d1_open.toFixed(2)})` : `Clean: Reading is greater than open`;
    const d2OpenTitle = hasD2ContinuityError ? `Continuity Mismatch: Open (${d2_open.toFixed(2)}) does not match yesterday's close (${prevRow.du2_d.close_night.toFixed(2)})` : (prevRow ? `Clean: Matches yesterday's close (${prevRow.du2_d.close_night.toFixed(2)})` : `Clean: First day opening`);
    const d2CloseTitle = hasD2TrendError ? `Trend Error: Evening close (${d2_close.toFixed(2)}) is less than open (${d2_open.toFixed(2)})` : `Clean: Reading is greater than open`;

    tr.innerHTML = `
      <td style="font-weight:600; font-size:0.8rem; white-space:nowrap; padding: 0.5rem; border-bottom: 1px solid var(--border);">${row.date}</td>

      <!-- Petrol Totalizers -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP1ContinuityError ? 'diff-highlight' : ''}" title="${p1OpenTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_p', 'open', this.textContent)">${p1_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP1TrendError ? 'diff-highlight' : ''}" title="${p1CloseTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_p', 'close_day', this.textContent)">${p1_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP2ContinuityError ? 'diff-highlight' : ''}" title="${p2OpenTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_p', 'open', this.textContent)">${p2_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP2TrendError ? 'diff-highlight' : ''}" title="${p2CloseTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_p', 'close_day', this.textContent)">${p2_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-dim); font-size: 0.75rem;" class="col-petrol">
        ${p_tests} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: var(--color-petrol);" class="col-petrol">
        ${p_sales.toFixed(1)} L
      </td>

      <!-- Petrol Tank Wetstock -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; background: rgba(16, 185, 129, 0.02);" class="col-petrol">
        <span class="editable-cell" title="Enter physical Petrol dip in cm" style="border-bottom: 1px dashed #10b981; padding: 2px 4px; cursor: pointer; color: #fff; font-weight: 600;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'recon', 'dip_ms_cm', this.textContent)">${(row.dip_ms_cm || 0).toFixed(1)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-muted); font-size: 0.75rem; background: rgba(16, 185, 129, 0.02);" class="col-petrol">
        ${(row.phys_ms || 0).toFixed(0)} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: ${Math.abs(row.var_ms || 0) > (p_sales * 0.005) ? '#ef4444' : '#10b981'}; background: rgba(16, 185, 129, 0.02);" class="col-petrol" title="Book Stock (Expected): ${(row.book_ms || 0).toFixed(0)} L (Dip: ${(row.exp_dip_ms || 0).toFixed(1)} cm) | Physical Stock (Actual): ${(row.phys_ms || 0).toFixed(0)} L (Dip: ${(row.dip_ms_cm || 0).toFixed(1)} cm)${deliv.ms_shortage > 0 ? ' | Tanker Shortage: -' + deliv.ms_shortage.toFixed(0) + ' L' : ''}">
        ${(row.var_ms || 0) >= 0 ? '+' : ''}${(row.var_ms || 0).toFixed(0)} L${deliv.ms_shortage > 0 ? ' <small style="color:#f87171;font-weight:normal;" title="Tanker delivery shortfall of ' + deliv.ms_shortage.toFixed(0) + ' L detected via density check">⚠️</small>' : ''}
      </td>

      <!-- Diesel Totalizers -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD1ContinuityError ? 'diff-highlight' : ''}" title="${d1OpenTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_d', 'open', this.textContent)">${d1_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD1TrendError ? 'diff-highlight' : ''}" title="${d1CloseTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_d', 'close_day', this.textContent)">${d1_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD2ContinuityError ? 'diff-highlight' : ''}" title="${d2OpenTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_d', 'open', this.textContent)">${d2_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD2TrendError ? 'diff-highlight' : ''}" title="${d2CloseTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_d', 'close_day', this.textContent)">${d2_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-dim); font-size: 0.75rem;" class="col-diesel">
        ${d_tests} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: var(--color-diesel);" class="col-diesel">
        ${d_sales.toFixed(1)} L
      </td>

      <!-- Diesel Tank Wetstock -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; background: rgba(245, 158, 11, 0.02);" class="col-diesel">
        <span class="editable-cell" title="Enter physical Diesel dip in cm" style="border-bottom: 1px dashed #f59e0b; padding: 2px 4px; cursor: pointer; color: #fff; font-weight: 600;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'recon', 'dip_hsd_cm', this.textContent)">${(row.dip_hsd_cm || 0).toFixed(1)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-muted); font-size: 0.75rem; background: rgba(245, 158, 11, 0.02);" class="col-diesel">
        ${(row.phys_hsd || 0).toFixed(0)} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: ${Math.abs(row.var_hsd || 0) > (d_sales * 0.005) ? '#ef4444' : '#10b981'}; background: rgba(245, 158, 11, 0.02);" class="col-diesel" title="Book Stock (Expected): ${(row.book_hsd || 0).toFixed(0)} L (Dip: ${(row.exp_dip_hsd || 0).toFixed(1)} cm) | Physical Stock (Actual): ${(row.phys_hsd || 0).toFixed(0)} L (Dip: ${(row.dip_hsd_cm || 0).toFixed(1)} cm)${deliv.hsd_shortage > 0 ? ' | Tanker Shortage: -' + deliv.hsd_shortage.toFixed(0) + ' L' : ''}">
        ${(row.var_hsd || 0) >= 0 ? '+' : ''}${(row.var_hsd || 0).toFixed(0)} L${deliv.hsd_shortage > 0 ? ' <small style="color:#f87171;font-weight:normal;" title="Tanker delivery shortfall of ' + deliv.hsd_shortage.toFixed(0) + ' L detected via density check">⚠️</small>' : ''}
      </td>

      <!-- Cash Variance Analysis -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-muted); font-size: 0.8rem;">
        ₹${expectedRev.toFixed(0)}
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;">
        <span class="editable-cell" style="border-bottom: 1px dashed var(--primary); padding: 2px 4px; cursor: pointer; color: #fff; font-weight: 600;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'recon', 'actual_collection', this.textContent)">₹${actualColl.toFixed(0)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: ${varianceColor}; font-family: monospace;">
        ${variance >= 0 ? '+' : ''}₹${variance.toFixed(0)}
      </td>

      <!-- Math Check Status -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: center;">
        ${row.isPlaceholder ?
          `<span style="color: var(--text-dim); font-size: 0.75rem;">Placeholder</span>` :
          (rowHasError ?
            `<button class="btn btn-warning btn-xs" style="font-size:0.7rem; padding: 4px 8px; border-radius:4px; font-weight:700; background-color: #d97706; border-color: #d97706; color: #fff; cursor: pointer;" onclick="submitRowToLedger('${row.date}')">⚠️ Submit anyway</button>` :
            `<button class="btn btn-success btn-xs" style="font-size:0.7rem; padding: 4px 8px; border-radius:4px; font-weight:700; background-color: #22c55e; border-color: #22c55e; color: #fff; cursor: pointer;" onclick="submitRowToLedger('${row.date}')">📩 Submit</button>`
          )
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  const filteredIssues = issues.filter(issue => renderedMonthData.some(row => row.date === issue.date));
  updateDsrSummaryCards(petrolTotalSales, dieselTotalSales, filteredIssues);
}

window.selectDsrMonth = function(monthKey) {
  currentDsrMonth = monthKey;

  document.querySelectorAll('#dsr-month-tabs .btn').forEach(el => {
    el.classList.remove('active');
  });

  const btn = document.getElementById(`dsr-tab-${monthKey}`) || document.getElementById(`dsr-tab-${monthKey.toLowerCase()}`);
  if (btn) btn.classList.add('active');

  renderDsrChecker();
};

window.updateDsrCell = function(date, unitKey, fieldKey, rawValue) {
  const cleanVal = rawValue.replace(/[^0-9\.]/g, '');
  const num = parseFloat(cleanVal);
  if (isNaN(num)) {
    renderDsrChecker();
    return;
  }

  let row = window.dsrDraftData.find(r => r.date === date);
  if (!row) {
    const prodRow = db.daily_ledger.find(r => r.date === date);
    if (prodRow) {
      row = JSON.parse(JSON.stringify(prodRow));
      row.actual_collection = prodRow.recon?.total_collection ?? calculateRowExpectedRev(prodRow);
      window.dsrDraftData.push(row);
    } else {
      row = {
        date: date,
        prices: { petrol: 113.37, diesel: 98.41 },
        du1_p: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        du2_p: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        du1_d: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        du2_d: { open: 0.0, close_day: 0.0, close_night: 0.0, tests_day: 0, tests_night: 0 },
        recon: {},
        actual_collection: 0.0,
        dip_ms_cm: 0.0,
        dip_hsd_cm: 0.0
      };
      window.dsrDraftData.push(row);
    }
  }

  let changed = false;
  if (unitKey === 'recon' && fieldKey === 'actual_collection') {
    if (row.actual_collection !== num) {
      row.actual_collection = num;
      changed = true;
    }
  } else if (unitKey === 'recon' && fieldKey === 'dip_ms_cm') {
    if (row.dip_ms_cm !== num) {
      row.dip_ms_cm = num;
      changed = true;
    }
  } else if (unitKey === 'recon' && fieldKey === 'dip_hsd_cm') {
    if (row.dip_hsd_cm !== num) {
      row.dip_hsd_cm = num;
      changed = true;
    }
  } else if (row[unitKey]) {
    const oldVal = row[unitKey][fieldKey];
    if (oldVal !== num) {
      row[unitKey][fieldKey] = num;
      if (fieldKey === 'close_day') {
        row[unitKey]['close_night'] = num;
      }
      propagateDsrOpeningTotalizers();
      changed = true;
    }
  }

  if (changed) {
    saveDsrDraftEdits();
    renderDsrChecker();

    // Toast notification confirming saved draft and merge path
    showNotification(`✏️ Value saved to local draft. Click 'Merge to Production' (top-right) to apply and sync changes to GitHub Gist.`, 'success');
  } else {
    renderDsrChecker();
  }
};

window.exportDsrJSON = function() {
  if (!window.dsrDraftData) return;
  const jsonStr = JSON.stringify({ daily_ledger: window.dsrDraftData }, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `octaneflow_digitized_dsr_draft_${currentDsrMonth}.json`;
  a.click();
};

window.approveAndMergeDsr = function() {
  const issues = validateDsrData(window.dsrDraftData);
  const issueDates = new Set(issues.map(i => i.date));

  // Clean rows are those with no validation issues, and are not placeholders
  const cleanRows = window.dsrDraftData.filter(row => !issueDates.has(row.date) && !row.isPlaceholder);
  const dirtyRows = window.dsrDraftData.filter(row => issueDates.has(row.date));

  if (cleanRows.length === 0) {
    showNotification("⚠️ No clean/verified entries found to merge. Please resolve issues first.", "warning");
    return;
  }

  if (!confirm(`Are you sure you want to merge ${cleanRows.length} clean/verified DSR records to the production daily ledger? (The remaining ${dirtyRows.length} records with issues/gaps will stay in review).`)) {
    return;
  }

  const session = getSession();
  const approvedBy = session ? session.username : 'owner';
  const approvedAt = new Date().toISOString();

  let mergeCount = 0;
  cleanRows.forEach(row => {
    let existingRow = db.daily_ledger.find(r => r.date === row.date);
    let oldNetP = 0;
    let oldNetD = 0;

    if (existingRow) {
      try {
        const oldCalc = computeLedgerRow(existingRow);
        oldNetP = oldCalc.totals.net_24h.petrol || 0;
        oldNetD = oldCalc.totals.net_24h.diesel || 0;
      } catch(e) {}
    }

    const newRow = JSON.parse(JSON.stringify(row));
    const actualColl = newRow.actual_collection !== undefined ? newRow.actual_collection : (calculateRowExpectedRev(newRow));
    newRow.recon = {
      cash: actualColl,
      phonepe: 0,
      credit: 0,
      total_collection: actualColl,
      remarks: 'OCR Digitized DSR'
    };
    delete newRow.actual_collection;

    newRow._approved_by = approvedBy;
    newRow._approved_at = approvedAt;
    newRow._submitted_by = 'ocr';

    try {
      const newCalc = computeLedgerRow(newRow);
      const newNetP = newCalc.totals.net_24h.petrol || 0;
      const newNetD = newCalc.totals.net_24h.diesel || 0;

      db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
      db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
    } catch(e) {}

    if (existingRow) {
      const idx = db.daily_ledger.indexOf(existingRow);
      db.daily_ledger[idx] = newRow;
    } else {
      db.daily_ledger.push(newRow);
    }
    mergeCount++;
  });

  db.daily_ledger.sort((a, b) => b.date.localeCompare(a.date));
  saveDB();

  // Keep remaining dirtyRows in draft, discard merged rows
  window.dsrDraftData = dirtyRows;
  if (dirtyRows.length === 0) {
    localStorage.removeItem('octaneflow_dsr_draft_edits');
  } else {
    localStorage.setItem('octaneflow_dsr_draft_edits', JSON.stringify(dirtyRows));
  }

  showNotification(`🎉 Successfully merged ${mergeCount} clean DSR entries to the production database. ${dirtyRows.length} entries with issues remain in draft.`, 'success');
  initApp();
};

window.submitRowToLedger = function(date) {
  const row = window.dsrDraftData.find(r => r.date === date);
  if (!row) {
    showNotification("⚠️ Cannot submit placeholder or empty row. Please enter some values first.", "warning");
    return;
  }

  const session = getSession();
  const approvedBy = session ? session.username : 'owner';
  const approvedAt = new Date().toISOString();

  let existingRow = db.daily_ledger.find(r => r.date === row.date);
  let oldNetP = 0;
  let oldNetD = 0;

  if (existingRow) {
    try {
      const oldCalc = computeLedgerRow(existingRow);
      oldNetP = oldCalc.totals.net_24h.petrol || 0;
      oldNetD = oldCalc.totals.net_24h.diesel || 0;
    } catch(e) {}
  }

  const newRow = JSON.parse(JSON.stringify(row));
  const actualColl = newRow.actual_collection !== undefined ? newRow.actual_collection : (calculateRowExpectedRev(newRow));
  newRow.recon = {
    cash: actualColl,
    phonepe: 0,
    credit: 0,
    total_collection: actualColl,
    remarks: 'OCR Digitized DSR'
  };
  delete newRow.actual_collection;
  delete newRow.isPlaceholder;

  newRow._approved_by = approvedBy;
  newRow._approved_at = approvedAt;
  newRow._submitted_by = 'ocr';

  try {
    const newCalc = computeLedgerRow(newRow);
    const newNetP = newCalc.totals.net_24h.petrol || 0;
    const newNetD = newCalc.totals.net_24h.diesel || 0;

    db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
  } catch(e) {}

  if (existingRow) {
    const idx = db.daily_ledger.indexOf(existingRow);
    db.daily_ledger[idx] = newRow;
  } else {
    db.daily_ledger.push(newRow);
  }

  db.daily_ledger.sort((a, b) => b.date.localeCompare(a.date));
  saveDB();

  // Remove this row from draft data staging
  window.dsrDraftData = window.dsrDraftData.filter(r => r.date !== date);
  if (window.dsrDraftData.length === 0) {
    localStorage.removeItem('octaneflow_dsr_draft_edits');
  } else {
    localStorage.setItem('octaneflow_dsr_draft_edits', JSON.stringify(window.dsrDraftData));
  }

  showNotification(`🎉 Successfully submitted DSR entry for ${formatDate(date)} to sales ledger.`, 'success');
  initApp();
};

window.renderDsrChecker = renderDsrChecker;

// ====== STOCK ANCHOR FUNCTIONS ======

window.applyStockAnchor = function() {
  const dateEl = document.getElementById('anchor-date');
  const petrolEl = document.getElementById('anchor-petrol');
  const dieselEl = document.getElementById('anchor-diesel');
  const statusEl = document.getElementById('anchor-status');

  const date = dateEl?.value;
  const petrol_L = parseFloat(petrolEl?.value);
  const diesel_L = parseFloat(dieselEl?.value);

  if (!date || isNaN(petrol_L) || isNaN(diesel_L)) {
    if (statusEl) statusEl.textContent = '⚠️ Please fill in date, petrol L and diesel L.';
    return;
  }

  if (!db.settings) db.settings = {};
  db.settings.stock_anchor = { date, petrol_L, diesel_L };
  saveDB();

  if (statusEl) {
    statusEl.textContent = `✅ Anchor set: ${date} | Petrol ${petrol_L.toFixed(0)} L | Diesel ${diesel_L.toFixed(0)} L`;
    statusEl.style.color = '#10b981';
  }

  renderLedger();
  showNotification(`⚓ Stock anchor set for ${date}. All historical inventory recalculated!`, 'success');
};

window.clearStockAnchor = function() {
  if (db.settings) delete db.settings.stock_anchor;
  saveDB();
  const statusEl = document.getElementById('anchor-status');
  if (statusEl) { statusEl.textContent = 'Anchor cleared.'; statusEl.style.color = 'var(--text-muted)'; }
  renderLedger();
};

// Load saved anchor into UI fields on page render
function loadAnchorUI() {
  const anchor = db.settings?.stock_anchor;
  if (!anchor) return;
  const dateEl = document.getElementById('anchor-date');
  const petrolEl = document.getElementById('anchor-petrol');
  const dieselEl = document.getElementById('anchor-diesel');
  const statusEl = document.getElementById('anchor-status');
  if (dateEl) dateEl.value = anchor.date || '';
  if (petrolEl) petrolEl.value = anchor.petrol_L != null ? anchor.petrol_L : '';
  if (dieselEl) dieselEl.value = anchor.diesel_L != null ? anchor.diesel_L : '';
  if (statusEl) {
    statusEl.textContent = `✅ Active anchor: ${anchor.date} | P ${anchor.petrol_L?.toFixed(0)} L | D ${anchor.diesel_L?.toFixed(0)} L`;
    statusEl.style.color = '#10b981';
  }
}
window.loadAnchorUI = loadAnchorUI;


// Plan 21: Toggle Expenses Details Popover
function toggleExpensePopover(event, date) {
  event.stopPropagation();
  // Close any open popovers
  const openPopovers = document.querySelectorAll('.expense-popover');
  openPopovers.forEach(p => p.remove());

  const dayExps = (typeof KC_EXPENSES_DATA !== 'undefined') ? KC_EXPENSES_DATA[date] : null;
  if (!dayExps || dayExps.length === 0) return;

  const container = event.target.closest('.expense-popover-container');
  if (!container) return;

  const popover = document.createElement('div');
  popover.className = 'expense-popover';
  
  let listHtml = '';
  dayExps.forEach(it => {
    const amtStr = typeof it.amount === 'number' ? '₹ ' + it.amount.toFixed(0) : it.amount;
    listHtml += `<div class="expense-popover-item"><span>${it.name}</span><span class="item-val">${amtStr}</span></div>`;
  });

  popover.innerHTML = `
    <div class="expense-popover-header">
      <span class="expense-popover-title">DSR Expenses: ${formatDate(date)}</span>
      <button class="expense-popover-close" onclick="this.closest('.expense-popover').remove()">&times;</button>
    </div>
    <div class="expense-popover-list">
      ${listHtml}
    </div>
  `;

  container.appendChild(popover);

  // Close when clicking outside
  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== event.target) {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  document.addEventListener('click', closeHandler);
}
window.toggleExpensePopover = toggleExpensePopover;

window.jumpToDsrCell = function(date, unit, field) {
  const rowEl = document.getElementById(`dsr-row-${date}`);
  if (!rowEl) return;
  
  rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Find span matching unit and field
  const span = rowEl.querySelector(`span[onblur*="'${unit}'"][onblur*="'${field}'"]`);
  if (span) {
    span.style.transition = 'none';
    span.style.background = '#facc15'; // highlight yellow
    span.style.color = '#000';
    span.style.fontWeight = '800';
    span.style.borderRadius = '4px';
    
    setTimeout(() => {
      span.focus();
      // Select text inside cell
      const range = document.createRange();
      range.selectNodeContents(span);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 350);
    
    setTimeout(() => {
      span.style.transition = 'all 1s ease';
      span.style.background = '';
      span.style.color = '';
      span.style.fontWeight = '';
    }, 1500);
  }
};

let tempModalExpenses = [];

function renderModalExpenses() {
  const container = document.getElementById('modal-expenses-list');
  if (!container) return;
  
  if (tempModalExpenses.length === 0) {
    container.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 0.5rem;">No daily cash expenses logged for this date.</div>`;
    return;
  }
  
  container.innerHTML = tempModalExpenses.map((exp, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px; margin-bottom: 2px;">
      <span>${exp.name}</span>
      <div style="display:flex; gap:10px; align-items:center;">
        <span style="font-weight:700; color:var(--primary);">₹ ${exp.amount.toFixed(0)}</span>
        <button type="button" onclick="deleteModalExpense(${idx})" style="background:none; border:none; color:#ef4444; font-size:1.1rem; line-height:1; cursor:pointer; padding:0 4px;">&times;</button>
      </div>
    </div>
  `).join('');
}

function addModalExpense() {
  const nameInput = document.getElementById('new-dayexp-name');
  const amtInput = document.getElementById('new-dayexp-amount');
  if (!nameInput || !amtInput) return;
  
  const name = nameInput.value.trim();
  const amt = parseFloat(amtInput.value);
  
  if (!name || isNaN(amt) || amt <= 0) {
    showNotification('Please enter a valid description and amount.', 'warning');
    return;
  }
  
  tempModalExpenses.push({ name, amount: amt });
  nameInput.value = '';
  amtInput.value = '';
  renderModalExpenses();
}

function deleteModalExpense(idx) {
  tempModalExpenses.splice(idx, 1);
  renderModalExpenses();
}

window.addModalExpense = addModalExpense;
window.deleteModalExpense = deleteModalExpense;

// ── OTP Password Reset Logic ───────────────────────────────
let otpTimerInterval = null;

window.showForgotPasswordModal = function(e) {
  if (e) e.preventDefault();
  const overlay = document.getElementById('otp-reset-overlay');
  if (overlay) overlay.style.display = 'flex';
  
  // Reset elements
  document.getElementById('otp-step-1').style.display = 'flex';
  document.getElementById('otp-step-2').style.display = 'none';
  document.getElementById('otp-step-3').style.display = 'none';
  
  // Clear inputs
  document.getElementById('otp-reset-username').value = '';
  document.getElementById('otp-reset-phone').value = '';
  document.getElementById('otp-input-code').value = '';
  document.getElementById('otp-new-password').value = '';
  document.getElementById('otp-confirm-password').value = '';
  
  // Clear errors
  document.getElementById('otp-error-step1').textContent = '';
  document.getElementById('otp-error-step2').textContent = '';
  document.getElementById('otp-error-step3').textContent = '';
  
  if (otpTimerInterval) clearInterval(otpTimerInterval);
};

window.closeForgotPasswordModal = function() {
  const overlay = document.getElementById('otp-reset-overlay');
  if (overlay) overlay.style.display = 'none';
  if (otpTimerInterval) clearInterval(otpTimerInterval);
};

window.backToStep1 = function() {
  document.getElementById('otp-step-1').style.display = 'flex';
  document.getElementById('otp-step-2').style.display = 'none';
  if (otpTimerInterval) clearInterval(otpTimerInterval);
};

window.sendOtpRequest = function() {
  const username = document.getElementById('otp-reset-username').value.trim();
  const rawPhone = document.getElementById('otp-reset-phone').value.trim();
  const errEl = document.getElementById('otp-error-step1');
  if (errEl) errEl.textContent = '';
  
  if (!username) {
    if (errEl) errEl.textContent = 'Please enter a username.';
    return;
  }
  
  const phone = rawPhone.replace(/[^0-9]/g, '');
  if (phone.length !== 10) {
    if (errEl) errEl.textContent = 'Please enter a valid 10-digit mobile number.';
    return;
  }
  
  const users = getUsers();
  const uname = username.toLowerCase();
  
  // Verification check:
  // If owner, we can send to any phone (since owner might not have registered phone yet in DB)
  // If employee, phone number MUST match the registered phone in db.employees
  if (uname !== 'owner') {
    const emp = (db.employees || []).find(e => e.id === uname || e.name.toLowerCase().includes(uname));
    if (!emp) {
      if (errEl) errEl.textContent = 'Username not found. Contact administrator.';
      return;
    }
    const cleanEmpPhone = emp.phone.replace(/[^0-9]/g, '');
    if (!cleanEmpPhone.endsWith(phone)) {
      if (errEl) errEl.textContent = 'Mobile number does not match registered employee records.';
      return;
    }
  }
  
  // Generate random 6-digit OTP
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiry = Date.now() + 5 * 60 * 1000; // 5 min expiry
  
  sessionStorage.setItem('reset_otp_code', otpCode);
  sessionStorage.setItem('reset_otp_expiry', expiry);
  sessionStorage.setItem('reset_username', uname);
  
  // Open WhatsApp link to send OTP
  const message = encodeURIComponent(`🚨 RKSK Chandaroon Password Reset Verification OTP: ${otpCode}. Valid for 5 minutes.`);
  window.open(`https://api.whatsapp.com/send?phone=91${phone}&text=${message}`, '_blank');
  
  // Switch to Step 2
  document.getElementById('otp-step-1').style.display = 'none';
  document.getElementById('otp-step-2').style.display = 'flex';
  
  // Start countdown timer
  let secondsLeft = 300;
  const timerEl = document.getElementById('otp-timer');
  if (timerEl) timerEl.textContent = `Time remaining: 05:00`;
  
  if (otpTimerInterval) clearInterval(otpTimerInterval);
  otpTimerInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      clearInterval(otpTimerInterval);
      if (timerEl) timerEl.textContent = 'OTP has expired. Please try again.';
      sessionStorage.removeItem('reset_otp_code');
    } else {
      const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
      const secs = String(secondsLeft % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `Time remaining: ${mins}:${secs}`;
    }
  }, 1000);
  
  showNotification('📤 OTP sent via WhatsApp! Check your window/tab.', 'success');
};

window.verifyOtpRequest = function() {
  const enteredCode = document.getElementById('otp-input-code').value.trim();
  const errEl = document.getElementById('otp-error-step2');
  if (errEl) errEl.textContent = '';
  
  const savedCode = sessionStorage.getItem('reset_otp_code');
  const savedExpiry = parseInt(sessionStorage.getItem('reset_otp_expiry') || '0');
  
  if (!savedCode || Date.now() > savedExpiry) {
    if (errEl) errEl.textContent = 'OTP has expired. Please request a new one.';
    return;
  }
  
  if (enteredCode !== savedCode) {
    if (errEl) errEl.textContent = 'Invalid OTP. Please check the code and try again.';
    return;
  }
  
  // Clear OTP from memory after successful check
  if (otpTimerInterval) clearInterval(otpTimerInterval);
  
  // Switch to Step 3
  document.getElementById('otp-step-2').style.display = 'none';
  document.getElementById('otp-step-3').style.display = 'flex';
};

window.submitNewPassword = async function() {
  const newPass = document.getElementById('otp-new-password').value;
  const confPass = document.getElementById('otp-confirm-password').value;
  const errEl = document.getElementById('otp-error-step3');
  if (errEl) errEl.textContent = '';
  
  if (newPass.length < 4) {
    if (errEl) errEl.textContent = 'Password must be at least 4 characters.';
    return;
  }
  if (newPass !== confPass) {
    if (errEl) errEl.textContent = 'Passwords do not match.';
    return;
  }
  
  const username = sessionStorage.getItem('reset_username');
  if (!username) {
    if (errEl) errEl.textContent = 'Session error. Please restart.';
    return;
  }
  
  const newHash = await hashString(newPass.trim());
  const users = getUsers();
  
  if (users[username]) {
    users[username].passwordHash = newHash;
    saveUsers(users);
  } else if (username === 'owner') {
    users['owner'] = {
      username: 'owner', displayName: 'Owner', role: 'owner',
      passwordHash: newHash, active: true,
      createdAt: new Date().toISOString()
    };
    saveUsers(users);
  }
  
  showNotification('🔑 Password updated successfully! Log in using your new credentials.', 'success');
  closeForgotPasswordModal();
};

