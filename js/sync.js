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
  //   { event: "*", schema: "public", table: "master_ledger" },
  //   (payload) => __async(this, null, function* () {
  //     SystemLogger.success("Realtime", "Detected table update: master_ledger");
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
function initSync() {
  return pullPendingEntries();
}

function pullPendingEntries() {
  return __async(this, null, function* () {
    const cfg = getSyncCfg();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      setSyncStatus("off");
      SystemLogger.warning("pullPendingEntries", "Sync skipped: Supabase credentials are not configured.");
      return null;
    }
    if (!supabaseClient) initSupabaseClient();
    if (!supabaseClient) {
      setSyncStatus("error");
      return null;
    }

    SystemLogger.info("pullPendingEntries", "Pulling pending entries from Supabase...");
    try {
      setSyncStatus("syncing");
      
      const { data: pendingData, error: pendingErr } = yield supabaseClient.from("pending_entries").select("*");
      if (pendingErr) throw pendingErr;
      
      // Update local db with pulled pending entries (merging based on ID)
      if (!db.pending_entries) db.pending_entries = [];
      const pulledIds = new Set(pendingData.map(e => e.id));
      
      // Keep local pending entries that haven't been pushed yet, or update with pulled
      const mergedPending = [...db.pending_entries.filter(e => !pulledIds.has(e.id))];
      pendingData.forEach(e => {
        mergedPending.push({
          id: e.id,
          employee_id: e.employee_id,
          date: e.date,
          shift_type: e.shift_type,
          entryData: e.entry_data, // Mapped to entryData for frontend
          status: e.status,
          submitted_at: e.submitted_at
        });
      });
      
      db.pending_entries = mergedPending;
      saveDB(false); // Only local save

      setSyncStatus("synced");
      SystemLogger.success("pullPendingEntries", `Successfully pulled ${pendingData.length} pending entries.`);
      return pendingData;
    } catch (error) {
      setSyncStatus("error");
      SystemLogger.error("pullPendingEntries", "Error pulling pending entries", error);
      return null;
    }
  });
}

function pushApprovedEntries() {
  return __async(this, null, function* () {
    const cfg = getSyncCfg();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) {
      SystemLogger.warning("pushApprovedEntries", "Supabase credentials not configured.");
      return false;
    }
    if (!supabaseClient) initSupabaseClient();

    try {
      setSyncStatus("syncing");
      
      // 1. Push Master Ledger
      if (db.master_ledger && db.master_ledger.length > 0) {
        // We only push entries that don't have an ID (if we generated local) or we just upsert them
        const ledgerPayload = db.master_ledger.map(row => ({
          date: row.date,
          shift_type: row.shift_type || 'day',
          entry_data: row.entryData || row, // Assuming the row IS the entryData
          employee_id: row.employee_id || null,
          approved_at: row.approved_at || new Date().toISOString()
        }));
        
        // Supabase upsert requires unique constraints. For simplicity we assume insert since master_ledger is append-only
        const { error: ledgerErr } = yield supabaseClient.from("master_ledger").upsert(ledgerPayload, { onConflict: 'date, shift_type' });
        if (ledgerErr) {
          console.warn("Upsert error on master_ledger. Check unique constraints on (date, shift_type). Using insert fallback.");
          yield supabaseClient.from("master_ledger").insert(ledgerPayload); // Fallback
        }
      }

      // 2. Push Pending Entries Status Updates (e.g. approved or rejected)
      if (db.pending_entries && db.pending_entries.length > 0) {
        const pendingPayload = db.pending_entries.map(e => ({
          id: e.id,
          employee_id: e.employee_id,
          date: e.date,
          shift_type: e.shift_type,
          entry_data: e.entryData,
          status: e.status,
          submitted_at: e.submitted_at
        }));
        const { error: pendingErr } = yield supabaseClient.from("pending_entries").upsert(pendingPayload);
        if (pendingErr) throw pendingErr;
      }
      
      // 3. Push Employees Configuration
      if (db.employees) {
        const empPayload = Object.values(db.employees).map(emp => ({
           name: emp.displayName || emp.name,
           phone: emp.phone,
           pin: emp.pinHash || emp.pin,
           registration_code: emp.registration_code
        })).filter(emp => emp.registration_code); // Only push actual employees with a code
        
        if (empPayload.length > 0) {
           yield supabaseClient.from("employees").upsert(empPayload, { onConflict: 'phone' });
        }
      }

      setSyncStatus("synced");
      cfg.last_push = new Date().toISOString();
      saveSyncCfg(cfg);
      SystemLogger.success("pushApprovedEntries", "Successfully pushed approved data to Supabase.");
      return true;
    } catch (error) {
      setSyncStatus("error");
      SystemLogger.error("pushApprovedEntries", "Push failed", error);
      return false;
    }
  });
}