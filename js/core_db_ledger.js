// ── Format datetime helper ─────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return '';
  return iso.replace('T',' ').slice(0,16);
}
function sanitizeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return isNaN(parsed) ? fallback : parsed;
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
      petrol: 113.37,
      diesel: 98.41
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

      // --- UNIVERSAL DATA SANITIZATION SCRUBBER ---
      const safeNum = (val) => {
        const n = parseFloat(val);
        return isNaN(n) ? 0 : n;
      };

      db.stock.petrol = safeNum(db.stock.petrol);
      db.stock.diesel = safeNum(db.stock.diesel);
      db.stock.petrol_cost_wac = safeNum(db.stock.petrol_cost_wac);
      db.stock.diesel_cost_wac = safeNum(db.stock.diesel_cost_wac);
      
      db.cashflow.bank_balance = safeNum(db.cashflow.bank_balance);
      db.cashflow.phonepe_balance = safeNum(db.cashflow.phonepe_balance);
      db.cashflow.cash_drawer = safeNum(db.cashflow.cash_drawer);
      db.cashflow.iocl_cushion = safeNum(db.cashflow.iocl_cushion);

      if (db.daily_ledger && Array.isArray(db.daily_ledger)) {
        db.daily_ledger.forEach(row => {
          if (row.prices) {
            row.prices.petrol = safeNum(row.prices.petrol);
            row.prices.diesel = safeNum(row.prices.diesel);
          }
          ['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(n => {
            if (row[n]) {
              row[n].open = safeNum(row[n].open);
              row[n].close_day = safeNum(row[n].close_day);
              row[n].close_night = safeNum(row[n].close_night);
              row[n].tests_day = safeNum(row[n].tests_day);
              row[n].tests_night = safeNum(row[n].tests_night);
            }
          });
          if (row.recon) {
            row.recon.cash = safeNum(row.recon.cash);
            row.recon.phonepe = safeNum(row.recon.phonepe);
            row.recon.credit = safeNum(row.recon.credit);
            row.recon.total_collection = safeNum(row.recon.total_collection);
          }
        });
      }
      
      if (db.prices && Array.isArray(db.prices)) {
        db.prices.forEach(p => {
          p.petrol = safeNum(p.petrol);
          p.diesel = safeNum(p.diesel);
        });
      }
      // ---------------------------------------------

      let dbModified = false;
      
      if (!db.prices) {
        db.prices = [...DEFAULT_DB.prices];
        dbModified = true;
      } else {
        let p = db.prices.find(x => x.effective_date === "2026-06-01T08:00");
        if (!p) {
          db.prices.push({ effective_date: "2026-06-01T08:00", petrol: 113.37, diesel: 98.41 });
          dbModified = true;
        } else if (Number(p.petrol) !== 113.37 || Number(p.diesel) !== 98.41) {
          p.petrol = 113.37;
          p.diesel = 98.41;
          dbModified = true;
        }
      }
      
      if (!db.holidays) {
        db.holidays = [...DEFAULT_DB.holidays];
        dbModified = true;
      }
      if (!db.daily_ledger) {
        db.daily_ledger = [];
        dbModified = true;
      }

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

      if (db.daily_ledger.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const origLen = db.daily_ledger.length;
        db.daily_ledger = db.daily_ledger.filter(row => row.date <= todayStr);
        if (db.daily_ledger.length !== origLen) {
          dbModified = true;
          SystemLogger.success('loadDB', `Pruned ${origLen - db.daily_ledger.length} future-date rows from production ledger.`);
        }
      }

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
      if (!db.employees) {
        db.employees = JSON.parse(JSON.stringify(DEFAULT_DB.employees));
      }
      buildIndexes();
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

  // Automatically merge clean entries from dsr_data.js into active database
  if (typeof DSR_DRAFT_DATA !== 'undefined' && DSR_DRAFT_DATA.daily_ledger) {
    let dbModified = false;
    DSR_DRAFT_DATA.daily_ledger.forEach(draftRow => {
      const idx = db.daily_ledger.findIndex(r => r.date === draftRow.date);
      if (idx === -1) {
        db.daily_ledger.push(draftRow);
        dbModified = true;
      } else {
        if (JSON.stringify(db.daily_ledger[idx]) !== JSON.stringify(draftRow)) {
          db.daily_ledger[idx] = draftRow;
          dbModified = true;
        }
      }
    });
    if (dbModified) {
      db.daily_ledger.sort((a, b) => b.date.localeCompare(a.date));
      saveDB();
    }
  }
}

function prunePendingEntries() {
  if (!db || !db.pending_entries) return;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffTime = sevenDaysAgo.toISOString();

  db.pending_entries = db.pending_entries.filter(entry => {
    if (entry.status === 'pending') return true;
    return entry.submittedAt >= cutoffTime;
  });
}

// ── In-memory index for O(1) lookups (not stored, rebuilt from arrays) ──────
function buildIndexes() {
  db._idx = {
    pendingById:  Object.fromEntries((db.pending_entries || []).map(e => [e.id, e])),
    ledgerByDate: Object.fromEntries((db.daily_ledger   || []).map(e => [e.date, e])),
    priceByDate:  Object.fromEntries((db.prices         || []).map(p => [p.effective_date, p]))
  };
}

function saveDB(immediate = false) {
  prunePendingEntries();
  try {
    // Exclude runtime index from serialization
    const { _idx, ...dbToSave } = db;
    const dbStr = JSON.stringify(dbToSave);
    localStorage.setItem('octaneflow_db', dbStr);
    const bytes = new Blob([dbStr]).size;
    const kb = (bytes / 1024).toFixed(2);
    SystemLogger.success('saveDB', `Database saved locally successfully (${kb} KB).`);
    // Warn if DB is getting large (>3MB = 60% of typical 5MB quota)
    if (bytes > 3 * 1024 * 1024) {
      showNotification(`⚠️ Database is large (${(bytes/1024/1024).toFixed(1)} MB). Consider archiving old data.`, 'warning');
    }
  } catch (e) {
    SystemLogger.error('saveDB', 'Failed to save database locally. Storage quota may be exceeded!', e);
    showNotification('⚠️ Database write failed! Storage may be full.', 'danger');
  }
  buildIndexes(); // Rebuild index after every save
  // Auto-push to cloud on every save (debounced 2s to avoid hammering API, or immediate)
  clearTimeout(saveDB._pushTimer);
  if (immediate) {
    return syncPush();
  } else {
    saveDB._pushTimer = setTimeout(() => syncPush(), 2000);
    return Promise.resolve(true);
  }
}

function resetDB() {
  db = JSON.parse(JSON.stringify(DEFAULT_DB));
  try { db.users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '{}'); }
  catch { db.users = {}; }
  saveDB();
  SystemLogger.success('resetDB', 'Database reset to factory default state.');
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
function computeLedgerRow(row, wacMap) {
  if (!row) {
    return {
      sales: {
        du1_p: { day: 0, night: 0 },
        du1_d: { day: 0, night: 0 },
        du2_p: { day: 0, night: 0 },
        du2_d: { day: 0, night: 0 }
      },
      totals: {
        day: { petrol: 0, diesel: 0 },
        night: { petrol: 0, diesel: 0 },
        net_24h: { petrol: 0, diesel: 0 }
      },
      financials: {
        rev_petrol: 0,
        rev_diesel: 0,
        total_revenue: 0,
        total_cost: 0,
        profit: 0
      }
    };
  }

  // FIX: Read tests as local variables — NEVER mutate the stored row object.
  // tests_day = 1 if the day shift actually ran (close_day > open), else 0.
  const t1p_day   = (row.du1_p && (row.du1_p.close_day ?? 0) > (row.du1_p.open ?? 0))   ? (row.du1_p.tests_day   ?? 1) : 0;
  const t1p_night = (row.du1_p && (row.du1_p.close_night ?? 0) > (row.du1_p.close_day ?? 0)) ? (row.du1_p.tests_night ?? 0) : 0;
  const t1d_day   = (row.du1_d && (row.du1_d.close_day ?? 0) > (row.du1_d.open ?? 0))   ? (row.du1_d.tests_day   ?? 1) : 0;
  const t1d_night = (row.du1_d && (row.du1_d.close_night ?? 0) > (row.du1_d.close_day ?? 0)) ? (row.du1_d.tests_night ?? 0) : 0;
  const t2p_day   = (row.du2_p && (row.du2_p.close_day ?? 0) > (row.du2_p.open ?? 0))   ? (row.du2_p.tests_day   ?? 1) : 0;
  const t2p_night = (row.du2_p && (row.du2_p.close_night ?? 0) > (row.du2_p.close_day ?? 0)) ? (row.du2_p.tests_night ?? 0) : 0;
  const t2d_day   = (row.du2_d && (row.du2_d.close_day ?? 0) > (row.du2_d.open ?? 0))   ? (row.du2_d.tests_day   ?? 1) : 0;
  const t2d_night = (row.du2_d && (row.du2_d.close_night ?? 0) > (row.du2_d.close_day ?? 0)) ? (row.du2_d.tests_night ?? 0) : 0;

  // 1. Day Sales Qty: Close Day - Open - (Tests Day * 5L per test)
  const d1_p_day = Math.max(0, (row.du1_p?.close_day   || 0) - (row.du1_p?.open || 0) - (t1p_day   * 5));
  const d1_d_day = Math.max(0, (row.du1_d?.close_day   || 0) - (row.du1_d?.open || 0) - (t1d_day   * 5));
  const d2_p_day = Math.max(0, (row.du2_p?.close_day   || 0) - (row.du2_p?.open || 0) - (t2p_day   * 5));
  const d2_d_day = Math.max(0, (row.du2_d?.close_day   || 0) - (row.du2_d?.open || 0) - (t2d_day   * 5));

  // 2. Night Sales Qty: Close Night - Close Day - (Tests Night * 5L per test)
  const d1_p_night = Math.max(0, (row.du1_p?.close_night || 0) - (row.du1_p?.close_day || 0) - (t1p_night * 5));
  const d1_d_night = Math.max(0, (row.du1_d?.close_night || 0) - (row.du1_d?.close_day || 0) - (t1d_night * 5));
  const d2_p_night = Math.max(0, (row.du2_p?.close_night || 0) - (row.du2_p?.close_day || 0) - (t2p_night * 5));
  const d2_d_night = Math.max(0, (row.du2_d?.close_night || 0) - (row.du2_d?.close_day || 0) - (t2d_night * 5));

  // 3. Totals
  const day_petrol = d1_p_day + d2_p_day;
  const day_diesel = d1_d_day + d2_d_day;
  const night_petrol = d1_p_night + d2_p_night;
  const night_diesel = d1_d_night + d2_d_night;

  const net_petrol_24h = day_petrol + night_petrol;
  const net_diesel_24h = day_diesel + night_diesel;

  // 4. Financials
  const rev_petrol = net_petrol_24h * (row.prices?.petrol || 0);
  const rev_diesel = net_diesel_24h * (row.prices?.diesel || 0);
  const total_revenue = rev_petrol + rev_diesel;

  // Determine WAC rates to use (look up from wacMap if available, else use current)
  const dateWac = (wacMap && wacMap[row.date]) || { ms: db.stock?.petrol_cost_wac ?? 0, hsd: db.stock?.diesel_cost_wac ?? 0 };

  const cost_petrol = net_petrol_24h * (dateWac.ms ?? 0);
  const cost_diesel = net_diesel_24h * (dateWac.hsd ?? 0);
  const total_cost = cost_petrol + cost_diesel;

  const profit = total_revenue - total_cost;

  // Gross commission per fuel type = selling price margin over purchase cost
  const commission_petrol = rev_petrol - cost_petrol;
  const commission_diesel = rev_diesel - cost_diesel;
  const total_commission = commission_petrol + commission_diesel;

  const dayExps = row.expenses || (typeof KC_EXPENSES_DATA !== 'undefined' ? KC_EXPENSES_DATA[row.date] : null) || [];
  const total_expenses = dayExps.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
  const net_operating_profit = total_commission - total_expenses;

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
      profit,
      commission_petrol,
      commission_diesel,
      total_commission,
      total_expenses,
      net_operating_profit
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
    SystemLogger.success('saveDailyReadings', `Reconciliation modified and saved for date ${formatDate(data.date)}. Net Sales: Petrol = ${newNetP.toFixed(2)} L, Diesel = ${newNetD.toFixed(2)} L.`, newCalc.totals);
    showNotification(`✅ Reconciled values saved in local database and synced to Supabase! Updates visible on Sales Cumulative Sheet and Profit charts.`, "success");
  } else {
    // New date log entry: directly subtract sales from stock
    db.stock.petrol = Math.max(0, db.stock.petrol - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel - newNetD);

    db.daily_ledger.push(data);
    SystemLogger.success('saveDailyReadings', `Daily readings logged and saved for date ${formatDate(data.date)}. Net Sales: Petrol = ${newNetP.toFixed(2)} L, Diesel = ${newNetD.toFixed(2)} L.`, newCalc.totals);
    showNotification(`✅ Daily readings logged in local database and synced to Supabase! Updates visible on Sales Cumulative Sheet and Profit charts.`, "success");
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
    
    // Queue for cloud deletion
    db.deleted_ledger_dates = db.deleted_ledger_dates || [];
    if (!db.deleted_ledger_dates.includes(dateStr)) {
      db.deleted_ledger_dates.push(dateStr);
    }
    
    saveDB();
    showNotification(`Daily record for ${formatDate(dateStr)} deleted.`, "info");
    initApp();
  }
}

