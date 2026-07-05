var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
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
  
  const mergedUsers = { ...localUsers };
  
  if (db && Array.isArray(db.employees)) {
    db.employees.forEach(emp => {
      if (emp.phone) {
        const phoneKey = emp.phone.replace(/\\D/g, '');
        mergedUsers[phoneKey] = { ...mergedUsers[phoneKey], ...emp };
      }
    });
  }
  if (!mergedUsers["owner"]) {
    mergedUsers["owner"] = {
      username: "owner",
      displayName: "Owner",
      role: "owner",
      passwordHash: "8dc776bfaf816d9df3c9213be47307223f66f91f7d4cbe20004f1dc0b05b38ed",
      active: true,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } else {
    mergedUsers["owner"] = __spreadProps(__spreadValues({}, mergedUsers["owner"]), {
      username: "owner",
      displayName: "Owner",
      role: "owner",
      active: true
    });
  }
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(mergedUsers));
  if (db) {
    db.employees = mergedUsers;
  }
  return mergedUsers;
}
function saveUsers(u, immediate = false) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(u));
}
function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || "null");
  } catch (e) {
    return null;
  }
}
function setSession(user) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    loginAt: (/* @__PURE__ */ new Date()).toISOString()
  }));
}
function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}
function initAuth() {
  return __async(this, null, function* () {
    const users = getUsers();
    let modified = false;
    if (!users["owner"]) {
      const hash = yield hashString("OctaneFlow@2026");
      users["owner"] = {
        username: "owner",
        displayName: "Owner",
        role: "owner",
        passwordHash: hash,
        active: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      modified = true;
    }
    if (modified) saveUsers(users);
  });
}
function loginUser(username, credential) {
  return __async(this, null, function* () {
    const users = getUsers();
    const uname = username.toLowerCase().trim();
    let user = users[uname];
    
    // Check if it's owner
    if (!user && uname === "owner") {
      const defaultHash = yield hashString("OctaneFlow@2026");
      user = {
        username: "owner",
        displayName: "Owner",
        role: "owner",
        passwordHash: defaultHash,
        active: true
      };
    }

    // Try finding employee by phone number if not found by username key
    if (!user) {
      const phoneMatches = Object.values(users).filter(u => 
        u.role !== 'owner' && 
        u.phone && 
        u.phone.replace(/\\D/g, '') === uname.replace(/\\D/g, '')
      );
      if (phoneMatches.length > 0) {
        user = phoneMatches[0];
      }
    }

    if (!user || user.deleted) {
      return { success: false, error: "User account not found." };
    }
    if (!user.active) {
      return { success: false, error: "This account has been deactivated by the administrator." };
    }
    
    if (user.role === "owner") {
      const incomingHash = yield hashString(credential);
      const targetHash = user.passwordHash || user.pinHash;
      if (incomingHash !== targetHash) {
        return { success: false, error: "Incorrect administrator password." };
      }
    } else {
      // Employee Login: credential is the Registration Code
      if (credential !== user.registration_code) {
        return { success: false, error: "Incorrect Registration Code." };
      }
    }
    setSession(user);
    return { success: true, user };
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
    if (nameEl) nameEl.textContent = "\u{1F451} " + session.displayName;
    updateApprovalsBadge();
  } else {
    if (appEl) appEl.style.display = "none";
    if (empEl) empEl.style.display = "flex";
    renderEmployeeView(session);
  }
  return session;
}
