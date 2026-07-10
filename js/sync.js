var __defProp = Object.defineProperty;
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
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
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
const SYNC_CFG_KEY = "octaneflow_sync_cfg";
let realtimeChannel = null;
function subscribeToRealtime() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    try {
      supabaseClient.removeChannel(realtimeChannel);
    } catch (e) {
      console.warn("Failed to remove channel:", e);
    }
  }
  SystemLogger.info("Realtime", "Realtime WebSocket subscription is disabled.");
  // realtimeChannel = supabaseClient.channel("octaneflow-realtime-changes").on(
  //   "postgres_changes",
  //   { event: "*", schema: "public", table: "pending_entries" },
  //   (payload) => __async(this, null, function* () {
  //     SystemLogger.success("Realtime", "Detected table update: pending_entries");
  //     yield initSync();
  //   })
  // ).on(
  //   "postgres_changes",
  //   { event: "*", schema: "public", table: "daily_ledger" },
  //   (payload) => __async(this, null, function* () {
  //     SystemLogger.success("Realtime", "Detected table update: daily_ledger");
  //     yield initSync();
  //   })
  // ).on(
  //   "postgres_changes",
  //   { event: "*", schema: "public", table: "app_state" },
  //   (payload) => __async(this, null, function* () {
  //     SystemLogger.success("Realtime", "Detected table update: app_state");
  //     yield initSync();
  //   })
  // ).subscribe((status) => {
  //   SystemLogger.info("Realtime", `WebSocket status: ${status}`);
  // });
}
function initSupabaseClient() {
  const cfg = getSyncCfg();
  if (cfg.supabaseUrl && cfg.supabaseKey && typeof window.supabase !== "undefined") {
    try {
      if (cfg.supabaseUrl.startsWith("http://") || cfg.supabaseUrl.startsWith("https://")) {
        supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
        subscribeToRealtime();
      } else {
        SystemLogger.warning("initSupabaseClient", "Supabase URL is not valid. Skipping initialization.");
        supabaseClient = null;
      }
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
  }
}
function getSyncCfg() {
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || "{}");
  } catch (e) {
    cfg = {};
  }
  cfg.supabaseUrl = "https://tgaunkmbzzrlvdwyuykm.supabase.co";
  cfg.supabaseKey = "sb_publishable_YJgYf4bM6Kh5AfqybtbH4g_H5hQN2Sf";
  return cfg;
}
function saveSyncCfg(cfg) {
  localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
}
function formatSyncTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `(Sync: ${hours}:${minutes} ${ampm})`;
}
function setSyncStatus(state) {
  const el = document.getElementById("sync-status-indicator");
  if (!el) return;
  const map = {
    syncing: { icon: "\u2601\uFE0F", text: "Syncing\u2026", color: "#f97316" },
    synced: { icon: "\u2705", text: "Synced", color: "#22c55e" },
    error: { icon: "\u26A0\uFE0F", text: "Sync error", color: "#ef4444" },
    offline: { icon: "\u{1F4F6}", text: "Offline", color: "#94a3b8" },
    off: { icon: "\u{1F50C}", text: "Sync off", color: "#475569" }
  };
  const s = map[state] || map.off;
  let timeStr = "";
  if (state === "synced") {
    const cfg = getSyncCfg();
    const lastSync = cfg.last_push || localStorage.getItem("octaneflow_last_sync");
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
  const banner = document.getElementById("global-alert-banner");
  const text = document.getElementById("global-alert-text");
  const actionBtn = document.getElementById("global-alert-action-btn");
  if (!banner || !text || !actionBtn) return;
  const cfg = getSyncCfg();
  const isOnline = navigator.onLine;
  if (!isOnline) {
    banner.style.display = "flex";
    banner.style.borderColor = "rgba(239, 68, 68, 0.3)";
    banner.style.background = "rgba(239, 68, 68, 0.1)";
    banner.style.color = "#fca5a5";
    text.textContent = "You are currently offline. Operations will be saved locally and synced automatically when back online.";
    actionBtn.style.display = "inline-block";
    actionBtn.textContent = "Work Offline";
    actionBtn.onclick = () => {
      banner.style.display = "none";
    };
  } else if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    banner.style.display = "flex";
    banner.style.borderColor = "rgba(234, 179, 8, 0.3)";
    banner.style.background = "rgba(234, 179, 8, 0.1)";
    banner.style.color = "#fef08a";
    text.textContent = "Cloud Sync is not configured. Go to Settings to enter Supabase API URL & Anon Key.";
    actionBtn.style.display = "inline-block";
    actionBtn.textContent = "Configure";
    actionBtn.onclick = () => {
      switchView("settings");
      setTimeout(() => {
        const el = document.getElementById("cfg-sync-master-key");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    };
  } else {
    const rateLimit = Number(localStorage.getItem("github_rate_limit_remaining") || "60");
    if (rateLimit < 10) {
      banner.style.display = "flex";
      banner.style.borderColor = "rgba(239, 68, 68, 0.3)";
      banner.style.background = "rgba(239, 68, 68, 0.1)";
      banner.style.color = "#fca5a5";
      text.textContent = `Warning: GitHub API rate limit is very low (${rateLimit} requests left). Sync may pause shortly.`;
      actionBtn.style.display = "inline-block";
      actionBtn.textContent = "Close";
      actionBtn.onclick = () => {
        banner.style.display = "none";
      };
    } else {
      banner.style.display = "none";
    }
  }
}
function syncPull() {
  return __async(this, null, function* () {
    const cfg = getSyncCfg();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      setSyncStatus("off");
      SystemLogger.warning("syncPull", "Sync skipped: Supabase credentials are not configured.");
      return null;
    }
    if (!supabaseClient) {
      initSupabaseClient();
    }
    if (!supabaseClient) {
      setSyncStatus("error");
      SystemLogger.error("syncPull", "Supabase client failed to initialize.");
      return null;
    }
    SystemLogger.info("syncPull", "Starting cloud pull from Supabase...");
    try {
      setSyncStatus("syncing");
      const { data: stateData, error: stateErr } = yield supabaseClient.from("app_state").select("*");
      if (stateErr) throw stateErr;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffISO = cutoff.toISOString();
      const { data: pendingData, error: pendingErr } = yield supabaseClient.from("pending_entries").select("*").or(`status.in.(pending,queued,syncing,pending_approval),reviewed_at.gte.${cutoffISO}`);
      if (pendingErr) throw pendingErr;
      const { data: ledgerData, error: ledgerErr } = yield supabaseClient.from("daily_ledger").select("*");
      if (ledgerErr) throw ledgerErr;
      const record = {
        pending_entries: pendingData.map((e) => ({
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
        daily_ledger: ledgerData.map((e) => ({
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
        users: {},
        cashflow: {},
        audit_trail: []
      };
      stateData.forEach((row) => {
        if (row.key === "settings") record.settings = row.value;
        else if (row.key === "stock") record.stock = row.value;
        else if (row.key === "price_history") record.price_history = row.value;
        else if (row.key === "purchases") record.purchases = row.value;
        else if (row.key === "holidays") record.holidays = row.value;
        else if (row.key === "users") record.users = row.value;
        else if (row.key === "cashflow") record.cashflow = row.value;
        else if (row.key === "audit_trail") record.audit_trail = row.value;
      });
      let maxTime = /* @__PURE__ */ new Date(0);
      pendingData.forEach((e) => {
        const t1 = e.submitted_at ? new Date(e.submitted_at) : /* @__PURE__ */ new Date(0);
        const t2 = e.reviewed_at ? new Date(e.reviewed_at) : /* @__PURE__ */ new Date(0);
        if (t1 > maxTime) maxTime = t1;
        if (t2 > maxTime) maxTime = t2;
      });
      ledgerData.forEach((e) => {
        const t = e.approved_at ? new Date(e.approved_at) : /* @__PURE__ */ new Date(0);
        if (t > maxTime) maxTime = t;
      });
      record._synced_at = maxTime.toISOString();
      localStorage.setItem("octaneflow_last_sync", (/* @__PURE__ */ new Date()).toISOString());
      setSyncStatus("synced");
      SystemLogger.success("syncPull", `Supabase pull succeeded. Retrieved ${ledgerData.length} ledger and ${pendingData.length} pending records.`);
      return record;
    } catch (err) {
      const isOnline = navigator.onLine;
      setSyncStatus(isOnline ? "error" : "offline");
      SystemLogger.error("syncPull", "Supabase pull failed", err);
      return null;
    }
  });
}
function rebuildSyncQueue() {
  if (!db) return;
  db.sync_queue = db.sync_queue || [];
  const session = typeof getSession === "function" ? getSession() : null;
  const isOwner = session && session.role === "owner";
  if (isOwner && db.dirty_app_state_keys && db.dirty_app_state_keys.length > 0) {
    const keys = [...new Set(db.dirty_app_state_keys)];
    keys.forEach((k) => {
      let val = null;
      if (k === "settings") val = db.settings || {};
      else if (k === "stock") val = db.stock || {};
      else if (k === "price_history") val = db.price_history || [];
      else if (k === "purchases") val = db.purchases || [];
      else if (k === "holidays") val = db.holidays || [];
      else if (k === "users") val = db.users || {};
      else if (k === "cashflow") val = db.cashflow || {};
      else if (k === "audit_trail") val = db.audit_trail || [];
      const existing = db.sync_queue.find((q) => q.action === "upsert_app_state" && q.payload.key === k && q.status === "pending");
      if (existing) {
        existing.payload.value = val;
      } else {
        db.sync_queue.push({
          tx_id: "tx_state_" + k + "_" + Date.now(),
          action: "upsert_app_state",
          payload: { key: k, value: val },
          retry_count: 0,
          status: "pending",
          error_details: "",
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    });
    db.dirty_app_state_keys = [];
  }
  if (db.pending_entries) {
    db.pending_entries.forEach((e) => {
      if (e._dirty) {
        const existing = db.sync_queue.find((q) => q.action === "upsert_pending" && q.payload.id === e.id && q.status !== "success" && q.status !== "dropped");
        if (existing) {
          existing.payload = e;
        } else {
          db.sync_queue.push({
            tx_id: "tx_pending_" + e.id + "_" + Date.now(),
            action: "upsert_pending",
            payload: JSON.parse(JSON.stringify(e)),
            retry_count: 0,
            status: "pending",
            error_details: "",
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    });
  }
  if (isOwner && db.deleted_ledger_dates && db.deleted_ledger_dates.length > 0) {
    db.deleted_ledger_dates.forEach((d) => {
      const existing = db.sync_queue.find((q) => q.action === "delete_ledger" && q.payload.date === d && q.status === "pending");
      if (!existing) {
        db.sync_queue.push({
          tx_id: "tx_delete_" + d + "_" + Date.now(),
          action: "delete_ledger",
          payload: { date: d },
          retry_count: 0,
          status: "pending",
          error_details: "",
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    });
    db.deleted_ledger_dates = [];
  }
  if (isOwner && db.daily_ledger) {
    db.daily_ledger.forEach((e) => {
      if (e._dirty) {
        const existing = db.sync_queue.find((q) => q.action === "upsert_ledger" && q.payload.date === e.date && q.status !== "success" && q.status !== "dropped");
        if (existing) {
          existing.payload = JSON.parse(JSON.stringify(e));
        } else {
          db.sync_queue.push({
            tx_id: "tx_ledger_" + e.date + "_" + Date.now(),
            action: "upsert_ledger",
            payload: JSON.parse(JSON.stringify(e)),
            retry_count: 0,
            status: "pending",
            error_details: "",
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    });
  }
}
function isBusinessEquivalent(localObj, uploadedObj) {
  if (!localObj || !uploadedObj) return localObj === uploadedObj;
  
  // Extract strictly business-critical fields for comparison
  const extract = (obj) => {
    if (obj.submission_type || obj.entryData) {
      // Pending Entry
      return {
        status: obj.status,
        entryData: obj.entryData,
        rejectionReason: obj.rejectionReason
      };
    } else if (obj.shifts && obj.totals) {
      // Daily Ledger
      return {
        status: obj.status,
        shifts: obj.shifts,
        totals: obj.totals,
        inventory: obj.inventory,
        margins: obj.margins
      };
    }
    // Fallback: strip known sync flags
    const clone = __spreadValues({}, obj);
    delete clone._dirty;
    return clone;
  };
  
  return JSON.stringify(extract(localObj)) === JSON.stringify(extract(uploadedObj));
}

function processSyncQueue() {
  return __async(this, null, function* () {
    if (!db || !db.sync_queue || db.sync_queue.length === 0) return;
    if (!supabaseClient) {
      initSupabaseClient();
    }
    if (!supabaseClient) {
      setSyncStatus("error");
      return;
    }
    db.sync_queue = db.sync_queue.filter((q) => q.status !== "success");
    const pendingItems = db.sync_queue.filter((q) => q.status === "pending" || q.status === "failed");
    if (pendingItems.length === 0) return;
    setSyncStatus("syncing");
    for (const tx of pendingItems) {
      if ((tx.retry_count || 0) >= 5) {
        SystemLogger.error("syncQueue", `Dropping permanently failed TX ${tx.tx_id} after 5 retries to prevent queue lockup.`);
        window.logAuditTrail("SYNC_TX_DROPPED", JSON.stringify(tx), "", `Sync transaction dropped due to excessive retries: ${tx.error_details}`);
        
        // Edge Case Prevention: If an app_state upload is dropped, we must restore its dirty flag
        // Otherwise, initSync will overwrite the local state with stale cloud data.
        if (tx.action === "upsert_app_state" && tx.payload && tx.payload.key) {
          db.dirty_app_state_keys = db.dirty_app_state_keys || [];
          if (!db.dirty_app_state_keys.includes(tx.payload.key)) {
            db.dirty_app_state_keys.push(tx.payload.key);
          }
        }
        
        tx.status = "dropped";
        db.sync_queue = db.sync_queue.filter((q) => q.tx_id !== tx.tx_id);
        continue;
      }
      tx.status = "processing";
      tx.retry_count = (tx.retry_count || 0) + 1;
      try {
        if (tx.action === "upsert_app_state") {
          const { error } = yield supabaseClient.from("app_state").upsert([tx.payload]);
          if (error) throw error;
        } else if (tx.action === "upsert_pending") {
          const cleanPayload = __spreadValues({}, tx.payload);
          delete cleanPayload._dirty;
          const dbPayload = {
            id: cleanPayload.id,
            submitted_by: cleanPayload.submittedBy,
            submitted_by_name: cleanPayload.submittedByName,
            submitted_at: cleanPayload.submittedAt,
            submission_type: cleanPayload.submission_type,
            status: cleanPayload.status,
            entry_data: cleanPayload.entryData,
            rejection_reason: cleanPayload.rejectionReason || null,
            reviewed_by: cleanPayload.reviewedBy || null,
            reviewed_at: cleanPayload.reviewedAt || null
          };
          const { error } = yield supabaseClient.from("pending_entries").upsert([dbPayload]);
          if (error) throw error;
        } else if (tx.action === "delete_ledger") {
          const { error } = yield supabaseClient.from("daily_ledger").delete().eq("date", tx.payload.date);
          if (error) throw error;
        } else if (tx.action === "upsert_ledger") {
          const cleanPayload = __spreadValues({}, tx.payload);
          delete cleanPayload._dirty;
          const dbPayload = {
            date: cleanPayload.date,
            prices: cleanPayload.prices,
            du1_p: cleanPayload.du1_p,
            du1_d: cleanPayload.du1_d,
            du2_p: cleanPayload.du2_p,
            du2_d: cleanPayload.du2_d,
            recon: cleanPayload.recon,
            approved_by: cleanPayload.approvedBy || null,
            approved_at: cleanPayload.approvedAt || null,
            submitted_by: cleanPayload.submittedBy || null
          };
          const { error } = yield supabaseClient.from("daily_ledger").upsert([dbPayload]);
          if (error) throw error;
        }
        tx.status = "success";
        tx.error_details = "";
        
        // Step 3: Clear _dirty flag safely (Business Data Integrity Verification)
        if (tx.action === "upsert_pending") {
          const idx = (db.pending_entries || []).findIndex(e => e.id === tx.payload.id);
          if (idx !== -1 && isBusinessEquivalent(db.pending_entries[idx], tx.payload)) {
            db.pending_entries[idx]._dirty = false;
          }
        } else if (tx.action === "upsert_ledger") {
          const idx = (db.daily_ledger || []).findIndex(e => e.date === tx.payload.date);
          if (idx !== -1 && isBusinessEquivalent(db.daily_ledger[idx], tx.payload)) {
            db.daily_ledger[idx]._dirty = false;
          }
        }

        db.sync_history = db.sync_history || [];
        db.sync_history.unshift({
          tx_id: tx.tx_id,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          action: tx.action,
          retry_count: tx.retry_count,
          status: tx.status,
          error_details: ""
        });
        if (db.sync_history.length > 50) db.sync_history = db.sync_history.slice(0, 50);
        SystemLogger.success("syncQueue", `Success TX: ${tx.tx_id} (${tx.action})`);
      } catch (err) {
        tx.status = "failed";
        tx.error_details = err.message || String(err);
        db.sync_history = db.sync_history || [];
        db.sync_history.unshift({
          tx_id: tx.tx_id,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          action: tx.action,
          retry_count: tx.retry_count,
          status: tx.status,
          error_details: tx.error_details
        });
        if (db.sync_history.length > 50) db.sync_history = db.sync_history.slice(0, 50);
        SystemLogger.error("syncQueue", `Failed TX: ${tx.tx_id} (${tx.action})`, err);
        setSyncStatus("error");
        const _a = db, { _idx: _idx2 } = _a, dbToSave2 = __objRest(_a, ["_idx"]);
        localStorage.setItem("octaneflow_db", JSON.stringify(dbToSave2));
        return;
      }
    }
    setSyncStatus("synced");
    db.sync_queue = db.sync_queue.filter((q) => q.status !== "success");
    const _b = db, { _idx } = _b, dbToSave = __objRest(_b, ["_idx"]);
    localStorage.setItem("octaneflow_db", JSON.stringify(dbToSave));
    const cfg = getSyncCfg();
    cfg.last_push = (/* @__PURE__ */ new Date()).toISOString();
    saveSyncCfg(cfg);
  });
}
function syncPush(forceAll = false) {
  return __async(this, null, function* () {
    const cfg = getSyncCfg();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      SystemLogger.warning("syncPush", "Sync push skipped: Supabase credentials are not configured.");
      return false;
    }
    if (!supabaseClient) {
      initSupabaseClient();
    }
    if (!supabaseClient) {
      setSyncStatus("error");
      SystemLogger.error("syncPush", "Supabase client failed to initialize.");
      return false;
    }
    SystemLogger.info("syncPush", `Staging modifications to sync queue (forceAll: ${forceAll})...`);
    rebuildSyncQueue();
    yield processSyncQueue();
    return true;
  });
}
function initSync() {
  return __async(this, null, function* () {
    var _a;
    const cfg = getSyncCfg();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      setSyncStatus("off");
      SystemLogger.info("initSync", "Auto-sync is disabled (no credentials).");
      return;
    }
    
    const dbStrBefore = db ? JSON.stringify(db) : null;
    
    SystemLogger.info("initSync", "Initializing cloud sync checks...");
    const cloudData = yield syncPull();
    if (!cloudData || !cloudData.daily_ledger) {
      SystemLogger.warning("initSync", "Could not fetch cloud data.");
      return;
    }
    if (!db) {
      db = cloudData;
    } else {
      // Remote Database Reset Coordinator
      if (cloudData.settings && cloudData.settings.database_reset_timestamp) {
        db.settings = db.settings || {};
        if (db.settings.database_reset_timestamp !== cloudData.settings.database_reset_timestamp) {
          SystemLogger.warning("initSync", "Remote database reset detected. Wiping local ledger and sync queue.");
          db.daily_ledger = [];
          db.sync_queue = [];
          db.deleted_ledger_dates = [];
          db.conflicts = {};
          db.settings.database_reset_timestamp = cloudData.settings.database_reset_timestamp;
          localStorage.setItem("octaneflow_db", JSON.stringify(db));
        }
      }
      const isKeyProtected = (key) => {
        const session = typeof getSession === 'function' ? getSession() : null;
        const isOwner = session && session.role === "owner";
        if (!isOwner) return false; // Employees never upload app_state, so they cannot protect it from cloud overwrites
        
        const isDirty = db.dirty_app_state_keys && db.dirty_app_state_keys.includes(key);
        const isQueued = db.sync_queue && db.sync_queue.some((q) => q.action === "upsert_app_state" && q.payload.key === key && q.status !== "success" && q.status !== "dropped");
        return isDirty || isQueued;
      };

      const keysToCheck = ["settings", "stock", "price_history", "purchases", "holidays", "users", "cashflow"];
      db.conflicts = db.conflicts || {};
      keysToCheck.forEach((k) => {
        const localVal = db[k];
        const cloudVal = cloudData[k];
        if (isKeyProtected(k) && cloudVal) {
          if (JSON.stringify(localVal) !== JSON.stringify(cloudVal)) {
            db.conflicts[k] = {
              cloud: JSON.parse(JSON.stringify(cloudVal)),
              local: JSON.parse(JSON.stringify(localVal)),
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            };
            // Only alert owners about sync conflicts; employees see silent handling.
            if (window.getAuthSession && window.getAuthSession()?.role === "owner") {
              SystemLogger.warning("initSync", `Sync Conflict detected on settings key: ${k}. Cloud changes preserved in db.conflicts.`);
              showNotification(`\u26A0\uFE0F Sync Conflict: Concurrent edits found on ${k}. Cloud data saved in conflicts. Click <a href="#" onclick="openConflictsModal(); return false;">here</a> to review.`, "warning");
            } else {
              // For non‑owner users, silently retain local version and log.
              SystemLogger.info("initSync", `Sync Conflict on ${k} ignored for non‑owner user.`);
            }
          }
        }
      });
      const stateKeys = [
        { key: "settings", default: {} },
        { key: "stock", default: {} },
        { key: "price_history", default: [] },
        { key: "purchases", default: [] },
        { key: "holidays", default: [] },
        { key: "cashflow", default: {} }
      ];
      stateKeys.forEach(({ key, default: def }) => {
        if (!isKeyProtected(key)) {
          db[key] = cloudData[key] || db[key] || def;
        }
      });
      
      const localU = db.users || {};
      const cloudU = cloudData.users || {};
      let safeUsers = {};
      
      if (isKeyProtected("users")) {
        safeUsers = __spreadValues({}, localU);
      } else {
        safeUsers = __spreadValues(__spreadValues({}, localU), cloudU);
        for (const k in localU) {
          if (!safeUsers[k]) safeUsers[k] = localU[k];
          const localDeleted = localU[k].deleted;
          const cloudDeleted = cloudU[k] && cloudU[k].deleted;
          if (localDeleted || cloudDeleted) {
            if (localDeleted) {
              safeUsers[k].deleted = true;
            } else if (cloudDeleted) {
              const localT = localU[k].createdAt ? new Date(localU[k].createdAt).getTime() : 0;
              const cloudT = cloudU[k].createdAt ? new Date(cloudU[k].createdAt).getTime() : 0;
              if (localT > cloudT) {
                safeUsers[k].deleted = false;
              } else {
                safeUsers[k].deleted = true;
              }
            }
          }
        }
        for (const k in cloudU) {
          if (cloudU[k].deleted && !localU[k]) safeUsers[k].deleted = true;
        }
      }
      db.users = safeUsers;
      const unsyncedPending = (db.pending_entries || []).filter((e) => e._dirty);
      const mergedPendingMap = /* @__PURE__ */ new Map();
      (cloudData.pending_entries || []).forEach((cloudEntry) => {
        const localEntry = {
          id: cloudEntry.id,
          submittedBy: cloudEntry.submitted_by || cloudEntry.submittedBy,
          submittedByName: cloudEntry.submitted_by_name || cloudEntry.submittedByName,
          submittedAt: cloudEntry.submitted_at || cloudEntry.submittedAt,
          submission_type: cloudEntry.submission_type,
          status: cloudEntry.status,
          entryData: cloudEntry.entry_data || cloudEntry.entryData,
          rejectionReason: cloudEntry.rejection_reason || cloudEntry.rejectionReason,
          reviewedBy: cloudEntry.reviewed_by || cloudEntry.reviewedBy,
          reviewedAt: cloudEntry.reviewed_at || cloudEntry.reviewedAt,
          _dirty: false
        };
        mergedPendingMap.set(localEntry.id, localEntry);
      });
      unsyncedPending.forEach((localEntry) => {
        mergedPendingMap.set(localEntry.id, localEntry);
      });
      const prevPendingCount = (db.pending_entries || []).length;
      db.pending_entries = Array.from(mergedPendingMap.values());
      
      // Prune local approved/rejected entries that are older than 7 days to keep database fast
      const pruneCutoff = new Date();
      pruneCutoff.setDate(pruneCutoff.getDate() - 7);
      const pruneCutoffISO = pruneCutoff.toISOString();
      db.pending_entries = db.pending_entries.filter((e) => {
        if (!["approved", "rejected"].includes(e.status)) return true;
        return e.reviewedAt && e.reviewedAt >= pruneCutoffISO;
      });
      
      // Play a chime if new pending entries were downloaded from the cloud
      if (db.pending_entries.length > prevPendingCount && typeof getSession === 'function') {
        const sess = getSession();
        if (sess && sess.role === 'owner') {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
            if (typeof showNotification === 'function') {
              showNotification("🔔 New submission received from an employee!", "info");
            }
          } catch(e) {}
        }
      }

      const unsyncedLedger = (db.daily_ledger || []).filter((e) => e._dirty);
      const deletedDates = db.deleted_ledger_dates || [];
      const mergedLedgerMap = /* @__PURE__ */ new Map();
      (cloudData.daily_ledger || []).forEach((cloudEntry) => {
        if (deletedDates.includes(cloudEntry.date)) return;
        
        let cloudCorrected = false;
        // Safety Guard: Validate incoming cloud totalizers against verified refined ledger
        const refinedEntry = window.REFINED_SALES_LEDGER && window.REFINED_SALES_LEDGER.daily_ledger.find(r => r.date === cloudEntry.date);
        if (refinedEntry) {
          ['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(nozzle => {
            if (refinedEntry[nozzle]) {
              if (!cloudEntry[nozzle]) {
                cloudEntry[nozzle] = { ...refinedEntry[nozzle] };
                cloudCorrected = true;
              } else {
                const fields = ['open', 'close_day', 'close_night', 'tests_day', 'tests_night'];
                fields.forEach(f => {
                  if (cloudEntry[nozzle][f] !== refinedEntry[nozzle][f]) {
                    cloudEntry[nozzle][f] = refinedEntry[nozzle][f];
                    cloudCorrected = true;
                  }
                });
              }
            }
          });
        }
        
        cloudEntry._dirty = cloudCorrected;
        mergedLedgerMap.set(cloudEntry.date, cloudEntry);
      });
      unsyncedLedger.forEach((localEntry) => {
        if (deletedDates.includes(localEntry.date)) return;
        mergedLedgerMap.set(localEntry.date, localEntry);
      });
      db.daily_ledger = Array.from(mergedLedgerMap.values());
    }
    localStorage.setItem("octaneflow_db", JSON.stringify(db));
    if (db.users) {
      localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(db.users));
    }
    cfg.last_push = cloudData._synced_at || (/* @__PURE__ */ new Date()).toISOString();
    saveSyncCfg(cfg);
    buildIndexes();
    
    const dbStrAfter = JSON.stringify(db);
    if (dbStrBefore !== dbStrAfter) {
      if (typeof renderCurrentView === 'function') {
        const session = typeof getSession === 'function' ? getSession() : null;
        if (session && session.role === "owner") {
          renderCurrentView();
        } else if (session && typeof renderEmployeeView === 'function') {
          renderEmployeeView(session);
        }
      }
      SystemLogger.success("initSync", `Sync applied new changes to UI. Merged ${db.daily_ledger.length} ledger days and ${db.pending_entries.length} pending items.`);
    } else {
      SystemLogger.success("initSync", `Sync complete. No new changes detected.`);
    }
  });
}
const LOGS_STORAGE_KEY = "octaneflow_system_logs";
const SystemLogger = {
  getLogs() {
    try {
      return JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  },
  saveLogs(logs) {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error("Failed to save logs to localStorage:", e);
    }
  },
  log(level, context, message, details = "") {
    var _a;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const newLog = {
      timestamp,
      level: level.toUpperCase(),
      // INFO, SUCCESS, WARNING, ERROR
      context,
      message,
      details: typeof details === "object" ? JSON.stringify(details) : String(details)
    };
    let logs = this.getLogs();
    logs.unshift(newLog);
    if (logs.length > 100) {
      logs = logs.slice(0, 100);
    }
    this.saveLogs(logs);
    const consoleMsg = `[${newLog.level}] [${context}] ${message} ${details ? "| " + details : ""}`;
    if (newLog.level === "ERROR") {
      console.error(consoleMsg);
    } else if (newLog.level === "WARNING") {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }
    this.appendLogToUI(newLog);
    if ((_a = document.getElementById("view-settings")) == null ? void 0 : _a.classList.contains("active")) {
      renderDiagnostics();
    }
  },
  info(context, message, details = "") {
    this.log("INFO", context, message, details);
  },
  success(context, message, details = "") {
    this.log("SUCCESS", context, message, details);
  },
  warning(context, message, details = "") {
    this.log("WARNING", context, message, details);
  },
  error(context, message, details = "") {
    this.log("ERROR", context, message, details);
  },
  clear() {
    this.saveLogs([]);
    const container = document.getElementById("diagnostic-logs-list");
    if (container) {
      container.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 1rem;">Logs cleared.</div>`;
    }
    renderDiagnostics();
  },
  getLevelColor(level) {
    switch (level) {
      case "SUCCESS":
        return "#22c55e";
      case "ERROR":
        return "#ef4444";
      case "WARNING":
        return "#f59e0b";
      case "INFO":
      default:
        return "#3b82f6";
    }
  },
  appendLogToUI(log) {
    const container = document.getElementById("diagnostic-logs-list");
    if (!container) return;
    if (container.children.length === 1 && container.children[0].textContent.includes("No activity logged yet")) {
      container.innerHTML = "";
    }
    const logEl = document.createElement("div");
    logEl.className = "log-item";
    logEl.style.borderBottom = "1px solid rgba(255,255,255,0.02)";
    logEl.style.paddingBottom = "4px";
    logEl.style.wordBreak = "break-all";
    const t = new Date(log.timestamp);
    const timeStr = t.toLocaleTimeString([], { hour12: false }) + "." + String(t.getMilliseconds()).padStart(3, "0");
    const color = this.getLevelColor(log.level);
    logEl.innerHTML = `
      <span style="color: var(--text-dim); font-size: 0.7rem;">[${timeStr}]</span>
      <span style="color: ${color}; font-weight: bold; font-size: 0.7rem;">[${log.level}]</span>
      <span style="color: #cbd5e1; font-weight: 600;">[${log.context}]</span>
      <span style="color: #f1f5f9;">${log.message}</span>
      ${log.details ? `<span style="color: #64748b; font-size: 0.7rem; display: block; margin-left: 1.5rem; white-space: pre-wrap;">Details: ${log.details}</span>` : ""}
    `;
    container.appendChild(logEl);
    container.scrollTop = container.scrollHeight;
  },
  renderAll() {
    const container = document.getElementById("diagnostic-logs-list");
    if (!container) return;
    const logs = this.getLogs();
    if (logs.length === 0) {
      container.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No activity logged yet. Perform some actions to see diagnostic data.</div>`;
      return;
    }
    container.innerHTML = "";
    const displayLogs = [...logs].reverse();
    displayLogs.forEach((log) => {
      const logEl = document.createElement("div");
      logEl.className = "log-item";
      logEl.style.borderBottom = "1px solid rgba(255,255,255,0.02)";
      logEl.style.paddingBottom = "4px";
      logEl.style.wordBreak = "break-all";
      const t = new Date(log.timestamp);
      const timeStr = t.toLocaleTimeString([], { hour12: false }) + "." + String(t.getMilliseconds()).padStart(3, "0");
      const color = this.getLevelColor(log.level);
      logEl.innerHTML = `
        <span style="color: var(--text-dim); font-size: 0.7rem;">[${timeStr}]</span>
        <span style="color: ${color}; font-weight: bold; font-size: 0.7rem;">[${log.level}]</span>
        <span style="color: #cbd5e1; font-weight: 600;">[${log.context}]</span>
        <span style="color: #f1f5f9;">${log.message}</span>
        ${log.details ? `<span style="color: #64748b; font-size: 0.7rem; display: block; margin-left: 1.5rem; white-space: pre-wrap;">Details: ${log.details}</span>` : ""}
      `;
      container.appendChild(logEl);
    });
    container.scrollTop = container.scrollHeight;
  }
};
function renderDiagnostics() {
  let dbSizeStr = "0 KB";
  let quotaPct = 0;
  let isDbAvailable = false;
  try {
    const dbStr = localStorage.getItem("octaneflow_db") || "";
    const bytes = new Blob([dbStr]).size;
    isDbAvailable = true;
    dbSizeStr = (bytes / 1024).toFixed(2) + " KB";
    quotaPct = Math.min(bytes / (5 * 1024 * 1024) * 100, 100);
  } catch (e) {
    dbSizeStr = "Unavailable";
    isDbAvailable = false;
  }
  const dbStatusEl = document.getElementById("diag-db-status");
  if (dbStatusEl) {
    dbStatusEl.textContent = isDbAvailable ? "Available" : "Write Failed / Locked";
    dbStatusEl.style.color = isDbAvailable ? "#22c55e" : "#ef4444";
  }
  const dbSizeEl = document.getElementById("diag-db-size");
  if (dbSizeEl) dbSizeEl.textContent = dbSizeStr;
  const quotaBar = document.getElementById("diag-db-quota-bar");
  if (quotaBar) {
    quotaBar.style.width = quotaPct + "%";
    quotaBar.style.background = quotaPct > 80 ? "var(--danger)" : quotaPct > 50 ? "var(--warning)" : "var(--primary)";
  }
  const quotaText = document.getElementById("diag-db-quota-text");
  if (quotaText) quotaText.textContent = `${quotaPct.toFixed(2)}% of 5MB browser quota`;
  const ledgerCount = db && db.daily_ledger ? db.daily_ledger.length : 0;
  const purchaseCount = db && db.purchases ? db.purchases.length : 0;
  const pendingCount = db && db.pending_entries ? db.pending_entries.filter((e) => e.submission_type !== "device_registration").length : 0;
  const dbRecordsEl = document.getElementById("diag-db-records");
  if (dbRecordsEl) dbRecordsEl.textContent = `${ledgerCount} Ledger Days`;
  const dbPurchasesEl = document.getElementById("diag-db-purchases");
  if (dbPurchasesEl) dbPurchasesEl.textContent = `${purchaseCount} Purchases`;
  const dbPendingEl = document.getElementById("diag-db-pending");
  if (dbPendingEl) dbPendingEl.textContent = `${pendingCount} Pending Submissions`;
  const cfg = getSyncCfg();
  const syncStatusEl = document.getElementById("diag-sync-status");
  const syncTimeEl = document.getElementById("diag-sync-time");
  const syncSupabaseIdEl = document.getElementById("diag-sync-gist-id");
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    if (syncStatusEl) {
      const activeStateEl = document.getElementById("sync-status-indicator");
      const activeState = activeStateEl ? activeStateEl.textContent : "";
      if (activeState.includes("Sync error") || activeState.includes("Offline")) {
        syncStatusEl.textContent = "Sync Failure";
        syncStatusEl.style.color = "#ef4444";
      } else if (activeState.includes("Syncing")) {
        syncStatusEl.textContent = "Syncing...";
        syncStatusEl.style.color = "#f97316";
      } else {
        syncStatusEl.textContent = "Connected";
        syncStatusEl.style.color = "#22c55e";
      }
    }
    if (syncTimeEl) {
      if (cfg.last_push) {
        const d = new Date(cfg.last_push);
        syncTimeEl.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
      } else {
        syncTimeEl.textContent = "Never Synced";
      }
    }
    if (syncSupabaseIdEl) {
      syncSupabaseIdEl.textContent = `Supabase URL: ...${cfg.supabaseUrl.slice(-8)}`;
      syncSupabaseIdEl.title = cfg.supabaseUrl;
    }
  } else {
    if (syncStatusEl) {
      syncStatusEl.textContent = "Disabled";
      syncStatusEl.style.color = "var(--text-dim)";
    }
    if (syncTimeEl) syncTimeEl.textContent = "N/A";
    if (syncSupabaseIdEl) syncSupabaseIdEl.textContent = "Database: Not Configured";
  }
}
function getPreviousShift(dateStr, shift) {
  if (shift === "night") {
    return { date: dateStr, shift: "day" };
  } else {
    const d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() - 1);
    return { date: d.toISOString().split("T")[0], shift: "night" };
  }
}
function getNozzleOpeningReading(nozzle, dateStr, shift) {
  let curr = { date: dateStr, shift };
  for (let i = 0; i < 60; i++) {
    curr = getPreviousShift(curr.date, curr.shift);
    const pending = (db.pending_entries || []).find(
      (e) => e.entryData.date === curr.date && e.entryData.shift === curr.shift && e.status === "pending"
    );
    if (pending && pending.entryData[nozzle]) {
      const val = curr.shift === "day" ? pending.entryData[nozzle].close_day : pending.entryData[nozzle].close_night;
      if (val && val > 0) return val;
    }
    const ledger = db.daily_ledger.find((r) => r.date === curr.date);
    if (ledger && ledger[nozzle]) {
      const val = curr.shift === "day" ? ledger[nozzle].close_day : ledger[nozzle].close_night;
      if (val && val > 0) return val;
      if (ledger[nozzle].open && ledger[nozzle].open > 0) return ledger[nozzle].open;
    }
  }
  const sorted = [...db.daily_ledger].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length > 0 && sorted[0][nozzle]) {
    const val = sorted[0][nozzle].open;
    if (val && val > 0) return val;
  }
  const fallbacks = { du1_p: 15400, du2_p: 12900, du1_d: 21250, du2_d: 18600 };
  return fallbacks[nozzle] || 0;
}
const AUTH_USERS_KEY = "octaneflow_users";
const AUTH_SESSION_KEY = "octaneflow_session";
const DEVICE_ID_KEY = "octaneflow_device_id";
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === "x" ? r : r & 3 | 8).toString(16);
    });
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
function sha256_js(ascii) {
  function rightRotate(value, amount) {
    return value >>> amount | value << 32 - amount;
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = "";
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
      hash[primeCounter] = mathPow(candidate, 0.5) * maxWord | 0;
      k[primeCounter++] = mathPow(candidate, 1 / 3) * maxWord | 0;
    }
  }
  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\0";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (3 - i) % 4 * 8;
  }
  words[words.length] = asciiLength / maxWord | 0;
  words[words.length] = asciiLength | 0;
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      let wItem = w[i];
      if (i >= 16) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ w[i - 15] >>> 3;
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ w[i - 2] >>> 10;
        wItem = w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
      }
      const ch = hash[4] & hash[5] ^ ~hash[4] & hash[6];
      const maj = hash[0] & hash[1] ^ hash[0] & hash[2] ^ hash[1] & hash[2];
      const s0_h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const s1_h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const temp1 = hash[7] + s1_h + ch + k[i] + wItem | 0;
      const temp2 = s0_h + maj | 0;
      hash = [temp1 + temp2 | 0].concat(hash);
      hash[4] = hash[4] + temp1 | 0;
    }
    for (let i = 0; i < 8; i++) {
      hash[i] = hash[i] + oldHash[i] | 0;
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = hash[i] >> j * 8 & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}
function hashString(str) {
  return __async(this, null, function* () {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = yield crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {
      console.warn("crypto.subtle failed, falling back to JS SHA-256:", e);
    }
    return sha256_js(str);
  });
}

// Control auto-syncing of local changes
window.disableAutoPush = true;

window.triggerManualSync = function() {
  return __async(this, null, function* () {
    if (!navigator.onLine) {
      showNotification('❌ Device is offline. Cannot sync to cloud.', 'danger');
      return;
    }
    const btn = document.getElementById('ledger-sync-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Syncing...';
    }
    
    // Temporarily bypass disableAutoPush to run sync
    const prevDisable = window.disableAutoPush;
    window.disableAutoPush = false;
    
    try {
      showNotification('☁️ Sync started. Pushing changes...', 'info');
      const success = yield syncPush(true);
      if (success) {
        showNotification('✅ Cloud sync complete!', 'success');
      } else {
        showNotification('⚠️ Sync skipped or failed.', 'warning');
      }
    } catch (e) {
      showNotification('❌ Sync failed: ' + e.message, 'danger');
    } finally {
      window.disableAutoPush = prevDisable;
      if (btn) {
        btn.disabled = false;
      }
      if (typeof renderLedger === 'function') {
        renderLedger();
      }
    }
  });
};

// Added to handle the conflict notification clicks
window.openConflictsModal = async function() {
  if (!db.conflicts || Object.keys(db.conflicts).length === 0) {
    alert("No active sync conflicts found.");
    return;
  }
  let msg = "Sync Conflicts Detected:\n\n";
  for (const k in db.conflicts) {
    msg += `- ${k} (Local has edits not in cloud)\n`;
  }
  msg += "\nDo you want to KEEP YOUR LOCAL CHANGES and overwrite the cloud? \n\n[OK] = Keep Local \n[Cancel] = Discard Local & Revert to Cloud";
  
  if (confirm(msg)) {
    // Keep local, clear conflict
    db.conflicts = {};
    saveDB();
    if (typeof forceSync === 'function') {
      alert("Keeping local changes. Syncing to cloud now... Please wait a moment.");
      await forceSync();
    }
    alert("Sync complete!");
    location.reload();
  } else {
    // Revert to cloud
    for (const k in db.conflicts) {
      if (db.conflicts[k].cloud) {
        db[k] = db.conflicts[k].cloud;
      }
    }
    db.conflicts = {};
    saveDB();
    alert("Reverted to cloud data.");
    location.reload();
  }
};
