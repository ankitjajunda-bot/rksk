// ============================================================
// OctaneFlow Production Login UI handler (V1)
// ============================================================

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

function initLoginForm() {
  const form = document.getElementById("login-form");
  const errEl = document.getElementById("login-error");
  const btnEl = document.getElementById("login-btn");
  if (!form) return;

  const invitedUser = localStorage.getItem("octaneflow_invited_user");
  if (invitedUser) {
    const userInp = document.getElementById("login-username");
    if (userInp) userInp.value = invitedUser;
    localStorage.removeItem("octaneflow_invited_user");
  }

  form.addEventListener("submit", (e) => __async(this, null, function* () {
    var _a, _b;
    e.preventDefault();
    const username = ((_a = document.getElementById("login-username")) == null ? void 0 : _a.value) || "";
    const credential = ((_b = document.getElementById("login-password")) == null ? void 0 : _b.value) || "";
    if (errEl) errEl.textContent = "";

    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = "Logging in...";
    }

    const result = yield loginUser(username, credential);
    if (!result.success) {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = "Log In";
      }

      let errorMsg = "Login failed.";
      switch (result.state) {
        case "WAITING_FOR_SYNC":
          errorMsg = "Account not ready yet. Please connect to the internet to complete setup.";
          break;
        case "USERNAME_NOT_FOUND":
          errorMsg = "User account not found. Please verify your username.";
          break;
        case "INVALID_PASSWORD":
          errorMsg = "Incorrect password or PIN. Please try again.";
          break;
        case "ACCOUNT_DISABLED":
          errorMsg = "This account has been deactivated by the administrator.";
          break;
        case "ACCOUNT_LOCKED":
          errorMsg = "Account locked due to too many failed attempts. Contact admin.";
          break;
        case "DEVICE_NOT_APPROVED":
          errorMsg = "This device is not approved yet. Please Register Device first.";
          showDeviceRequestForm();
          const reqName = document.getElementById("req-emp-name");
          const reqUser = document.getElementById("req-emp-username");
          if (reqName) reqName.value = result.user?.displayName || "";
          if (reqUser) reqUser.value = result.user?.username || "";
          showNotification("⚠️ Device not approved yet. Access request displayed below.", "warning");
          break;
        case "SERVER_UNAVAILABLE":
          errorMsg = "Authentication server is currently unavailable. Try again later.";
          break;
        case "OFFLINE":
          errorMsg = "You are currently offline. First-time login requires active internet.";
          break;
        default:
          errorMsg = result.error || "An unexpected error occurred during login.";
      }

      if (result.state !== "DEVICE_NOT_APPROVED") {
        if (errEl) errEl.textContent = errorMsg;
      }
      return;
    }

    if (btnEl) {
      btnEl.textContent = "Syncing latest data...";
    }

    try {
      yield initSync();
    } catch (err) {
      console.warn("[Sync] Failed to pull on login, loading cached database:", err);
    }

    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = "Log In";
    }

    checkAuth();
    if (result.user.role === "owner") {
      initApp();
    }
  }));
}

function updateApprovalsBadge() {
  const pending = (db.pending_entries || []).filter((e) => e.status === "pending" && e.submission_type !== "device_registration").length;
  const badge = document.getElementById("approvals-badge");
  if (badge) {
    badge.textContent = pending || "";
    badge.style.display = pending > 0 ? "inline-flex" : "none";
  }
  const subBadge = document.getElementById("approvals-badge-sub");
  if (subBadge) {
    subBadge.textContent = pending || "";
    subBadge.style.display = pending > 0 ? "inline-flex" : "none";
  }
}
