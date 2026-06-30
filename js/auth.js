// ── User Store ─────────────────────────────────────────────
function getUsers() {
  let localUsers = {};
  try { localUsers = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); } catch {}
  
  let dbUsers = (db && db.users) ? db.users : {};
  
  // Bidirectional merge to prevent ANY data loss
  const mergedUsers = { ...localUsers, ...dbUsers };
  
  // If local had users but DB was wiped, restore from local to merged
  for (const k in localUsers) {
    if (!mergedUsers[k]) mergedUsers[k] = localUsers[k];
  }
  
  // Guarantee owner always exists
  if (!mergedUsers['owner']) {
    mergedUsers['owner'] = {
      username: 'owner', displayName: 'Owner', role: 'owner',
      passwordHash: '8dc776bfaf816d9df3c9213be47307223f66f91f7d4cbe20004f1dc0b05b38ed',
      active: true, createdAt: new Date().toISOString()
    };
  }
  
  // Persist the fixed merged list everywhere
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(mergedUsers));
  if (db) {
    db.users = mergedUsers;
    // We don't call saveDB() here to avoid loops, saveDB is handled in auth or sync
  }
  
  return mergedUsers;
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

// ── Create default owner account & recover lost employees ─────────────
async function initAuth() {
  const users = getUsers();
  let modified = false;

  if (!users['owner']) {
    const hash = await hashString('OctaneFlow@2026');
    users['owner'] = {
      username: 'owner', displayName: 'Owner', role: 'owner',
      passwordHash: hash, active: true,
      createdAt: new Date().toISOString()
    };
    modified = true;
  }

  // Auto-recover lost employees from ledger history
  if (db && db.daily_ledger) {
    const pinHash1234 = await hashString('1234');
    db.daily_ledger.forEach(row => {
      const u = row.submitted_by;
      if (u && u !== 'system' && u !== 'owner' && !users[u]) {
        users[u] = {
          username: u, displayName: u.charAt(0).toUpperCase() + u.slice(1), role: 'employee',
          pinHash: pinHash1234, active: true, deviceId: null, // Device ID null means it will ask for approval, but wait! We can bypass it if we want.
          createdAt: new Date().toISOString()
        };
        modified = true;
      }
    });
  }

  if (modified) saveUsers(users);
}

async function loginUser(username, credential) {
  const users = getUsers();
  const uname = username.toLowerCase().trim();
  let user = users[uname];

  if (!user && uname === 'owner') {
    // Default Owner fallback if not found in db
    const defaultHash = await hashString('OctaneFlow@2026');
    user = {
      username: 'owner',
      displayName: 'Owner',
      role: 'owner',
      passwordHash: defaultHash,
      active: true
    };
  }

  if (!user) {
    return { success: false, error: 'User account not found.' };
  }

  if (!user.active) {
    return { success: false, error: 'This account has been deactivated by the administrator.' };
  }

  // Hash the incoming password/PIN to compare
  const incomingHash = await hashString(credential);

  if (user.role === 'owner') {
    const targetHash = user.passwordHash || user.pinHash; // Fallback support
    if (incomingHash !== targetHash) {
      return { success: false, error: 'Incorrect administrator password.' };
    }
  } else {
    // Employee credential check (PIN)
    if (incomingHash !== user.pinHash) {
      return { success: false, error: 'Incorrect employee PIN.' };
    }

    // Strict Device ID check
    const currentDeviceId = getDeviceId();
    if (!user.deviceId) {
      user.deviceId = currentDeviceId;
      saveUsers(users); // Auto-bind on first recovered login
    } else if (user.deviceId !== currentDeviceId) {
      return { success: false, error: 'DEVICE_NOT_APPROVED', user };
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

