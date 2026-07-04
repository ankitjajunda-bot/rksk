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
      btnEl.textContent = "Logging in\u2026";
    }
    const result = yield loginUser(username, credential);
    if (!result.success) {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = "Log In";
      }
      if (result.error === "DEVICE_NOT_APPROVED") {
        showDeviceRequestForm();
        const reqName = document.getElementById("req-emp-name");
        const reqUser = document.getElementById("req-emp-username");
        const reqPhone = document.getElementById("req-emp-phone");
        if (reqName) reqName.value = result.user.displayName || "";
        if (reqUser) reqUser.value = result.user.username || "";
        if (reqPhone) reqPhone.value = result.user.phone || "";
        showNotification("\u26A0\uFE0F This device is not approved yet. Please generate a code and send it to the owner.", "warning");
      } else {
        if (errEl) errEl.textContent = result.error;
      }
      return;
    }
    if (btnEl) {
      btnEl.textContent = "Syncing latest data\u2026";
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