function recordTanker(dateStr, timeStr, loadType, customP, customD, priceP, priceD,
                      petrolInvoiceDensity = 0, petrolObservedDensity = 0, petrolObservedTemp = 0,
                      dieselInvoiceDensity = 0, dieselObservedDensity = 0, dieselObservedTemp = 0,
                      invoiceNo = '', paymentStatus = 'Due') {
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
    SystemLogger.warning('recordTanker', `Tanker receipt rejected: volume must equal exactly 12,000 Liters (got ${totalVol} L)`);
    return;
  }

  if (petrolQty % 4000 !== 0 || dieselQty % 4000 !== 0) {
    showNotification("Illogical value rejected. Petrol and Diesel quantities must be multiples of 4,000 Liters (corresponding to 4kl compartments).", "danger");
    SystemLogger.warning('recordTanker', `Tanker receipt rejected: quantities must be multiples of 4,000 L (Petrol: ${petrolQty} L, Diesel: ${dieselQty} L)`);
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

  const petrolRho15 = petrolQty > 0 ? getDensityAt15(petrolObservedDensity, petrolObservedTemp) : 0;
  const petrolVcf = petrolQty > 0 && petrolRho15 > 0 ? petrolObservedDensity / petrolRho15 : 0;
  const petrolCorrectedVol = petrolQty > 0 ? petrolQty * petrolVcf : 0;
  const petrolShortage = petrolQty > 0 ? petrolQty - petrolCorrectedVol : 0;

  const dieselRho15 = dieselQty > 0 ? getDensityAt15(dieselObservedDensity, dieselObservedTemp) : 0;
  const dieselVcf = dieselQty > 0 && dieselRho15 > 0 ? dieselObservedDensity / dieselRho15 : 0;
  const dieselCorrectedVol = dieselQty > 0 ? dieselQty * dieselVcf : 0;
  const dieselShortage = dieselQty > 0 ? dieselQty - dieselCorrectedVol : 0;

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
    invoice_no: invoiceNo || ('Challan_' + Date.now()),
    payment_status: paymentStatus === 'Paid' ? 'paid' : 'unpaid',
    paid_date: paymentStatus === 'Paid' ? dateStr + 'T' + timeStr : null,
    interest_charged: 0,

    petrol_invoice_density: petrolInvoiceDensity,
    petrol_observed_density: petrolObservedDensity,
    petrol_observed_temp: petrolObservedTemp,
    petrol_rho15: petrolRho15,
    petrol_vcf: petrolVcf,
    petrol_corrected_vol: petrolCorrectedVol,
    petrol_shortage: petrolShortage,

    diesel_invoice_density: dieselInvoiceDensity,
    diesel_observed_density: dieselObservedDensity,
    diesel_observed_temp: dieselObservedTemp,
    diesel_rho15: dieselRho15,
    diesel_vcf: dieselVcf,
    diesel_corrected_vol: dieselCorrectedVol,
    diesel_shortage: dieselShortage,
    deadline_date: creditDetails.deadlineDate,
    rtgs_filing_date: creditDetails.rtgsDate
  };

  db.purchases.unshift(purchase);
  saveDB();
  SystemLogger.success('recordTanker', `Recorded tanker delivery: Petrol = ${petrolQty} L @ ₹${priceP}/L, Diesel = ${dieselQty} L @ ₹${priceD}/L. Total Cost: ₹${purchase.total_cost.toFixed(2)}`, purchase);
  showNotification("✅ Tanker delivery saved to local database and synced to Supabase! Added to Tanker purchases registry and reconciled closing stock.", "success");
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
  SystemLogger.success('updateSellingPrice', `Selling prices updated: Petrol = ₹${entry.petrol.toFixed(2)}/L, Diesel = ₹${entry.diesel.toFixed(2)}/L (Effective: ${entry.effective_date})`, entry);
  showNotification("✅ Selling prices saved to local database and synced to Supabase! Updates will apply to future DSR commission calculations.", "success");
}

function addHoliday(dateStr, name) {
  if (db.holidays.some(h => h.date === dateStr)) {
    showNotification("A holiday is already recorded for this date!", "danger");
    return;
  }
  db.holidays.push({ date: dateStr, name });
  db.holidays.sort((a,b) => new Date(a.date) - new Date(b.date));
  saveDB();
  showNotification("✅ Bank holiday added to calendar database and synced to Supabase! Bank credit offset will apply to credit planning.", "success");
}

function removeHoliday(dateStr) {
  db.holidays = db.holidays.filter(h => h.date !== dateStr);
  saveDB();
  showNotification("✅ Holiday removed from calendar database and synced to Supabase.", "info");
}

function togglePayment(purchaseId) {
  const p = db.purchases.find(item => item.id === purchaseId);
  if (!p) return;

  const currentStatus = p.payment_status;
  const newStatusText = currentStatus === 'unpaid' ? 'Mark as PAID' : 'Mark as UNPAID';
  if (!confirm(`Are you sure you want to change this tanker's payment status to: ${newStatusText}?`)) {
    return;
  }

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
      showNotification(`✅ Payment marked as PAID (Late by ${diffDays} days). Interest charged. Synced to Supabase!`, "warning");
    } else {
      p.interest_charged = 0;
      showNotification("✅ Payment marked as PAID (On Time). Synced to Supabase!", "success");
    }
  } else {
    p.payment_status = 'unpaid';
    p.paid_date = null;
    p.interest_charged = 0;
    showNotification("✅ Payment reset to unpaid status. Synced to Supabase!", "info");
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
    const wacMap = buildWACTimeline();
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
      const c = computeLedgerRow(row, wacMap);
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
const SUB_TABS = {
  operations: [
    { id: 'shift-recon', label: 'Shift Recon' },
    { id: 'ledger',      label: 'Sales Ledger' },
    { id: 'approvals',   label: 'Pending Approvals', badge: 'approvals-badge' },
    { id: 'dsr-checker', label: 'DSR Data Checker' },
    { id: 'kc-dsr-live', label: 'Live Shift Reconciliation' }
  ],
  logistics: [
    { id: 'purchases',   label: 'Tanker Purchases' },
    { id: 'supplies',    label: 'Supply Sheet (OCR)' },
    { id: 'pricing',     label: 'Selling Prices' }
  ],
  financials: [
    { id: 'cashflow',    label: 'Cash Flow Forecast' },
    { id: 'expenses',    label: 'Expense Ledger' }
  ],
  settings: [
    { id: 'settings',    label: 'System Settings' },
    { id: 'holidays',    label: 'Bank Holidays' }
  ]
};

const currentSubviews = {
  operations: 'shift-recon',
  logistics: 'purchases',
  financials: 'cashflow',
  settings: 'settings'
};

const titles = {
  dashboard: "Dashboard Overview",
  ledger: "Sales Cumulative Ledger",
  purchases: "Tankers & Credit Operations",
  supplies: "Supply Sheet (OCR Extracted Bills)",
  pricing: "Fuel Selling Prices",
  holidays: "Bank Holiday Calendar",
  settings: "System Settings & Utilities",
  cashflow: "Cash Flow & Orders Solver",
  'shift-recon': "Shift Reconciliation & Cash Count",
  expenses: "Expense Ledger",
  approvals: "Shift Approvals",
  'dsr-checker': "DSR Data Checker & OCR Verifier",
  'kc-dsr-live': "Live Shift Reconciliation Dashboard"
};

function switchSubview(mainView, subviewId) {
  const session = getSession();
  if (subviewId === 'dsr-checker' && (!session || session.role !== 'owner')) {
    showNotification("Access denied: Owners only.", "danger");
    return;
  }
  currentSubviews[mainView] = subviewId;

  // Update view visibility
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const targetEl = document.getElementById(`view-${subviewId}`);
  if (targetEl) targetEl.classList.add('active');

  // Render subtabs bar
  renderSubtabsBar(mainView);

  // Set header title
  const headerTitle = document.getElementById('view-title');
  if (headerTitle) headerTitle.textContent = titles[subviewId] || "Ram Kisan Sewa Kendra";

  // Force pull if approvals is selected
  if (subviewId === 'approvals') {
    refreshApprovalsPanel();
  } else {
    // Render content
    renderActiveView(subviewId);
  }
}

function renderSubtabsBar(mainView) {
  const session = getSession();
  const bar = document.getElementById('header-subtabs');
  if (!bar) return;

  const subtabs = SUB_TABS[mainView];
  if (!subtabs) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  bar.style.display = 'flex';
  const activeSub = currentSubviews[mainView];

  bar.innerHTML = subtabs.map(tab => {
    if (tab.id === 'dsr-checker' && (!session || session.role !== 'owner')) {
      return '';
    }
    const isActive = tab.id === activeSub;
    const badgeHtml = tab.badge ? `<span class="badge" id="${tab.badge}-sub" style="margin-left:0.4rem;background:#ef4444;color:#fff;border-radius:9999px;padding:0.1rem 0.4rem;font-size:0.65rem;font-weight:800;display:none;">0</span>` : '';
    return `
      <button class="subtab-item ${isActive ? 'active' : ''}" data-subview="${tab.id}">
        ${tab.label}${badgeHtml}
      </button>
    `;
  }).join('');

  // Wire events
  bar.querySelectorAll('.subtab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchSubview(mainView, btn.dataset.subview);
    });
  });

  // Update badges immediately
  updateApprovalsBadge();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const targetView = item.dataset.view;

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    if (targetView === 'dashboard') {
      document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
      const dbView = document.getElementById('view-dashboard');
      if (dbView) dbView.classList.add('active');
      const bar = document.getElementById('header-subtabs');
      if (bar) bar.style.display = 'none';
      const headerTitle = document.getElementById('view-title');
      if (headerTitle) headerTitle.textContent = titles.dashboard;
      renderActiveView('dashboard');
    } else {
      const activeSub = currentSubviews[targetView] || targetView;
      switchSubview(targetView, activeSub);
    }
  });
});

