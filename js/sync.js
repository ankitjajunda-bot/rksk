// OctaneFlow App State and Logic - Daily Ledger Spreadsheet Edition

// ============================================================
// GITHUB GIST AUTO-SYNC ENGINE
// Stores data in a private Supabase — no size limit, free.
// Credentials live in localStorage under 'octaneflow_sync_cfg'
// (separate from db so they survive a DB reset).
// ============================================================

const SYNC_CFG_KEY  = 'octaneflow_sync_cfg';

let realtimeChannel = null;

function subscribeToRealtime() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    try {
      supabaseClient.removeChannel(realtimeChannel);
    } catch (e) {
      console.warn('Failed to remove channel:', e);
    }
  }

  SystemLogger.info('Realtime', 'Subscribing to Supabase Realtime WebSocket...');

  realtimeChannel = supabaseClient
    .channel('octaneflow-realtime-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pending_entries' },
      async (payload) => {
        SystemLogger.success('Realtime', 'Detected table update: pending_entries');
        await initSync();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'daily_ledger' },
      async (payload) => {
        SystemLogger.success('Realtime', 'Detected table update: daily_ledger');
        await initSync();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state' },
      async (payload) => {
        SystemLogger.success('Realtime', 'Detected table update: app_state');
        await initSync();
      }
    )
    .subscribe((status) => {
      SystemLogger.info('Realtime', `WebSocket status: ${status}`);
    });
}

