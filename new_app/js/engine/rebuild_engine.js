// ============================================================================
// js/engine/rebuild_engine.js — Chronological Stock & WAC Rebuild
// ============================================================================

const RebuildEngine = {
  /**
   * Rebuild stock and WAC from a given date to present.
   * This cascades the mathematical effects of historical edits.
   */
  async rebuildFromDate(startDate, dbSnapshot) {
    // If we only have dbSnapshot, fetch fresh from DB to be safe
    const ledger = await OctaneDB.dbGetAll('master_ledger');
    const purchases = await OctaneDB.dbGetAll('purchases');
    
    // Sort chronologically
    const sorted = ledger.filter(r => r.date >= startDate).sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return;
    
    // Get the day before startDate stock as baseline
    const prevDate = MathEngine.addDays(startDate, -1);
    
    // Calculate stock for the previous date (using stock engine history reconstruction)
    // We pass the current state, but to truly find it we can just use the reconstructed history
    const history = StockEngine.getStockHistoryFor(prevDate, dbSnapshot);
    
    let currentPetrol = history.petEnd;
    let currentDiesel = history.dieEnd;
    
    // Calculate past WAC by walking purchases before startDate
    let currentWacP = dbSnapshot.settings.petrol_cost_wac || 91.50;
    let currentWacD = dbSnapshot.settings.diesel_cost_wac || 82.10;
    
    const pastPurchases = purchases.filter(p => p.date.split('T')[0] <= prevDate);
    // Simple way to get the WAC as of prevDate:
    if (pastPurchases.length > 0) {
      const pastWacMap = StockEngine.buildWACTimeline({ purchases: pastPurchases, stock: { petrol: 0, diesel: 0 } });
      const lastDate = Object.keys(pastWacMap).sort().pop();
      if (lastDate) {
        currentWacP = pastWacMap[lastDate].ms;
        currentWacD = pastWacMap[lastDate].hsd;
      }
    }
    
    for (const row of sorted) {
      // Apply purchases on this day
      const dayPurchases = purchases.filter(p => p.date.split('T')[0] === row.date);
      for (const p of dayPurchases) {
        const pLiters = p.petrol_liters || 0;
        const dLiters = p.diesel_liters || 0;
        const pPrice = p.petrol_price || currentWacP;
        const dPrice = p.diesel_price || currentWacD;
        
        // Recalculate WAC
        if (pLiters > 0) {
          currentWacP = ((currentPetrol * currentWacP) + (pLiters * pPrice)) / (currentPetrol + pLiters);
          currentPetrol += pLiters;
        }
        if (dLiters > 0) {
          currentWacD = ((currentDiesel * currentWacD) + (dLiters * dPrice)) / (currentDiesel + dLiters);
          currentDiesel += dLiters;
        }
      }
      
      // Apply sales
      const calc = MathEngine.computeLedgerRow(row, { [row.date]: { ms: currentWacP, hsd: currentWacD } }, dbSnapshot);
      currentPetrol -= calc.totals.net_24h.petrol;
      currentDiesel -= calc.totals.net_24h.diesel;
      
      // Store rebuilt values for future historical reports
      row._rebuilt_stock = { petrol: currentPetrol, diesel: currentDiesel };
      row._rebuilt_wac = { ms: currentWacP, hsd: currentWacD };
      row._dirty = true;
      await OctaneDB.dbPut('master_ledger', row);
      
      // Push the updated row to the cloud
      await window.syncQueue.enqueue('PUSH_LEDGER', row);
    }
    
    // Update current stock
    await OctaneDB.dbPut('stock', { key: 'petrol', value: currentPetrol });
    await OctaneDB.dbPut('stock', { key: 'diesel', value: currentDiesel });
    await OctaneDB.dbPut('stock', { key: 'petrol_cost_wac', value: currentWacP });
    await OctaneDB.dbPut('stock', { key: 'diesel_cost_wac', value: currentWacD });
    
    ErrorTracker.info(`Chronological rebuild completed from ${startDate}. Final P=${currentPetrol.toFixed(2)}, D=${currentDiesel.toFixed(2)}`, 'RebuildEngine');
  }
};

window.RebuildEngine = RebuildEngine;
