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
  } catch (e) {
  }
  let dbUsers = db && db.users ? db.users : {};
  const mergedUsers = {};
  const allUsernames = /* @__PURE__ */ new Set([
    ...Object.keys(localUsers || {}),
    ...Object.keys(dbUsers || {})
  ]);
  allUsernames.forEach((username) => {
    const localUser = localUsers[username] || {};
    const dbUser = dbUsers[username] || {};
    const mergedUser = __spreadValues(__spreadValues({}, localUser), dbUser);
    if (localUser.deleted || dbUser.deleted) {
      mergedUser.deleted = true;
    } else {
      delete mergedUser.deleted;
    }
    mergedUsers[username] = mergedUser;
  });
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
    db.users = mergedUsers;
  }
  return mergedUsers;
}
function saveUsers(u) {
  if (db) {
    db.users = u;
    db.dirty_app_state_keys = db.dirty_app_state_keys || [];
    if (!db.dirty_app_state_keys.includes('users')) {
      db.dirty_app_state_keys.push('users');
    }
    saveDB();
  }
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
    if (!user || user.deleted) {
      return { success: false, error: "User account not found." };
    }
    if (!user.active) {
      return { success: false, error: "This account has been deactivated by the administrator." };
    }
    const incomingHash = yield hashString(credential);
    if (user.role === "owner") {
      const targetHash = user.passwordHash || user.pinHash;
      if (incomingHash !== targetHash) {
        return { success: false, error: "Incorrect administrator password." };
      }
    } else {
      if (incomingHash !== user.pinHash) {
        return { success: false, error: "Incorrect employee PIN." };
      }
      const currentDeviceId = getDeviceId();
      if (!user.deviceId) {
        return { success: false, error: "DEVICE_NOT_APPROVED", user };
      }
      if (user.deviceId !== currentDeviceId) {
        return { success: false, error: "DEVICE_NOT_APPROVED", user };
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
