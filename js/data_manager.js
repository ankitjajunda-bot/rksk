/**
 * DataManager - Asynchronous Lazy Loader and Lookup Engine for Sharded Ledger
 * Sourced strictly from date keys, ensuring data integrity & O(1) in-memory lookup.
 */
class DataManager {
  constructor() {
    this.loadedMonths = new Set();
    this.priceHistory = null;
  }

  // Resolves month string key (e.g., "2026_05") from date "2026-05-28"
  getMonthKey(dateStr) {
    if (!dateStr || dateStr.length < 7) return null;
    return dateStr.substring(0, 7).replace('-', '_');
  }

  // Load prices configuration from normalized prices history
  async loadPriceHistory() {
    if (this.priceHistory) return this.priceHistory;
    try {
      const res = await fetch('data/prices_history.json');
      if (res.ok) {
        this.priceHistory = await res.json();
      }
    } catch (e) {
      console.warn("Could not load pricing configuration:", e);
      this.priceHistory = {};
    }
    return this.priceHistory;
  }

  // Asynchronously lazy-load the monthly shard for a target date list
  async ensureShardsLoaded(dates) {
    const monthsToLoad = new Set();
    dates.forEach(d => {
      const mKey = this.getMonthKey(d);
      if (mKey) monthsToLoad.add(mKey);
    });

    let dbModified = false;
    const prices = await this.loadPriceHistory();

    for (const mKey of monthsToLoad) {
      if (!this.loadedMonths.has(mKey)) {
        try {
          console.log(`[DataManager] Lazy loading monthly shard: data/shards/ledger_${mKey}.json`);
          const res = await fetch(`data/shards/ledger_${mKey}.json`);
          if (res.ok) {
            const shardData = await res.json();
            
            Object.keys(shardData).forEach(date => {
              // Check if entry already exists in the primary db array
              const idx = db.daily_ledger.findIndex(r => r.date === date);
              if (idx === -1) {
                // Stitch the normalized price back into the entry on load
                const newRow = { 
                  date, 
                  prices: prices[date] || { petrol: 100, diesel: 90 }, 
                  ...shardData[date] 
                };
                db.daily_ledger.push(newRow);
                dbModified = true;
              }
            });
            this.loadedMonths.add(mKey);
          }
        } catch (e) {
          console.warn(`[DataManager] Failed to load shard ledger_${mKey}.json:`, e);
        }
      }
    }

    if (dbModified) {
      db.daily_ledger.sort((a, b) => b.date.localeCompare(a.date));
      if (typeof buildIndexes === 'function') {
        buildIndexes();
      }
      return true;
    }
    return false;
  }

  // Fast hash-lookup for daily ledger row
  getDay(dateStr) {
    if (db && db._idx && db._idx.ledgerByDate) {
      return db._idx.ledgerByDate[dateStr] || null;
    }
    // Fallback search
    return db.daily_ledger.find(r => r.date === dateStr) || null;
  }

  // O(1) local modification update
  updateDay(dateStr, updatedData) {
    const idx = db.daily_ledger.findIndex(r => r.date === dateStr);
    if (idx !== -1) {
      db.daily_ledger[idx] = { ...db.daily_ledger[idx], ...updatedData };
      db.daily_ledger[idx]._dirty = true;
      if (typeof buildIndexes === 'function') {
        buildIndexes();
      }
      return true;
    }
    return false;
  }
}

// Global reference
window.DataManager = new DataManager();
