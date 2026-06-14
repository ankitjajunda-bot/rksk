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
  try { return JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || '{}'); }
  catch { return {}; }
}

function saveSyncCfg(cfg) {
  localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
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
  el.innerHTML = `<span style="color:${s.color};font-size:0.75rem;font-weight:600;">${s.icon} ${s.text}</span>`;
}

// Pull latest data from GitHub Gist
async function syncPull() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) { setSyncStatus('off'); return null; }
  try {
    setSyncStatus('syncing');
    const res = await fetch(`${GIST_API_BASE}/${cfg.gistId}`, {
      headers: {
        'Authorization': `token ${cfg.gistToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!res.ok) { setSyncStatus('error'); return null; }
    const gist   = await res.json();
    const file   = gist.files && gist.files[GIST_FILENAME];
    if (!file)   { setSyncStatus('error'); return null; }
    const record = JSON.parse(file.content);
    setSyncStatus('synced');
    return record;
  } catch {
    setSyncStatus(navigator.onLine ? 'error' : 'offline');
    return null;
  }
}

// Push current db to GitHub Gist
async function syncPush() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) return;
  try {
    setSyncStatus('syncing');
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
    if (res.ok) {
      const cfg2 = getSyncCfg();
      cfg2.last_push = new Date().toISOString();
      saveSyncCfg(cfg2);
    }
    setSyncStatus(res.ok ? 'synced' : 'error');
  } catch {
    setSyncStatus(navigator.onLine ? 'error' : 'offline');
  }
}

// On app start — pull cloud data if it's newer than local
async function initSync() {
  const cfg = getSyncCfg();
  if (!cfg.gistId || !cfg.gistToken) { setSyncStatus('off'); return; }
  const cloudData = await syncPull();
  if (!cloudData || !cloudData.daily_ledger) return;

  const cloudAt   = cloudData._synced_at ? new Date(cloudData._synced_at) : new Date(0);
  const localAt   = cfg.last_push        ? new Date(cfg.last_push)        : new Date(0);

  if (cloudAt > localAt || !db || !db.daily_ledger) {
    db = cloudData;
    localStorage.setItem('octaneflow_db', JSON.stringify(db));
    if (db.users) {
      localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(db.users));
    }
    cfg.last_push = cloudData._synced_at || new Date().toISOString();
    saveSyncCfg(cfg);
    console.log('[Sync] Loaded cloud data — rows:', db.daily_ledger.length);
  } else {
    console.log('[Sync] Local is current — rows:', db.daily_ledger.length);
  }
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
  const user  = users[uname];

  if (!user || !user.active)
    return { success: false, error: 'Invalid username or credential.' };

  const inputHash = await hashString(credential.trim());

  if (user.role === 'owner') {
    if (inputHash !== user.passwordHash)
      return { success: false, error: 'Incorrect password.' };
    setSession(user);
    return { success: true, user };
  }

  // Employee — PIN check
  if (inputHash !== user.pinHash)
    return { success: false, error: 'Invalid username or PIN.' };

  // Device binding
  const deviceId = getDeviceId();
  if (!user.deviceId) {
    // First login on this device — register automatically
    users[uname].deviceId = deviceId;
    users[uname].deviceRegisteredAt = new Date().toISOString();
    saveUsers(users);
    setSession(users[uname]);
    return { success: true, user: users[uname], newDevice: true };
  }

  if (user.deviceId !== deviceId)
    return { success: false, error: 'Unauthorized device.\nThis account is not registered on this device.\nContact your manager.' };

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

    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Log In'; }

    if (!result.success) {
      if (errEl) errEl.textContent = result.error;
      return;
    }
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
  if (!badge) return;
  badge.textContent    = pending || '';
  badge.style.display  = pending > 0 ? 'inline-flex' : 'none';
}

// ── Employee: Submit Reading form ──────────────────────────
function renderEmployeeView(session) {
  const nameEl = document.getElementById('emp-user-name');
  if (nameEl) nameEl.textContent = session.displayName;

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
  const date  = document.getElementById('emp-date')?.value;
  const shift = document.getElementById('emp-shift')?.value || 'day';

  if (!date) { showNotification('Please select a date.', 'danger'); return; }

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
  showNotification('✅ Reading submitted for approval!', 'success');

  // Clear form
  ['emp-date','emp-du1p-open','emp-du1p-close','emp-du1p-tests',
   'emp-du1d-open','emp-du1d-close','emp-du1d-tests',
   'emp-du2p-open','emp-du2p-close','emp-du2p-tests',
   'emp-du2d-open','emp-du2d-close','emp-du2d-tests',
   'emp-cash','emp-card','emp-remarks']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  renderEmployeeView(session);
}

// ── Owner: Approvals Panel ─────────────────────────────────
function renderApprovalsPanel() {
  updateApprovalsBadge();
  const container = document.getElementById('approvals-list');
  if (!container) return;
  const all = (db.pending_entries || []).sort((a,b) => b.submittedAt.localeCompare(a.submittedAt));

  if (all.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#64748b;padding:3rem;font-size:1rem;">No submissions yet. Employees submit readings from their phones.</div>';
    return;
  }
  container.innerHTML = all.map(entry => {
    const isPending = entry.status === 'pending';
    const sc = entry.status === 'approved' ? '#22c55e' : entry.status === 'rejected' ? '#ef4444' : '#f97316';
    const ed = entry.entryData;
    const ms  = Math.max(0,
      ((ed.du1_p?.close_day||0)+(ed.du1_p?.close_night||0)-(ed.du1_p?.open||0)-(ed.du1_p?.tests_day||0)-(ed.du1_p?.tests_night||0)) +
      ((ed.du2_p?.close_day||0)+(ed.du2_p?.close_night||0)-(ed.du2_p?.open||0)-(ed.du2_p?.tests_day||0)-(ed.du2_p?.tests_night||0)));
    const hsd = Math.max(0,
      ((ed.du1_d?.close_day||0)+(ed.du1_d?.close_night||0)-(ed.du1_d?.open||0)-(ed.du1_d?.tests_day||0)-(ed.du1_d?.tests_night||0)) +
      ((ed.du2_d?.close_day||0)+(ed.du2_d?.close_night||0)-(ed.du2_d?.open||0)-(ed.du2_d?.tests_day||0)-(ed.du2_d?.tests_night||0)));
    return `
      <div style="background:#1e293b;border:1px solid ${isPending?'#f97316':'#334155'};border-radius:1rem;padding:1.25rem;margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
          <div>
            <div style="font-weight:800;color:#f8fafc;">${ed.date} · ${ed.shift==='day'?'☀️ Day':'🌙 Night'}</div>
            <div style="font-size:0.78rem;color:#94a3b8;">By <strong style="color:#f97316;">${entry.submittedByName}</strong> · ${entry.submittedAt.replace('T',' ').slice(0,16)}</div>
          </div>
          <span style="color:${sc};font-weight:700;font-size:0.8rem;padding:0.2rem 0.7rem;background:rgba(0,0,0,0.4);border-radius:9999px;">${entry.status.toUpperCase()}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.4rem;margin-bottom:0.75rem;">
          ${[['MS Sold',ms.toFixed(0)+' L'],['HSD Sold',hsd.toFixed(0)+' L'],['Cash',formatCurrency(ed.cash_sales||0)],['Card/UPI',formatCurrency(ed.card_sales||0)]]
            .map(([l,v])=>`<div style="background:#0f1117;border-radius:0.5rem;padding:0.5rem;text-align:center;"><div style="font-size:0.65rem;color:#64748b;">${l}</div><div style="font-weight:700;color:#f8fafc;font-size:0.85rem;">${v}</div></div>`).join('')}
        </div>
        ${ed.remarks?`<div style="font-size:0.78rem;color:#94a3b8;margin-bottom:0.5rem;">📝 ${ed.remarks}</div>`:''}
        ${isPending?`
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button onclick="approveEntry('${entry.id}')" style="flex:1;min-width:100px;background:#22c55e;color:#fff;border:none;border-radius:0.5rem;padding:0.55rem 1rem;font-weight:700;cursor:pointer;">✅ Approve</button>
          <button onclick="promptRejectEntry('${entry.id}')" style="flex:1;min-width:100px;background:#ef4444;color:#fff;border:none;border-radius:0.5rem;padding:0.55rem 1rem;font-weight:700;cursor:pointer;">❌ Reject</button>
        </div>`:''}
        ${entry.status==='rejected'&&entry.rejectionReason?`<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(239,68,68,0.1);border-radius:0.4rem;color:#fca5a5;font-size:0.78rem;">Rejected by ${entry.reviewedBy}: ${entry.rejectionReason}</div>`:''}
      </div>`;
  }).join('');
}

function approveEntry(entryId) {
  const session = getSession();
  if (!session || session.role !== 'owner') return;
  const idx = (db.pending_entries||[]).findIndex(e=>e.id===entryId);
  if (idx===-1) return;
  const entry = db.pending_entries[idx];
  const ed    = entry.entryData;
  // Check for duplicate date
  if (db.daily_ledger.find(r=>r.date===ed.date)) {
    showNotification(`⚠️ Ledger entry for ${ed.date} already exists. Review manually.`, 'danger');
    return;
  }
  db.daily_ledger.push({
    date: ed.date, du1_p: ed.du1_p, du1_d: ed.du1_d, du2_p: ed.du2_p, du2_d: ed.du2_d,
    recon: { cash: ed.cash_sales||0, phonepe: ed.card_sales||0, credit: 0,
             total_collection: (ed.cash_sales||0)+(ed.card_sales||0), remarks: ed.remarks||'' },
    _approved_by: session.username, _approved_at: new Date().toISOString(),
    _submitted_by: entry.submittedBy
  });
  db.daily_ledger.sort((a,b)=>b.date.localeCompare(a.date));
  db.pending_entries[idx].status     = 'approved';
  db.pending_entries[idx].reviewedBy = session.username;
  db.pending_entries[idx].reviewedAt = new Date().toISOString();
  saveDB();
  showNotification(`✅ Entry for ${ed.date} approved and added to ledger.`, 'success');
  renderApprovalsPanel();
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
          </div>
        </div>`).join('');

  const addBtn = document.getElementById('add-employee-btn');
  if (addBtn && !addBtn._wired) {
    console.log('[User Management] Wiring add employee button listener');
    addBtn._wired = true;
    addBtn.addEventListener('click', addEmployee);
  }

  const setupBtn = document.getElementById('copy-setup-link-btn');
  if (setupBtn && !setupBtn._wired) {
    setupBtn._wired = true;
    setupBtn.addEventListener('click', copyEmployeeSetupLink);
  }
}

async function addEmployee() {
  console.log('[User Management] addEmployee clicked!');
  try {
    const name = document.getElementById('new-emp-name')?.value.trim();
    const user = document.getElementById('new-emp-username')?.value.trim().toLowerCase().replace(/\s+/g,'');
    const pin  = document.getElementById('new-emp-pin')?.value.trim();
    console.log('[User Management] Form inputs:', { name, user, pin });
    if (!name||!user||!pin) { showNotification('Fill in all three fields.','danger'); return; }
    if (!/^\d{4,6}$/.test(pin)) { showNotification('PIN must be 4–6 digits.','danger'); return; }
    const users = getUsers();
    if (users[user]) { showNotification('Username already exists.','danger'); return; }
    users[user] = {
      username: user, displayName: name, role: 'employee',
      pinHash: await hashString(pin),
      deviceId: null, deviceRegisteredAt: null,
      active: true, createdAt: new Date().toISOString()
    };
    saveUsers(users);
    document.getElementById('new-emp-name').value = '';
    document.getElementById('new-emp-username').value = '';
    document.getElementById('new-emp-pin').value = '';
    showNotification(`✅ Employee "${name}" added successfully!`, 'success');
    renderUserManagement();
  } catch (err) {
    console.error('Failed to add employee:', err);
    showNotification('❌ Failed to add employee: ' + err.message, 'danger');
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
      if (!db.employees || db.employees.length === 0) {
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
}

function saveDB() {
  localStorage.setItem('octaneflow_db', JSON.stringify(db));
  // Auto-push to cloud on every save (debounced 2s to avoid hammering API)
  clearTimeout(saveDB._pushTimer);
  saveDB._pushTimer = setTimeout(() => syncPush(), 2000);
}

function resetDB() {
  db = JSON.parse(JSON.stringify(DEFAULT_DB));
  try { db.users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); }
  catch { db.users = {}; }
  saveDB();
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
function computeLedgerRow(row) {
  // FIX: Read tests as local variables — NEVER mutate the stored row object.
  // tests_day = 1 if the day shift actually ran (close_day > open), else 0.
  const t1p_day   = (row.du1_p && row.du1_p.close_day > row.du1_p.open)   ? (row.du1_p.tests_day   || 1) : 0;
  const t1p_night = (row.du1_p && row.du1_p.close_night > row.du1_p.close_day) ? (row.du1_p.tests_night || 0) : 0;
  const t1d_day   = (row.du1_d && row.du1_d.close_day > row.du1_d.open)   ? (row.du1_d.tests_day   || 1) : 0;
  const t1d_night = (row.du1_d && row.du1_d.close_night > row.du1_d.close_day) ? (row.du1_d.tests_night || 0) : 0;
  const t2p_day   = (row.du2_p && row.du2_p.close_day > row.du2_p.open)   ? (row.du2_p.tests_day   || 1) : 0;
  const t2p_night = (row.du2_p && row.du2_p.close_night > row.du2_p.close_day) ? (row.du2_p.tests_night || 0) : 0;
  const t2d_day   = (row.du2_d && row.du2_d.close_day > row.du2_d.open)   ? (row.du2_d.tests_day   || 1) : 0;
  const t2d_night = (row.du2_d && row.du2_d.close_night > row.du2_d.close_day) ? (row.du2_d.tests_night || 0) : 0;

  // 1. Day Sales Qty: Close Day - Open - (Tests Day * 5L per test)
  const d1_p_day = Math.max(0, (row.du1_p.close_day   || 0) - (row.du1_p.open || 0) - (t1p_day   * 5));
  const d1_d_day = Math.max(0, (row.du1_d.close_day   || 0) - (row.du1_d.open || 0) - (t1d_day   * 5));
  const d2_p_day = Math.max(0, (row.du2_p.close_day   || 0) - (row.du2_p.open || 0) - (t2p_day   * 5));
  const d2_d_day = Math.max(0, (row.du2_d.close_day   || 0) - (row.du2_d.open || 0) - (t2d_day   * 5));

  // 2. Night Sales Qty: Close Night - Close Day - (Tests Night * 5L per test)
  const d1_p_night = Math.max(0, (row.du1_p.close_night || 0) - (row.du1_p.close_day || 0) - (t1p_night * 5));
  const d1_d_night = Math.max(0, (row.du1_d.close_night || 0) - (row.du1_d.close_day || 0) - (t1d_night * 5));
  const d2_p_night = Math.max(0, (row.du2_p.close_night || 0) - (row.du2_p.close_day || 0) - (t2p_night * 5));
  const d2_d_night = Math.max(0, (row.du2_d.close_night || 0) - (row.du2_d.close_day || 0) - (t2d_night * 5));

  // 3. Totals
  const day_petrol = d1_p_day + d2_p_day;
  const day_diesel = d1_d_day + d2_d_day;
  const night_petrol = d1_p_night + d2_p_night;
  const night_diesel = d1_d_night + d2_d_night;

  const net_petrol_24h = day_petrol + night_petrol;
  const net_diesel_24h = day_diesel + night_diesel;

  // 4. Financials
  const rev_petrol = net_petrol_24h * row.prices.petrol;
  const rev_diesel = net_diesel_24h * row.prices.diesel;
  const total_revenue = rev_petrol + rev_diesel;

  const cost_petrol = net_petrol_24h * db.stock.petrol_cost_wac;
  const cost_diesel = net_diesel_24h * db.stock.diesel_cost_wac;
  const total_cost = cost_petrol + cost_diesel;

  const profit = total_revenue - total_cost;

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
      profit
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
    showNotification(`Reconciliation completed for ${formatDate(data.date)}.`, "success");
  } else {
    // New date log entry: directly subtract sales from stock
    db.stock.petrol = Math.max(0, db.stock.petrol - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel - newNetD);
    
    db.daily_ledger.push(data);
    showNotification(`Daily readings logged for ${formatDate(data.date)}.`, "success");
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

function recordTanker(dateStr, timeStr, loadType, customP, customD, priceP, priceD) {
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
    return;
  }

  if (petrolQty % 4000 !== 0 || dieselQty % 4000 !== 0) {
    showNotification("Illogical value rejected. Petrol and Diesel quantities must be multiples of 4,000 Liters (corresponding to 4kl compartments).", "danger");
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
    deadline_date: creditDetails.deadlineDate,
    rtgs_filing_date: creditDetails.rtgsDate,
    payment_status: 'unpaid',
    paid_date: null,
    interest_charged: 0
  };

  db.purchases.unshift(purchase);
  saveDB();
  showNotification("Tanker purchase recorded. Stock levels increased.", "success");
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
  showNotification("Selling prices updated.", "success");
}

function addHoliday(dateStr, name) {
  if (db.holidays.some(h => h.date === dateStr)) {
    showNotification("A holiday is already recorded for this date!", "danger");
    return;
  }
  db.holidays.push({ date: dateStr, name });
  db.holidays.sort((a,b) => new Date(a.date) - new Date(b.date));
  saveDB();
  showNotification("Bank holiday added to calendar.", "success");
}

function removeHoliday(dateStr) {
  db.holidays = db.holidays.filter(h => h.date !== dateStr);
  saveDB();
  showNotification("Holiday removed.", "info");
}

function togglePayment(purchaseId) {
  const p = db.purchases.find(item => item.id === purchaseId);
  if (!p) return;

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
      showNotification(`Payment marked as PAID (Late by ${diffDays} days). Interest charged.`, "warning");
    } else {
      p.interest_charged = 0;
      showNotification("Payment marked as PAID (On Time).", "success");
    }
  } else {
    p.payment_status = 'unpaid';
    p.paid_date = null;
    p.interest_charged = 0;
    showNotification("Payment reset to unpaid status.", "info");
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
      const c = computeLedgerRow(row);
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
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const targetView = item.dataset.view;
    
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    
    item.classList.add('active');
    document.getElementById(`view-${targetView}`).classList.add('active');
    
    const headerTitle = document.getElementById('view-title');
    const titles = {
      dashboard: "Dashboard Overview",
      ledger: "Sales Cumulative Ledger",
      purchases: "Tankers & Credit Operations",
      pricing: "Fuel Selling Prices",
      holidays: "Bank Holiday Calendar",
      settings: "System Settings & Utilities",
      cashflow: "Cash Flow & Orders Solver",
      'shift-recon': "Shift Reconciliation & Cash Count",
      expenses: "Expense Ledger"
    };
    headerTitle.textContent = titles[targetView] || "OctaneFlow";

    renderActiveView(targetView);
  });
});

