const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock localStorage
const localStorageStore = {};
global.localStorage = {
  getItem: (key) => localStorageStore[key] || null,
  setItem: (key, value) => { localStorageStore[key] = String(value); },
  removeItem: (key) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

// Mock db
global.db = {
  daily_ledger: [],
  stock: { petrol_cost_wac: 0, diesel_cost_wac: 0 },
  users: []
};

// Mock DOM
global.document = {
  getElementById: (id) => ({
    value: '',
    textContent: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: () => {}
  }),
  querySelectorAll: () => []
};
global.window = global;

// Helper to load source files into the global context
global.loadScript = (filename) => {
  const filePath = path.resolve(__dirname, '../js', filename);
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code);
};
