// ============================================================================
// js/engine/ledger_engine.js — Ledger CRUD Operations
// ============================================================================

const LedgerEngine = {

  /**
   * Save or update daily readings. Updates stock levels accordingly.
   */
  async saveDailyReadings(data, dbSnapshot) {
    const newCalc = MathEngine.computeLedgerRow(data, null, dbSnapshot);
    const newNetP = newCalc.totals.net_24h.petrol;
    const newNetD = newCalc.totals.net_24h.diesel;

    const existingIdx = dbSnapshot.master_ledger.findIndex(r => r.date === data.date);

    if (existingIdx !== -1) {
      // Editing existing: reconcile stock delta
      const oldCalc = MathEngine.computeLedgerRow(dbSnapshot.master_ledger[existingIdx], null, dbSnapshot);
      const oldNetP = oldCalc.totals.net_24h.petrol;
      const oldNetD = oldCalc.totals.net_24h.diesel;

      const newPetrol = (dbSnapshot.stock.petrol || 0) + oldNetP - newNetP;
      const newDiesel = (dbSnapshot.stock.diesel || 0) + oldNetD - newNetD;

      await OctaneDB.dbPut('stock', { key: 'petrol', value: newPetrol });
      await OctaneDB.dbPut('stock', { key: 'diesel', value: newDiesel });

      data.id = dbSnapshot.master_ledger[existingIdx].id || data.date;
      data._dirty = true;
      await OctaneDB.dbPut('master_ledger', data);

      ErrorTracker.info(`Ledger updated for ${data.date}. ΔP=${(oldNetP - newNetP).toFixed(2)}, ΔD=${(oldNetD - newNetD).toFixed(2)}`, 'LedgerEngine');

      // If it's a historical edit, rebuild chronological stock and WAC
      const todayStr = new Date().toISOString().split('T')[0];
      if (data.date < todayStr && typeof RebuildEngine !== 'undefined') {
        await RebuildEngine.rebuildFromDate(data.date, dbSnapshot);
      }

    } else {
      // New entry: subtract from stock
      const newPetrol = (dbSnapshot.stock.petrol || 0) - newNetP;
      const newDiesel = (dbSnapshot.stock.diesel || 0) - newNetD;

      await OctaneDB.dbPut('stock', { key: 'petrol', value: newPetrol });
      await OctaneDB.dbPut('stock', { key: 'diesel', value: newDiesel });

      if (!data.id) data.id = data.date;
      data._dirty = true;
      await OctaneDB.dbPut('master_ledger', data);

      ErrorTracker.info(`New ledger entry for ${data.date}. P=${newNetP.toFixed(2)}L, D=${newNetD.toFixed(2)}L`, 'LedgerEngine');
    }

    // Queue sync
    await window.syncQueue.enqueue('PUSH_LEDGER', data);

    return { success: true, salesP: newNetP, salesD: newNetD };
  },

  /**
   * Delete a ledger entry and credit stock back.
   */
  async deleteLedgerRow(dateStr, dbSnapshot) {
    const row = dbSnapshot.master_ledger.find(r => r.date === dateStr);
    if (!row) return { success: false, error: 'Entry not found' };

    const calc = MathEngine.computeLedgerRow(row, null, dbSnapshot);
    const restoredP = (dbSnapshot.stock.petrol || 0) + calc.totals.net_24h.petrol;
    const restoredD = (dbSnapshot.stock.diesel || 0) + calc.totals.net_24h.diesel;

    await OctaneDB.dbPut('stock', { key: 'petrol', value: restoredP });
    await OctaneDB.dbPut('stock', { key: 'diesel', value: restoredD });
    await OctaneDB.dbDelete('master_ledger', row.id || dateStr);

    ErrorTracker.info(`Ledger entry deleted for ${dateStr}. Stock restored: P+${calc.totals.net_24h.petrol.toFixed(2)}, D+${calc.totals.net_24h.diesel.toFixed(2)}`, 'LedgerEngine');

    return { success: true, restoredP, restoredD };
  },

  /**
   * Record a tanker purchase.
   */
  async recordTanker(data, dbSnapshot) {
    const { dateStr, timeStr, petrolQty, dieselQty, petrolPrice, dieselPrice, invoiceNo, paymentStatus, observedTemperature = 15 } = data;

    // Apply thermal expansion correction
    const actualPetrolQty = petrolQty ? petrolQty * MathEngine.getThermalExpansionFactor(observedTemperature, 'petrol') : 0;
    const actualDieselQty = dieselQty ? dieselQty * MathEngine.getThermalExpansionFactor(observedTemperature, 'diesel') : 0;

    // Duplicate check
    if (invoiceNo) {
      const existing = dbSnapshot.purchases.find(p => p.invoice_no === invoiceNo);
      if (existing) return { success: false, error: `Invoice ${invoiceNo} already exists` };
    }

    const totalVol = actualPetrolQty + actualDieselQty;
    // We check against the nominal load (12000L). The input quantities are the nominal load.
    const nominalVol = (petrolQty || 0) + (dieselQty || 0);
    if (nominalVol !== 12000 && nominalVol > 0) return { success: false, error: `Tanker load must equal 12,000L (got ${nominalVol}L)` };

    const purchase = {
      id: crypto.randomUUID(),
      date: dateStr + (timeStr ? 'T' + timeStr : ''),
      petrol_liters: actualPetrolQty,
      diesel_liters: actualDieselQty,
      petrol_price: petrolPrice || dbSnapshot.stock.petrol_cost_wac || 0,
      diesel_price: dieselPrice || dbSnapshot.stock.diesel_cost_wac || 0,
      invoice_no: invoiceNo || '',
      payment_status: paymentStatus || 'Due',
      recorded_at: new Date().toISOString()
    };

    // Update stock
    const newP = (dbSnapshot.stock.petrol || 0) + purchase.petrol_liters;
    const newD = (dbSnapshot.stock.diesel || 0) + purchase.diesel_liters;
    await OctaneDB.dbPut('stock', { key: 'petrol', value: newP });
    await OctaneDB.dbPut('stock', { key: 'diesel', value: newD });

    // Update WAC
    if (purchase.petrol_liters > 0) {
      const oldQty = dbSnapshot.stock.petrol || 0;
      const oldCost = oldQty * (dbSnapshot.stock.petrol_cost_wac || 0);
      const newWac = (oldCost + purchase.petrol_liters * purchase.petrol_price) / (oldQty + purchase.petrol_liters);
      await OctaneDB.dbPut('stock', { key: 'petrol_cost_wac', value: newWac });
    }
    if (purchase.diesel_liters > 0) {
      const oldQty = dbSnapshot.stock.diesel || 0;
      const oldCost = oldQty * (dbSnapshot.stock.diesel_cost_wac || 0);
      const newWac = (oldCost + purchase.diesel_liters * purchase.diesel_price) / (oldQty + purchase.diesel_liters);
      await OctaneDB.dbPut('stock', { key: 'diesel_cost_wac', value: newWac });
    }

    await OctaneDB.dbPut('purchases', purchase);
    ErrorTracker.info(`Tanker recorded: P=${purchase.petrol_liters}L, D=${purchase.diesel_liters}L, Invoice=${invoiceNo}`, 'LedgerEngine');

    return { success: true, purchase };
  },

  /**
   * Update selling price effective from a given datetime.
   */
  async updateSellingPrice(effectiveDate, priceP, priceD) {
    const entry = {
      effective_date: effectiveDate,
      petrol: parseFloat(priceP) || 0,
      diesel: parseFloat(priceD) || 0
    };
    await OctaneDB.dbPut('prices', entry);
    ErrorTracker.info(`Price updated: P=₹${entry.petrol}, D=₹${entry.diesel} from ${effectiveDate}`, 'LedgerEngine');
    return { success: true, entry };
  }
};

window.LedgerEngine = LedgerEngine;