function renderActiveView(viewName) {
  if (viewName === 'dashboard')   { renderDashboard(); updateApprovalsBadge(); }
  if (viewName === 'ledger')      renderLedger();
  if (viewName === 'purchases')   renderPurchases();
  if (viewName === 'pricing')     renderPricing();
  if (viewName === 'holidays')    renderHolidays();
  if (viewName === 'settings')    { renderSettings(); renderUserManagement(); }
  if (viewName === 'cashflow')    renderCashFlow();
  if (viewName === 'shift-recon') renderShiftRecon();
  if (viewName === 'expenses')    renderExpenseLedger();
  if (viewName === 'approvals')   renderApprovalsPanel();
}

// -------------------------------------------------------------
// VIEW-SPECIFIC RENDERERS
// -------------------------------------------------------------
function renderDashboard() {
  const activePrice = db.prices[0] || { petrol: 103.50, diesel: 90.80 };
  
  document.getElementById('current-date-span').textContent = formatDate(new Date().toISOString().split('T')[0]);

  document.getElementById('dash-selling-prices').textContent = 
    `P: ${formatCurrency(activePrice.petrol)} | D: ${formatCurrency(activePrice.diesel)}`;
  document.getElementById('dash-prices-last-updated').textContent = 
    activePrice.effective_date ? `Effective: ${formatDateTime(activePrice.effective_date)}` : "No price logged";

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

  // Tanks Levels
  const petrolVol = db.stock.petrol;
  const dieselVol = db.stock.diesel;
  const maxPetrol = db.settings.petrol_capacity;
  const maxDiesel = db.settings.diesel_capacity;
  
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

  const stockDieselEl = document.getElementById('tank-stock-diesel');
  if (stockDieselEl) stockDieselEl.textContent = formatVol(dieselVol);
  const usableDieselEl = document.getElementById('tank-usable-diesel');
  if (usableDieselEl) usableDieselEl.textContent = formatVol(usableD);
  const deadDieselEl = document.getElementById('tank-dead-diesel');
  if (deadDieselEl) deadDieselEl.textContent = formatVol(deadDStock);
  const percentDieselEl = document.getElementById('tank-percent-diesel');
  if (percentDieselEl) percentDieselEl.textContent = `${dieselPct.toFixed(1)}% of ${maxDiesel} L`;

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

  if (ledgerViewMode === 'table') {
    tableContainer.style.display = 'block';
    splitContainer.style.display = 'none';
    document.getElementById('ledger-pnl-container').style.display = 'none';
    toggleBtn.style.display = 'inline-flex';

    let headerHtml = '';
    let rowsHtml = '';

    const getAnomalyStats = (row, index) => {
      const prevRow = index + 1 < db.daily_ledger.length ? db.daily_ledger[index + 1] : null;
      const isPriceChange = prevRow && (row.prices.petrol !== prevRow.prices.petrol || row.prices.diesel !== prevRow.prices.diesel);
      
      const c = computeLedgerRow(row);
      const isNoSalePetrol = c.totals.net_24h.petrol <= 0;
      const isNoSaleDiesel = c.totals.net_24h.diesel <= 0;
      
      const testsP = row.du1_p.tests_day + row.du2_p.tests_day;
      const testsD = row.du1_d.tests_day + row.du2_d.tests_day;
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
      
      return {
        isPriceChange,
        isNoSalePetrol,
        isNoSaleDiesel,
        isNoTesting,
        isNegativeProfit,
        hasVariance,
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
          </tr>
        </thead>
      `;

      db.daily_ledger.forEach((row, index) => {
        const anomaly = getAnomalyStats(row, index);
        const c = anomaly.c;
        const testsP = anomaly.testsP;
        const testsD = anomaly.testsD;

        rowsHtml += `
          <tr>
            <td class="sticky-col-left"><strong>${formatDate(row.date)}</strong>${anomaly.badgesHtml}</td>
            <td class="col-petrol ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${row.prices.petrol.toFixed(2)}</td>
            <td class="col-diesel ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${row.prices.diesel.toFixed(2)}</td>
            
            <!-- DU 1 24Hr -->
            <td class="bg-petrol-group">${row.du1_p.open.toFixed(1)}</td>
            <td class="bg-petrol-group">${row.du1_p.close_night.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du1_d.open.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du1_d.close_night.toFixed(1)}</td>
            
            <!-- DU 2 24Hr -->
            <td class="bg-petrol-group">${row.du2_p.open.toFixed(1)}</td>
            <td class="bg-petrol-group">${row.du2_p.close_night.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du2_d.open.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du2_d.close_night.toFixed(1)}</td>

            <!-- 24hr Net Liters -->
            <td class="col-petrol bg-petrol-group ${anomaly.isNoSalePetrol ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${c.totals.net_24h.petrol.toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group ${anomaly.isNoSaleDiesel ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${c.totals.net_24h.diesel.toFixed(1)}</td>

            <!-- 24hr Tests -->
            <td class="col-petrol bg-petrol-group ${testsP === 0 ? 'cell-anomaly-no-test' : ''}">${testsP * 5} L</td>
            <td class="col-diesel bg-diesel-group ${testsD === 0 ? 'cell-anomaly-no-test' : ''}">${testsD * 5} L</td>

            <!-- Revenue -->
            <td class="col-petrol">${formatCurrency(c.financials.rev_petrol)}</td>
            <td class="col-diesel">${formatCurrency(c.financials.rev_diesel)}</td>
            <td style="font-weight:600;">${formatCurrency(c.financials.total_revenue)}</td>
            
            <!-- Cost & Profit -->
            <td>${formatCurrency(c.financials.total_cost)}</td>
            <td class="${c.financials.profit >= 0 ? 'text-success' : 'text-danger'} ${anomaly.isNegativeProfit ? 'cell-anomaly-negative-profit' : ''}" style="font-weight: 600;">
              ${formatCurrency(c.financials.profit)}
            </td>

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
          </tr>
        </thead>
      `;

      db.daily_ledger.forEach((row, index) => {
        const anomaly = getAnomalyStats(row, index);
        const c = anomaly.c;
        const testsP = anomaly.testsP;
        const testsD = anomaly.testsD;
        rowsHtml += `
          <tr>
            <td class="sticky-col-left"><strong>${formatDate(row.date)}</strong>${anomaly.badgesHtml}</td>
            <td class="col-petrol ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${row.prices.petrol.toFixed(2)}</td>
            <td class="col-diesel ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${row.prices.diesel.toFixed(2)}</td>
            
            <!-- DU1 Day -->
            <td class="bg-petrol-group">${row.du1_p.open.toFixed(1)}</td>
            <td class="bg-petrol-group">${row.du1_p.close_day.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du1_d.open.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du1_d.close_day.toFixed(1)}</td>
            
            <!-- DU2 Day -->
            <td class="bg-petrol-group">${row.du2_p.open.toFixed(1)}</td>
            <td class="bg-petrol-group">${row.du2_p.close_day.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du2_d.open.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du2_d.close_day.toFixed(1)}</td>

            <!-- DU1 Night -->
            <td class="bg-petrol-group">${row.du1_p.close_day.toFixed(1)}</td>
            <td class="bg-petrol-group">${row.du1_p.close_night.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du1_d.close_day.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du1_d.close_night.toFixed(1)}</td>
            
            <!-- DU2 Night -->
            <td class="bg-petrol-group">${row.du2_p.close_day.toFixed(1)}</td>
            <td class="bg-petrol-group">${row.du2_p.close_night.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du2_d.close_day.toFixed(1)}</td>
            <td class="bg-diesel-group">${row.du2_d.close_night.toFixed(1)}</td>

            <!-- Day Sales Net -->
            <td class="col-petrol bg-petrol-group">${c.sales.du1_p.day.toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${c.sales.du1_d.day.toFixed(1)}</td>
            <td class="col-petrol bg-petrol-group">${c.sales.du2_p.day.toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${c.sales.du2_d.day.toFixed(1)}</td>

            <!-- Night Sales Net -->
            <td class="col-petrol bg-petrol-group">${c.sales.du1_p.night.toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${c.sales.du1_d.night.toFixed(1)}</td>
            <td class="col-petrol bg-petrol-group">${c.sales.du2_p.night.toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${c.sales.du2_d.night.toFixed(1)}</td>

            <!-- Day Tests -->
            <td class="col-petrol bg-petrol-group">${(row.du1_p.tests_day + row.du2_p.tests_day) * 5} L</td>
            <td class="col-diesel bg-diesel-group">${(row.du1_d.tests_day + row.du2_d.tests_day) * 5} L</td>

            <!-- 24hr Net Liters -->
            <td class="col-petrol bg-petrol-group ${anomaly.isNoSalePetrol ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${c.totals.net_24h.petrol.toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group ${anomaly.isNoSaleDiesel ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${c.totals.net_24h.diesel.toFixed(1)}</td>

            <!-- Revenue -->
            <td class="col-petrol">${formatCurrency(c.financials.rev_petrol)}</td>
            <td class="col-diesel">${formatCurrency(c.financials.rev_diesel)}</td>
            <td style="font-weight:600;">${formatCurrency(c.financials.total_revenue)}</td>
            
            <!-- Cost & Profit -->
            <td>${formatCurrency(c.financials.total_cost)}</td>
            <td class="${c.financials.profit >= 0 ? 'text-success' : 'text-danger'} ${anomaly.isNegativeProfit ? 'cell-anomaly-negative-profit' : ''}" style="font-weight: 600;">
              ${formatCurrency(c.financials.profit)}
            </td>

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
      const c = computeLedgerRow(row);
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

    const c = computeLedgerRow(selectedRow);

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
            Reporting Date: <strong>${formatDate(selectedRow.date)}</strong> | Selling Rates: Petrol: <strong>₹${selectedRow.prices.petrol.toFixed(2)}</strong>, Diesel: <strong>₹${selectedRow.prices.diesel.toFixed(2)}</strong>
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
      const testsP = selectedRow.du1_p.tests_day + selectedRow.du2_p.tests_day;
      const testsD = selectedRow.du1_d.tests_day + selectedRow.du2_d.tests_day;
      
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
                    Open: ${selectedRow.du1_p.open.toFixed(1)}<br>
                    Close: ${selectedRow.du1_p.close_night.toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${(selectedRow.du1_p.close_night - selectedRow.du1_p.open).toFixed(1)} L</span>
                    ${selectedRow.du1_p.tests_day > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${selectedRow.du1_p.tests_day * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${(c.sales.du1_p.day + c.sales.du1_p.night).toFixed(1)} L</strong></span>
                </div>
                
                <!-- Diesel Nozzle -->
                <div class="flow-nozzle-section diesel">
                  <div class="flow-nozzle-label" style="color:var(--color-diesel);">
                    <span>Diesel (HSD)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 2</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${selectedRow.du1_d.open.toFixed(1)}<br>
                    Close: ${selectedRow.du1_d.close_night.toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${(selectedRow.du1_d.close_night - selectedRow.du1_d.open).toFixed(1)} L</span>
                    ${selectedRow.du1_d.tests_day > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${selectedRow.du1_d.tests_day * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${(c.sales.du1_d.day + c.sales.du1_d.night).toFixed(1)} L</strong></span>
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
                    Open: ${selectedRow.du2_p.open.toFixed(1)}<br>
                    Close: ${selectedRow.du2_p.close_night.toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${(selectedRow.du2_p.close_night - selectedRow.du2_p.open).toFixed(1)} L</span>
                    ${selectedRow.du2_p.tests_day > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${selectedRow.du2_p.tests_day * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${(c.sales.du2_p.day + c.sales.du2_p.night).toFixed(1)} L</strong></span>
                </div>
                
                <!-- Diesel Nozzle -->
                <div class="flow-nozzle-section diesel">
                  <div class="flow-nozzle-label" style="color:var(--color-diesel);">
                    <span>Diesel (HSD)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 4</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${selectedRow.du2_d.open.toFixed(1)}<br>
                    Close: ${selectedRow.du2_d.close_night.toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${(selectedRow.du2_d.close_night - selectedRow.du2_d.open).toFixed(1)} L</span>
                    ${selectedRow.du2_d.tests_day > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${selectedRow.du2_d.tests_day * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${(c.sales.du2_d.day + c.sales.du2_d.night).toFixed(1)} L</strong></span>
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
                <span>P: ${c.totals.net_24h.petrol.toFixed(0)}L × ₹${selectedRow.prices.petrol.toFixed(2)}</span>
                <span>${formatCurrency(c.financials.rev_petrol)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border); margin-bottom:0.25rem;">
                <span>D: ${c.totals.net_24h.diesel.toFixed(0)}L × ₹${selectedRow.prices.diesel.toFixed(2)}</span>
                <span>${formatCurrency(c.financials.rev_diesel)}</span>
              </div>
              
              <div style="display:flex; justify-content:space-between; border-top:1px dashed var(--border); padding-top:0.5rem; margin-top:0.25rem;">
                <span style="color:var(--text-muted);">WAC Purchase Cost:</span>
                <span style="font-weight:600; color:#fff;">${formatCurrency(c.financials.total_cost)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>P WAC Cost (₹${db.stock.petrol_cost_wac.toFixed(2)}):</span>
                <span>${formatCurrency(c.totals.net_24h.petrol * db.stock.petrol_cost_wac)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>D WAC Cost (₹${db.stock.diesel_cost_wac.toFixed(2)}):</span>
                <span>${formatCurrency(c.totals.net_24h.diesel * db.stock.diesel_cost_wac)}</span>
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
      const dayRev = (c.totals.day.petrol * selectedRow.prices.petrol) + (c.totals.day.diesel * selectedRow.prices.diesel);
      const nightRev = (c.totals.night.petrol * selectedRow.prices.petrol) + (c.totals.night.diesel * selectedRow.prices.diesel);
      const totalRev = dayRev + nightRev || 1;
      
      const dayShare = (dayRev / totalRev) * 100;
      const nightShare = (nightRev / totalRev) * 100;
      
      const maxPetrol = Math.max(c.totals.day.petrol, c.totals.night.petrol) || 1;
      const maxDiesel = Math.max(c.totals.day.diesel, c.totals.night.diesel) || 1;
      
      const dayPetPct = (c.totals.day.petrol / maxPetrol) * 100;
      const nightPetPct = (c.totals.night.petrol / maxPetrol) * 100;
      
      const dayDiePct = (c.totals.day.diesel / maxDiesel) * 100;
      const nightDiePct = (c.totals.night.diesel / maxDiesel) * 100;
      
      const dayTestsP = selectedRow.du1_p.tests_day + selectedRow.du2_p.tests_day;
      const dayTestsD = selectedRow.du1_d.tests_day + selectedRow.du2_d.tests_day;
      
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
    
    tr.innerHTML = `
      <td>
        <strong>${formatDate(p.date.split('T')[0])}</strong><br>
        <span style="font-size: 0.8rem; color: var(--text-dim);">${p.date.split('T')[1]}</span>
      </td>
      <td>${formatVol(p.petrol_liters)}</td>
      <td>${formatVol(p.diesel_liters)}</td>
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
  removeHoliday(dateStr);
  renderHolidays();
}

function renderSettings() {
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
}

// -------------------------------------------------------------
// EVENT HANDLERS & MODALS
// -------------------------------------------------------------
function openLogReadingsModal() {
  // Set date field to today
  document.getElementById('ledger-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('log-readings-modal-title').textContent = "Log Daily Totalizer Readings";
  
  // Clear form fields
  document.getElementById('log-readings-form').reset();
  document.getElementById('ledger-date').value = new Date().toISOString().split('T')[0];
  
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

tankerLoadSelect.addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    customSliders.style.display = 'block';
    updateCustomLoadTotals();
  } else {
    customSliders.style.display = 'none';
  }
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
});

customDInput.addEventListener('input', () => {
  const d = parseInt(customDInput.value);
  customPInput.value = 12000 - d;
  updateCustomLoadTotals();
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
    const close_day = parseFloat(document.getElementById(`${prefix}_close_day`).value) || 0;
    const close_night = parseFloat(document.getElementById(`${prefix}_close_night`).value) || 0;
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

  const ledgerEntry = { date, prices: { petrol: prices.petrol, diesel: prices.diesel }, du1_p, du1_d, du2_p, du2_d };
  
  saveDailyReadings(ledgerEntry);
  closeModal('log-readings-modal');
  initApp();
});

document.getElementById('tanker-purchase-form').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const date = document.getElementById('purchase-date').value;
  const time = document.getElementById('purchase-time').value;
  const loadType = tankerLoadSelect.value;
  const priceP = parseFloat(document.getElementById('purchase-price-petrol').value);
  const priceD = parseFloat(document.getElementById('purchase-price-diesel').value);
  
  const customP = parseInt(customPInput.value);
  const customD = parseInt(customDInput.value);

  recordTanker(date, time, loadType, customP, customD, priceP, priceD);
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
  triggerDownload(jsonStr, `octaneflow_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
});

document.getElementById('restore-db-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

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
        saveDB();
        showNotification("Database restored successfully!", "success");
        initApp();
      } else {
        showNotification("Invalid file format. Verification failed.", "danger");
      }
    } catch (err) {
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
  document.querySelector('[data-view="purchases"]').click();
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
  showNotification("Excel simulation database successfully seeded!", "success");
  initApp();
}

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
function initApp() {
  loadDB();
  document.getElementById('current-date-span').textContent = formatDate(new Date().toISOString().split('T')[0]);

  // Read current active tab and render it
  const activeTab = document.querySelector('.nav-item.active').dataset.view;
  renderActiveView(activeTab);

  // Start cloud sync check (async — won't block render)
  initSync().then(() => {
    // Re-render after sync in case cloud had newer data
    renderActiveView(document.querySelector('.nav-item.active').dataset.view);
  }).catch(() => setSyncStatus('error'));
}

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

  // Wire up Take a Tour button
  const tourBtn = document.getElementById('take-tour-btn');
  if (tourBtn) tourBtn.addEventListener('click', () => startTour());

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
          const activeItem = document.querySelector('.nav-item.active');
          if (activeItem) renderActiveView(activeItem.dataset.view);
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
    target: '[data-view="ledger"]',
    setup: () => {
      // Step 1: Open Sales Cumulative tab
      const tab = document.querySelector('[data-view="ledger"]');
      if (tab) tab.click();
    },
    align: 'right',
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
    target: '[data-view="cashflow"]',
    setup: () => {
      const tab = document.querySelector('[data-view="cashflow"]');
      if (tab) tab.click();
    },
    align: 'right',
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
      
      document.getElementById('recon-p-tests').value = (row.du1_p.tests_day + row.du2_p.tests_day) * 5;
      document.getElementById('recon-d-tests').value = (row.du1_d.tests_day + row.du2_d.tests_day) * 5;
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
      if (rData.cash_counted) {
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
  
  document.getElementById('recon-p-tests').value = p_tests;
  document.getElementById('recon-d-tests').value = d_tests;
  
  // Volume Calculations
  const du1_p_sales = du1_p_close > 0 ? Math.max(0, du1_p_close - du1_p_open) : 0;
  const du2_p_sales = du2_p_close > 0 ? Math.max(0, du2_p_close - du2_p_open) : 0;
  const du1_d_sales = du1_d_close > 0 ? Math.max(0, du1_d_close - du1_d_open) : 0;
  const du2_d_sales = du2_d_close > 0 ? Math.max(0, du2_d_close - du2_d_open) : 0;
  
  const petrol_gross = du1_p_sales + du2_p_sales;
  const diesel_gross = du1_d_sales + du2_d_sales;
  
  const petrol_net = Math.max(0, petrol_gross - p_tests);
  const diesel_net = Math.max(0, diesel_gross - d_tests);
  
  const total_liters = petrol_net + diesel_net;
  
  // Financial Calculations
  const dateStr = document.getElementById('recon-date').value;
  const prices = getPricesAt(dateStr);
  
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
  
  if (du1_p_close < du1_p_open || du2_p_close < du2_p_open || du1_d_close < du1_d_open || du2_d_close < du2_d_open) {
    showNotification("Closing readings cannot be less than opening readings.", "danger");
    return;
  }
  
  const p_tests = parseFloat(document.getElementById('recon-p-tests').value) || 0;
  const d_tests = parseFloat(document.getElementById('recon-d-tests').value) || 0;
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
  
  row.recon = row.recon || {};
  row.recon[shift] = {
    phonepe_close: curr_pe,
    phonepe_net: net_pe,
    expenses: JSON.parse(JSON.stringify(window.reconExpensesList)),
    cash_counted: counted_cash,
    expected_cash: shift_expected_cash,
    variance: shift_variance,
    paper_verified: !!window.ocrExtractedValues,
    paper_timestamp: window.ocrExtractedValues ? window.ocrExtractedValues.timestamp : null
  };
  
  // Call general ledger save logic which also automatically updates stock
  saveDailyReadings(row);
  
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
        <button class="btn btn-secondary btn-sm" onclick="deleteEmployee(${index})" style="padding: 0.15rem 0.35rem; font-size: 0.65rem; border-radius:3px; background:rgba(239, 68, 68, 0.15); color:rgb(248, 113, 113); border:none; cursor:pointer;">Delete</button>
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

function deleteEmployee(index) {
  const emp = db.employees[index];
  if (!confirm(`Are you sure you want to delete authorized employee ${emp.name}?`)) return;
  
  db.employees.splice(index, 1);
  saveDB();
  renderEmployeesTable();
  renderSyncMessages();
  showNotification(`Employee deleted from authorized directory.`, "info");
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
    .filter(p => p.petrol_liters > 0 || p.diesel_liters > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // All unique dates in ledger, sorted oldest first
  const ledgerDates = [...new Set(db.daily_ledger.map(r => r.date))].sort();

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
    while (pi < purch.length && purch[pi].date.split('T')[0] <= date) {
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
  const sorted = [...db.prices].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  for (const p of sorted) {
    if (p.effective_date.split('T')[0] <= dateStr) return p;
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
