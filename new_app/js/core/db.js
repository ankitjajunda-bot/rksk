// ============================================================================
// js/core/db.js — IndexedDB Data Layer
// ============================================================================

const DB_NAME = 'octaneflow_db';
const DB_VERSION = 2;

const STORES = [
  { name: 'master_ledger',  keyPath: 'id' },
  { name: 'pending_entries', keyPath: 'id' },
  { name: 'employees',      keyPath: 'id' },
  { name: 'employee_sessions', keyPath: 'id', indexes: [
    { name: 'token', keyPath: 'token', options: { unique: true } },
    { name: 'employee_id', keyPath: 'employee_id', options: { unique: false } },
    { name: 'expires_at', keyPath: 'expires_at', options: { unique: false } }
  ] },
  { name: 'purchases',      keyPath: 'id' },
  { name: 'settings',       keyPath: 'key' },
  { name: 'stock',          keyPath: 'key' },
  { name: 'cashflow',       keyPath: 'key' },
  { name: 'prices',         keyPath: 'effective_date' },
  { name: 'holidays',       keyPath: 'date' },
  { name: 'expenses',       keyPath: 'id' },
  { name: 'sync_queue',     keyPath: 'id' },
  { name: 'error_logs',     keyPath: 'id' },
  { name: 'locks',          keyPath: 'key' },
  { name: 'backups',        keyPath: 'id' },
];

let _dbInstance = null;
let _useLocalStorageFallback = false;

// ---------------------------------------------------------------------------
// Open / Create
// ---------------------------------------------------------------------------
async function openDB() {
  if (_dbInstance) return _dbInstance;

  if (!window.indexedDB) {
    console.warn('[DB] IndexedDB not available — falling back to localStorage');
    _useLocalStorageFallback = true;
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const idb = event.target.result;
      STORES.forEach(({ name, keyPath, indexes }) => {
        if (!idb.objectStoreNames.contains(name)) {
          const store = idb.createObjectStore(name, { keyPath });
          if (indexes) {
            indexes.forEach(idx => store.createIndex(idx.name, idx.keyPath, idx.options));
          }
        }
      });
    };

    request.onsuccess = (event) => {
      _dbInstance = event.target.result;
      resolve(_dbInstance);
    };

    request.onerror = (event) => {
      console.error('[DB] Failed to open IndexedDB', event.target.error);
      _useLocalStorageFallback = true;
      resolve(null);
    };
  });
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------
async function dbGet(storeName, id) {
  if (_useLocalStorageFallback) return _lsGet(storeName, id);
  const idb = await openDB();
  if (!idb) return _lsGet(storeName, id);

  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => { console.error(`[DB] get(${storeName}, ${id}) failed`, req.error); resolve(null); };
  });
}

async function dbGetAll(storeName) {
  if (_useLocalStorageFallback) return _lsGetAll(storeName);
  const idb = await openDB();
  if (!idb) return _lsGetAll(storeName);

  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => { console.error(`[DB] getAll(${storeName}) failed`, req.error); resolve([]); };
  });
}

async function dbPut(storeName, data) {
  if (_useLocalStorageFallback) return _lsPut(storeName, data);
  const idb = await openDB();
  if (!idb) return _lsPut(storeName, data);

  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve(true);
    req.onerror = () => { console.error(`[DB] put(${storeName}) failed`, req.error); resolve(false); };
  });
}

async function dbPutBulk(storeName, items) {
  if (_useLocalStorageFallback) { items.forEach(i => _lsPut(storeName, i)); return true; }
  const idb = await openDB();
  if (!idb) { items.forEach(i => _lsPut(storeName, i)); return true; }

  return new Promise((resolve) => {
    const tx = idb.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => { console.error(`[DB] putBulk(${storeName}) failed`, tx.error); resolve(false); };
  });
}

async function dbDelete(storeName, id) {
  if (_useLocalStorageFallback) return _lsDelete(storeName, id);
  const idb = await openDB();
  if (!idb) return _lsDelete(storeName, id);

  return new Promise((resolve) => {
    const tx = idb.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => { console.error(`[DB] delete(${storeName}, ${id}) failed`, req.error); resolve(false); };
  });
}

async function dbClear(storeName) {
  if (_useLocalStorageFallback) return _lsClear(storeName);
  const idb = await openDB();
  if (!idb) return _lsClear(storeName);

  return new Promise((resolve) => {
    const tx = idb.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => { console.error(`[DB] clear(${storeName}) failed`, req.error); resolve(false); };
  });
}

// ---------------------------------------------------------------------------
// localStorage fallback helpers
// ---------------------------------------------------------------------------
function _lsKey(store) { return `octaneflow_idb_${store}`; }

function _lsGetAll(store) {
  try { return JSON.parse(localStorage.getItem(_lsKey(store)) || '[]'); } catch { return []; }
}
function _lsGet(store, id) {
  const all = _lsGetAll(store);
  return all.find(r => {
    const kp = STORES.find(s => s.name === store)?.keyPath || 'id';
    return r[kp] === id;
  }) || null;
}
function _lsPut(store, data) {
  const all = _lsGetAll(store);
  const kp = STORES.find(s => s.name === store)?.keyPath || 'id';
  const idx = all.findIndex(r => r[kp] === data[kp]);
  if (idx >= 0) all[idx] = data; else all.push(data);
  localStorage.setItem(_lsKey(store), JSON.stringify(all));
  return true;
}
function _lsDelete(store, id) {
  const all = _lsGetAll(store);
  const kp = STORES.find(s => s.name === store)?.keyPath || 'id';
  const filtered = all.filter(r => r[kp] !== id);
  localStorage.setItem(_lsKey(store), JSON.stringify(filtered));
  return true;
}
function _lsClear(store) {
  localStorage.setItem(_lsKey(store), '[]');
  return true;
}