function initSupabaseClient() {
  const cfg = getSyncCfg();
  if (cfg.supabaseUrl && cfg.supabaseKey && typeof window.supabase !== 'undefined') {
    try {
      if (cfg.supabaseUrl.startsWith('http://') || cfg.supabaseUrl.startsWith('https://')) {
        supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
        subscribeToRealtime();
      } else {
        SystemLogger.warning('initSupabaseClient', 'Supabase URL is not valid. Skipping initialization.');
        supabaseClient = null;
      }
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
  }
}

function getSyncCfg() {
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || '{}');
  } catch {
    cfg = {};
  }
  // Force pre-configured credentials always
  cfg.supabaseUrl = 'https://tgaunkmbzzrlvdwyuykm.supabase.co';
  cfg.supabaseKey = 'sb_publishable_YJgYf4bM6Kh5AfqybtbH4g_H5hQN2Sf';
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
  } else if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    banner.style.display = 'flex';
    banner.style.borderColor = 'rgba(234, 179, 8, 0.3)';
    banner.style.background = 'rgba(234, 179, 8, 0.1)';
    banner.style.color = '#fef08a';
    text.textContent = 'Cloud Sync is not configured. Go to Settings to enter Supabase API URL & Anon Key.';
    actionBtn.style.display = 'inline-block';
    actionBtn.textContent = 'Configure';
    actionBtn.onclick = () => {
      switchView('settings');
      setTimeout(() => {
        const el = document.getElementById('cfg-sync-master-key');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
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

// Pull latest data from Supabase
async function syncPull() {
  const cfg = getSyncCfg();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    setSyncStatus('off');
    SystemLogger.warning('syncPull', 'Sync skipped: Supabase credentials are not configured.');
    return null;
  }
  if (!supabaseClient) {
    initSupabaseClient();
  }
  if (!supabaseClient) {
    setSyncStatus('error');
    SystemLogger.error('syncPull', 'Supabase client failed to initialize.');
    return null;
  }
  
  SystemLogger.info('syncPull', 'Starting cloud pull from Supabase...');
  try {
    setSyncStatus('syncing');
    
    // 1. Fetch app_state key-values
    const { data: stateData, error: stateErr } = await supabaseClient.from('app_state').select('*');
    if (stateErr) throw stateErr;
    
    // 2. Fetch pending_entries
    const { data: pendingData, error: pendingErr } = await supabaseClient.from('pending_entries').select('*');
    if (pendingErr) throw pendingErr;
    
    // 3. Fetch daily_ledger
    const { data: ledgerData, error: ledgerErr } = await supabaseClient.from('daily_ledger').select('*');
    if (ledgerErr) throw ledgerErr;
    
    // Construct unified db payload
    const record = {
      pending_entries: pendingData.map(e => ({
        id: e.id,
        submittedBy: e.submitted_by,
        submittedByName: e.submitted_by_name,
        submittedAt: e.submitted_at,
        submission_type: e.submission_type,
        status: e.status,
        entryData: e.entry_data,
        rejectionReason: e.rejection_reason,
        reviewedBy: e.reviewed_by,
        reviewedAt: e.reviewed_at
      })),
      daily_ledger: ledgerData.map(e => ({
        date: e.date,
        prices: e.prices,
        du1_p: e.du1_p,
        du1_d: e.du1_d,
        du2_p: e.du2_p,
        du2_d: e.du2_d,
        recon: e.recon,
        approved_by: e.approved_by,
        approved_at: e.approved_at,
        submitted_by: e.submitted_by
      })),
      settings: {},
      stock: {},
      price_history: [],
      purchases: [],
      holidays: [],
      users: {}
    };
    
    stateData.forEach(row => {
      if (row.key === 'settings') record.settings = row.value;
      else if (row.key === 'stock') record.stock = row.value;
      else if (row.key === 'price_history') record.price_history = row.value;
      else if (row.key === 'purchases') record.purchases = row.value;
      else if (row.key === 'holidays') record.holidays = row.value;
      else if (row.key === 'users') record.users = row.value;
    });
    
    let maxTime = new Date(0);
    pendingData.forEach(e => {
      const t1 = e.submitted_at ? new Date(e.submitted_at) : new Date(0);
      const t2 = e.reviewed_at ? new Date(e.reviewed_at) : new Date(0);
      if (t1 > maxTime) maxTime = t1;
      if (t2 > maxTime) maxTime = t2;
    });
    ledgerData.forEach(e => {
      const t = e.approved_at ? new Date(e.approved_at) : new Date(0);
      if (t > maxTime) maxTime = t;
    });
    
    record._synced_at = maxTime.toISOString();
    
    localStorage.setItem('octaneflow_last_sync', new Date().toISOString());
    setSyncStatus('synced');
    SystemLogger.success('syncPull', `Supabase pull succeeded. Retrieved ${ledgerData.length} ledger and ${pendingData.length} pending records.`);
    return record;
  } catch (err) {
    const isOnline = navigator.onLine;
    setSyncStatus(isOnline ? 'error' : 'offline');
    SystemLogger.error('syncPull', 'Supabase pull failed', err);
    return null;
  }
}

async function syncPush(forceAll = false) {
  const cfg = getSyncCfg();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    SystemLogger.warning('syncPush', 'Sync push skipped: Supabase credentials are not configured.');
    return false;
  }
  if (!supabaseClient) {
    initSupabaseClient();
  }
  if (!supabaseClient) {
    setSyncStatus('error');
    SystemLogger.error('syncPush', 'Supabase client failed to initialize.');
    return false;
  }
  
  const session = getSession();
  const isOwner = session && session.role === 'owner';
  
  SystemLogger.info('syncPush', `Starting Supabase database sync & push (forceAll: ${forceAll})...`);
  try {
    setSyncStatus('syncing');
    
    // 1. Push app_state (always push)
    const appStateRows = [
      { key: 'settings', value: db.settings || {} },
      { key: 'stock', value: db.stock || {} },
      { key: 'price_history', value: db.price_history || [] },
      { key: 'purchases', value: db.purchases || [] },
      { key: 'holidays', value: db.holidays || [] },
      { key: 'users', value: db.users || {} }
    ];
    
    const { error: stateErr } = await supabaseClient.from('app_state').upsert(appStateRows);
    if (stateErr) throw stateErr;
    
    // 2. Push pending_entries (filter to pending or recent if not forceAll)
    if (db.pending_entries && db.pending_entries.length > 0) {
      let entriesToPush = db.pending_entries;
      if (!forceAll) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoff = sevenDaysAgo.toISOString();
        entriesToPush = db.pending_entries.filter(e => e.status === 'pending' || e.submittedAt >= cutoff || (e.reviewedAt && e.reviewedAt >= cutoff));
      }
      
      if (entriesToPush.length > 0) {
        const pendingRows = entriesToPush.map(e => ({
          id: e.id,
          submitted_by: e.submittedBy,
          submitted_by_name: e.submittedByName,
          submitted_at: e.submittedAt,
          submission_type: e.submission_type,
          status: e.status,
          entry_data: e.entryData,
          rejection_reason: e.rejectionReason || '',
          reviewed_by: e.reviewedBy || '',
          reviewed_at: e.reviewedAt || null
        }));
        const { error: pendingErr } = await supabaseClient.from('pending_entries').upsert(pendingRows);
        if (pendingErr) throw pendingErr;
      }
    }
    
    // 3. Push daily_ledger (Only push if owner, and only push recent 14 days unless forceAll)
    if (isOwner && db.daily_ledger && db.daily_ledger.length > 0) {
      let ledgerToPush = db.daily_ledger;
      if (!forceAll) {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const dateCutoff = fourteenDaysAgo.toISOString().split('T')[0];
        ledgerToPush = db.daily_ledger.filter(e => e.date >= dateCutoff);
      }
      
      if (ledgerToPush.length > 0) {
        const ledgerRows = ledgerToPush.map(e => ({
          date: e.date,
          prices: e.prices,
          du1_p: e.du1_p,
          du1_d: e.du1_d,
          du2_p: e.du2_p,
          du2_d: e.du2_d,
          recon: e.recon,
          approved_by: e.approved_by || 'owner',
          approved_at: e.approved_at || new Date().toISOString(),
          submitted_by: e.submitted_by || 'system'
        }));
        const { error: ledgerErr } = await supabaseClient.from('daily_ledger').upsert(ledgerRows);
        if (ledgerErr) throw ledgerErr;
      }
    }
    
    // Clear dirty flags upon successful push
    if (db.pending_entries) {
      db.pending_entries.forEach(e => { e._dirty = false; });
    }
    if (db.daily_ledger) {
      db.daily_ledger.forEach(e => { e._dirty = false; });
    }
    // Save DB to update cleaned flags in local storage
    const { _idx, ...dbToSave } = db;
    localStorage.setItem('octaneflow_db', JSON.stringify(dbToSave));

    const cfg2 = getSyncCfg();
    cfg2.last_push = new Date().toISOString();
    saveSyncCfg(cfg2);
    localStorage.setItem('octaneflow_last_sync', cfg2.last_push);
    setSyncStatus('synced');
    SystemLogger.success('syncPush', 'Supabase database push completed successfully.');
    return true;
  } catch (err) {
    const isOnline = navigator.onLine;
    setSyncStatus(isOnline ? 'error' : 'offline');
    SystemLogger.error('syncPush', 'Supabase push failed due to exception.', err);
    return false;
  }
}

