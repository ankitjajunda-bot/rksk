// ============================================================================
// js/engine/stock_engine.js — Stock Reconciliation Engine
// ============================================================================

const StockEngine = {

  /**
   * Reconstruct historical stock levels by walking backwards from current stock.
   */
  getStockHistoryFor(dateStr, dbSnapshot) {
    let petStock = dbSnapshot.stock.petrol || 0;
    let dieStock = dbSnapshot.stock.diesel || 0;
    const petCap = dbSnapshot.settings.petrol_capacity || 20000;
    const dieCap = dbSnapshot.settings.diesel_capacity || 20000;

    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) {
      return { petStart: petStock, petEnd: petStock, dieStart: dieStock, dieEnd: dieStock, purchasedP: 0, purchasedD: 0, salesP: 0, salesD: 0, petrolSupplyMissing: false, dieselSupplyMissing: false };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let maxDateStr = todayStr;
    if (dateStr > maxDateStr) maxDateStr = dateStr;
    dbSnapshot.master_ledger.forEach(r => { if (r.date > maxDateStr) maxDateStr = r.date; });
    dbSnapshot.purchases.forEach(p => { const d = p.date.split('T')[0]; if (d > maxDateStr) maxDateStr = d; });

    let currentDate = maxDateStr;
    let loopLimit = 500;
    let petrolSupplyMissing = false, dieselSupplyMissing = false;

    while (currentDate >= dateStr && loopLimit > 0) {
      loopLimit--;
      const row = dbSnapshot.master_ledger.find(r => r.date === currentDate);
      let salesP = 0, salesD = 0;
      if (row) {
        const calc = MathEngine.computeLedgerRow(row, null, dbSnapshot);
        salesP = calc.totals.net_24h.petrol;
        salesD = calc.totals.net_24h.diesel;
      }

      const dayPurchases = dbSnapshot.purchases.filter(p => p.date.split('T')[0] === currentDate);
      const purchasedP = dayPurchases.reduce((s, p) => s + (p.petrol_liters || 0), 0);
      const purchasedD = dayPurchases.reduce((s, p) => s + (p.diesel_liters || 0), 0);

      const endP = petStock, endD = dieStock;
      let startP = endP + salesP - purchasedP;
      let startD = endD + salesD - purchasedD;

      if (startP > petCap || startP < 0) { petrolSupplyMissing = true; startP = Math.min(petCap, Math.max(0, startP)); }
      if (startD > dieCap || startD < 0) { dieselSupplyMissing = true; startD = Math.min(dieCap, Math.max(0, startD)); }

      if (currentDate === dateStr) {
        return { petStart: startP, petEnd: endP, dieStart: startD, dieEnd: endD, purchasedP, purchasedD, salesP, salesD, petrolSupplyMissing, dieselSupplyMissing };
      }

      petStock = startP;
      dieStock = startD;
      currentDate = MathEngine.addDays(currentDate, -1);
    }

    return { petStart: petStock, petEnd: petStock, dieStart: dieStock, dieEnd: dieStock, purchasedP: 0, purchasedD: 0, salesP: 0, salesD: 0, petrolSupplyMissing, dieselSupplyMissing };
  },

  /**
   * Build WAC (Weighted Average Cost) timeline from purchases.
   */
  buildWACTimeline(dbSnapshot) {
    const wacMap = {};
    const purchases = [...(dbSnapshot.purchases || [])].sort((a, b) => a.date.localeCompare(b.date));
    let runningPetrolQty = dbSnapshot.stock.petrol || 0;
    let runningPetrolCost = runningPetrolQty * (dbSnapshot.stock.petrol_cost_wac || 0);
    let runningDieselQty = dbSnapshot.stock.diesel || 0;
    let runningDieselCost = runningDieselQty * (dbSnapshot.stock.diesel_cost_wac || 0);

    purchases.forEach(p => {
      const pDate = p.date.split('T')[0];
      const pLitres = p.petrol_liters || 0;
      const dLitres = p.diesel_liters || 0;
      const pPrice = p.petrol_price || dbSnapshot.stock.petrol_cost_wac || 0;
      const dPrice = p.diesel_price || dbSnapshot.stock.diesel_cost_wac || 0;

      if (pLitres > 0) {
        runningPetrolQty += pLitres;
        runningPetrolCost += pLitres * pPrice;
      }
      if (dLitres > 0) {
        runningDieselQty += dLitres;
        runningDieselCost += dLitres * dPrice;
      }

      wacMap[pDate] = {
        ms: runningPetrolQty > 0 ? runningPetrolCost / runningPetrolQty : pPrice,
        hsd: runningDieselQty > 0 ? runningDieselCost / runningDieselQty : dPrice
      };
    });

    return wacMap;
  },

  /**
   * Reconcile stock for a single ledger row.
   */
  reconcileStock(row, dbSnapshot) {
    const calc = MathEngine.computeLedgerRow(row, null, dbSnapshot);
    const salesP = calc.totals.net_24h.petrol;
    const salesD = calc.totals.net_24h.diesel;

    return {
      petrolSold: salesP,
      dieselSold: salesD,
      newPetrolStock: Math.max(0, (dbSnapshot.stock.petrol || 0) - salesP),
      newDieselStock: Math.max(0, (dbSnapshot.stock.diesel || 0) - salesD)
    };
  }
};

window.StockEngine = StockEngine;