// ---------------------------------------------------------------------------
// Migration from old localStorage-based app
// ---------------------------------------------------------------------------
async function migrateFromLocalStorage() {
  if (localStorage.getItem('octaneflow_migrated') === 'true') return false;

  const raw = localStorage.getItem('octaneflow_db');
  if (!raw) { localStorage.setItem('octaneflow_migrated', 'true'); return false; }

  let oldDB;
  try { oldDB = JSON.parse(raw); } catch { return false; }

  console.log('[Migration] Starting migration from localStorage to IndexedDB…');

  // master_ledger
  if (Array.isArray(oldDB.master_ledger)) {
    for (const row of oldDB.master_ledger) {
      if (!row.id) row.id = row.date || crypto.randomUUID();
      await dbPut('master_ledger', row);
    }
  }

  // pending_entries
  if (Array.isArray(oldDB.pending_entries)) {
    for (const entry of oldDB.pending_entries) {
      if (!entry.id) entry.id = crypto.randomUUID();
      await dbPut('pending_entries', entry);
    }
  }

  // employees
  if (Array.isArray(oldDB.employees)) {
    for (const emp of oldDB.employees) {
      if (!emp.id) emp.id = 'emp_' + Date.now() + Math.random().toString(36).slice(2);
      await dbPut('employees', emp);
    }
  }

  // purchases
  if (Array.isArray(oldDB.purchases)) {
    for (const p of oldDB.purchases) {
      if (!p.id) p.id = crypto.randomUUID();
      await dbPut('purchases', p);
    }
  }

  // settings (flatten to key/value store)
  if (oldDB.settings && typeof oldDB.settings === 'object') {
    for (const [key, value] of Object.entries(oldDB.settings)) {
      await dbPut('settings', { key, value });
    }
  }

  // stock
  if (oldDB.stock && typeof oldDB.stock === 'object') {
    for (const [key, value] of Object.entries(oldDB.stock)) {
      await dbPut('stock', { key, value: parseFloat(value) || 0 });
    }
  }

  // cashflow
  if (oldDB.cashflow && typeof oldDB.cashflow === 'object') {
    for (const [key, value] of Object.entries(oldDB.cashflow)) {
      await dbPut('cashflow', { key, value: parseFloat(value) || 0 });
    }
  }

  // prices
  if (Array.isArray(oldDB.prices)) {
    for (const p of oldDB.prices) {
      await dbPut('prices', p);
    }
  }

  // holidays
  if (Array.isArray(oldDB.holidays)) {
    for (const h of oldDB.holidays) {
      await dbPut('holidays', h);
    }
  }

  // expenses
  if (Array.isArray(oldDB.expenses)) {
    for (const e of oldDB.expenses) {
      if (!e.id) e.id = crypto.randomUUID();
      await dbPut('expenses', e);
    }
  }

  localStorage.setItem('octaneflow_migrated', 'true');
  console.log('[Migration] ✅ Migration complete.');
  return true;
}

// ---------------------------------------------------------------------------
// Convenience: Load full DB into a single object (for engine functions)
// ---------------------------------------------------------------------------
async function loadFullDB() {
  const data = {
    master_ledger:   await dbGetAll('master_ledger'),
    pending_entries: await dbGetAll('pending_entries'),
    employees:       await dbGetAll('employees'),
    employee_sessions: await dbGetAll('employee_sessions'),
    purchases:       await dbGetAll('purchases'),
    prices:          await dbGetAll('prices'),
    holidays:        await dbGetAll('holidays'),
    expenses:        await dbGetAll('expenses'),
    settings:        {},
    stock:           {},
    cashflow:        {},
  };

  // Reconstruct settings/stock/cashflow from key-value stores
  const settingsArr = await dbGetAll('settings');
  settingsArr.forEach(s => { data.settings[s.key] = s.value; });

  const stockArr = await dbGetAll('stock');
  stockArr.forEach(s => { data.stock[s.key] = s.value; });

  const cashflowArr = await dbGetAll('cashflow');
  cashflowArr.forEach(s => { data.cashflow[s.key] = s.value; });

  // Apply defaults
  const defaults = {
    petrol_capacity: 20000, diesel_capacity: 20000, safety_stock: 2500,
    currency: '₹', ads_days: 14, sundays_closed: true, sats_closed: true,
    petrol_tank_dia: 200, petrol_tank_len: 636.6, petrol_dead_stock: 600,
    diesel_tank_dia: 200, diesel_tank_len: 636.6, diesel_dead_stock: 40,
    test_deduction_liters: 5
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (data.settings[k] === undefined) data.settings[k] = v;
  }

  const stockDefaults = { petrol: 6800, diesel: 5200, petrol_cost_wac: 91.50, diesel_cost_wac: 82.10 };
  for (const [k, v] of Object.entries(stockDefaults)) {
    if (data.stock[k] === undefined) data.stock[k] = v;
  }

  const cfDefaults = { bank_balance: 500000, phonepe_balance: 50000, cash_drawer: 60000, iocl_cushion: 20000 };
  for (const [k, v] of Object.entries(cfDefaults)) {
    if (data.cashflow[k] === undefined) data.cashflow[k] = v;
  }

  return data;
}

// Export
window.OctaneDB = {
  openDB, dbGet, dbGetAll, dbPut, dbPutBulk, dbDelete, dbClear,
  migrateFromLocalStorage, loadFullDB
};