function renderActiveView(viewName) {
  if (viewName === 'dashboard')   { renderDashboard(); updateApprovalsBadge(); }
  if (viewName === 'ledger') { renderLedger(); setTimeout(loadAnchorUI, 50); }
  if (viewName === 'purchases')   renderPurchases();
  if (viewName === 'supplies')    renderSupplies();
  if (viewName === 'pricing')     renderPricing();
  if (viewName === 'holidays')    renderHolidays();
  if (viewName === 'settings')    { renderSettings(); renderUserManagement(); }
  if (viewName === 'cashflow')    renderCashFlow();
  if (viewName === 'shift-recon') renderShiftRecon();
  if (viewName === 'expenses')    renderExpenseLedger();
  if (viewName === 'approvals')   renderApprovalsPanel();
  if (viewName === 'dsr-checker') renderDsrChecker();
  if (viewName === 'kc-dsr-live') renderKcDsrLive();
}

function renderKcDsrLive() {
  // Let the iframe display normally
}

// -------------------------------------------------------------
// VIEW-SPECIFIC RENDERERS
// -------------------------------------------------------------
function renderDashboard() {
  let activePrice = (db.prices && db.prices[0]) ? db.prices[0] : { petrol: 103.50, diesel: 90.80 };
  let priceLastUpdatedStr = activePrice.effective_date ? `Effective: ${formatDateTime(activePrice.effective_date)}` : "No price logged";

  if (db.daily_ledger && db.daily_ledger.length > 0) {
    const latestRow = db.daily_ledger[0];
    if (latestRow.prices) {
      activePrice = {
        petrol: latestRow.prices.petrol || activePrice.petrol,
        diesel: latestRow.prices.diesel || activePrice.diesel
      };
      priceLastUpdatedStr = `From latest DSR (${formatDate(latestRow.date)})`;
    }
  }

  document.getElementById('current-date-span').textContent = formatDate(new Date().toISOString().split('T')[0]);

  document.getElementById('dash-selling-prices').textContent =
    `P: ${formatCurrency(activePrice.petrol)} | D: ${formatCurrency(activePrice.diesel)}`;
  document.getElementById('dash-prices-last-updated').textContent = priceLastUpdatedStr;

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

  // Tanks Levels (calculate dynamically from latest physical dip if possible)
  const maxPetrol = db.settings.petrol_capacity || 20000;
  const maxDiesel = db.settings.diesel_capacity || 20000;
  const maxDipP = db.settings.petrol_tank_dia || 200;
  const maxDipD = db.settings.diesel_tank_dia || 200;

  const latestRowForStock = db.daily_ledger && db.daily_ledger.length > 0 ? db.daily_ledger[0] : null;
  let petrolVol = db.stock.petrol;
  let dieselVol = db.stock.diesel;

  if (latestRowForStock) {
    const latestPhysP = dipToLiters(latestRowForStock.dip_ms_cm || 0, maxPetrol, maxDipP);
    const latestPhysD = dipToLiters(latestRowForStock.dip_hsd_cm || 0, maxDiesel, maxDipD);
    if (latestPhysP > 0) petrolVol = latestPhysP;
    if (latestPhysD > 0) dieselVol = latestPhysD;
  }

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

  // Calculate rolling 7-day average sales and days of cover
  const getAverageSales = (days = 7) => {
    let petSalesSum = 0;
    let dieSalesSum = 0;
    let count = 0;
    const sortedLedger = [...(window.dsrDraftData || [])].sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < Math.min(days, sortedLedger.length); i++) {
      const row = sortedLedger[i];
      const p1_open = row.du1_p.open || 0;
      const p1_close = row.du1_p.close_day || 0;
      const p2_open = row.du2_p.open || 0;
      const p2_close = row.du2_p.close_day || 0;
      const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
      const p_sales = Math.max(0, (p1_close - p1_open) + (p2_close - p2_open) - p_tests);

      const d1_open = row.du1_d.open || 0;
      const d1_close = row.du1_d.close_day || 0;
      const d2_open = row.du2_d.open || 0;
      const d2_close = row.du2_d.close_day || 0;
      const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
      const d_sales = Math.max(0, (d1_close - d1_open) + (d2_close - d2_open) - d_tests);
      
      petSalesSum += p_sales;
      dieSalesSum += d_sales;
      count++;
    }
    return {
      petrol: count > 0 ? petSalesSum / count : 1000,
      diesel: count > 0 ? dieSalesSum / count : 1500
    };
  };

  const avgSales = getAverageSales(7);
  const petCover = avgSales.petrol > 0 ? usableP / avgSales.petrol : 99;
  const dieCover = avgSales.diesel > 0 ? usableD / avgSales.diesel : 99;

  const coverPetrolEl = document.getElementById('tank-cover-petrol');
  if (coverPetrolEl) {
    if (petCover < 3) {
      coverPetrolEl.innerHTML = `<strong style="color:#f87171;">${petCover.toFixed(1)} days</strong> <span style="background:rgba(239,68,68,0.15); color:#f87171; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">⚠️ Low Stock</span>`;
    } else {
      coverPetrolEl.innerHTML = `<strong style="color:#4ade80;">${petCover.toFixed(1)} days</strong> <span style="background:rgba(74,222,128,0.15); color:#4ade80; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">🟢 Healthy</span>`;
    }
  }

  const stockDieselEl = document.getElementById('tank-stock-diesel');
  if (stockDieselEl) stockDieselEl.textContent = formatVol(dieselVol);
  const usableDieselEl = document.getElementById('tank-usable-diesel');
  if (usableDieselEl) usableDieselEl.textContent = formatVol(usableD);
  const deadDieselEl = document.getElementById('tank-dead-diesel');
  if (deadDieselEl) deadDieselEl.textContent = formatVol(deadDStock);
  const percentDieselEl = document.getElementById('tank-percent-diesel');
  if (percentDieselEl) percentDieselEl.textContent = `${dieselPct.toFixed(1)}% of ${maxDiesel} L`;

  const coverDieselEl = document.getElementById('tank-cover-diesel');
  if (coverDieselEl) {
    if (dieCover < 3) {
      coverDieselEl.innerHTML = `<strong style="color:#f87171;">${dieCover.toFixed(1)} days</strong> <span style="background:rgba(239,68,68,0.15); color:#f87171; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">⚠️ Low Stock</span>`;
    } else {
      coverDieselEl.innerHTML = `<strong style="color:#4ade80;">${dieCover.toFixed(1)} days</strong> <span style="background:rgba(74,222,128,0.15); color:#4ade80; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:700; margin-left:0.25rem;">🟢 Healthy</span>`;
    }
  }

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

  const wacMap = buildWACTimeline();

  // 1. Build stock reconciliation timeline (forward + backward from anchor)
  // PRIORITY ORDER:
  //   a) If db.settings.stock_anchor is set (user-entered verified stock on a known date),
  //      run BACKWARD from anchor date (anchor_date + supply - sales = prev day stock),
  //      then run FORWARD from anchor date for future dates.
  //   b) If no anchor: run forward from Day-1, seeding from OCR dip on first row only.
  //   c) Supply always read from supply bills first, then OCR receipts.
  const stockTimeline = {};

  const forwardLedger = [...db.daily_ledger].sort((a, b) => a.date.localeCompare(b.date));

  // Helper: get supply for a date
  function getDaySupply(dateStr) {
    const phys = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[dateStr] : null;
    let p_supply = 0, d_supply = 0;
    if (typeof SUPPLY_BILLS_DATA !== 'undefined') {
      const daySupplies = SUPPLY_BILLS_DATA.filter(s => s.invoice_date_iso === dateStr);
      daySupplies.forEach(s => {
        const qty = (s.quantity_kl || 0) * 1000;
        if (s.product === 'Petrol') p_supply += qty;
        else if (s.product === 'Diesel') d_supply += qty;
      });
    }
    if (p_supply === 0 && d_supply === 0 && phys) {
      p_supply = phys.petrol_receipt || 0;
      d_supply = phys.diesel_receipt || 0;
    }
    // Truck capacity safeguard
    if (p_supply > 12000) p_supply = 12000;
    if (d_supply > 12000) d_supply = 12000;
    if (p_supply + d_supply > 12000) {
      const ratio = p_supply / (p_supply + d_supply);
      p_supply = Math.round((12000 * ratio) / 4000) * 4000;
      d_supply = 12000 - p_supply;
    }
    return { p_supply, d_supply };
  }

  const anchor = db.settings?.stock_anchor; // { date, petrol_L, diesel_L }

  if (anchor && anchor.date && anchor.petrol_L != null && anchor.diesel_L != null) {
    // === BACKWARD PASS: from anchor date going earlier ===
    let backP = anchor.petrol_L;
    let backD = anchor.diesel_L;
    const anchorIdx = forwardLedger.findIndex(r => r.date === anchor.date);
    const startIdx = anchorIdx >= 0 ? anchorIdx : forwardLedger.length - 1;

    // Set anchor day's opening stock
    for (let i = startIdx; i >= 0; i--) {
      const row = forwardLedger[i];
      const c = computeLedgerRow(row, wacMap);
      const sales_p = c.totals.net_24h.petrol;
      const sales_d = c.totals.net_24h.diesel;
      const { p_supply, d_supply } = getDaySupply(row.date);
      const phys_display = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[row.date] : null;

      // On anchor day itself: opening = backP (which is anchor stock at start of day)
      // close = opening - sales + supply
      const open_p = i === startIdx ? backP : (backP + sales_p - p_supply);
      const open_d = i === startIdx ? backD : (backD + sales_d - d_supply);
      const close_p = Math.max(0, open_p - sales_p + p_supply);
      const close_d = Math.max(0, open_d - sales_d + d_supply);

      stockTimeline[row.date] = {
        start_p: Math.max(0, open_p),
        supply_p: p_supply,
        close_p,
        physical_p: phys_display?.petrol_dip ?? null,
        start_d: Math.max(0, open_d),
        supply_d: d_supply,
        close_d,
        physical_d: phys_display?.diesel_dip ?? null
      };

      // Move backward: prev day closing = this day opening
      backP = Math.max(0, open_p);
      backD = Math.max(0, open_d);
    }

    // === FORWARD PASS: from anchor date going later ===
    let fwdP = stockTimeline[forwardLedger[startIdx]?.date]?.close_p ?? anchor.petrol_L;
    let fwdD = stockTimeline[forwardLedger[startIdx]?.date]?.close_d ?? anchor.diesel_L;
    for (let i = startIdx + 1; i < forwardLedger.length; i++) {
      const row = forwardLedger[i];
      const c = computeLedgerRow(row, wacMap);
      const sales_p = c.totals.net_24h.petrol;
      const sales_d = c.totals.net_24h.diesel;
      const { p_supply, d_supply } = getDaySupply(row.date);
      const phys_display = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[row.date] : null;
      const close_p = Math.max(0, fwdP - sales_p + p_supply);
      const close_d = Math.max(0, fwdD - sales_d + d_supply);
      stockTimeline[row.date] = {
        start_p: fwdP, supply_p: p_supply, close_p,
        physical_p: phys_display?.petrol_dip ?? null,
        start_d: fwdD, supply_d: d_supply, close_d,
        physical_d: phys_display?.diesel_dip ?? null
      };
      fwdP = close_p;
      fwdD = close_d;
    }

  } else {
    // === FORWARD-ONLY PASS (no anchor set — use OCR dip for day-1 seed) ===
    let runningPetrol = null;
    let runningDiesel = null;



  forwardLedger.forEach(row => {
    let p_supply = 0;
    let d_supply = 0;

    const dateStr = row.date;
    const phys = (typeof DSR_PHYSICAL_STOCK_DATA !== 'undefined') ? DSR_PHYSICAL_STOCK_DATA[dateStr] : null;

    // Step 1: Get supply from bank-verified invoices first, then OCR receipts
    let p_bill_supply = 0;
    let d_bill_supply = 0;
    if (typeof SUPPLY_BILLS_DATA !== 'undefined') {
      const daySupplies = SUPPLY_BILLS_DATA.filter(s => s.invoice_date_iso === dateStr);
      daySupplies.forEach(s => {
        const qty = (s.quantity_kl || 0) * 1000;
        if (s.product === 'Petrol') p_bill_supply += qty;
        else if (s.product === 'Diesel') d_bill_supply += qty;
      });
    }

    if (p_bill_supply > 0 || d_bill_supply > 0) {
      p_supply = p_bill_supply;
      d_supply = d_bill_supply;
    } else if (phys) {
      p_supply = phys.petrol_receipt || 0;
      d_supply = phys.diesel_receipt || 0;
    }

    // Truck capacity safeguard — max 12 KL per day, snaps to 4KL compartments
    if (p_supply > 12000) p_supply = 12000;
    if (d_supply > 12000) d_supply = 12000;
    if (p_supply + d_supply > 12000) {
      const ratio = p_supply / (p_supply + d_supply);
      p_supply = Math.round((12000 * ratio) / 4000) * 4000;
      d_supply = 12000 - p_supply;
    }

    // Step 2: Determine opening stock
    // Always prefer the running calculated chain.
    // Only use OCR dip for seeding the very first day (runningPetrol is null)
    // or if user has manually overridden (p_dip_override).
    const p_dip_raw = (row.p_dip_override !== undefined) ? row.p_dip_override : null;
    const d_dip_raw = (row.d_dip_override !== undefined) ? row.d_dip_override : null;

    let start_p;
    if (p_dip_raw !== null) {
      // Manual override always wins
      start_p = p_dip_raw;
    } else if (runningPetrol !== null) {
      // Calculated chain is the primary source
      start_p = runningPetrol;
    } else if (phys && phys.petrol_dip !== undefined) {
      // First-day seed only — use OCR dip to bootstrap the chain
      start_p = phys.petrol_dip;
    } else {
      start_p = row.opening_stock?.ms ?? 8000;
    }

    let start_d;
    if (d_dip_raw !== null) {
      start_d = d_dip_raw;
    } else if (runningDiesel !== null) {
      start_d = runningDiesel;
    } else if (phys && phys.diesel_dip !== undefined) {
      start_d = phys.diesel_dip;
    } else {
      start_d = row.opening_stock?.hsd ?? 12000;
    }

    const c = computeLedgerRow(row, wacMap);
    const sales_p = c.totals.net_24h.petrol;
    const sales_d = c.totals.net_24h.diesel;

    const close_p = Math.max(0, start_p - sales_p + p_supply);
    const close_d = Math.max(0, start_d - sales_d + d_supply);

    runningPetrol = close_p;
    runningDiesel = close_d;

    // Store physical dip for display/sanity check only (not for chain calculation)
    const phys_p_display = phys && phys.petrol_dip !== undefined ? phys.petrol_dip : null;
    const phys_d_display = phys && phys.diesel_dip !== undefined ? phys.diesel_dip : null;

    stockTimeline[dateStr] = {
      start_p,
      supply_p: p_supply,
      close_p,
      physical_p: phys_p_display,
      start_d,
      supply_d: d_supply,
      close_d,
      physical_d: phys_d_display
    };
  }); // end forwardLedger.forEach
  } // end else (no anchor)

  // Build full date list — from first entry to TODAY (IST)
  // OUTSIDE if/else so ALL ledger views share the same data
  const ledgerDateMap = {};
  db.daily_ledger.forEach(r => { ledgerDateMap[r.date] = r; });
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  const todayDateStr = nowIST.toISOString().split('T')[0];
  const firstLedgerDate = forwardLedger[0]?.date || todayDateStr;
  const fullLedgerRows = [];
  let iterDate = new Date(firstLedgerDate + 'T12:00:00Z');
  const endIterDate = new Date(todayDateStr + 'T12:00:00Z');
  while (iterDate <= endIterDate) {
    const ds = iterDate.toISOString().split('T')[0];
    fullLedgerRows.push(ledgerDateMap[ds] ? { ...ledgerDateMap[ds], _isPending: false } : { date: ds, _isPending: true });
    iterDate.setDate(iterDate.getDate() + 1);
  }
  fullLedgerRows.reverse(); // newest first — today at top

  if (ledgerViewMode === 'table') {

    tableContainer.style.display = 'block';
    splitContainer.style.display = 'none';
    document.getElementById('ledger-pnl-container').style.display = 'none';
    toggleBtn.style.display = 'inline-flex';

    let headerHtml = '';
    let rowsHtml = '';

    const getAnomalyStats = (row, index) => {
      if (!row) {
        return {
          isPriceChange: false,
          isNoSalePetrol: true,
          isNoSaleDiesel: true,
          isNoTesting: true,
          isNegativeProfit: false,
          hasVariance: false,
          badgesHtml: '',
          testsP: 0,
          testsD: 0,
          c: computeLedgerRow(null, wacMap)
        };
      }
      const prevRow = index + 1 < db.daily_ledger.length ? db.daily_ledger[index + 1] : null;
      const isPriceChange = prevRow && row.prices && prevRow.prices &&
        (Number(row.prices.petrol || 0) !== Number(prevRow.prices.petrol || 0) || Number(row.prices.diesel || 0) !== Number(prevRow.prices.diesel || 0));

      const c = computeLedgerRow(row, wacMap);
      const isNoSalePetrol = (c.totals?.net_24h?.petrol || 0) <= 0;
      const isNoSaleDiesel = (c.totals?.net_24h?.diesel || 0) <= 0;

      const t1p_day   = (row.du1_p && (row.du1_p.close_day ?? 0) > (row.du1_p.open ?? 0))   ? (row.du1_p.tests_day   ?? 1) : 0;
      const t1d_day   = (row.du1_d && (row.du1_d.close_day ?? 0) > (row.du1_d.open ?? 0))   ? (row.du1_d.tests_day   ?? 1) : 0;
      const t2p_day   = (row.du2_p && (row.du2_p.close_day ?? 0) > (row.du2_p.open ?? 0))   ? (row.du2_p.tests_day   ?? 1) : 0;
      const t2d_day   = (row.du2_d && (row.du2_d.close_day ?? 0) > (row.du2_d.open ?? 0))   ? (row.du2_d.tests_day   ?? 1) : 0;

      const testsP = t1p_day + t2p_day;
      const testsD = t1d_day + t2d_day;
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

      const stk = stockTimeline[row.date];
      const isLowStockPetrol = stk && stk.close_p < 600;
      const isLowStockDiesel = stk && stk.close_d < 40;
      if (isLowStockPetrol || isLowStockDiesel) {
        let lowDetails = [];
        if (isLowStockPetrol) lowDetails.push(`Petrol (${stk.close_p.toFixed(0)}L < 600L)`);
        if (isLowStockDiesel) lowDetails.push(`Diesel (${stk.close_d.toFixed(0)}L < 40L)`);
        badgesHtml += `<span class="anomaly-badge anomaly-badge-lowstock" title="Low Fuel Level: ${lowDetails.join(', ')}">Low Stock</span>`;
      }

      return {
        isPriceChange,
        isNoSalePetrol,
        isNoSaleDiesel,
        isNoTesting,
        isNegativeProfit,
        hasVariance,
        isLowStockPetrol,
        isLowStockDiesel,
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
            <th rowspan="2">Net Operating Profit (₹)</th>
            <th colspan="3" class="col-petrol bg-petrol-group">Petrol Stock Reconciliation</th>
            <th colspan="3" class="col-diesel bg-diesel-group">Diesel Stock Reconciliation</th>
            <th rowspan="2">Expenses</th>
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

            <th class="bg-petrol-group">Morning Dip</th>
            <th class="bg-petrol-group">Supply (L)</th>
            <th class="bg-petrol-group">Reconciled Close</th>

            <th class="bg-diesel-group">Morning Dip</th>
            <th class="bg-diesel-group">Supply (L)</th>
            <th class="bg-diesel-group">Reconciled Close</th>
          </tr>
        </thead>
      `;


      fullLedgerRows.forEach((row) => {
        if (row._isPending) {
          const stkEst = stockTimeline[row.date];
          const stkEstHtml = stkEst
            ? `<span style="color:#10b981; font-size:0.72rem; margin-left:0.5rem;">≈ P: ${stkEst.start_p.toFixed(0)} L | D: ${stkEst.start_d.toFixed(0)} L</span>`
            : '';
          rowsHtml += `
            <tr style="background: rgba(239,68,68,0.05); border-left: 3px solid #ef4444;">
              <td class="sticky-col-left" style="color: #ef4444;">
                <strong>${formatDate(row.date)}</strong>
                <span style="display:block; font-size:0.68rem; color:#ef4444; margin-top:2px;">⏳ Pending</span>
              </td>
              <td colspan="18" style="text-align:center; color: var(--text-muted); font-size:0.78rem; font-style:italic; padding: 0.6rem 0;">
                No readings entered yet${stkEstHtml}
              </td>
              <td class="sticky-col-right">
                <button class="btn btn-primary btn-sm" onclick="openLogReadingsModal('${row.date}')" style="padding: 0.25rem 0.5rem; font-size:0.72rem;">Enter Data</button>
              </td>
            </tr>
          `;
          return;
        }

        const index = db.daily_ledger.findIndex(r => r.date === row.date);
        const anomaly = getAnomalyStats(row, index);
        const c = anomaly.c;
        const testsP = anomaly.testsP;
        const testsD = anomaly.testsD;

        const stk = stockTimeline[row.date] || {
          start_p: 0, supply_p: 0, close_p: 0, physical_p: null,
          start_d: 0, supply_d: 0, close_d: 0, physical_d: null
        };

        let p_dip_html = stk.start_p.toFixed(0);
        if (stk.physical_p !== null) {
          const diff = Math.abs(stk.start_p - stk.physical_p);
          if (diff > 500) {
            p_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_p.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            p_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        let d_dip_html = stk.start_d.toFixed(0);
        if (stk.physical_d !== null) {
          const diff = Math.abs(stk.start_d - stk.physical_d);
          if (diff > 500) {
            d_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_d.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            d_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        const dayExps = row.expenses || (typeof KC_EXPENSES_DATA !== 'undefined' ? KC_EXPENSES_DATA[row.date] : null) || [];
        let expenses_html = '&mdash;';
        const totAmt = dayExps.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        if (totAmt > 0) {
          expenses_html = `
            <div class="expense-popover-container">
              <button class="expense-btn" onclick="toggleExpensePopover(event, '${row.date}')">
                ₹ ${totAmt.toFixed(0)}
              </button>
            </div>
          `;
        }

        rowsHtml += `
          <tr>
            <td class="sticky-col-left"><strong>${formatDate(row.date)}</strong>${anomaly.badgesHtml}</td>
            <td class="col-petrol ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.petrol ?? 0).toFixed(2)}</td>
            <td class="col-diesel ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.diesel ?? 0).toFixed(2)}</td>

            <!-- DU 1 24Hr -->
            <td class="bg-petrol-group">${(row.du1_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du1_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- DU 2 24Hr -->
            <td class="bg-petrol-group">${(row.du2_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du2_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- 24hr Net Liters -->
            <td class="col-petrol bg-petrol-group ${anomaly.isNoSalePetrol ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.petrol ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group ${anomaly.isNoSaleDiesel ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.diesel ?? 0).toFixed(1)}</td>

            <!-- 24hr Tests -->
            <td class="col-petrol bg-petrol-group ${testsP === 0 ? 'cell-anomaly-no-test' : ''}">${testsP * 5} L</td>
            <td class="col-diesel bg-diesel-group ${testsD === 0 ? 'cell-anomaly-no-test' : ''}">${testsD * 5} L</td>

            <!-- Revenue -->
            <td class="col-petrol">${formatCurrency(c.financials?.rev_petrol ?? 0)}</td>
            <td class="col-diesel">${formatCurrency(c.financials?.rev_diesel ?? 0)}</td>
            <td style="font-weight:600;">${formatCurrency(c.financials?.total_revenue ?? 0)}</td>

            <!-- Cost & Profit -->
            <td>${formatCurrency(c.financials?.total_cost ?? 0)}</td>
            <td class="${(c.financials?.profit ?? 0) >= 0 ? 'text-success' : 'text-danger'} ${anomaly.isNegativeProfit ? 'cell-anomaly-negative-profit' : ''}" style="font-weight: 600;">
              ${formatCurrency(c.financials?.profit ?? 0)}
            </td>

            <!-- Plan 21: Net Operating Profit (Commission - Expenses) -->
            <td style="font-weight:600;" title="Gross Commission: ${formatCurrency(c.financials?.total_commission ?? 0)} | Daily Expenses: ${formatCurrency(totAmt)}">${formatCurrency(c.financials?.net_operating_profit ?? 0)}</td>

            <!-- Plan 21: Stock Reconciliation Petrol -->
            <td class="bg-petrol-group">${p_dip_html}</td>
            <td class="bg-petrol-group">${stk.supply_p > 0 ? stk.supply_p.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-petrol-group" style="font-weight:600;">${stk.close_p.toFixed(0)} L</td>

            <!-- Plan 21: Stock Reconciliation Diesel -->
            <td class="bg-diesel-group">${d_dip_html}</td>
            <td class="bg-diesel-group">${stk.supply_d > 0 ? stk.supply_d.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-diesel-group" style="font-weight:600;">${stk.close_d.toFixed(0)} L</td>

            <!-- Plan 21: Expenses -->
            <td>${expenses_html}</td>

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
            <th rowspan="2">Net Operating Profit (₹)</th>
            <th colspan="3" class="col-petrol bg-petrol-group">Petrol Stock Reconciliation</th>
            <th colspan="3" class="col-diesel bg-diesel-group">Diesel Stock Reconciliation</th>
            <th rowspan="2">Expenses</th>
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

            <th class="bg-petrol-group">Morning Dip</th>
            <th class="bg-petrol-group">Supply (L)</th>
            <th class="bg-petrol-group">Reconciled Close</th>

            <th class="bg-diesel-group">Morning Dip</th>
            <th class="bg-diesel-group">Supply (L)</th>
            <th class="bg-diesel-group">Reconciled Close</th>
          </tr>
        </thead>
      `;


      // Reuse same fullLedgerRows built above (includes pending placeholders)
      fullLedgerRows.forEach((row) => {
        if (row._isPending) {
          const stkEst = stockTimeline[row.date];
          const stkEstHtml = stkEst
            ? `<span style="color:#10b981; font-size:0.72rem; margin-left:0.5rem;">≈ P: ${stkEst.start_p.toFixed(0)} L | D: ${stkEst.start_d.toFixed(0)} L</span>`
            : '';
          rowsHtml += `
            <tr style="background: rgba(239,68,68,0.05); border-left: 3px solid #ef4444;">
              <td class="sticky-col-left" style="color: #ef4444;">
                <strong>${formatDate(row.date)}</strong>
                <span style="display:block; font-size:0.68rem; color:#ef4444; margin-top:2px;">⏳ Pending</span>
              </td>
              <td colspan="28" style="text-align:center; color: var(--text-muted); font-size:0.78rem; font-style:italic; padding: 0.6rem 0;">
                No readings entered yet${stkEstHtml}
              </td>
              <td class="sticky-col-right">
                <button class="btn btn-primary btn-sm" onclick="openLogReadingsModal('${row.date}')" style="padding: 0.25rem 0.5rem; font-size:0.72rem;">Enter Data</button>
              </td>
            </tr>
          `;
          return;
        }

        const index = db.daily_ledger.findIndex(r => r.date === row.date);
        const anomaly = getAnomalyStats(row, index);
        const c = anomaly.c;
        const testsP = anomaly.testsP;
        const testsD = anomaly.testsD;

        const stk = stockTimeline[row.date] || {
          start_p: 0, supply_p: 0, close_p: 0, physical_p: null,
          start_d: 0, supply_d: 0, close_d: 0, physical_d: null
        };


        let p_dip_html = stk.start_p.toFixed(0);
        if (stk.physical_p !== null) {
          const diff = Math.abs(stk.start_p - stk.physical_p);
          if (diff > 500) {
            p_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_p.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            p_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        let d_dip_html = stk.start_d.toFixed(0);
        if (stk.physical_d !== null) {
          const diff = Math.abs(stk.start_d - stk.physical_d);
          if (diff > 500) {
            d_dip_html += ` <span class="stock-mismatch-badge" title="Physical Dip: ${stk.physical_d.toFixed(0)} L (Diff: ${diff.toFixed(0)} L)">⚠️ Mismatch</span>`;
          } else {
            d_dip_html += ` <span class="stock-ok-badge" title="Physical Dip matches reconciled stock">OK</span>`;
          }
        }

        const dayExps = (typeof KC_EXPENSES_DATA !== 'undefined') ? KC_EXPENSES_DATA[row.date] : null;
        let expenses_html = '&mdash;';
        if (dayExps && dayExps.length > 0) {
          const totAmt = dayExps.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
          expenses_html = `
            <div class="expense-popover-container">
              <button class="expense-btn" onclick="toggleExpensePopover(event, '${row.date}')">
                ₹ ${totAmt.toFixed(0)}
              </button>
            </div>
          `;
        }

        rowsHtml += `
          <tr>
            <td class="sticky-col-left"><strong>${formatDate(row.date)}</strong>${anomaly.badgesHtml}</td>
            <td class="col-petrol ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.petrol ?? 0).toFixed(2)}</td>
            <td class="col-diesel ${anomaly.isPriceChange ? 'cell-anomaly-price-change' : ''}" style="font-weight: 500;">${(row.prices?.diesel ?? 0).toFixed(2)}</td>

            <!-- DU1 Day -->
            <td class="bg-petrol-group">${(row.du1_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du1_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_day ?? 0).toFixed(1)}</td>

            <!-- DU2 Day -->
            <td class="bg-petrol-group">${(row.du2_p?.open ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du2_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.open ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_day ?? 0).toFixed(1)}</td>

            <!-- DU1 Night -->
            <td class="bg-petrol-group">${(row.du1_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du1_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du1_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- DU2 Night -->
            <td class="bg-petrol-group">${(row.du2_p?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-petrol-group">${(row.du2_p?.close_night ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_day ?? 0).toFixed(1)}</td>
            <td class="bg-diesel-group">${(row.du2_d?.close_night ?? 0).toFixed(1)}</td>

            <!-- Day Sales Net -->
            <td class="col-petrol bg-petrol-group">${(c.sales?.du1_p?.day ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du1_d?.day ?? 0).toFixed(1)}</td>
            <td class="col-petrol bg-petrol-group">${(c.sales?.du2_p?.day ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du2_d?.day ?? 0).toFixed(1)}</td>

            <!-- Night Sales Net -->
            <td class="col-petrol bg-petrol-group">${(c.sales?.du1_p?.night ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du1_d?.night ?? 0).toFixed(1)}</td>
            <td class="col-petrol bg-petrol-group">${(c.sales?.du2_p?.night ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group">${(c.sales?.du2_d?.night ?? 0).toFixed(1)}</td>

            <!-- Day Tests -->
            <td class="col-petrol bg-petrol-group">
              ${(() => {
                const t1 = (row.du1_p && (row.du1_p.close_day ?? 0) > (row.du1_p.open ?? 0)) ? (row.du1_p.tests_day ?? 1) : 0;
                const t2 = (row.du2_p && (row.du2_p.close_day ?? 0) > (row.du2_p.open ?? 0)) ? (row.du2_p.tests_day ?? 1) : 0;
                const vol = (t1 + t2) * 5;
                const amt = vol * (row.prices?.petrol || 0);
                return vol > 0 ? `${vol} L <span style="font-size:0.75rem; color:var(--text-dim); display:block;">(₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>` : "0 L";
              })()}
            </td>
            <td class="col-diesel bg-diesel-group">
              ${(() => {
                const t1 = (row.du1_d && (row.du1_d.close_day ?? 0) > (row.du1_d.open ?? 0)) ? (row.du1_d.tests_day ?? 1) : 0;
                const t2 = (row.du2_d && (row.du2_d.close_day ?? 0) > (row.du2_d.open ?? 0)) ? (row.du2_d.tests_day ?? 1) : 0;
                const vol = (t1 + t2) * 5;
                const amt = vol * (row.prices?.diesel || 0);
                return vol > 0 ? `${vol} L <span style="font-size:0.75rem; color:var(--text-dim); display:block;">(₹ ${amt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>` : "0 L";
              })()}
            </td>

            <!-- 24hr Net Liters -->
            <td class="col-petrol bg-petrol-group ${anomaly.isNoSalePetrol ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.petrol ?? 0).toFixed(1)}</td>
            <td class="col-diesel bg-diesel-group ${anomaly.isNoSaleDiesel ? 'cell-anomaly-no-sale' : ''}" style="font-weight:600;">${(c.totals?.net_24h?.diesel ?? 0).toFixed(1)}</td>

            <!-- Revenue -->
            <td class="col-petrol">${formatCurrency(c.financials?.rev_petrol ?? 0)}</td>
            <td class="col-diesel">${formatCurrency(c.financials?.rev_diesel ?? 0)}</td>
            <td style="font-weight:600;">${formatCurrency(c.financials?.total_revenue ?? 0)}</td>

            <!-- Cost & Profit -->
            <td>${formatCurrency(c.financials?.total_cost ?? 0)}</td>
            <td class="${(c.financials?.profit ?? 0) >= 0 ? 'text-success' : 'text-danger'} ${anomaly.isNegativeProfit ? 'cell-anomaly-negative-profit' : ''}" style="font-weight: 600;">
              ${formatCurrency(c.financials?.profit ?? 0)}
            </td>

            <!-- Plan 21: Net Operating Profit (Commission - Expenses) -->
            <td style="font-weight:600;" title="Gross Commission: ${formatCurrency(c.financials?.total_commission ?? 0)} | Daily Expenses: ${formatCurrency(c.financials?.total_expenses ?? 0)}">${formatCurrency(c.financials?.net_operating_profit ?? 0)}</td>

            <!-- Plan 21: Stock Reconciliation Petrol -->
            <td class="bg-petrol-group">${p_dip_html}</td>
            <td class="bg-petrol-group">${stk.supply_p > 0 ? stk.supply_p.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-petrol-group" style="font-weight:600;">${stk.close_p.toFixed(0)} L</td>

            <!-- Plan 21: Stock Reconciliation Diesel -->
            <td class="bg-diesel-group">${d_dip_html}</td>
            <td class="bg-diesel-group">${stk.supply_d > 0 ? stk.supply_d.toFixed(0) + ' L' : '0 L'}</td>
            <td class="bg-diesel-group" style="font-weight:600;">${stk.close_d.toFixed(0)} L</td>

            <!-- Plan 21: Expenses -->
            <td>${expenses_html}</td>

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
      const c = computeLedgerRow(row, wacMap);
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

    const c = computeLedgerRow(selectedRow, wacMap);

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
            Reporting Date: <strong>${formatDate(selectedRow.date)}</strong> | Selling Rates: Petrol: <strong>₹${(selectedRow.prices?.petrol ?? 0).toFixed(2)}</strong>, Diesel: <strong>₹${(selectedRow.prices?.diesel ?? 0).toFixed(2)}</strong>
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
      const testsP = (selectedRow.du1_p?.tests_day ?? 0) + (selectedRow.du2_p?.tests_day ?? 0);
      const testsD = (selectedRow.du1_d?.tests_day ?? 0) + (selectedRow.du2_d?.tests_day ?? 0);

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
                    Open: ${(selectedRow.du1_p?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du1_p?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du1_p?.close_night ?? 0) - (selectedRow.du1_p?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du1_p?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du1_p?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du1_p?.day ?? 0) + (c.sales?.du1_p?.night ?? 0)).toFixed(1)} L</strong></span>
                </div>

                <!-- Diesel Nozzle -->
                <div class="flow-nozzle-section diesel">
                  <div class="flow-nozzle-label" style="color:var(--color-diesel);">
                    <span>Diesel (HSD)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 2</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${(selectedRow.du1_d?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du1_d?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du1_d?.close_night ?? 0) - (selectedRow.du1_d?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du1_d?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du1_d?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du1_d?.day ?? 0) + (c.sales?.du1_d?.night ?? 0)).toFixed(1)} L</strong></span>
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
                    Open: ${(selectedRow.du2_p?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du2_p?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du2_p?.close_night ?? 0) - (selectedRow.du2_p?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du2_p?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du2_p?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du2_p?.day ?? 0) + (c.sales?.du2_p?.night ?? 0)).toFixed(1)} L</strong></span>
                </div>

                <!-- Diesel Nozzle -->
                <div class="flow-nozzle-section diesel">
                  <div class="flow-nozzle-label" style="color:var(--color-diesel);">
                    <span>Diesel (HSD)</span>
                    <span style="font-size:0.7rem; font-weight:500;">Nozzle 4</span>
                  </div>
                  <div class="flow-nozzle-formula">
                    Open: ${(selectedRow.du2_d?.open ?? 0).toFixed(1)}<br>
                    Close: ${(selectedRow.du2_d?.close_night ?? 0).toFixed(1)}
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span class="flow-nozzle-sold">+${((selectedRow.du2_d?.close_night ?? 0) - (selectedRow.du2_d?.open ?? 0)).toFixed(1)} L</span>
                    ${(selectedRow.du2_d?.tests_day ?? 0) > 0 ? `
                      <div class="flow-test-beaker" title="Calibration quality check tests recirculated back into tank.">
                        <svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        -${(selectedRow.du2_d?.tests_day ?? 0) * 5}L tests
                      </div>
                    ` : ''}
                  </div>
                  <span style="font-size:0.65rem; color:var(--text-muted); margin-top:0.2rem;">Net: <strong>${((c.sales?.du2_d?.day ?? 0) + (c.sales?.du2_d?.night ?? 0)).toFixed(1)} L</strong></span>
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
                <span>P: ${(c.totals?.net_24h?.petrol ?? 0).toFixed(0)}L × ₹${(selectedRow.prices?.petrol ?? 0).toFixed(2)}</span>
                <span>${formatCurrency(c.financials?.rev_petrol ?? 0)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border); margin-bottom:0.25rem;">
                <span>D: ${(c.totals?.net_24h?.diesel ?? 0).toFixed(0)}L × ₹${(selectedRow.prices?.diesel ?? 0).toFixed(2)}</span>
                <span>${formatCurrency(c.financials?.rev_diesel ?? 0)}</span>
              </div>

              <div style="display:flex; justify-content:space-between; border-top:1px dashed var(--border); padding-top:0.5rem; margin-top:0.25rem;">
                <span style="color:var(--text-muted);">WAC Purchase Cost:</span>
                <span style="font-weight:600; color:#fff;">${formatCurrency(c.financials.total_cost)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>P WAC Cost (₹${(db.stock?.petrol_cost_wac ?? 0).toFixed(2)}):</span>
                <span>${formatCurrency((c.totals?.net_24h?.petrol ?? 0) * (db.stock?.petrol_cost_wac ?? 0))}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-dim); padding-left:0.5rem; border-left:1px solid var(--border);">
                <span>D WAC Cost (₹${(db.stock?.diesel_cost_wac ?? 0).toFixed(2)}):</span>
                <span>${formatCurrency((c.totals?.net_24h?.diesel ?? 0) * (db.stock?.diesel_cost_wac ?? 0))}</span>
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
      const dayRev = ((c.totals?.day?.petrol ?? 0) * (selectedRow.prices?.petrol ?? 0)) + ((c.totals?.day?.diesel ?? 0) * (selectedRow.prices?.diesel ?? 0));
      const nightRev = ((c.totals?.night?.petrol ?? 0) * (selectedRow.prices?.petrol ?? 0)) + ((c.totals?.night?.diesel ?? 0) * (selectedRow.prices?.diesel ?? 0));
      const totalRev = dayRev + nightRev || 1;

      const dayShare = (dayRev / totalRev) * 100;
      const nightShare = (nightRev / totalRev) * 100;

      const maxPetrol = Math.max(c.totals.day.petrol, c.totals.night.petrol) || 1;
      const maxDiesel = Math.max(c.totals.day.diesel, c.totals.night.diesel) || 1;

      const dayPetPct = (c.totals.day.petrol / maxPetrol) * 100;
      const nightPetPct = (c.totals.night.petrol / maxPetrol) * 100;

      const dayDiePct = (c.totals.day.diesel / maxDiesel) * 100;
      const nightDiePct = (c.totals.night.diesel / maxDiesel) * 100;

      const dayTestsP = (selectedRow.du1_p?.tests_day ?? 0) + (selectedRow.du2_p?.tests_day ?? 0);
      const dayTestsD = (selectedRow.du1_d?.tests_day ?? 0) + (selectedRow.du2_d?.tests_day ?? 0);

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

function renderSupplies() {
  const filterEl = document.getElementById('filter-supply-product');
  const searchEl = document.getElementById('search-supply-input');
  const tbody = document.getElementById('supplies-table-body');
  if (!tbody) return;

  const productFilter = filterEl ? filterEl.value : 'all';
  const searchInput = searchEl ? searchEl.value.toLowerCase().trim() : '';

  tbody.innerHTML = '';

  // Check if global array is defined
  if (typeof SUPPLY_BILLS_DATA === 'undefined') {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim);">Error: Supply bills data not loaded.</td></tr>`;
    return;
  }

  let filtered = SUPPLY_BILLS_DATA;

  // Apply product filter
  if (productFilter !== 'all') {
    filtered = filtered.filter(row => row.product === productFilter);
  }

  // Apply text search
  if (searchInput) {
    filtered = filtered.filter(row => 
      row.invoice_date.toLowerCase().includes(searchInput) ||
      (row.invoice_no && row.invoice_no.toLowerCase().includes(searchInput)) ||
      (row.sap_entry_no && row.sap_entry_no.toLowerCase().includes(searchInput)) ||
      (row.tt_number && row.tt_number.toLowerCase().includes(searchInput)) ||
      (row.doubt_or_discrepancy && row.doubt_or_discrepancy.toLowerCase().includes(searchInput))
    );
  }

  // Calculate metrics
  let totalPetrol = 0;
  let countPetrol = 0;
  let totalDiesel = 0;
  let countDiesel = 0;
  let totalCost = 0;
  let totalCount = 0;

  filtered.forEach(row => {
    const qty = parseFloat(row.quantity_kl) || 0;
    const cost = parseFloat(row.material_total) || 0;
    if (row.product === 'Petrol') {
      totalPetrol += qty;
      if (qty > 0) countPetrol++;
    } else if (row.product === 'Diesel') {
      totalDiesel += qty;
      if (qty > 0) countDiesel++;
    }
    totalCost += cost;
    totalCount++;
  });

  // Update DOM metrics
  const petEl = document.getElementById('supply-total-petrol');
  const petCntEl = document.getElementById('supply-count-petrol');
  const dieEl = document.getElementById('supply-total-diesel');
  const dieCntEl = document.getElementById('supply-count-diesel');
  const costEl = document.getElementById('supply-total-cost');
  const countEl = document.getElementById('supply-total-count');

  if (petEl) petEl.textContent = `${totalPetrol.toFixed(1)} KL`;
  if (petCntEl) petCntEl.textContent = `${countPetrol} Tankers`;
  if (dieEl) dieEl.textContent = `${totalDiesel.toFixed(1)} KL`;
  if (dieCntEl) dieCntEl.textContent = `${countDiesel} Tankers`;
  if (costEl) costEl.textContent = formatCurrency(totalCost);
  if (countEl) countEl.textContent = `${totalCount} Deliveries`;

  // Render rows
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">No supply records found matching filters.</td></tr>`;
    return;
  }

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    
    const qty_kl = parseFloat(row.quantity_kl);
    const qty_l = !isNaN(qty_kl) ? `${(qty_kl * 1000).toLocaleString('en-IN')} L` : `<span style="color:#ef4444; font-weight:600;">Unclear</span>`;
    const qty_kl_str = !isNaN(qty_kl) ? `${qty_kl} KL` : `<span style="color:#ef4444; font-weight:600;">Unclear</span>`;

    const cost = parseFloat(row.material_total);
    const cost_str = !isNaN(cost) ? formatCurrency(cost) : `<span class="text-muted">Unclear</span>`;
    
    // Status color
    const isFlagged = !!row.doubt_or_discrepancy;
    const statusBadge = isFlagged 
      ? `<span class="anomaly-badge anomaly-badge-notest" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171;">⚠️ Flagged</span>`
      : `<span class="anomaly-badge anomaly-badge-price" style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80;">✅ Verified</span>`;

    tr.innerHTML = `
      <td style="font-weight: 600;">${row.invoice_date}</td>
      <td class="${row.product === 'Petrol' ? 'col-petrol' : 'col-diesel'}" style="font-weight: 600;">${row.product}</td>
      <td style="font-weight: 600;">${qty_kl_str}</td>
      <td style="font-weight: 500;">${qty_l}</td>
      <td style="font-weight: 600; color: var(--primary);">${cost_str}</td>
      <td><code style="color: var(--text-dim);">${row.invoice_no || '—'}</code></td>
      <td><code style="color: var(--text-dim);">${row.sap_entry_no || '—'}</code></td>
      <td><code style="color: var(--text-dim);">${row.tt_number || '—'}</code></td>
      <td>${statusBadge}</td>
      <td style="font-size: 0.82rem; max-width: 250px; color: ${isFlagged ? '#f87171' : 'var(--text-muted)'}; line-height:1.4;">${row.doubt_or_discrepancy || 'Clean delivery'}</td>
    `;
    tbody.appendChild(tr);
  });
}

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

    let petrolAuditHtml = '';
    if (p.petrol_liters > 0 && p.petrol_observed_density) {
      const pDev = p.petrol_rho15 - p.petrol_invoice_density;
      const pDevColor = Math.abs(pDev) > 3.0 ? '#ef4444' : '#22c55e';
      petrolAuditHtml = `
        <div style="font-size: 0.72rem; line-height: 1.35; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dotted var(--border); color: var(--text-muted); font-family: monospace;">
          Obs: <strong>${p.petrol_observed_density}</strong> @ <strong>${p.petrol_observed_temp}°C</strong><br>
          ρ15: <strong>${p.petrol_rho15?.toFixed(1) || '-'}</strong> (Dev: <strong style="color: ${pDevColor}">${pDev > 0 ? '+' : ''}${pDev?.toFixed(1) || '0'}</strong>)<br>
          Corr: <strong>${p.petrol_corrected_vol?.toFixed(0) || '-'} L</strong><br>
          Short: <strong style="${p.petrol_shortage > 0 ? 'color: #ef4444;' : ''}">${p.petrol_shortage?.toFixed(0) || '0'} L</strong>
        </div>
      `;
    }

    let dieselAuditHtml = '';
    if (p.diesel_liters > 0 && p.diesel_observed_density) {
      const dDev = p.diesel_rho15 - p.diesel_invoice_density;
      const dDevColor = Math.abs(dDev) > 3.0 ? '#ef4444' : '#22c55e';
      dieselAuditHtml = `
        <div style="font-size: 0.72rem; line-height: 1.35; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dotted var(--border); color: var(--text-muted); font-family: monospace;">
          Obs: <strong>${p.diesel_observed_density}</strong> @ <strong>${p.diesel_observed_temp}°C</strong><br>
          ρ15: <strong>${p.diesel_rho15?.toFixed(1) || '-'}</strong> (Dev: <strong style="color: ${dDevColor}">${dDev > 0 ? '+' : ''}${dDev?.toFixed(1) || '0'}</strong>)<br>
          Corr: <strong>${p.diesel_corrected_vol?.toFixed(0) || '-'} L</strong><br>
          Short: <strong style="${p.diesel_shortage > 0 ? 'color: #ef4444;' : ''}">${p.diesel_shortage?.toFixed(0) || '0'} L</strong>
        </div>
      `;
    }

    tr.innerHTML = `
      <td>
        <strong>${formatDate(p.date.split('T')[0])}</strong><br>
        <span style="font-size: 0.8rem; color: var(--text-dim);">${p.date.split('T')[1]}</span>
      </td>
      <td>${formatVol(p.petrol_liters)}${petrolAuditHtml}</td>
      <td>${formatVol(p.diesel_liters)}${dieselAuditHtml}</td>
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
  if (confirm(`Are you sure you want to remove the bank holiday on ${formatDate(dateStr)}?`)) {
    removeHoliday(dateStr);
    renderHolidays();
  }
}

function renderSettings() {
  const session = getSession();

  // ── Cloud Sync Settings ──────────────────────────────────
  const syncCfg      = getSyncCfg();
  const urlEl  = document.getElementById('cfg-sync-master-key');
  const keyEl   = document.getElementById('cfg-sync-bin-id');
  if (urlEl) urlEl.value = syncCfg.supabaseUrl || '';
  if (keyEl)  keyEl.value  = syncCfg.supabaseKey || '';

  const saveSyncBtn = document.getElementById('cfg-save-sync-btn');
  if (saveSyncBtn && !saveSyncBtn._wired) {
    saveSyncBtn._wired = true;
    saveSyncBtn.addEventListener('click', async () => {
      const urlVal  = (urlEl ? urlEl.value : '').trim();
      const keyVal  = (keyEl  ? keyEl.value  : '').trim();
      if (!urlVal || !keyVal) { showNotification('Enter both Supabase API URL and Anon Key.', 'danger'); return; }
      saveSyncCfg({ supabaseUrl: urlVal, supabaseKey: keyVal });
      initSupabaseClient();
      showNotification('Sync settings saved. Pushing data to cloud…', 'success');
      const success = await syncPush();
      if (success) {
        showNotification('✅ Data pushed to Supabase successfully!', 'success');
      } else {
        showNotification('❌ Push failed. Did you run supabase_schema.sql?', 'danger');
      }
    });
  }

  const forcePushBtn = document.getElementById('cfg-force-push-btn');
  if (forcePushBtn && !forcePushBtn._wired) {
    forcePushBtn._wired = true;
    forcePushBtn.addEventListener('click', async () => {
      showNotification('Pushing all data to cloud…', 'info');
      const success = await syncPush(true);
      if (success) showNotification('✅ All data pushed to cloud.', 'success');
      else showNotification('❌ Push failed. Did you create the tables in Supabase?', 'danger');
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

  // ── Owner Profile Settings ────────────────────────────────
  if (session && session.role === 'owner') {
    const dispNameEl = document.getElementById('owner-display-name');
    const unameEl = document.getElementById('owner-username');
    const newPassEl = document.getElementById('owner-new-password');
    if (dispNameEl) dispNameEl.value = session.displayName || '';
    if (unameEl) unameEl.value = session.username || '';
    if (newPassEl) newPassEl.value = '';
  }

  const updateProfileBtn = document.getElementById('update-owner-profile-btn');
  if (updateProfileBtn && !updateProfileBtn._wired) {
    updateProfileBtn._wired = true;
    updateProfileBtn.addEventListener('click', async () => {
      const dispName = document.getElementById('owner-display-name')?.value?.trim();
      const newUname = document.getElementById('owner-username')?.value?.trim()?.toLowerCase();
      const newPass  = document.getElementById('owner-new-password')?.value;

      if (!dispName || !newUname) {
        showNotification('Display Name and Username are required.', 'danger');
        return;
      }

      const users = getUsers();
      if (!session || session.role !== 'owner') return;

      const currentUname = session.username.toLowerCase();

      // If changing username, check for conflicts
      if (newUname !== currentUname && users[newUname]) {
        showNotification('Username is already taken.', 'danger');
        return;
      }

      const userRecord = users[currentUname];
      if (!userRecord) {
        showNotification('Owner account record not found.', 'danger');
        return;
      }

      userRecord.displayName = dispName;

      if (newPass && newPass.trim() !== '') {
        if (newPass.length < 6) {
          showNotification('Password must be at least 6 characters.', 'danger');
          return;
        }
        userRecord.passwordHash = await hashString(newPass.trim());
      }

      if (newUname !== currentUname) {
        userRecord.username = newUname;
        users[newUname] = userRecord;
        delete users[currentUname];
      } else {
        users[currentUname] = userRecord;
      }

      saveUsers(users);
      setSession(userRecord);

      showNotification('✅ Profile updated successfully. Syncing changes...', 'success');

      try {
        await syncPush();
        showNotification('✅ Profile synchronized across all devices!', 'success');
      } catch (err) {
        showNotification('⚠️ Profile saved locally but failed to sync to cloud.', 'warning');
      }

      checkAuth();
      renderSettings();
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

  // Render Diagnostics & System logs
  renderDiagnostics();
  SystemLogger.renderAll();
}

// -------------------------------------------------------------
// EVENT HANDLERS & MODALS
// -------------------------------------------------------------
function openLogReadingsModal(targetDate) {
  // Use targetDate if provided, otherwise default to current IST date
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  const defaultDate = nowIST.toISOString().split('T')[0];
  const activeDate = targetDate || defaultDate;

  document.getElementById('ledger-date').value = activeDate;
  document.getElementById('log-readings-modal-title').textContent = `Log Daily Totalizer Readings for ${formatDate(activeDate)}`;

  // Clear form fields
  document.getElementById('log-readings-form').reset();
  document.getElementById('ledger-date').value = activeDate;
  const remarksEl = document.getElementById('ledger-remarks');
  if (remarksEl) remarksEl.value = '';

  tempModalExpenses = [];
  renderModalExpenses();

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

  const remarksEl = document.getElementById('ledger-remarks');
  if (remarksEl) remarksEl.value = row.feedback || '';

  // Plan 21: Populate starting stock dip overrides
  document.getElementById('ledger_p_dip_override').value = row.p_dip_override !== undefined ? row.p_dip_override : '';
  document.getElementById('ledger_d_dip_override').value = row.d_dip_override !== undefined ? row.d_dip_override : '';

  // Pre-fill daily cash expenses
  const staticExps = (typeof KC_EXPENSES_DATA !== 'undefined') ? KC_EXPENSES_DATA[row.date] : null;
  tempModalExpenses = row.expenses ? [...row.expenses] : (staticExps ? staticExps.map(x => ({name: x.name, amount: x.amount})) : []);
  renderModalExpenses();

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

let astmTable = null;

async function loadAstmTable() {
  if (astmTable) return astmTable;
  try {
    const res = await fetch('astm_table_53b.json');
    if (!res.ok) throw new Error("Failed to load ASTM Table 53B");
    astmTable = await res.json();
    window.astmTable = astmTable;
    console.log('[ASTM] Table 53B data successfully loaded.');
    return astmTable;
  } catch (err) {
    console.error('[ASTM] Error loading table:', err);
    return null;
  }
}

function calculateRho15Formula(rho_t, temp) {
  const K0 = 186.9696;
  const K1 = 0.4862;
  const dt = temp - 15.0;
  let rho15 = rho_t;
  for (let i = 0; i < 10; i++) {
    const alpha15 = (K0 + K1 * rho15) / (rho15 * rho15);
    const vcf = Math.exp(-alpha15 * dt * (1.0 + 0.8 * alpha15 * dt));
    rho15 = rho_t / vcf;
  }
  return rho15;
}

function getDensityAt15(obsD, obsT) {
  obsD = parseFloat(obsD);
  obsT = parseFloat(obsT);
  if (isNaN(obsD) || isNaN(obsT) || obsD <= 0 || obsT < 0) return 0;

  if (!astmTable) {
    return calculateRho15Formula(obsD, obsT);
  }

  if (obsD < 670 || obsD > 1056 || obsT < 0.0 || obsT > 50.0) {
    return calculateRho15Formula(obsD, obsT);
  }

  const d1 = Math.floor(obsD);
  const d2 = Math.ceil(obsD);
  const t1 = Math.floor(obsT * 2) / 2;
  const t2 = t1 + 0.5 <= 50.0 ? t1 + 0.5 : 50.0;

  const getVal = (d, t) => {
    const dStr = String(d);
    const tStr = t.toFixed(1);
    if (astmTable[dStr] && astmTable[dStr][tStr] !== undefined) {
      return parseFloat(astmTable[dStr][tStr]);
    }
    return null;
  };

  const v11 = getVal(d1, t1);
  const v21 = getVal(d2, t1);
  const v12 = getVal(d1, t2);
  const v22 = getVal(d2, t2);

  if (v11 === null || v21 === null || v12 === null || v22 === null) {
    return calculateRho15Formula(obsD, obsT);
  }

  const wd = d2 === d1 ? 0 : (obsD - d1) / (d2 - d1);
  const wt = t2 === t1 ? 0 : (obsT - t1) / (t2 - t1);

  const val_t1 = v11 + wd * (v21 - v11);
  const val_t2 = v12 + wd * (v22 - v12);

  const val = val_t1 + wt * (val_t2 - val_t1);
  return val;
}

function updateLiveAstmCalculations() {
  const loadType = tankerLoadSelect.value;
  const customP = loadType === 'custom' ? (parseInt(customPInput.value) || 0) : 0;
  const customD = loadType === 'custom' ? (parseInt(customDInput.value) || 0) : 0;

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

  // Petrol calculations
  if (petrolQty > 0) {
    const invD = parseFloat(document.getElementById('petrol-invoice-density').value) || 0;
    const obsD = parseFloat(document.getElementById('petrol-observed-density').value) || 0;
    const obsT = parseFloat(document.getElementById('petrol-observed-temp').value) || 0;
    const statusEl = document.getElementById('petrol-astm-status');

    if (invD && obsD && obsT) {
      const rho15 = getDensityAt15(obsD, obsT);
      const vcf = rho15 > 0 ? obsD / rho15 : 0;
      const vol15 = petrolQty * vcf;
      const shortage = petrolQty - vol15;
      const dev = rho15 - invD;
      const devColor = Math.abs(dev) > 3.0 ? '#ef4444' : '#10b981';

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.6rem; border-radius: 6px; margin-top: 0.5rem; font-family: monospace; font-size: 0.78rem; line-height: 1.4;">
            <div>Density @ 15°C: <strong>${rho15.toFixed(2)}</strong> kg/m³</div>
            <div>Density Dev: <strong style="color: ${devColor};">${dev.toFixed(2)}</strong> kg/m³ (Limit: ±3.0)</div>
            <div>VCF: <strong>${vcf.toFixed(5)}</strong></div>
            <div>Corrected Vol: <strong>${vol15.toFixed(1)}</strong> L</div>
            <div>Shortage: <strong style="${shortage > 0 ? 'color:#ef4444;' : 'color:#10b981;'}">${shortage.toFixed(1)}</strong> L</div>
          </div>
        `;
      }
    } else if (statusEl) {
      statusEl.innerHTML = '';
    }
  }

  // Diesel calculations
  if (dieselQty > 0) {
    const invD = parseFloat(document.getElementById('diesel-invoice-density').value) || 0;
    const obsD = parseFloat(document.getElementById('diesel-observed-density').value) || 0;
    const obsT = parseFloat(document.getElementById('diesel-observed-temp').value) || 0;
    const statusEl = document.getElementById('diesel-astm-status');

    if (invD && obsD && obsT) {
      const rho15 = getDensityAt15(obsD, obsT);
      const vcf = rho15 > 0 ? obsD / rho15 : 0;
      const vol15 = dieselQty * vcf;
      const shortage = dieselQty - vol15;
      const dev = rho15 - invD;
      const devColor = Math.abs(dev) > 3.0 ? '#ef4444' : '#10b981';

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.6rem; border-radius: 6px; margin-top: 0.5rem; font-family: monospace; font-size: 0.78rem; line-height: 1.4;">
            <div>Density @ 15°C: <strong>${rho15.toFixed(2)}</strong> kg/m³</div>
            <div>Density Dev: <strong style="color: ${devColor};">${dev.toFixed(2)}</strong> kg/m³ (Limit: ±3.0)</div>
            <div>VCF: <strong>${vcf.toFixed(5)}</strong></div>
            <div>Corrected Vol: <strong>${vol15.toFixed(1)}</strong> L</div>
            <div>Shortage: <strong style="${shortage > 0 ? 'color:#ef4444;' : 'color:#10b981;'}">${shortage.toFixed(1)}</strong> L</div>
          </div>
        `;
      }
    } else if (statusEl) {
      statusEl.innerHTML = '';
    }
  }
}

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

function updatePriceInputRequirements() {
  const loadType = tankerLoadSelect.value;
  const pricePInput = document.getElementById('purchase-price-petrol');
  const priceDInput = document.getElementById('purchase-price-diesel');
  
  const petrolSection = document.getElementById('petrol-astm-section');
  const dieselSection = document.getElementById('diesel-astm-section');

  let needPetrol = false;
  let needDiesel = false;

  if (loadType === 'full-petrol') {
    needPetrol = true;
  } else if (loadType === 'full-diesel') {
    needDiesel = true;
  } else if (loadType === 'mixed-8d-4p' || loadType === 'mixed-8p-4d') {
    needPetrol = true;
    needDiesel = true;
  } else if (loadType === 'custom') {
    const p = parseInt(customPInput.value) || 0;
    const d = parseInt(customDInput.value) || 0;
    if (p > 0) needPetrol = true;
    if (d > 0) needDiesel = true;
  }

  if (petrolSection) petrolSection.style.display = needPetrol ? 'block' : 'none';
  if (dieselSection) dieselSection.style.display = needDiesel ? 'block' : 'none';

  if (pricePInput) {
    if (needPetrol) {
      pricePInput.required = true;
      pricePInput.removeAttribute('disabled');
      pricePInput.placeholder = "e.g. 90.50";
    } else {
      pricePInput.required = false;
      pricePInput.setAttribute('disabled', 'true');
      pricePInput.value = "";
      pricePInput.placeholder = "Not applicable";
    }
  }

  if (priceDInput) {
    if (needDiesel) {
      priceDInput.required = true;
      priceDInput.removeAttribute('disabled');
      priceDInput.placeholder = "e.g. 82.20";
    } else {
      priceDInput.required = false;
      priceDInput.setAttribute('disabled', 'true');
      priceDInput.value = "";
      priceDInput.placeholder = "Not applicable";
    }
  }

  if (typeof updateLiveAstmCalculations === 'function') {
    updateLiveAstmCalculations();
  }
}

tankerLoadSelect.addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    customSliders.style.display = 'block';
    updateCustomLoadTotals();
  } else {
    customSliders.style.display = 'none';
  }
  updatePriceInputRequirements();
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
  updatePriceInputRequirements();
});

customDInput.addEventListener('input', () => {
  const d = parseInt(customDInput.value);
  customPInput.value = 12000 - d;
  updateCustomLoadTotals();
  updatePriceInputRequirements();
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
    const close_day_raw = document.getElementById(`${prefix}_close_day`).value.trim();
    const close_night_raw = document.getElementById(`${prefix}_close_night`).value.trim();

    // If empty (e.g. in the morning), default closing to opening so sales are calculated as 0
    const close_day = close_day_raw === '' ? open : (parseFloat(close_day_raw) || 0);
    const close_night = close_night_raw === '' ? close_day : (parseFloat(close_night_raw) || 0);

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

  if (!confirm(`Are you sure you want to save manual ledger readings for operating date: ${formatDate(date)}?`)) {
    return;
  }

  const remarksEl = document.getElementById('ledger-remarks');
  const remarks = remarksEl ? remarksEl.value.trim() : '';

  const pDipVal = document.getElementById('ledger_p_dip_override').value.trim();
  const dDipVal = document.getElementById('ledger_d_dip_override').value.trim();

  const existingRow = db.daily_ledger.find(row => row.date === date);
  const ledgerEntry = { 
    date, 
    prices: { petrol: prices.petrol, diesel: prices.diesel }, 
    du1_p, 
    du1_d, 
    du2_p, 
    du2_d, 
    feedback: remarks,
    expenses: tempModalExpenses,
    createdAt: existingRow?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (pDipVal !== '') {
    ledgerEntry.p_dip_override = parseFloat(pDipVal);
  }
  if (dDipVal !== '') {
    ledgerEntry.d_dip_override = parseFloat(dDipVal);
  }

  saveDailyReadings(ledgerEntry);
  closeModal('log-readings-modal');
  initApp();
});

document.getElementById('tanker-purchase-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const date = document.getElementById('purchase-date').value;
  const time = document.getElementById('purchase-time').value;
  const loadType = tankerLoadSelect.value;

  const customP = loadType === 'custom' ? (parseInt(customPInput.value) || 0) : 0;
  const customD = loadType === 'custom' ? (parseInt(customDInput.value) || 0) : 0;

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

  const pricePVal = document.getElementById('purchase-price-petrol').value;
  const priceDVal = document.getElementById('purchase-price-diesel').value;

  const priceP = petrolQty > 0 ? (parseFloat(pricePVal) || 0) : 0;
  const priceD = dieselQty > 0 ? (parseFloat(priceDVal) || 0) : 0;

  let confirmMsg = `Are you sure you want to record this tanker receipt?\n\nDate: ${formatDate(date)}\nLoad Type: ${loadType}`;
  if (petrolQty > 0) {
    confirmMsg += `\nPetrol Rate: ₹${priceP.toFixed(2)}/L (${petrolQty.toLocaleString()} L)`;
  }
  if (dieselQty > 0) {
    confirmMsg += `\nDiesel Rate: ₹${priceD.toFixed(2)}/L (${dieselQty.toLocaleString()} L)`;
  }
  const invoiceNo = document.getElementById('purchase-invoice-no').value.trim();
  const paymentStatus = document.getElementById('purchase-payment-status').value;

  const petrolInvoiceDensity = petrolQty > 0 ? parseFloat(document.getElementById('petrol-invoice-density').value) || 0 : 0;
  const petrolObservedDensity = petrolQty > 0 ? parseFloat(document.getElementById('petrol-observed-density').value) || 0 : 0;
  const petrolObservedTemp = petrolQty > 0 ? parseFloat(document.getElementById('petrol-observed-temp').value) || 0 : 0;

  const dieselInvoiceDensity = dieselQty > 0 ? parseFloat(document.getElementById('diesel-invoice-density').value) || 0 : 0;
  const dieselObservedDensity = dieselQty > 0 ? parseFloat(document.getElementById('diesel-observed-density').value) || 0 : 0;
  const dieselObservedTemp = dieselQty > 0 ? parseFloat(document.getElementById('diesel-observed-temp').value) || 0 : 0;

  if (!confirm(confirmMsg)) {
    return;
  }

  recordTanker(date, time, loadType, customP, customD, priceP, priceD,
               petrolInvoiceDensity, petrolObservedDensity, petrolObservedTemp,
               dieselInvoiceDensity, dieselObservedDensity, dieselObservedTemp,
               invoiceNo, paymentStatus);
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

  if (!confirm(`Are you sure you want to update selling prices?\n\nPetrol: ₹${p.toFixed(2)}/L\nDiesel: ₹${d.toFixed(2)}/L\nEffective: ${effTime.replace('T', ' ')}`)) {
    return;
  }

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
  if (!confirm("Are you sure you want to update the system capacity and settings?")) {
    return;
  }
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
  if (!confirm("Are you sure you want to update PhonePe API merchant keys?")) {
    return;
  }
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
  SystemLogger.info('backupDB', 'Database backup exported successfully.');
  triggerDownload(jsonStr, `octaneflow_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
});

document.getElementById('restore-db-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm("Are you sure you want to restore the database from this backup file? All current shift histories, tanker receipts, and rates will be permanently overwritten!")) {
    e.target.value = '';
    return;
  }

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

        // Set the restored DB as the latest synced version to prevent cloud overwrite
        db._synced_at = new Date().toISOString();
        const cfg = getSyncCfg();
        cfg.last_push = db._synced_at;
        saveSyncCfg(cfg);

        saveDB();
        SystemLogger.success('restoreDB', 'Database restored successfully from backup file.', {
          records: db.daily_ledger.length,
          purchases: db.purchases.length
        });
        showNotification("Database restored successfully!", "success");
        initApp();

        // Push restored data to cloud Supabase so other devices get it too
        syncPush().then(() => {
          SystemLogger.success('restoreDB', 'Restored database successfully pushed to cloud Supabase.');
        }).catch(err => {
          SystemLogger.error('restoreDB', 'Failed to push restored database to cloud Supabase.', err);
        });
      } else {
        SystemLogger.error('restoreDB', 'Failed to restore backup: Invalid file schema or missing properties.');
        showNotification("Invalid file format. Verification failed.", "danger");
      }
    } catch (err) {
      SystemLogger.error('restoreDB', 'Failed to parse backup JSON file.', err);
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
  const tab = document.querySelector('[data-view="logistics"]');
  if (tab) {
    tab.click();
    switchSubview('logistics', 'purchases');
  }
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
  SystemLogger.success('seedDemoData', 'Simulated demo database successfully seeded with 14 days of history.');
  showNotification("Excel simulation database successfully seeded!", "success");
  initApp();
}

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
function renderCurrentView() {
  const session = getSession();
  if (session && session.role !== 'owner') {
    checkAuth();
    return;
  }
  const activeItem = document.querySelector('.nav-item.active');
  if (!activeItem) return;
  const activeTab = activeItem.dataset.view;
  if (activeTab === 'dashboard') {
    renderActiveView('dashboard');
  } else {
    const activeSub = currentSubviews[activeTab] || activeTab;
    renderActiveView(activeSub);
  }
}

function initApp() {
  const session = getSession();
  if (session && session.role !== 'owner') {
    checkAuth();
    return;
  }
  loadDB();
  const todayStr = new Date().toISOString().split('T')[0];
  const formattedToday = formatDate(todayStr);
  document.getElementById('current-date-span').textContent = formattedToday;
  document.title = `RKSK Pump Dashboard — ${formattedToday}`;

  // Read current active tab and render it
  renderCurrentView();

  // Configure tanker purchase form price field requirements
  updatePriceInputRequirements();

  // Load ASTM table and trigger initial calculations
  loadAstmTable().then(() => {
    updateLiveAstmCalculations();
  });

  // Bind input and change listeners for real-time tanker density calculations
  const densityFields = [
    'petrol-invoice-density', 'petrol-observed-density', 'petrol-observed-temp',
    'diesel-invoice-density', 'diesel-observed-density', 'diesel-observed-temp',
    'custom-petrol-qty', 'custom-diesel-qty'
  ];
  densityFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateLiveAstmCalculations);
      el.addEventListener('change', updateLiveAstmCalculations);
    }
  });

  // Bind input and change listeners for real-time supply bills filtering
  const supplyFilterEl = document.getElementById('filter-supply-product');
  if (supplyFilterEl) supplyFilterEl.addEventListener('change', () => renderSupplies());

  const supplySearchEl = document.getElementById('search-supply-input');
  if (supplySearchEl) supplySearchEl.addEventListener('input', () => renderSupplies());

  // Start cloud sync check (async — won't block render)
  updateGlobalAlertBanner();
  initSync().then(() => {
    // Re-render after sync in case cloud had newer data
    renderCurrentView();
    updatePriceInputRequirements();
    updateGlobalAlertBanner();
  }).catch(() => {
    setSyncStatus('error');
    updateGlobalAlertBanner();
  });
}