async function initSync() {
  const cfg = getSyncCfg();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    setSyncStatus('off');
    SystemLogger.info('initSync', 'Auto-sync is disabled (no credentials).');
    return;
  }
  SystemLogger.info('initSync', 'Initializing cloud sync checks...');
  const cloudData = await syncPull();
  if (!cloudData || !cloudData.daily_ledger) {
    SystemLogger.warning('initSync', 'Could not fetch cloud data.');
    return;
  }

  if (!db) {
    db = cloudData;
  } else {
    // 1. Merge settings, stock, price_history, purchases, holidays, users from cloud (cloud is source of truth)
    db.settings = cloudData.settings || db.settings || {};
    db.stock = cloudData.stock || db.stock || {};
    db.price_history = cloudData.price_history || db.price_history || [];
    db.purchases = cloudData.purchases || db.purchases || [];
    db.holidays = cloudData.holidays || db.holidays || [];
    
    // Safely merge users bidirectionally so cloud sync NEVER wipes local users
    const localU = db.users || {};
    const cloudU = cloudData.users || {};
    const safeUsers = { ...localU, ...cloudU };
    for (const k in localU) {
      if (!safeUsers[k]) safeUsers[k] = localU[k];
    }
    db.users = safeUsers;

    // 2. Merge pending_entries: Keep unsynced local entries, overlay cloud entries (deleting resolved ones)
    const unsyncedPending = (db.pending_entries || []).filter(e => e._dirty);
    const mergedPendingMap = new Map();
    (cloudData.pending_entries || []).forEach(cloudEntry => {
      cloudEntry._dirty = false;
      mergedPendingMap.set(cloudEntry.id, cloudEntry);
    });
    unsyncedPending.forEach(localEntry => {
      mergedPendingMap.set(localEntry.id, localEntry);
    });
    db.pending_entries = Array.from(mergedPendingMap.values());

    // 3. Merge daily_ledger: Keep unsynced local entries, overlay cloud entries
    const unsyncedLedger = (db.daily_ledger || []).filter(e => e._dirty);
    const mergedLedgerMap = new Map();
    (cloudData.daily_ledger || []).forEach(cloudEntry => {
      cloudEntry._dirty = false;
      mergedLedgerMap.set(cloudEntry.date, cloudEntry);
    });
    unsyncedLedger.forEach(localEntry => {
      mergedLedgerMap.set(localEntry.date, localEntry);
    });
    db.daily_ledger = Array.from(mergedLedgerMap.values());
  }

  // Save the merged database locally
  localStorage.setItem('octaneflow_db', JSON.stringify(db));
  if (db.users) {
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(db.users));
  }

  cfg.last_push = cloudData._synced_at || new Date().toISOString();
  saveSyncCfg(cfg);

  buildIndexes();
  
  // Re-draw current view if settings or ledger changes
  const activeView = document.querySelector('.view-panel.active')?.id || '';
  if (activeView === 'view-dashboard') {
    if (typeof initApp === 'function') initApp();
  } else if (activeView === 'view-approvals') {
    if (typeof renderApprovalsPanel === 'function') renderApprovalsPanel();
  }

  SystemLogger.success('initSync', `Sync complete. Merged ${db.daily_ledger.length} ledger days and ${db.pending_entries.length} pending items.`);
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
  const pendingCount = (db && db.pending_entries) ? db.pending_entries.filter(e => e.submission_type !== 'device_registration').length : 0;

  const dbRecordsEl = document.getElementById('diag-db-records');
  if (dbRecordsEl) dbRecordsEl.textContent = `${ledgerCount} Ledger Days`;
  const dbPurchasesEl = document.getElementById('diag-db-purchases');
  if (dbPurchasesEl) dbPurchasesEl.textContent = `${purchaseCount} Purchases`;
  const dbPendingEl = document.getElementById('diag-db-pending');
  if (dbPendingEl) dbPendingEl.textContent = `${pendingCount} Pending Submissions`;

  const cfg = getSyncCfg();
  const syncStatusEl = document.getElementById('diag-sync-status');
  const syncTimeEl = document.getElementById('diag-sync-time');
  const syncSupabaseIdEl = document.getElementById('diag-sync-gist-id');

  if (cfg.supabaseUrl && cfg.supabaseKey) {
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
    if (syncSupabaseIdEl) {
      syncSupabaseIdEl.textContent = `Supabase URL: ...${cfg.supabaseUrl.slice(-8)}`;
      syncSupabaseIdEl.title = cfg.supabaseUrl;
    }
  } else {
    if (syncStatusEl) {
      syncStatusEl.textContent = 'Disabled';
      syncStatusEl.style.color = 'var(--text-dim)';
    }
    if (syncTimeEl) syncTimeEl.textContent = 'N/A';
    if (syncSupabaseIdEl) syncSupabaseIdEl.textContent = 'Database: Not Configured';
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

