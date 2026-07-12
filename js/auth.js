// ============================================================
// OctaneFlow Production Authentication Module (V1)
// ============================================================

// Using global AUTH_USERS_KEY and AUTH_SESSION_KEY defined in sync.js to prevent redeclaration collisions

var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

function getUsers() {
  let localUsers = {};
  try {
    localUsers = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "{}");
  } catch (e) {}

  let dbUsers = (db && db.users) ? db.users : {};
  const mergedUsers = {};
  
  const allIds = new Set([
    ...Object.keys(localUsers || {}),
    ...Object.keys(dbUsers || {})
  ]);

  allIds.forEach((id) => {
    const localUser = localUsers[id] || {};
    const dbUser = dbUsers[id] || {};
    const mergedUser = Object.assign({}, localUser, dbUser);
    if (localUser.deleted || dbUser.deleted) {
      mergedUser.deleted = true;
    } else {
      delete mergedUser.deleted;
    }
    mergedUsers[id] = mergedUser;
  });

  // Ensure owner account always exists
  if (!mergedUsers["owner"]) {
    mergedUsers["owner"] = {
      id: "owner",
      username: "owner",
      displayName: "Owner",
      role: "owner",
      passwordHash: "8dc776bfaf816d9df3c9213be47307223f66f91f7d4cbe20004f1dc0b05b38ed", // Hash for 'OctaneFlow@2026'
      active: true,
      createdAt: new Date().toISOString()
    };
  } else {
    mergedUsers["owner"] = Object.assign({}, mergedUsers["owner"], {
      id: "owner",
      username: "owner",
      displayName: "Owner",
      role: "owner",
      active: true
    });
  }

  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(mergedUsers));
  if (db) {
    db.users = mergedUsers;
  }
  return mergedUsers;
}

function saveUsers(u, immediate = false, markDirty = true) {
  if (db) {
    db.users = u;
    if (markDirty) {
      db.dirty_app_state_keys = db.dirty_app_state_keys || [];
      if (!db.dirty_app_state_keys.includes('users')) {
        db.dirty_app_state_keys.push('users');
      }
    }
    saveDB(immediate);
  }
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(u));
}

// Check local storage only for fallback session
function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function setSession(user) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    loginAt: new Date().toISOString()
  }));
}

// Global hook for checks
window.getAuthSession = getSession;

function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function initAuth() {
  return __async(this, null, function* () {
    // Phase 2: Clean Reset Trigger
    const resetKey = "octaneflow_employee_reset_v1";
    if (!localStorage.getItem(resetKey)) {
      localStorage.removeItem(AUTH_USERS_KEY);
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      if (db) {
        db.users = {};
        db.pending_entries = [];
        db.sync_queue = [];
        db.dirty_app_state_keys = (db.dirty_app_state_keys || []).filter(k => k !== 'users');
        yield saveDB(true);
      }
      localStorage.setItem(resetKey, "true");
      SystemLogger.info("initAuth", "Phase 2: Legacy employee state cleaned successfully.");
    }

    const users = getUsers();
    let modified = false;
    if (!users["owner"]) {
      const hash = yield hashString("OctaneFlow@2026");
      users["owner"] = {
        id: "owner",
        username: "owner",
        displayName: "Owner",
        role: "owner",
        passwordHash: hash,
        active: true,
        createdAt: new Date().toISOString()
      };
      modified = true;
    }
    if (modified) saveUsers(users, true, false);
  });
}

function loginUser(username, credential) {
  return __async(this, null, function* () {
    const uname = username.toLowerCase().trim();
    const isOnline = navigator.onLine;

    // Pull from Supabase first if online to check master account status
    if (isOnline) {
      try {
        const pulled = yield syncPull();
        if (pulled && pulled.users) {
          db.users = pulled.users;
          localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(pulled.users));
        }
      } catch (err) {
        SystemLogger.warning("loginUser", "Could not sync latest users from Supabase on login", err);
      }
    }

    const users = getUsers();
    let user = Object.values(users).find(u => u.username.toLowerCase() === uname && !u.deleted);

    if (!user) {
      if (!isOnline) {
        return { success: false, state: "WAITING_FOR_SYNC", error: "Account not ready yet. Please connect to the internet to complete setup." };
      }
      return { success: false, state: "USERNAME_NOT_FOUND", error: "Account not found." };
    }

    if (!user.active) {
      return { success: false, state: "ACCOUNT_DISABLED", error: "This account has been deactivated by the administrator." };
    }

    const incomingHash = yield hashString(credential.trim());
    const targetHash = user.passwordHash || user.pinHash;
    if (incomingHash !== targetHash) {
      return { success: false, state: "INVALID_PASSWORD", error: "Incorrect password." };
    }

    // Device registration check has been disabled as per new system requirements

    setSession(user);
    SystemLogger.success("loginUser", `User ${user.username} (${user.id}) logged in successfully.`);
    return { success: true, state: "READY", user };
  });
}

function logoutUser() {
  clearSession();
  location.reload();
}

function checkAuth() {
  const session = getSession();
  const loginEl = document.getElementById("login-overlay");
  const appEl = document.getElementById("app-container-shell");
  const empEl = document.getElementById("employee-shell");

  if (!session) {
    if (loginEl) loginEl.style.display = "flex";
    if (appEl) appEl.style.display = "none";
    if (empEl) empEl.style.display = "none";
    return null;
  }

  if (loginEl) loginEl.style.display = "none";
  if (session.role === "owner") {
    if (appEl) appEl.style.display = "flex";
    if (empEl) empEl.style.display = "none";
    const nameEl = document.getElementById("session-user-name");
    if (nameEl) nameEl.textContent = "👑 " + session.displayName;
    updateApprovalsBadge();
  } else {
    if (appEl) appEl.style.display = "none";
    if (empEl) empEl.style.display = "flex";
    renderEmployeeView(session);
  }
  return session;
}
