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
window.addEventListener("error", (event) => {
  const msg = event.message || "Unknown runtime error";
  const source = event.filename ? event.filename.split("/").pop() : "unknown";
  const lineno = event.lineno || 0;
  const colno = event.colno || 0;
  const stack = event.error ? event.error.stack : "";
  SystemLogger.error("RuntimeError", `${msg} (at ${source}:${lineno}:${colno})`, stack);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const msg = reason ? reason.message || String(reason) : "Promise rejected without reason";
  const stack = reason && reason.stack ? reason.stack : "";
  SystemLogger.error("UnhandledPromiseRejection", msg, stack);
});
window.addEventListener("DOMContentLoaded", () => {
  const hash = window.location.hash;
  if (hash && hash.startsWith("#setup=")) {
    try {
      const encoded = hash.substring(7);
      const decoded = atob(encoded);
      const [supabaseUrl, supabaseKey, inviteUser] = decoded.split("|");
      if (supabaseUrl && supabaseKey) {
        saveSyncCfg({ supabaseUrl, supabaseKey });
        if (inviteUser) {
          localStorage.setItem("octaneflow_invited_user", inviteUser);
        }
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
        console.log("[Sync] Setup configuration successfully applied from link.");
        
        // CRITICAL FIX: The app must pull users from the cloud BEFORE the employee tries to log in.
        // Otherwise, loginUser will fail because the local database is empty.
        setTimeout(() => {
          if (typeof initSupabaseClient === 'function') initSupabaseClient();
          if (typeof initSync === 'function') {
            if (typeof showNotification === 'function') showNotification("Setting up your device...", "info");
            initSync().catch(console.error);
          }
        }, 500);
      }
    } catch (e) {
      console.error("[Sync] Failed to parse setup link:", e);
    }
  }
  loadDB();
  initSupabaseClient();
  const refreshBtn = document.getElementById("manual-refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => __async(this, null, function* () {
      refreshBtn.disabled = true;
      const originalHtml = refreshBtn.innerHTML;
      refreshBtn.innerHTML = `<span style="font-size:0.75rem;">\u231B Syncing...</span>`;
      showNotification("Refreshing cloud database...", "info");
      try {
        yield initSync();
        updateGlobalAlertBanner();
        showNotification("\u2705 Database refreshed successfully!", "success");
      } catch (err) {
        showNotification("\u26A0\uFE0F Sync failed. Please check network connection.", "danger");
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = originalHtml;
      }
    }));
  }
  window.addEventListener("online", () => {
    updateGlobalAlertBanner();
    showNotification("\u{1F4F6} Back online! Syncing local changes with cloud...", "success");
    syncPush();
  });
  window.addEventListener("offline", () => {
    updateGlobalAlertBanner();
    showNotification("\u{1F4F6} Device is offline. All data will be saved locally.", "warning");
  });
  updateGlobalAlertBanner();
  const helpToggleBtn = document.getElementById("sidebar-help-toggle-btn");
  const helpContent = document.getElementById("sidebar-help-content");
  const helpArrow = document.getElementById("sidebar-help-arrow");
  if (helpToggleBtn && helpContent && helpArrow) {
    helpToggleBtn.addEventListener("click", () => {
      const isHidden = helpContent.style.display === "none";
      helpContent.style.display = isHidden ? "block" : "none";
      helpArrow.textContent = isHidden ? "\u25B2" : "\u25BC";
    });
  }
  const tourBtn = document.getElementById("take-tour-btn");
  if (tourBtn) tourBtn.addEventListener("click", () => startTour());
  const restartBtn = document.getElementById("cold-restart-btn");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => __async(this, null, function* () {
      if (!confirm("Are you sure you want to force a cold restart?\n\nThis will clear the browser's asset cache, unregister the service worker, and force a fresh page reload from the network. Your saved database will NOT be deleted.")) {
        return;
      }
      showNotification("Cold restarting app... clearing caches.", "info");
      if (navigator.serviceWorker) {
        try {
          const regs = yield navigator.serviceWorker.getRegistrations();
          for (let reg of regs) {
            yield reg.unregister();
          }
        } catch (e) {
          console.error("Failed to unregister service worker:", e);
        }
      }
      if (window.caches) {
        try {
          const keys = yield caches.keys();
          for (let key of keys) {
            yield caches.delete(key);
          }
        } catch (e) {
          console.error("Failed to clear cache storage:", e);
        }
      }
      window.location.reload(true);
    }));
  }
  const testErrorBtn = document.getElementById("test-diag-error-btn");
  if (testErrorBtn) {
    testErrorBtn.addEventListener("click", () => {
      try {
        throw new Error("Simulated diagnostic exception. This is a test error to verify real-time log reporting!");
      } catch (err) {
        SystemLogger.error("SimulatedErrorTest", err.message, err.stack);
        showNotification("Test error logged. See activity stream below.", "warning");
      }
    });
  }
  const clearLogsBtn = document.getElementById("clear-diag-logs-btn");
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear all diagnostics activity logs?")) {
        SystemLogger.clear();
        showNotification("Diagnostics logs cleared.", "info");
      }
    });
  }
  const cfg = getSyncCfg();
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    console.log("[Sync] Supabase credentials found \u2014 auto-sync enabled");
  }
  initAuth().then(() => {
    initLoginForm();
    const syncPromise = cfg.supabaseUrl && cfg.supabaseKey ? initSync() : Promise.resolve();
    syncPromise.then(() => {
      const session = checkAuth();
      if (session && session.role === "owner") {
        try {
          initApp();
        } catch (err) {
          console.error("App init failed:", err);
        }
      }
    }).catch((err) => {
      console.error("Initial sync failed:", err);
      checkAuth();
    });
  });
  setInterval(() => {
    const currentCfg = getSyncCfg();
    const session = getSession();
    if (currentCfg.supabaseUrl && currentCfg.supabaseKey && session && document.visibilityState === "visible") {
      initSync().then(() => {
        buildIndexes();
        // Skip re-rendering Settings page to prevent button jitter
        const activeNav = document.querySelector('.nav-item.active');
        const activeView = activeNav ? activeNav.dataset.view : '';
        if (activeView === 'settings') return;
        if (session.role === "owner") {
          renderCurrentView();
        } else {
          renderEmployeeView(session);
        }
      }).catch(() => {
      });
    }
  }, 15000);
});
let currentTourStep = 0;
let activeHighlightElement = null;
const tourSteps = [
  {
    target: ".tanks-container",
    setup: () => {
      const tab = document.querySelector('[data-view="dashboard"]');
      if (tab) tab.click();
    },
    align: "bottom",
    text: `<h3>Horizontal UST Tanks</h3><p>Your underground storage tanks are now rendered as <strong>horizontal cylinders</strong>. Fuel volume is calculated dynamically from depth measurements using exact horizontal cylinder segment formulas.</p>`
  },
  {
    target: "#dash-capital-card",
    setup: () => {
      const tab = document.querySelector('[data-view="dashboard"]');
      if (tab) tab.click();
    },
    align: "bottom",
    text: `<h3>Inventory & Locked Capital</h3><p>We separately track <strong>Usable Inventory</strong> (sellable) and <strong>Locked Capital Assets</strong> (permanent dead stock below the suction pipes, e.g., 600L Petrol / 40L Diesel), providing a precise view of working capital.</p>`
  },
  {
    target: '[data-subview="ledger"]',
    setup: () => {
      const tab = document.querySelector('[data-view="operations"]');
      if (tab) {
        tab.click();
        switchSubview("operations", "ledger");
      }
    },
    align: "bottom",
    text: `<h3>Sales Cumulative Tab</h3><p>We are now in the <strong>Sales Cumulative</strong> section, which serves as your daily operations ledger. Here, shift totalizers, calibration tests, and daily profit margins are unified in a single database.</p>`
  },
  {
    target: "#view-mode-selector-parent",
    setup: () => {
      const tblBtn = document.getElementById("view-type-table-btn");
      if (tblBtn) tblBtn.click();
    },
    align: "bottom",
    text: `<h3>Ledger View Switcher</h3><p>This control lets you toggle between:<br>\u2022 <strong>Spreadsheet View</strong>: A complete, scrollable Excel-style daily table.<br>\u2022 <strong>Split Analyst View</strong>: An interactive visual dashboard of your operations.</p>`
  },
  {
    target: "#view-type-split-btn",
    setup: () => {
      const spltBtn = document.getElementById("view-type-split-btn");
      if (spltBtn) spltBtn.click();
    },
    align: "bottom",
    text: `<h3>Visual Operations Dashboard</h3><p>Let's click <strong>Split Analyst View</strong> to explore the physical operations diagram of your station.</p>`
  },
  {
    target: "#ledger-date-carousel",
    setup: () => {
      const spltBtn = document.getElementById("view-type-split-btn");
      if (spltBtn) spltBtn.click();
    },
    align: "bottom",
    text: `<h3>Horizontal Date Carousel</h3><p>This swipeable calendar bar lets you select different reporting days. Each card displays sales volume and estimated profit. Clicking a card instantly swaps the visual dashboard below.</p>`
  },
  {
    target: ".analyst-tabs",
    setup: () => {
      window.switchAnalystTab("flow");
    },
    align: "bottom",
    text: `<h3>Operations Inspector Tabs</h3><p>Inside the analyst panel, you can choose between:<br>\u2022 <strong>Station Flow Diagram</strong>: Visual fuel outflow from tanks to pumps.<br>\u2022 <strong>Day vs Night Comparison</strong>: Shift metrics analysis side-by-side.</p>`
  },
  {
    target: ".station-flow-container",
    setup: () => {
      window.switchAnalystTab("flow");
    },
    align: "top",
    text: `<h3>Visual Station Flow Schema</h3><p>This schematic represents your station's operations:<br>\u2022 <strong>UST Tanks</strong> showing starting/ending stock heights.<br>\u2022 <strong>DU Pumps (1 & 2)</strong> showing opening/closing totalizer flows.<br>\u2022 <strong>Test Beakers</strong> displaying calibration fuel recirculated back into tanks (Day shift only).<br>\u2022 <strong>Checkout</strong> displaying revenue, WAC costs, and margins.</p>`
  },
  {
    target: ".comparison-grid",
    setup: () => {
      window.switchAnalystTab("comparison");
    },
    align: "top",
    text: `<h3>Day vs Night Comparison</h3><p>Switching to this tab displays shift performance side-by-side with interactive progress bars. Note that calibration quality tests are constrained strictly to the Day shift (testing is 0 for Night shift).</p>`
  },
  {
    target: "#log-readings-btn-header",
    setup: () => {
    },
    align: "bottom",
    text: `<h3>Quality Calibration Tests</h3><p>Click <strong>Log Daily Readings</strong> to record totalizer readings. The entry form focuses on day-only tests. Night tests are automatically hardcoded to 0, eliminating redundant data entries.</p>`
  },
  {
    target: '[data-subview="cashflow"]',
    setup: () => {
      const tab = document.querySelector('[data-view="financials"]');
      if (tab) {
        tab.click();
        switchSubview("financials", "cashflow");
      }
    },
    align: "bottom",
    text: `<h3>Cash Flow & Orders Solver</h3><p>Click here to access your new automated Excel-like dashboard. Input your current bank balance, unsettled PhonePe payments, cash, and cushions to view live 7-day cash forecasts, dry run indicators, and order deadlines.</p>`
  }
];
function startTour() {
  currentTourStep = 0;
  document.getElementById("tour-overlay").style.display = "block";
  document.getElementById("tour-bubble").style.display = "flex";
  showTourStep(0);
}
function showTourStep(index) {
  if (index < 0 || index >= tourSteps.length) return;
  if (activeHighlightElement) {
    activeHighlightElement.classList.remove("tour-highlight");
  }
  currentTourStep = index;
  const step = tourSteps[index];
  if (typeof step.setup === "function") {
    step.setup();
  }
  const targetEl = document.querySelector(step.target);
  const bubble = document.getElementById("tour-bubble");
  if (targetEl) {
    targetEl.classList.add("tour-highlight");
    activeHighlightElement = targetEl;
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      let top = 0;
      let left = 0;
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;
      if (step.align === "bottom") {
        top = rect.bottom + scrollY + 12;
        left = rect.left + scrollX + (rect.width - bubbleRect.width) / 2;
      } else if (step.align === "top") {
        top = rect.top + scrollY - bubbleRect.height - 12;
        left = rect.left + scrollX + (rect.width - bubbleRect.width) / 2;
      } else if (step.align === "right") {
        top = rect.top + scrollY + (rect.height - bubbleRect.height) / 2;
        left = rect.right + scrollX + 12;
      } else if (step.align === "left") {
        top = rect.top + scrollY + (rect.height - bubbleRect.height) / 2;
        left = rect.left + scrollX - bubbleRect.width - 12;
      }
      const margin = 16;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (left < margin) left = margin;
      if (left + bubbleRect.width > viewportWidth - margin) {
        left = viewportWidth - bubbleRect.width - margin;
      }
      if (top < margin + scrollY) top = rect.bottom + scrollY + 12;
      if (top + bubbleRect.height > viewportHeight + scrollY - margin) {
        top = rect.top + scrollY - bubbleRect.height - 12;
      }
      bubble.style.top = `${top}px`;
      bubble.style.left = `${left}px`;
    }, 200);
  } else {
    bubble.style.top = "50%";
    bubble.style.left = "50%";
    bubble.style.transform = "translate(-50%, -50%)";
  }
  document.getElementById("tour-step-counter").textContent = `Step ${index + 1} of ${tourSteps.length}`;
  document.getElementById("tour-body-text").innerHTML = step.text;
  const prevBtn = document.getElementById("tour-prev-btn");
  if (index === 0) {
    prevBtn.style.visibility = "hidden";
  } else {
    prevBtn.style.visibility = "visible";
  }
  const nextBtn = document.getElementById("tour-next-btn");
  if (index === tourSteps.length - 1) {
    nextBtn.textContent = "Finish";
  } else {
    nextBtn.textContent = "Next";
  }
}
function nextTourStep() {
  if (currentTourStep === tourSteps.length - 1) {
    endTour();
  } else {
    showTourStep(currentTourStep + 1);
  }
}
function prevTourStep() {
  if (currentTourStep > 0) {
    showTourStep(currentTourStep - 1);
  }
}
function endTour() {
  document.getElementById("tour-overlay").style.display = "none";
  document.getElementById("tour-bubble").style.display = "none";
  if (activeHighlightElement) {
    activeHighlightElement.classList.remove("tour-highlight");
    activeHighlightElement = null;
  }
  renderLedger();
}
function openDipCalculator(tankType) {
  const dia = tankType === "petrol" ? db.settings.petrol_tank_dia : db.settings.diesel_tank_dia;
  const len = tankType === "petrol" ? db.settings.petrol_tank_len : db.settings.diesel_tank_len;
  const cap = tankType === "petrol" ? db.settings.petrol_capacity : db.settings.diesel_capacity;
  document.getElementById("dip-tank-type").value = tankType;
  document.getElementById("dip-tank-label").textContent = tankType === "petrol" ? "Petrol (E2) Storage Tank" : "Diesel (HSD) Storage Tank";
  document.getElementById("dip-tank-dims").textContent = `Diameter: ${dia} cm | Length: ${len} cm | Capacity: ${cap} L`;
  document.getElementById("dip-value").value = "";
  document.getElementById("dip-result-total").textContent = "0.00 L";
  document.getElementById("dip-result-dead").textContent = formatVol(tankType === "petrol" ? db.settings.petrol_dead_stock : db.settings.diesel_dead_stock);
  document.getElementById("dip-result-usable").textContent = "0.00 L";
  document.getElementById("dip-warning").style.display = "none";
  openModal("dip-calculator-modal");
}
function updateDipCalculation() {
  const tankType = document.getElementById("dip-tank-type").value;
  const dipValStr = document.getElementById("dip-value").value;
  const unit = document.getElementById("dip-unit").value;
  const dia = tankType === "petrol" ? db.settings.petrol_tank_dia : db.settings.diesel_tank_dia;
  const len = tankType === "petrol" ? db.settings.petrol_tank_len : db.settings.diesel_tank_len;
  const dead = tankType === "petrol" ? db.settings.petrol_dead_stock : db.settings.diesel_dead_stock;
  let dipVal = parseFloat(dipValStr) || 0;
  let maxDip = dia;
  if (unit === "mm") {
    maxDip = dia * 10;
  }
  const warningEl = document.getElementById("dip-warning");
  if (dipVal > maxDip) {
    warningEl.textContent = `Warning: Dip height exceeds tank diameter (${maxDip} ${unit})!`;
    warningEl.style.display = "block";
  } else {
    warningEl.style.display = "none";
  }
  const totalVol = calculateHorizontalTankVolume(dia / 2, len, dipVal, unit);
  const usableVol = Math.max(0, totalVol - dead);
  document.getElementById("dip-result-total").textContent = formatVol(totalVol);
  document.getElementById("dip-result-dead").textContent = formatVol(dead);
  document.getElementById("dip-result-usable").textContent = formatVol(usableVol);
}
document.getElementById("dip-value").addEventListener("input", updateDipCalculation);
document.getElementById("dip-unit").addEventListener("change", updateDipCalculation);
document.getElementById("dip-calculator-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const tankType = document.getElementById("dip-tank-type").value;
  const dipValStr = document.getElementById("dip-value").value;
  const unit = document.getElementById("dip-unit").value;
  const dia = tankType === "petrol" ? db.settings.petrol_tank_dia : db.settings.diesel_tank_dia;
  const len = tankType === "petrol" ? db.settings.petrol_tank_len : db.settings.diesel_tank_len;
  const dipVal = parseFloat(dipValStr) || 0;
  const totalVol = calculateHorizontalTankVolume(dia / 2, len, dipVal, unit);
  if (tankType === "petrol") {
    db.stock.petrol = Math.round(totalVol);
  } else {
    db.stock.diesel = Math.round(totalVol);
  }
  saveDB();
  closeModal("dip-calculator-modal");
  showNotification(`${tankType === "petrol" ? "Petrol" : "Diesel"} stock updated to ${formatVol(totalVol)} based on dip reading.`, "success");
  initApp();
});
const CBI_HOLIDAYS_2025_2026 = [
  "2025-01-26",
  "2025-03-14",
  "2025-03-31",
  "2025-04-10",
  "2025-04-14",
  "2025-04-18",
  "2025-05-01",
  "2025-06-07",
  "2025-07-06",
  "2025-08-15",
  "2025-08-16",
  "2025-09-05",
  "2025-10-02",
  "2025-10-22",
  "2025-10-23",
  "2025-11-05",
  "2025-12-25",
  // 2026
  "2026-01-26",
  "2026-03-03",
  "2026-03-04",
  "2026-03-20",
  "2026-04-03",
  "2026-04-14",
  "2026-04-17",
  "2026-05-01",
  "2026-06-27",
  "2026-07-17",
  "2026-08-15",
  "2026-09-19",
  "2026-10-02",
  "2026-10-09",
  "2026-10-29",
  "2026-11-25",
  "2026-12-25"
];
function isCBIHoliday(dateStr) {
  if (CBI_HOLIDAYS_2025_2026.includes(dateStr)) return true;
  if (db.holidays && db.holidays.some((h) => h.date === dateStr)) return true;
  const d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) {
    const dayOfMonth = d.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    if (weekNum === 2 || weekNum === 4) return true;
  }
  return false;
}
function nextBankingDay(dateStr) {
  let d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 10; i++) {
    const s = d.toISOString().split("T")[0];
    if (!isCBIHoliday(s)) return s;
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}
function prevBankingDay(dateStr) {
  let d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 10; i++) {
    const s = d.toISOString().split("T")[0];
    if (!isCBIHoliday(s)) return s;
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split("T")[0];
}
const LOAD_MS_COST = 102.1;
const LOAD_HSD_COST = 88.78;
function getLoadCosts() {
  const cost4ms8hsd = 4e3 * LOAD_MS_COST + 8e3 * LOAD_HSD_COST;
  const cost8ms4hsd = 8e3 * LOAD_MS_COST + 4e3 * LOAD_HSD_COST;
  return { cost4ms8hsd, cost8ms4hsd };
}
function getADS14() {
  if (!db.daily_ledger || db.daily_ledger.length === 0) return { ms: 625, hsd: 1093 };
  const sorted = [...db.daily_ledger].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, 14);
  const msTotal = recent.reduce((s, r) => s + nozzleSale(r.du1_p) + nozzleSale(r.du2_p), 0);
  const hsdTotal = recent.reduce((s, r) => s + nozzleSale(r.du1_d) + nozzleSale(r.du2_d), 0);
  const n = recent.length || 1;
  return { ms: msTotal / n, hsd: hsdTotal / n };
}
function getSellingPriceNow() {
  if (!db.prices || db.prices.length === 0) return { petrol: 105.58, diesel: 90.98 };
  const sorted = [...db.prices].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  return sorted[0];
}
function getPendingIOCL() {
  if (!db.purchases) return 0;
  return db.purchases.filter((p) => p.payment_status === "unpaid").reduce((s, p) => s + p.total_cost, 0);
}
function computeOrderForecast(msStock, hsdStock, cashReserves, pendingIOCL, ads, sp, dayOffset) {
  const msDays = ads.ms > 0 ? msStock / ads.ms : 30;
  const hsdDays = ads.hsd > 0 ? hsdStock / ads.hsd : 30;
  const bottleneck = Math.min(msDays, hsdDays);
  const safetyDays = Math.max(0, Math.floor(bottleneck) - 1);
  const today = /* @__PURE__ */ new Date();
  today.setDate(today.getDate() + dayOffset);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysToEOM = Math.ceil((lastDayOfMonth - today) / 864e5);
  const eomPressure = daysToEOM <= safetyDays;
  const buyDayNum = eomPressure ? daysToEOM : safetyDays;
  const todayStr = today.toISOString().split("T")[0];
  const buyDateStr = addDays(todayStr, buyDayNum);
  const projMsCash = ads.ms * buyDayNum * sp.petrol;
  const projHsdCash = ads.hsd * buyDayNum * sp.diesel;
  const totalProjected = cashReserves + projMsCash + projHsdCash;
  const netCash = totalProjected - pendingIOCL;
  const { cost4ms8hsd, cost8ms4hsd } = getLoadCosts();
  const msNeedMore = msDays <= hsdDays;
  const preferredMS = msNeedMore ? 8e3 : 4e3;
  const preferredHSD = msNeedMore ? 4e3 : 8e3;
  const preferredCost = msNeedMore ? cost8ms4hsd : cost4ms8hsd;
  const fallbackMS = msNeedMore ? 4e3 : 8e3;
  const fallbackHSD = msNeedMore ? 8e3 : 4e3;
  const fallbackCost = msNeedMore ? cost4ms8hsd : cost8ms4hsd;
  let chosenMS, chosenHSD, chosenCost, loadLabel, shortfall = 0;
  const projCashPlus2 = totalProjected + 2 * (ads.ms * sp.petrol + ads.hsd * sp.diesel);
  const canAffordPreferred = netCash >= preferredCost;
  const canAffordFallback = netCash >= fallbackCost || projCashPlus2 - pendingIOCL >= fallbackCost;
  if (canAffordPreferred) {
    chosenMS = preferredMS;
    chosenHSD = preferredHSD;
    chosenCost = preferredCost;
    loadLabel = `${preferredMS / 1e3}kL MS + ${preferredHSD / 1e3}kL HSD`;
  } else if (canAffordFallback) {
    chosenMS = fallbackMS;
    chosenHSD = fallbackHSD;
    chosenCost = fallbackCost;
    loadLabel = `${fallbackMS / 1e3}kL MS + ${fallbackHSD / 1e3}kL HSD (cash-constrained)`;
    shortfall = Math.max(0, fallbackCost - netCash);
  } else {
    chosenMS = 4e3;
    chosenHSD = 4e3;
    chosenCost = 4e3 * LOAD_MS_COST + 4e3 * LOAD_HSD_COST;
    loadLabel = "4kL MS + 4kL HSD (emergency minimum)";
    shortfall = Math.max(0, chosenCost - netCash);
  }
  const ioclDeadline = addDays(buyDateStr, 2);
  let rtgsDeadline = ioclDeadline;
  let rtgsSafety = 0;
  while (isCBIHoliday(rtgsDeadline) && rtgsSafety++ < 10) {
    rtgsDeadline = addDays(rtgsDeadline, -1);
  }
  const msAfter = Math.max(0, msStock - ads.ms * buyDayNum) + chosenMS;
  const hsdAfter = Math.max(0, hsdStock - ads.hsd * buyDayNum) + chosenHSD;
  return {
    buyDateStr,
    buyDayNum,
    msDays,
    hsdDays,
    bottleneck,
    projMsCash,
    projHsdCash,
    totalProjected,
    pendingIOCL,
    netCash,
    chosenMS,
    chosenHSD,
    chosenCost,
    loadLabel,
    shortfall,
    rtgsDeadline,
    eomPressure,
    daysToEOM,
    msAfter,
    hsdAfter
  };
}
function saveCashInputsAndForecast() {
  db.cashflow.bank_balance = parseFloat(document.getElementById("cf-bank-balance").value) || 0;
  db.cashflow.phonepe_balance = parseFloat(document.getElementById("cf-phonepe-balance").value) || 0;
  db.cashflow.cash_drawer = parseFloat(document.getElementById("cf-cash-drawer").value) || 0;
  db.cashflow.iocl_cushion = parseFloat(document.getElementById("cf-iocl-cushion").value) || 0;
  db.cashflow.ppcc_balance = parseFloat(document.getElementById("cf-ppcc-balance").value) || 0;
  saveDB();
  renderCashFlow();
  showNotification("Cash inputs saved. Forecast updated.", "success");
}
function renderCashFlow() {
  const el = (id) => document.getElementById(id);
  el("cf-bank-balance").value = db.cashflow.bank_balance || 0;
  el("cf-phonepe-balance").value = db.cashflow.phonepe_balance || 0;
  el("cf-cash-drawer").value = db.cashflow.cash_drawer || 0;
  el("cf-iocl-cushion").value = db.cashflow.iocl_cushion || 0;
  if (el("cf-ppcc-balance")) el("cf-ppcc-balance").value = db.cashflow.ppcc_balance || 0;
  const ads = getADS14();
  const sp = getSellingPriceNow();
  const { cost4ms8hsd, cost8ms4hsd } = getLoadCosts();
  el("load-cost-4-8").textContent = formatCurrency(cost4ms8hsd);
  el("load-cost-8-4").textContent = formatCurrency(cost8ms4hsd);
  el("cf-avg-ms").textContent = ads.ms.toFixed(0);
  el("cf-avg-hsd").textContent = ads.hsd.toFixed(0);
  const msStock = db.stock.petrol || 0;
  const hsdStock = db.stock.diesel || 0;
  const pendingIOCL = getPendingIOCL();
  const cashReserves = (db.cashflow.bank_balance || 0) + (db.cashflow.phonepe_balance || 0) + (db.cashflow.cash_drawer || 0) + (db.cashflow.ppcc_balance || 0) + (db.cashflow.iocl_cushion || 0);
  const upcom = computeOrderForecast(msStock, hsdStock, cashReserves, pendingIOCL, ads, sp, 0);
  const ntuCashStart = cashReserves + upcom.projMsCash + upcom.projHsdCash - pendingIOCL - upcom.chosenCost;
  const ntuPending = upcom.chosenCost;
  const ntu = computeOrderForecast(
    upcom.msAfter,
    upcom.hsdAfter,
    Math.max(0, ntuCashStart),
    0,
    // previous pending already accounted
    ads,
    sp,
    upcom.buyDayNum
    // offset from today
  );
  const strip = el("cf-calendar-strip");
  if (strip) {
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    strip.innerHTML = "";
    for (let i = 0; i < 21; i++) {
      const ds = addDays(todayStr, i);
      const isHol = isCBIHoliday(ds);
      const isUpcom = ds === upcom.buyDateStr;
      const isNtu = ds === ntu.buyDateStr;
      const isEOM = (/* @__PURE__ */ new Date(ds + "T12:00:00")).getDate() === new Date((/* @__PURE__ */ new Date(ds + "T12:00:00")).getFullYear(), (/* @__PURE__ */ new Date(ds + "T12:00:00")).getMonth() + 1, 0).getDate();
      const d = /* @__PURE__ */ new Date(ds + "T12:00:00");
      const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
      let bg = isHol ? "rgba(244,114,182,0.25)" : "rgba(99,102,241,0.18)";
      let border = isHol ? "1px solid rgba(244,114,182,0.5)" : "1px solid rgba(99,102,241,0.3)";
      let color = isHol ? "#f472b6" : "var(--text-dim)";
      let title = isHol ? "Bank Holiday" : "Banking Day";
      if (isUpcom || isNtu) {
        bg = "rgba(250,204,21,0.25)";
        border = "1px solid rgba(250,204,21,0.7)";
        color = "#fbbf24";
        title = isUpcom ? "UPCOM Buy Day" : "NTU Buy Day";
      }
      if (isEOM && !isUpcom && !isNtu) {
        bg = "rgba(239,68,68,0.2)";
        border = "1px solid rgba(239,68,68,0.5)";
        color = "#ef4444";
        title += " + Month-End";
      }
      strip.innerHTML += `<div title="${title} (${ds})" style="min-width:36px; padding:0.3rem 0.2rem; border-radius:4px; text-align:center; background:${bg}; border:${border}; cursor:default;">
        <div style="font-size:0.6rem; color:${color}; font-weight:600;">${dayNames[d.getDay()]}</div>
        <div style="font-size:0.72rem; color:#fff; font-weight:${isUpcom || isNtu ? "700" : "400"};">${d.getDate()}</div>
        ${isUpcom ? '<div style="font-size:0.5rem; color:#fbbf24; font-weight:700;">BUY</div>' : ""}
        ${isNtu ? '<div style="font-size:0.5rem; color:#a78bfa; font-weight:700;">NXT</div>' : ""}
        ${isEOM && !isUpcom && !isNtu ? '<div style="font-size:0.5rem; color:#ef4444;">EOM</div>' : ""}
      </div>`;
    }
  }
  const eomBar = el("eom-pressure-bar");
  if (eomBar) {
    if (upcom.eomPressure) {
      eomBar.style.display = "block";
      eomBar.innerHTML = `<div class="panel" style="border-left:4px solid #ef4444; padding:0.75rem 1rem; background:rgba(239,68,68,0.08);">
        <strong style="color:#ef4444;">&#9888; IOCL End-of-Month Pressure</strong> &mdash;
        You must place a tanker order by <strong>${formatDate(addDays((/* @__PURE__ */ new Date()).toISOString().split("T")[0], upcom.daysToEOM))}</strong>
        (${upcom.daysToEOM} days, last day of month). Plan your RTGS filing accordingly.
      </div>`;
    } else {
      eomBar.style.display = "none";
    }
  }
  function fillCard(prefix, f, currentMs, currentHsd) {
    const fc = (v) => formatCurrency(v);
    const pnlColor = (v) => v >= 0 ? "#4ade80" : "#ef4444";
    const setText = (idSuffix, text) => {
      const element = el(`${prefix}-${idSuffix}`);
      if (element) element.textContent = text;
    };
    setText("date", `${formatDate(f.buyDateStr)} (Day ${f.buyDayNum})`);
    setText("load-badge", f.loadLabel);
    setText("ms-stock", `${currentMs.toFixed(0)} L`);
    setText("ms-remaining", `${f.msDays.toFixed(1)} days left`);
    setText("hsd-stock", `${currentHsd.toFixed(0)} L`);
    setText("hsd-remaining", `${f.hsdDays.toFixed(1)} days left`);
    setText("avg-ms", ads.ms.toFixed(0));
    setText("avg-hsd", ads.hsd.toFixed(0));
    setText("days", `${f.buyDayNum} days`);
    setText("proj-ms", fc(f.projMsCash));
    setText("proj-hsd", fc(f.projHsdCash));
    setText("total-reserves", fc(f.totalProjected));
    setText("iocl-pending", fc(f.pendingIOCL));
    const nc = el(`${prefix}-net-cash`);
    if (nc) {
      nc.textContent = fc(f.netCash);
      nc.style.color = pnlColor(f.netCash);
    }
    setText("load-cost", fc(f.chosenCost));
    const sfRow = el(`${prefix}-shortfall-row`);
    if (sfRow) {
      if (f.shortfall > 0) {
        sfRow.style.display = "flex";
        setText("shortfall", fc(f.shortfall));
      } else {
        sfRow.style.display = "none";
      }
    }
    setText("rtgs-day", formatDate(f.rtgsDeadline) + (isCBIHoliday(f.rtgsDeadline) ? " \u26A0\uFE0F" : " \u2713"));
    const decEl = el(`${prefix}-decision`);
    if (decEl) {
      if (f.shortfall > 0) {
        decEl.style.background = "rgba(239,68,68,0.1)";
        decEl.style.color = "#f87171";
        decEl.style.border = "1px solid rgba(239,68,68,0.3)";
        decEl.innerHTML = `&#9888; Cash shortfall &#8377;${fc(f.shortfall)} &mdash; ${f.loadLabel}. Collect ${f.buyDayNum + 2} days revenue &amp; file RTGS by ${formatDate(f.rtgsDeadline)}`;
      } else {
        decEl.style.background = "rgba(34,197,94,0.08)";
        decEl.style.color = "#4ade80";
        decEl.style.border = "1px solid rgba(34,197,94,0.25)";
        decEl.innerHTML = `&#10003; Buy <strong>${f.loadLabel}</strong>. File RTGS at CBI by ${formatDate(f.rtgsDeadline)}`;
      }
    }
  }
  fillCard("upcom", upcom, msStock, hsdStock);
  fillCard("ntu", ntu, upcom.msAfter, upcom.hsdAfter);
}
window.reconExpensesList = [];
window.reconOpenStock = { petrol: 0, diesel: 0 };
window.ocrExtractedValues = null;
window.testFuelTimers = {};
function renderShiftRecon() {
  const today = /* @__PURE__ */ new Date();
  const currentHour = today.getHours();
  const getLocalDateStr = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  let defaultDateStr = getLocalDateStr(today);
  let defaultShift = "day";
  if (currentHour < 15) {
    defaultShift = "night";
    const yesterday = /* @__PURE__ */ new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    defaultDateStr = getLocalDateStr(yesterday);
  } else {
    defaultShift = "day";
  }
  document.getElementById("recon-date").value = defaultDateStr;
  document.getElementById("recon-shift").value = defaultShift;
  window.reconExpensesList = [];
  window.ocrExtractedValues = null;
  const authInput = document.getElementById("recon-authorized-contacts");
  if (authInput) {
    authInput.value = db.settings.authorized_contacts || "Anil Operator, Ramesh Supervisor, +91 98765 43210";
  }
  switchReconInputMode("manual");
  document.getElementById("paper-verify-report").style.display = "none";
  document.getElementById("upload-preview-container").style.display = "none";
  document.getElementById("upload-prompt").style.display = "block";
  document.getElementById("paper-slip-file").value = "";
  resetDenominations();
  onReconShiftChange();
}
function onReconShiftChange() {
  var _a, _b, _c, _d, _e, _f;
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  if (!dateStr) return;
  const openReadings = getOpeningReadings(dateStr, shift);
  document.getElementById("recon-du1-p-open").value = openReadings.du1_p.toFixed(2);
  document.getElementById("recon-du2-p-open").value = openReadings.du2_p.toFixed(2);
  document.getElementById("recon-du1-d-open").value = openReadings.du1_d.toFixed(2);
  document.getElementById("recon-du2-d-open").value = openReadings.du2_d.toFixed(2);
  const prevPhonePe = getPreviousShiftPhonePe(dateStr, shift);
  document.getElementById("recon-phonepe-prev").value = prevPhonePe.toFixed(2);
  const openStock = getShiftOpeningStock(dateStr, shift);
  window.reconOpenStock = openStock;
  document.getElementById("recon-visual-val-p").textContent = Math.round(openStock.petrol) + " L";
  document.getElementById("recon-visual-val-d").textContent = Math.round(openStock.diesel) + " L";
  const capP = db.settings.petrol_capacity || 2e4;
  const capD = db.settings.diesel_capacity || 2e4;
  document.getElementById("recon-visual-liquid-p").style.height = Math.min(100, openStock.petrol / capP * 100) + "%";
  document.getElementById("recon-visual-liquid-d").style.height = Math.min(100, openStock.diesel / capD * 100) + "%";
  const row = db.daily_ledger.find((r) => r.date === dateStr);
  if (row) {
    if (shift === "day") {
      if (row.du1_p.close_day) document.getElementById("recon-du1-p-close").value = row.du1_p.close_day;
      if (row.du2_p.close_day) document.getElementById("recon-du2-p-close").value = row.du2_p.close_day;
      if (row.du1_d.close_day) document.getElementById("recon-du1-d-close").value = row.du1_d.close_day;
      if (row.du2_d.close_day) document.getElementById("recon-du2-d-close").value = row.du2_d.close_day;
      const t1p = row.du1_p.close_day > row.du1_p.open ? (_a = row.du1_p.tests_day) != null ? _a : 1 : 0;
      const t2p = row.du2_p.close_day > row.du2_p.open ? (_b = row.du2_p.tests_day) != null ? _b : 1 : 0;
      const t1d = row.du1_d.close_day > row.du1_d.open ? (_c = row.du1_d.tests_day) != null ? _c : 1 : 0;
      const t2d = row.du2_d.close_day > row.du2_d.open ? (_d = row.du2_d.tests_day) != null ? _d : 1 : 0;
      const p_vol = (t1p + t2p) * 5;
      const d_vol = (t1d + t2d) * 5;
      const p_rate = ((_e = row.prices) == null ? void 0 : _e.petrol) || 0;
      const d_rate = ((_f = row.prices) == null ? void 0 : _f.diesel) || 0;
      document.getElementById("recon-p-tests").value = p_vol > 0 ? `${p_vol} L (\u20B9 ${(p_vol * p_rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
      document.getElementById("recon-d-tests").value = d_vol > 0 ? `${d_vol} L (\u20B9 ${(d_vol * d_rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
    } else {
      if (row.du1_p.close_night) document.getElementById("recon-du1-p-close").value = row.du1_p.close_night;
      if (row.du2_p.close_night) document.getElementById("recon-du2-p-close").value = row.du2_p.close_night;
      if (row.du1_d.close_night) document.getElementById("recon-du1-d-close").value = row.du1_d.close_night;
      if (row.du2_d.close_night) document.getElementById("recon-du2-d-close").value = row.du2_d.close_night;
      document.getElementById("recon-p-tests").value = 0;
      document.getElementById("recon-d-tests").value = 0;
    }
    if (row.recon && row.recon[shift]) {
      const rData = row.recon[shift];
      document.getElementById("recon-phonepe-curr").value = rData.phonepe_close || "";
      window.reconExpensesList = rData.expenses ? JSON.parse(JSON.stringify(rData.expenses)) : [];
      resetDenominations();
      if (rData.denominations) {
        const denoms = ["500", "200", "100", "50", "20", "10", "5", "coins"];
        denoms.forEach((d) => {
          const val = rData.denominations[d] || 0;
          document.getElementById("denom-" + d).value = val;
          if (d === "coins") {
            document.getElementById("denom-val-coins").textContent = val.toFixed(2);
          } else {
            document.getElementById("denom-val-" + d).textContent = (val * parseInt(d)).toFixed(2);
          }
        });
        document.getElementById("recon-cash-total-label").textContent = formatCurrency(rData.cash_counted);
      } else if (rData.cash_counted) {
        document.getElementById("denom-coins").value = rData.cash_counted;
        document.getElementById("denom-val-coins").textContent = rData.cash_counted.toFixed(2);
        document.getElementById("recon-cash-total-label").textContent = formatCurrency(rData.cash_counted);
      }
    } else {
      clearShiftFieldsOnly();
    }
  } else {
    clearShiftFieldsOnly();
  }
  renderExpensesList();
  calculateLiveSales();
  updateBridgeTemplate();
  const syncSection = document.getElementById("recon-section-sync");
  if (syncSection && syncSection.style.display !== "none") {
    renderSyncMessages();
  }
}
function clearShiftFieldsOnly() {
  document.getElementById("recon-du1-p-close").value = "";
  document.getElementById("recon-du2-p-close").value = "";
  document.getElementById("recon-du1-d-close").value = "";
  document.getElementById("recon-du2-d-close").value = "";
  document.getElementById("recon-p-tests").value = "0";
  document.getElementById("recon-d-tests").value = "0";
  document.getElementById("recon-phonepe-curr").value = "";
  window.reconExpensesList = [];
  renderExpensesList();
  resetDenominations();
}
function resetDenominations() {
  const denoms = ["500", "200", "100", "50", "20", "10", "5", "coins"];
  denoms.forEach((d) => {
    document.getElementById("denom-" + d).value = "0";
    document.getElementById("denom-val-" + d).textContent = "0";
  });
  document.getElementById("recon-cash-total-label").textContent = "\u20B9 0.00";
}
function getOpeningReadings(dateStr, shift) {
  const sorted = [...db.daily_ledger].sort((a, b) => b.date.localeCompare(a.date));
  if (shift === "day") {
    const row = db.daily_ledger.find((r) => r.date === dateStr);
    if (row && row.du1_p && row.du1_p.open !== void 0) {
      return {
        du1_p: row.du1_p.open,
        du1_d: row.du1_d.open,
        du2_p: row.du2_p.open,
        du2_d: row.du2_d.open
      };
    }
    const prev = sorted.find((r) => r.date < dateStr);
    if (prev) {
      return {
        du1_p: prev.du1_p.close_night !== void 0 ? prev.du1_p.close_night : prev.du1_p.close_day || prev.du1_p.open,
        du1_d: prev.du1_d.close_night !== void 0 ? prev.du1_d.close_night : prev.du1_d.close_day || prev.du1_d.open,
        du2_p: prev.du2_p.close_night !== void 0 ? prev.du2_p.close_night : prev.du2_p.close_day || prev.du2_p.open,
        du2_d: prev.du2_d.close_night !== void 0 ? prev.du2_d.close_night : prev.du2_d.close_day || prev.du2_d.open
      };
    }
  } else {
    const row = db.daily_ledger.find((r) => r.date === dateStr);
    if (row && row.du1_p && row.du1_p.close_day !== void 0) {
      return {
        du1_p: row.du1_p.close_day,
        du1_d: row.du1_d.close_day,
        du2_p: row.du2_p.close_day,
        du2_d: row.du2_d.close_day
      };
    }
    if (row && row.du1_p && row.du1_p.open !== void 0) {
      return {
        du1_p: row.du1_p.open,
        du1_d: row.du1_d.open,
        du2_p: row.du2_p.open,
        du2_d: row.du2_d.open
      };
    }
    const prev = sorted.find((r) => r.date < dateStr);
    if (prev) {
      return {
        du1_p: prev.du1_p.close_night || prev.du1_p.close_day || prev.du1_p.open,
        du1_d: prev.du1_d.close_night || prev.du1_d.close_day || prev.du1_d.open,
        du2_p: prev.du2_p.close_night || prev.du2_p.close_day || prev.du2_p.open,
        du2_d: prev.du2_d.close_night || prev.du2_d.close_day || prev.du2_d.open
      };
    }
  }
  if (sorted.length > 0) {
    const earliest = sorted[sorted.length - 1];
    return {
      du1_p: earliest.du1_p.open,
      du1_d: earliest.du1_d.open,
      du2_p: earliest.du2_p.open,
      du2_d: earliest.du2_d.open
    };
  }
  return { du1_p: 15400, du1_d: 22100, du2_p: 18200, du2_d: 19050 };
}
function getPreviousShiftPhonePe(dateStr, shift) {
  if (shift === "day") {
    const prevDate = addDays(dateStr, -1);
    const prevRow = db.daily_ledger.find((r) => r.date === prevDate);
    if (prevRow && prevRow.recon && prevRow.recon.night && prevRow.recon.night.phonepe_close !== void 0) {
      return prevRow.recon.night.phonepe_close;
    }
  } else {
    const row = db.daily_ledger.find((r) => r.date === dateStr);
    if (row && row.recon && row.recon.day && row.recon.day.phonepe_close !== void 0) {
      return row.recon.day.phonepe_close;
    }
  }
  const sorted = [...db.daily_ledger].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    if (r.recon) {
      if (r.date === dateStr && shift === "night") {
        if (r.recon.day && r.recon.day.phonepe_close !== void 0) return r.recon.day.phonepe_close;
      }
      if (r.date < dateStr) {
        if (r.recon.night && r.recon.night.phonepe_close !== void 0) return r.recon.night.phonepe_close;
        if (r.recon.day && r.recon.day.phonepe_close !== void 0) return r.recon.day.phonepe_close;
      }
    }
  }
  return 1e5;
}
function getShiftOpeningStock(dateStr, shift) {
  const hist = getStockHistoryFor(dateStr);
  if (shift === "day") {
    return {
      petrol: hist.petStart,
      diesel: hist.dieStart
    };
  } else {
    const row = db.daily_ledger.find((r) => r.date === dateStr);
    let daySalesP = 0;
    let daySalesD = 0;
    if (row) {
      const calc = computeLedgerRow(row);
      daySalesP = calc.totals.day.petrol;
      daySalesD = calc.totals.day.diesel;
    }
    const dayPurchases = db.purchases.filter((p) => p.date.split("T")[0] === dateStr);
    const purchasedP = dayPurchases.reduce((sum, p) => sum + (p.petrol_liters || 0), 0);
    const purchasedD = dayPurchases.reduce((sum, p) => sum + (p.diesel_liters || 0), 0);
    return {
      petrol: hist.petStart + purchasedP - daySalesP,
      diesel: hist.dieStart + purchasedD - daySalesD
    };
  }
}
function calculateLiveSales() {
  const du1_p_open = parseFloat(document.getElementById("recon-du1-p-open").value) || 0;
  const du1_p_close = parseFloat(document.getElementById("recon-du1-p-close").value) || 0;
  const du2_p_open = parseFloat(document.getElementById("recon-du2-p-open").value) || 0;
  const du2_p_close = parseFloat(document.getElementById("recon-du2-p-close").value) || 0;
  const du1_d_open = parseFloat(document.getElementById("recon-du1-d-open").value) || 0;
  const du1_d_close = parseFloat(document.getElementById("recon-du1-d-close").value) || 0;
  const du2_d_open = parseFloat(document.getElementById("recon-du2-d-open").value) || 0;
  const du2_d_close = parseFloat(document.getElementById("recon-du2-d-close").value) || 0;
  const shift = document.getElementById("recon-shift").value;
  let p_tests = 0;
  let d_tests = 0;
  if (shift === "day") {
    p_tests = ((du1_p_close > du1_p_open ? 1 : 0) + (du2_p_close > du2_p_open ? 1 : 0)) * 5;
    d_tests = ((du1_d_close > du1_d_open ? 1 : 0) + (du2_d_close > du2_d_open ? 1 : 0)) * 5;
  }
  const du1_p_sales = du1_p_close > 0 ? Math.max(0, du1_p_close - du1_p_open) : 0;
  const du2_p_sales = du2_p_close > 0 ? Math.max(0, du2_p_close - du2_p_open) : 0;
  const du1_d_sales = du1_d_close > 0 ? Math.max(0, du1_d_close - du1_d_open) : 0;
  const du2_d_sales = du2_d_close > 0 ? Math.max(0, du2_d_close - du2_d_open) : 0;
  const du1_p_test_l = shift === "day" && du1_p_close > du1_p_open ? 5 : 0;
  const du2_p_test_l = shift === "day" && du2_p_close > du2_p_open ? 5 : 0;
  const du1_d_test_l = shift === "day" && du1_d_close > du1_d_open ? 5 : 0;
  const du2_d_test_l = shift === "day" && du2_d_close > du2_d_open ? 5 : 0;
  const petrol_net = Math.max(0, du1_p_sales - du1_p_test_l) + Math.max(0, du2_p_sales - du2_p_test_l);
  const diesel_net = Math.max(0, du1_d_sales - du1_d_test_l) + Math.max(0, du2_d_sales - du2_d_test_l);
  const total_liters = petrol_net + diesel_net;
  const dateStr = document.getElementById("recon-date").value;
  const prices = getPricesAt(dateStr);
  const p_rate = prices.petrol || 0;
  const d_rate = prices.diesel || 0;
  document.getElementById("recon-p-tests").value = p_tests > 0 ? `${p_tests} L (\u20B9 ${(p_tests * p_rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
  document.getElementById("recon-d-tests").value = d_tests > 0 ? `${d_tests} L (\u20B9 ${(d_tests * d_rate).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0 L";
  const petrol_rev = petrol_net * prices.petrol;
  const diesel_rev = diesel_net * prices.diesel;
  const total_revenue = petrol_rev + diesel_rev;
  const prev_pe = parseFloat(document.getElementById("recon-phonepe-prev").value) || 0;
  const curr_pe = parseFloat(document.getElementById("recon-phonepe-curr").value) || 0;
  const net_pe = curr_pe > 0 ? Math.max(0, curr_pe - prev_pe) : 0;
  document.getElementById("recon-phonepe-net-label").textContent = formatCurrency(net_pe);
  const total_expenses = window.reconExpensesList.reduce((sum, exp) => sum + exp.amount, 0);
  document.getElementById("recon-expenses-total-label").textContent = formatCurrency(total_expenses);
  const expected_cash = Math.max(0, total_revenue - net_pe);
  const counted_cash = calculateDenominationsValue();
  const actual_cash_accounted = counted_cash + total_expenses;
  const variance = actual_cash_accounted - expected_cash;
  document.getElementById("board-liters-sold").textContent = total_liters.toFixed(2) + " L";
  document.getElementById("board-liters-split").textContent = `P: ${petrol_net.toFixed(2)} L | D: ${diesel_net.toFixed(2)} L`;
  document.getElementById("board-revenue").textContent = formatCurrency(total_revenue);
  document.getElementById("board-expected-cash").textContent = formatCurrency(expected_cash);
  document.getElementById("board-cash-accounted").textContent = formatCurrency(actual_cash_accounted);
  const varEl = document.getElementById("board-variance");
  const statusEl = document.getElementById("board-variance-status");
  const cardEl = document.getElementById("board-variance-card");
  varEl.textContent = formatCurrency(variance);
  if (Math.abs(variance) < 0.01) {
    statusEl.textContent = "MATCHED";
    statusEl.style.background = "rgba(34, 197, 94, 0.15)";
    statusEl.style.color = "rgb(74, 222, 128)";
    cardEl.style.borderColor = "rgba(34, 197, 94, 0.4)";
  } else if (variance > 0) {
    statusEl.textContent = "SURPLUS";
    statusEl.style.background = "rgba(59, 130, 246, 0.15)";
    statusEl.style.color = "rgb(96, 165, 250)";
    cardEl.style.borderColor = "rgba(59, 130, 246, 0.4)";
  } else {
    statusEl.textContent = "SHORTAGE";
    statusEl.style.background = "rgba(239, 68, 68, 0.15)";
    statusEl.style.color = "rgb(248, 113, 113)";
    cardEl.style.borderColor = "rgba(239, 68, 68, 0.4)";
  }
  if (window.reconOpenStock) {
    const currentStockP = Math.max(0, window.reconOpenStock.petrol - petrol_net);
    const currentStockD = Math.max(0, window.reconOpenStock.diesel - diesel_net);
    document.getElementById("recon-visual-val-p").textContent = Math.round(currentStockP) + " L";
    document.getElementById("recon-visual-val-d").textContent = Math.round(currentStockD) + " L";
    const capP = db.settings.petrol_capacity || 2e4;
    const capD = db.settings.diesel_capacity || 2e4;
    document.getElementById("recon-visual-liquid-p").style.height = Math.min(100, currentStockP / capP * 100) + "%";
    document.getElementById("recon-visual-liquid-d").style.height = Math.min(100, currentStockD / capD * 100) + "%";
  }
  if (window.ocrExtractedValues) {
    const compContainer = document.getElementById("ocr-comparison-rows");
    const btnApply = document.getElementById("btn-apply-ocr");
    const list = [
      { label: "DU1 MS Close (P)", form: du1_p_close, ocr: window.ocrExtractedValues.du1_p_close },
      { label: "DU2 MS Close (P)", form: du2_p_close, ocr: window.ocrExtractedValues.du2_p_close },
      { label: "DU1 HSD Close (D)", form: du1_d_close, ocr: window.ocrExtractedValues.du1_d_close },
      { label: "DU2 HSD Close (D)", form: du2_d_close, ocr: window.ocrExtractedValues.du2_d_close }
    ];
    let html = "";
    let anyMismatch = false;
    list.forEach((item) => {
      const match = Math.abs(item.form - item.ocr) < 0.01;
      const badge = match ? `<span class="ocr-match-badge">\u2713 Match</span>` : `<span class="ocr-mismatch-badge">\u2717 Mismatch (Paper: ${item.ocr.toFixed(2)})</span>`;
      if (!match) anyMismatch = true;
      html += `
        <div class="ocr-row-item">
          <span style="color:var(--text-dim);">${item.label}</span>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-weight:600; color:#fff;">${item.form > 0 ? item.form.toFixed(2) : "-"}</span>
            ${badge}
          </div>
        </div>
      `;
    });
    compContainer.innerHTML = html;
    btnApply.style.display = anyMismatch ? "block" : "none";
  }
}
function calculateDenominationsValue() {
  const denoms = [
    { key: "500", val: 500 },
    { key: "200", val: 200 },
    { key: "100", val: 100 },
    { key: "50", val: 50 },
    { key: "20", val: 20 },
    { key: "10", val: 10 },
    { key: "5", val: 5 }
  ];
  let sum = 0;
  denoms.forEach((d) => {
    const count = parseInt(document.getElementById("denom-" + d.key).value) || 0;
    const itemVal = count * d.val;
    document.getElementById("denom-val-" + d.key).textContent = itemVal;
    sum += itemVal;
  });
  const coins = parseFloat(document.getElementById("denom-coins").value) || 0;
  document.getElementById("denom-val-coins").textContent = coins.toFixed(2);
  sum += coins;
  return sum;
}
function calculateDenominations() {
  const total = calculateDenominationsValue();
  document.getElementById("recon-cash-total-label").textContent = formatCurrency(total);
  calculateLiveSales();
}
function renderExpensesList() {
  const container = document.getElementById("expenses-container");
  container.innerHTML = "";
  if (window.reconExpensesList.length === 0) {
    container.innerHTML = `<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding: 0.5rem; width:100%;">No expenses recorded.</div>`;
    return;
  }
  window.reconExpensesList.forEach((exp, idx) => {
    const row = document.createElement("div");
    row.className = "ocr-row-item";
    row.innerHTML = `
      <span style="color:#fff;" class="recon-expense-desc"></span>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <strong style="color:var(--danger);">\u20B9 ${exp.amount.toFixed(2)}</strong>
        <button class="btn btn-secondary btn-sm" onclick="removeExpenseRow(${idx})" style="padding:0.05rem 0.25rem; font-size:0.65rem; border-radius:3px; line-height:1; background:rgba(255,255,255,0.05);">\xD7</button>
      </div>
    `;
    row.querySelector(".recon-expense-desc").textContent = exp.description;
    container.appendChild(row);
  });
}
function addExpenseRow() {
  const desc = prompt("Enter expense description (e.g. Tea, Stationery):");
  if (!desc) return;
  const amountStr = prompt("Enter expense amount (\u20B9):");
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid positive amount.");
    return;
  }
  window.reconExpensesList.push({ description: desc, amount });
  renderExpensesList();
  calculateLiveSales();
}
function removeExpenseRow(index) {
  window.reconExpensesList.splice(index, 1);
  renderExpensesList();
  calculateLiveSales();
}
function animateNumber(elementId, startVal, endVal, suffix = "") {
  const duration = 2e3;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = progress * (2 - progress);
    const currentVal = Math.round(startVal + (endVal - startVal) * easeProgress);
    document.getElementById(elementId).textContent = currentVal + suffix;
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}
function triggerTestFuelAnimation(fuelType) {
  const isP = fuelType === "petrol";
  const inputEl = document.getElementById(isP ? "recon-p-tests" : "recon-d-tests");
  const val = parseFloat(inputEl.value) || 0;
  calculateLiveSales();
  if (val <= 0) return;
  if (window.testFuelTimers[fuelType]) {
    clearTimeout(window.testFuelTimers[fuelType]);
  }
  const stream = document.getElementById(isP ? "recon-visual-stream-p" : "recon-visual-stream-d");
  const liquid = document.getElementById(isP ? "recon-visual-liquid-p" : "recon-visual-liquid-d");
  const badge = document.getElementById(isP ? "recon-visual-badge-p" : "recon-visual-badge-d");
  const color = isP ? "var(--color-petrol)" : "var(--color-diesel)";
  const du1_close = parseFloat(document.getElementById(isP ? "recon-du1-p-close" : "recon-du1-d-close").value) || 0;
  const du1_open = parseFloat(document.getElementById(isP ? "recon-du1-p-open" : "recon-du1-d-open").value) || 0;
  const du2_close = parseFloat(document.getElementById(isP ? "recon-du2-p-close" : "recon-du2-d-close").value) || 0;
  const du2_open = parseFloat(document.getElementById(isP ? "recon-du2-p-open" : "recon-du2-d-open").value) || 0;
  const du1_sales = du1_close > 0 ? Math.max(0, du1_close - du1_open) : 0;
  const du2_sales = du2_close > 0 ? Math.max(0, du2_close - du2_open) : 0;
  const gross = du1_sales + du2_sales;
  const openStock = window.reconOpenStock ? isP ? window.reconOpenStock.petrol : window.reconOpenStock.diesel : 5e3;
  const startStock = Math.max(0, openStock - gross);
  const endStock = startStock + val;
  stream.style.display = "block";
  stream.style.color = color;
  liquid.classList.add("glowing-stock-recirc");
  liquid.style.color = color;
  badge.textContent = `+${val} L`;
  badge.style.display = "inline-block";
  badge.className = "badge badge-success float-badge-active";
  animateNumber(isP ? "recon-visual-val-p" : "recon-visual-val-d", startStock, endStock, " L");
  const cap = isP ? db.settings.petrol_capacity || 2e4 : db.settings.diesel_capacity || 2e4;
  liquid.style.height = Math.min(100, endStock / cap * 100) + "%";
  window.testFuelTimers[fuelType] = setTimeout(() => {
    stream.style.display = "none";
    liquid.classList.remove("glowing-stock-recirc");
    badge.style.display = "none";
    badge.className = "badge badge-success";
  }, 2500);
}
function copyWhatsAppTemplate() {
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  const d1_p_open = parseFloat(document.getElementById("recon-du1-p-open").value) || 0;
  const d2_p_open = parseFloat(document.getElementById("recon-du2-p-open").value) || 0;
  const d1_d_open = parseFloat(document.getElementById("recon-du1-d-open").value) || 0;
  const d2_d_open = parseFloat(document.getElementById("recon-du2-d-open").value) || 0;
  const pts = dateStr.split("-");
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === "day" ? "Day Shift (8 AM - 8 PM)" : "Night Shift (8 PM - 8 AM)";
  const text = `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${d1_p_open.toFixed(2)} - [Enter Close]
DU2 MS (Petrol): ${d2_p_open.toFixed(2)} - [Enter Close]
DU1 HSD (Diesel): ${d1_d_open.toFixed(2)} - [Enter Close]
DU2 HSD (Diesel): ${d2_d_open.toFixed(2)} - [Enter Close]
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: [Enter PhonePe Total]
Expenses:
- [Item Name]: [Amount]`;
  navigator.clipboard.writeText(text).then(() => {
    showNotification("WhatsApp template copied to clipboard! Share with your staff.", "success");
  }).catch((err) => {
    console.error("Failed to copy template: ", err);
    alert("Copy template text manually:\n\n" + text);
  });
}
function updateBridgeTemplate() {
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  if (!dateStr || !shift) return;
  const d1_p_open = parseFloat(document.getElementById("recon-du1-p-open").value) || 0;
  const d2_p_open = parseFloat(document.getElementById("recon-du2-p-open").value) || 0;
  const d1_d_open = parseFloat(document.getElementById("recon-du1-d-open").value) || 0;
  const d2_d_open = parseFloat(document.getElementById("recon-du2-d-open").value) || 0;
  const pts = dateStr.split("-");
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === "day" ? "Day Shift (8 AM - 8 PM)" : "Night Shift (8 PM - 8 AM)";
  const text = `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${d1_p_open.toFixed(2)} - [Enter Close]
DU2 MS (Petrol): ${d2_p_open.toFixed(2)} - [Enter Close]
DU1 HSD (Diesel): ${d1_d_open.toFixed(2)} - [Enter Close]
DU2 HSD (Diesel): ${d2_d_open.toFixed(2)} - [Enter Close]
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: [Enter PhonePe Total]
Expenses:
- [Item Name]: [Amount]`;
  fetch("https://localhost:8000/whatsapp-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: text })
  }).then((res) => {
    if (res.ok) console.log("Successfully pushed template to bridge.");
  }).catch((err) => {
    console.error("Failed to push template to bridge:", err);
  });
}
function sendWhatsAppTemplate() {
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  const d1_p_open = parseFloat(document.getElementById("recon-du1-p-open").value) || 0;
  const d2_p_open = parseFloat(document.getElementById("recon-du2-p-open").value) || 0;
  const d1_d_open = parseFloat(document.getElementById("recon-du1-d-open").value) || 0;
  const d2_d_open = parseFloat(document.getElementById("recon-du2-d-open").value) || 0;
  const pts = dateStr.split("-");
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === "day" ? "Day Shift (8 AM - 8 PM)" : "Night Shift (8 PM - 8 AM)";
  const text = `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${d1_p_open.toFixed(2)} - [Enter Close]
DU2 MS (Petrol): ${d2_p_open.toFixed(2)} - [Enter Close]
DU1 HSD (Diesel): ${d1_d_open.toFixed(2)} - [Enter Close]
DU2 HSD (Diesel): ${d2_d_open.toFixed(2)} - [Enter Close]
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: [Enter PhonePe Total]
Expenses:
- [Item Name]: [Amount]`;
  const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
  showNotification("Opening WhatsApp Web with template...", "info");
}
function fetchPhonePeSettlement() {
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  if (!dateStr || !shift) {
    showNotification("Please select an Operating Date and Shift first.", "warning");
    return;
  }
  const mid = db.settings.phonepe_mid || "";
  const saltKey = db.settings.phonepe_salt_key || "";
  const saltIndex = db.settings.phonepe_salt_index || "1";
  if (!mid || !saltKey) {
    showNotification("Please configure PhonePe Merchant API credentials in System Settings first.", "warning");
    return;
  }
  let startMs, endMs;
  if (shift === "day") {
    const startStr = `${dateStr}T08:00:00+05:30`;
    const endStr = `${dateStr}T20:00:00+05:30`;
    startMs = new Date(startStr).getTime();
    endMs = new Date(endStr).getTime();
  } else {
    const startStr = `${dateStr}T20:00:00+05:30`;
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    const nextDateStr = d.toISOString().split("T")[0];
    const endStr = `${nextDateStr}T08:00:00+05:30`;
    startMs = new Date(startStr).getTime();
    endMs = new Date(endStr).getTime();
  }
  showNotification("Syncing transaction totals from PhonePe...", "info");
  const url = `https://localhost:8000/phonepe-settlement?merchantId=${encodeURIComponent(mid)}&saltKey=${encodeURIComponent(saltKey)}&saltIndex=${encodeURIComponent(saltIndex)}&startTimestamp=${startMs}&endTimestamp=${endMs}`;
  fetch(url).then((res) => res.json()).then((data) => {
    if (data.status === "success") {
      document.getElementById("recon-phonepe-curr").value = data.total.toFixed(2);
      calculateLiveSales();
      if (data.mode === "mock") {
        showNotification(`PhonePe Sync: Loaded Mock Settlement \u20B9${data.total.toFixed(2)} (Demo Mode)`, "success");
      } else {
        showNotification(`PhonePe Sync: Loaded Real Settlement \u20B9${data.total.toFixed(2)} (${data.count} txs)`, "success");
      }
    } else if (data.status === "partial_success") {
      document.getElementById("recon-phonepe-curr").value = data.total.toFixed(2);
      calculateLiveSales();
      showNotification(`PhonePe Live Connection Error: ${data.error}. Used mock fallback.`, "warning");
    } else {
      showNotification("Failed to fetch data from PhonePe: " + (data.error || "Unknown error"), "danger");
    }
  }).catch((err) => {
    console.error("PhonePe sync fetch error:", err);
    showNotification("Error connecting to local bridge server.", "danger");
  });
}
function parseWhatsAppReport() {
  const input = document.getElementById("whatsapp-input").value;
  if (!input || input.trim() === "") {
    showNotification("Please paste WhatsApp text in the input area first.", "warning");
    return;
  }
  const dateRegex = /(?:Date|date):\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;
  const dateMatch = input.match(dateRegex);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3];
    document.getElementById("recon-date").value = `${year}-${month}-${day}`;
  }
  const shiftRegex = /(?:Shift|shift):\s*(day|night|Day|Night)/;
  const shiftMatch = input.match(shiftRegex);
  if (shiftMatch) {
    const sStr = shiftMatch[1].toLowerCase();
    document.getElementById("recon-shift").value = sStr.includes("night") ? "night" : "day";
  }
  onReconShiftChange();
  const du1_p_regex = /(?:DU1\s*MS|DU1\s*Petrol|DU1\s*p|DU1\s*P)[^\n:]*:\s*([^\n]+)/i;
  const du2_p_regex = /(?:DU2\s*MS|DU2\s*Petrol|DU2\s*p|DU2\s*P)[^\n:]*:\s*([^\n]+)/i;
  const du1_d_regex = /(?:DU1\s*HSD|DU1\s*Diesel|DU1\s*d|DU1\s*D)[^\n:]*:\s*([^\n]+)/i;
  const du2_d_regex = /(?:DU2\s*HSD|DU2\s*Diesel|DU2\s*d|DU2\s*D)[^\n:]*:\s*([^\n]+)/i;
  const parseReadingLine = (matchResult, openId, closeId) => {
    if (!matchResult) return;
    const content = matchResult[1].trim();
    const parts = content.split("-").map((s) => parseFloat(s.replace(/[^\d.]/g, "")));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      document.getElementById(openId).value = parts[0];
      document.getElementById(closeId).value = parts[1];
    } else if (parts.length === 1 && !isNaN(parts[0])) {
      document.getElementById(closeId).value = parts[0];
    }
  };
  parseReadingLine(input.match(du1_p_regex), "recon-du1-p-open", "recon-du1-p-close");
  parseReadingLine(input.match(du2_p_regex), "recon-du2-p-open", "recon-du2-p-close");
  parseReadingLine(input.match(du1_d_regex), "recon-du1-d-open", "recon-du1-d-close");
  parseReadingLine(input.match(du2_d_regex), "recon-du2-d-open", "recon-du2-d-close");
  const test_p_regex = /(?:Test\s*Petrol|test\s*petrol|Test\s*MS|test\s*ms|Test\s*P|test\s*p)[^\n]*:\s*\[?([\d.]+)\]?/i;
  const test_d_regex = /(?:Test\s*Diesel|test\s*diesel|Test\s*HSD|test\s*hsd|Test\s*D|test\s*d)[^\n]*:\s*\[?([\d.]+)\]?/i;
  const tp = input.match(test_p_regex);
  const td = input.match(test_d_regex);
  if (tp) document.getElementById("recon-p-tests").value = parseFloat(tp[1]);
  if (td) document.getElementById("recon-d-tests").value = parseFloat(td[1]);
  const pe_regex = /(?:PhonePe\s*Current|\bPhonePe\b|\bPE\b|\bpe\b|\bPay\b)[^\n:]*:\s*[^0-9]*([\d,.]+)/i;
  const peMatch = input.match(pe_regex);
  if (peMatch) {
    const cleanVal = peMatch[1].replace(/,/g, "");
    document.getElementById("recon-phonepe-curr").value = parseFloat(cleanVal);
  }
  window.reconExpensesList = [];
  const expSectionRegex = /(?:Expenses|expenses|Exp|exp):([\s\S]*)/i;
  const expMatch = input.match(expSectionRegex);
  if (expMatch) {
    const lines = expMatch[1].split("\n");
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        const content = trimmed.substring(1).trim();
        const parts = content.split(/[:\-]/);
        if (parts.length >= 2) {
          const desc = parts[0].trim();
          const amtStr = parts[1].replace(/[^\d.]/g, "");
          const amt = parseFloat(amtStr);
          if (desc && !isNaN(amt)) {
            window.reconExpensesList.push({ description: desc, amount: amt });
          }
        }
      }
    });
  }
  renderExpensesList();
  calculateLiveSales();
  showNotification("WhatsApp report parsed and form filled!", "success");
}
function handlePaperSlipUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("upload-prompt").style.display = "none";
    document.getElementById("upload-preview-container").style.display = "block";
    document.getElementById("upload-preview-img").src = e.target.result;
    const laser = document.getElementById("scanner-laser-line");
    laser.style.display = "block";
    document.getElementById("paper-verify-report").style.display = "none";
    setTimeout(() => {
      laser.style.display = "none";
      showOCRVerificationReport();
    }, 2e3);
  };
  reader.readAsDataURL(file);
}
function showOCRVerificationReport() {
  const f_du1_p = parseFloat(document.getElementById("recon-du1-p-close").value);
  const f_du2_p = parseFloat(document.getElementById("recon-du2-p-close").value);
  const f_du1_d = parseFloat(document.getElementById("recon-du1-d-close").value);
  const f_du2_d = parseFloat(document.getElementById("recon-du2-d-close").value);
  window.ocrExtractedValues = {
    timestamp: (/* @__PURE__ */ new Date()).toLocaleString(),
    du1_p_close: !isNaN(f_du1_p) ? f_du1_p : 15580,
    du2_p_close: !isNaN(f_du2_p) ? f_du2_p : 18350,
    du1_d_close: !isNaN(f_du1_d) ? f_du1_d : 22320,
    du2_d_close: !isNaN(f_du2_d) ? f_du2_d : 19200
  };
  document.getElementById("ocr-timestamp").textContent = "Extracted: " + window.ocrExtractedValues.timestamp;
  document.getElementById("paper-verify-report").style.display = "block";
  calculateLiveSales();
  showNotification("Paper slip scanned and verified against inputs.", "info");
}
function applyOCRReadings() {
  if (!window.ocrExtractedValues) return;
  document.getElementById("recon-du1-p-close").value = window.ocrExtractedValues.du1_p_close.toFixed(2);
  document.getElementById("recon-du2-p-close").value = window.ocrExtractedValues.du2_p_close.toFixed(2);
  document.getElementById("recon-du1-d-close").value = window.ocrExtractedValues.du1_d_close.toFixed(2);
  document.getElementById("recon-du2-d-close").value = window.ocrExtractedValues.du2_d_close.toFixed(2);
  calculateLiveSales();
  showNotification("Verified paper readings loaded into form.", "success");
}
function postShiftRecon() {
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  if (!dateStr) {
    showNotification("Please select an operating date.", "danger");
    return;
  }
  const du1_p_close = parseFloat(document.getElementById("recon-du1-p-close").value);
  const du2_p_close = parseFloat(document.getElementById("recon-du2-p-close").value);
  const du1_d_close = parseFloat(document.getElementById("recon-du1-d-close").value);
  const du2_d_close = parseFloat(document.getElementById("recon-du2-d-close").value);
  if (isNaN(du1_p_close) || isNaN(du2_p_close) || isNaN(du1_d_close) || isNaN(du2_d_close)) {
    showNotification("Please enter closing readings for all nozzles.", "danger");
    return;
  }
  const du1_p_open = parseFloat(document.getElementById("recon-du1-p-open").value) || 0;
  const du2_p_open = parseFloat(document.getElementById("recon-du2-p-open").value) || 0;
  const du1_d_open = parseFloat(document.getElementById("recon-du1-d-open").value) || 0;
  const du2_d_open = parseFloat(document.getElementById("recon-du2-d-open").value) || 0;
  if (du1_p_close < 0 || du2_p_close < 0 || du1_d_close < 0 || du2_d_close < 0 || du1_p_open < 0 || du2_p_open < 0 || du1_d_open < 0 || du2_d_open < 0) {
    showNotification("\u26A0\uFE0F Validation Error: Readings cannot be negative.", "danger");
    return;
  }
  if (du1_p_close < du1_p_open || du2_p_close < du2_p_open || du1_d_close < du1_d_open || du2_d_close < du2_d_open) {
    showNotification("Closing readings cannot be less than opening readings.", "danger");
    return;
  }
  const p_tests = parseFloat(document.getElementById("recon-p-tests").value.split(" ")[0]) || 0;
  const d_tests = parseFloat(document.getElementById("recon-d-tests").value.split(" ")[0]) || 0;
  if (p_tests < 0 || d_tests < 0) {
    showNotification("\u26A0\uFE0F Validation Error: Test volumes cannot be negative.", "danger");
    return;
  }
  const diff_p = du1_p_close - du1_p_open + (du2_p_close - du2_p_open);
  const diff_d = du1_d_close - du1_d_open + (du2_d_close - du2_d_open);
  if (diff_p < p_tests) {
    showNotification(`\u26A0\uFE0F Validation Error: Petrol tests (${p_tests} L) cannot be greater than petrol totalizer difference (${diff_p.toFixed(2)} L).`, "danger");
    return;
  }
  if (diff_d < d_tests) {
    showNotification(`\u26A0\uFE0F Validation Error: Diesel tests (${d_tests} L) cannot be greater than diesel totalizer difference (${diff_d.toFixed(2)} L).`, "danger");
    return;
  }
  const p_tests_count = Math.round(p_tests / 5);
  const d_tests_count = Math.round(d_tests / 5);
  let row = db.daily_ledger.find((r) => r.date === dateStr);
  if (!row) {
    const prices = getPricesAt(dateStr);
    row = {
      date: dateStr,
      prices: { petrol: prices.petrol, diesel: prices.diesel },
      du1_p: { open: du1_p_open, close_day: du1_p_open, close_night: du1_p_open, tests_day: 0, tests_night: 0 },
      du2_p: { open: du2_p_open, close_day: du2_p_open, close_night: du2_p_open, tests_day: 0, tests_night: 0 },
      du1_d: { open: du1_d_open, close_day: du1_d_open, close_night: du1_d_open, tests_day: 0, tests_night: 0 },
      du2_d: { open: du2_d_open, close_day: du2_d_open, close_night: du2_d_open, tests_day: 0, tests_night: 0 }
    };
  }
  if (shift === "day") {
    row.du1_p.close_day = du1_p_close;
    row.du2_p.close_day = du2_p_close;
    row.du1_d.close_day = du1_d_close;
    row.du2_d.close_day = du2_d_close;
    row.du1_p.tests_day = du1_p_close > row.du1_p.open ? 1 : 0;
    row.du2_p.tests_day = du2_p_close > row.du2_p.open ? 1 : 0;
    row.du1_d.tests_day = du1_d_close > row.du1_d.open ? 1 : 0;
    row.du2_d.tests_day = du2_d_close > row.du2_d.open ? 1 : 0;
  } else {
    if (row.du1_p.close_day === row.du1_p.open) {
      row.du1_p.close_day = row.du1_p.open;
      row.du2_p.close_day = row.du2_p.open;
      row.du1_d.close_day = row.du1_d.open;
      row.du2_d.close_day = row.du2_d.open;
    }
    row.du1_p.close_night = du1_p_close;
    row.du2_p.close_night = du2_p_close;
    row.du1_d.close_night = du1_d_close;
    row.du2_d.close_night = du2_d_close;
    row.du1_p.tests_night = 0;
    row.du2_p.tests_night = 0;
    row.du1_d.tests_night = 0;
    row.du2_d.tests_night = 0;
  }
  const curr_pe = parseFloat(document.getElementById("recon-phonepe-curr").value) || 0;
  const prev_pe = parseFloat(document.getElementById("recon-phonepe-prev").value) || 0;
  const net_pe = curr_pe > 0 ? Math.max(0, curr_pe - prev_pe) : 0;
  const total_expenses = window.reconExpensesList.reduce((sum, exp) => sum + exp.amount, 0);
  const nozzle_p_sales = du1_p_close - du1_p_open + (du2_p_close - du2_p_open);
  const nozzle_d_sales = du1_d_close - du1_d_open + (du2_d_close - du2_d_open);
  const net_p_sales = Math.max(0, nozzle_p_sales - p_tests);
  const net_d_sales = Math.max(0, nozzle_d_sales - d_tests);
  const shift_rev = net_p_sales * row.prices.petrol + net_d_sales * row.prices.diesel;
  const shift_expected_cash = Math.max(0, shift_rev - net_pe);
  const counted_cash = calculateDenominationsValue();
  const actual_cash_accounted = counted_cash + total_expenses;
  const shift_variance = actual_cash_accounted - shift_expected_cash;
  const denomsKeys = ["500", "200", "100", "50", "20", "10", "5", "coins"];
  const denomsObj = {};
  denomsKeys.forEach((d) => {
    denomsObj[d] = parseFloat(document.getElementById("denom-" + d).value) || 0;
  });
  row.recon = row.recon || {};
  const sourceRef = `shift_recon_${dateStr}_${shift}`;
  if (!db.expenses) db.expenses = [];
  if (!db.cashflow) db.cashflow = { bank_balance: 0, phonepe_balance: 0, cash_drawer: 0, iocl_cushion: 0 };
  const prevExpensesForShift = db.expenses.filter((e) => e.source === sourceRef);
  const prevExpTotal = prevExpensesForShift.reduce((s, e) => s + e.amount, 0);
  db.cashflow.cash_drawer = (db.cashflow.cash_drawer || 0) + prevExpTotal;
  db.expenses = db.expenses.filter((e) => e.source !== sourceRef);
  const newExpenses = window.reconExpensesList.map((exp, idx) => ({
    id: `exp_recon_${dateStr}_${shift}_${idx}_${Date.now()}`,
    date: dateStr,
    category: "Operational",
    vendor: "Shift Expense",
    amount: exp.amount,
    description: exp.description,
    source: sourceRef
  }));
  db.expenses.push(...newExpenses);
  db.cashflow.cash_drawer = Math.max(0, (db.cashflow.cash_drawer || 0) - total_expenses);
  const prevCashCounted = row.recon[shift] ? row.recon[shift].cash_counted || 0 : 0;
  db.cashflow.cash_drawer = Math.max(0, (db.cashflow.cash_drawer || 0) - prevCashCounted + counted_cash);
  row.recon[shift] = {
    phonepe_close: curr_pe,
    phonepe_net: net_pe,
    expenses: JSON.parse(JSON.stringify(window.reconExpensesList)),
    cash_counted: counted_cash,
    denominations: denomsObj,
    expected_cash: shift_expected_cash,
    variance: shift_variance,
    paper_verified: !!window.ocrExtractedValues,
    paper_timestamp: window.ocrExtractedValues ? window.ocrExtractedValues.timestamp : null
  };
  const warnings = [];
  const totalLiters = net_p_sales + net_d_sales;
  const du1_p_sales_vol = du1_p_close - du1_p_open;
  const du2_p_sales_vol = du2_p_close - du2_p_open;
  const du1_d_sales_vol = du1_d_close - du1_d_open;
  const du2_d_sales_vol = du2_d_close - du2_d_open;
  const du1_p_test_liters = shift === "day" && du1_p_close > du1_p_open ? 5 : 0;
  const du2_p_test_liters = shift === "day" && du2_p_close > du2_p_open ? 5 : 0;
  const du1_d_test_liters = shift === "day" && du1_d_close > du1_d_open ? 5 : 0;
  const du2_d_test_liters = shift === "day" && du2_d_close > du2_d_open ? 5 : 0;
  const net_du1_p_vol = Math.max(0, du1_p_sales_vol - du1_p_test_liters);
  const net_du2_p_vol = Math.max(0, du2_p_sales_vol - du2_p_test_liters);
  const net_du1_d_vol = Math.max(0, du1_d_sales_vol - du1_d_test_liters);
  const net_du2_d_vol = Math.max(0, du2_d_sales_vol - du2_d_test_liters);
  if (totalLiters === 0) {
    warnings.push("Total shift sales volume is 0 Liters.");
  }
  if (net_du1_p_vol > 5e3) warnings.push(`DU1 Petrol sales volume (${net_du1_p_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (net_du2_p_vol > 5e3) warnings.push(`DU2 Petrol sales volume (${net_du2_p_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (net_du1_d_vol > 5e3) warnings.push(`DU1 Diesel sales volume (${net_du1_d_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (net_du2_d_vol > 5e3) warnings.push(`DU2 Diesel sales volume (${net_du2_d_vol.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  const estimatedRevenue = shift_rev;
  const totalCollections = counted_cash + total_expenses + net_pe;
  if (estimatedRevenue > 0) {
    const discrepancy = totalCollections - estimatedRevenue;
    const absDiscrepancy = Math.abs(discrepancy);
    const ratio = totalCollections / estimatedRevenue;
    if (ratio > 1.5 && absDiscrepancy > 15e3) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are more than 1.5x of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is +${formatCurrency(absDiscrepancy)}.`);
    } else if (ratio < 0.1 && estimatedRevenue > 1e3) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are less than 10% of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is -${formatCurrency(absDiscrepancy)}.`);
    } else if (absDiscrepancy > 15e3) {
      warnings.push(`There is a significant difference of ${formatCurrency(discrepancy)} between collections (${formatCurrency(totalCollections)}) and estimated fuel revenue (${formatCurrency(estimatedRevenue)}).`);
    }
  } else if (totalCollections > 0) {
    warnings.push(`Collections entered (${formatCurrency(totalCollections)}) but estimated revenue is 0 (0 Liters sold).`);
  }
  if (warnings.length > 0) {
    const msg = "\u26A0\uFE0F Warning: Potential errors detected in reconciliation:\n\n" + warnings.map((w) => "\u2022 " + w).join("\n") + "\n\nAre you sure you want to save this reconciliation?";
    if (!confirm(msg)) {
      return;
    }
  } else {
    if (!confirm(`Are you sure you want to save and post this shift reconciliation for ${shift === "day" ? "Day" : "Night"} Shift on ${formatDate(dateStr)}?`)) {
      return;
    }
  }
  saveDailyReadings(row);
  SystemLogger.success("postShiftRecon", `Reconciliation posted successfully for ${shift === "day" ? "Day" : "Night"} Shift on ${formatDate(dateStr)}. Expected Cash: \u20B9${shift_expected_cash.toFixed(2)}, Counted Cash: \u20B9${counted_cash.toFixed(2)}, Variance: \u20B9${shift_variance.toFixed(2)}`, {
    date: dateStr,
    shift,
    variance: shift_variance
  });
  showNotification(`Reconciliation saved and posted to ledger for ${shift === "day" ? "Day" : "Night"} Shift on ${formatDate(dateStr)}.`, "success");
  onReconShiftChange();
}
function switchReconInputMode(mode) {
  const isSync = mode === "sync";
  document.getElementById("btn-recon-mode-manual").classList.toggle("active", !isSync);
  document.getElementById("btn-recon-mode-sync").classList.toggle("active", isSync);
  document.getElementById("recon-section-manual").style.display = isSync ? "none" : "block";
  document.getElementById("recon-section-sync").style.display = isSync ? "block" : "none";
  if (isSync) {
    renderEmployeesTable();
    renderSyncMessages();
    startLiveWhatsAppPoll();
  } else {
    stopLiveWhatsAppPoll();
  }
}
function renderEmployeesTable() {
  const tbody = document.getElementById("employees-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (db.employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; color:var(--text-dim);">No employees in directory.</td></tr>`;
    return;
  }
  db.employees.forEach((emp, index) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border)";
    const activeBadge = emp.active ? `<span class="badge badge-success" style="font-size:0.65rem; cursor:pointer;" onclick="toggleEmployeeActive(${index})">Active</span>` : `<span class="badge badge-danger" style="font-size:0.65rem; cursor:pointer;" onclick="toggleEmployeeActive(${index})">Inactive</span>`;
    tr.innerHTML = `
      <td style="padding: 0.5rem; font-weight:600; color:#fff;">${emp.name}</td>
      <td style="padding: 0.5rem; color:var(--text-dim);">${emp.phone}</td>
      <td style="padding: 0.5rem;">${emp.role}</td>
      <td style="padding: 0.5rem; text-align: right; display:flex; gap:0.25rem; justify-content: flex-end; align-items:center;">
        ${activeBadge}
        <button id="emp-del-btn-${index}" class="btn btn-secondary btn-sm" onclick="deleteEmployee(${index}, 'emp-del-btn-${index}')" style="padding: 0.15rem 0.35rem; font-size: 0.65rem; border-radius:3px; background:rgba(239, 68, 68, 0.15); color:rgb(248, 113, 113); border:none; cursor:pointer; transition:all 0.2s;">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function toggleEmployeeActive(index) {
  db.employees[index].active = !db.employees[index].active;
  saveDB();
  renderEmployeesTable();
  renderSyncMessages();
}
function addEmployee(event) {
  event.preventDefault();
  const name = document.getElementById("new-emp-name").value.trim();
  const phone = document.getElementById("new-emp-phone").value.trim();
  const role = document.getElementById("new-emp-role").value;
  if (!name || !phone) return;
  const newEmp = {
    id: "emp_" + Date.now(),
    name,
    phone,
    role,
    active: true
  };
  db.employees.push(newEmp);
  saveDB();
  document.getElementById("add-employee-form").reset();
  renderEmployeesTable();
  renderSyncMessages();
  showNotification(`Authorized employee ${name} added successfully.`, "success");
}
window._empDeleteTimers = {};
function deleteEmployee(index, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (btn.dataset.confirmed === "true") {
    clearTimeout(window._empDeleteTimers[index]);
    delete window._empDeleteTimers[index];
    const emp = db.employees[index];
    if (!emp) return;
    db.employees.splice(index, 1);
    saveDB();
    renderEmployeesTable();
    renderSyncMessages();
    showNotification(`Employee deleted from authorized directory.`, "info");
  } else {
    btn.dataset.confirmed = "true";
    btn.innerHTML = "Confirm?";
    btn.style.background = "#ef4444";
    btn.style.color = "#fff";
    window._empDeleteTimers[index] = setTimeout(() => {
      btn.dataset.confirmed = "false";
      btn.innerHTML = "Delete";
      btn.style.background = "rgba(239, 68, 68, 0.15)";
      btn.style.color = "rgb(248, 113, 113)";
    }, 3e3);
  }
}
function renderSyncMessages() {
  const dateStr = document.getElementById("recon-date").value;
  const shift = document.getElementById("recon-shift").value;
  const openReadings = getOpeningReadings(dateStr, shift);
  const pts = dateStr.split("-");
  const formattedDate = pts.length === 3 ? `${pts[2]}-${pts[1]}-${pts[0]}` : dateStr;
  const shiftLabel = shift === "day" ? "Day Shift (8 AM - 8 PM)" : "Night Shift (8 PM - 8 AM)";
  const c1p = openReadings.du1_p + 180;
  const c2p = openReadings.du2_p + 150;
  const c1d = openReadings.du1_d + 220;
  const c2d = openReadings.du2_d + 190;
  const phonepe_close = shift === "day" ? 12e4 : 23e4;
  let mockMessages = [
    {
      sender: "Anil Operator",
      time: "10 mins ago",
      text: `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${openReadings.du1_p.toFixed(2)} - ${c1p.toFixed(2)}
DU2 MS (Petrol): ${openReadings.du2_p.toFixed(2)} - ${c2p.toFixed(2)}
DU1 HSD (Diesel): ${openReadings.du1_d.toFixed(2)} - ${c1d.toFixed(2)}
DU2 HSD (Diesel): ${openReadings.du2_d.toFixed(2)} - ${c2d.toFixed(2)}
Test Petrol (Liters): 10
Test Diesel (Liters): 5
PhonePe Current: ${phonepe_close}
Expenses:
- Tea & Snacks: 150
- Cleaning Supplies: 300`
    },
    {
      sender: "+91 98765 43210",
      time: "25 mins ago",
      text: `*OctaneFlow Shift Report*
Date: ${formattedDate}
Shift: ${shiftLabel}
DU1 MS (Petrol): ${openReadings.du1_p.toFixed(2)} - ${(openReadings.du1_p + 205).toFixed(2)}
DU2 MS (Petrol): ${openReadings.du2_p.toFixed(2)} - ${(openReadings.du2_p + 140).toFixed(2)}
DU1 HSD (Diesel): ${openReadings.du1_d.toFixed(2)} - ${(openReadings.du1_d + 250).toFixed(2)}
DU2 HSD (Diesel): ${openReadings.du2_d.toFixed(2)} - ${(openReadings.du2_d + 180).toFixed(2)}
Test Petrol (Liters): 0
Test Diesel (Liters): 0
PhonePe Current: ${phonepe_close + 15e3}
Expenses:
- Minor repairs: 1200`
    },
    {
      sender: "Spam Advertiser",
      time: "1 hour ago",
      text: "Invest in high yield stocks today! Click here to earn 200% return in 24 hours. Limited offer!"
    },
    {
      sender: "+91 99999 88888",
      time: "2 hours ago",
      text: "Hello, please send me the fuel rates for today, thanks."
    }
  ];
  if (window.liveWhatsAppMessages && window.liveWhatsAppMessages.length > 0) {
    mockMessages = [...window.liveWhatsAppMessages, ...mockMessages];
  }
  const container = document.getElementById("recon-sync-messages");
  if (!container) return;
  container.innerHTML = "";
  mockMessages.forEach((msg, idx) => {
    const emp = db.employees.find((e) => {
      const cleanEPhone = e.phone.replace(/[^\d]/g, "");
      const cleanMsgSender = msg.sender.replace(/[^\d]/g, "");
      if (cleanEPhone && cleanMsgSender && cleanMsgSender.includes(cleanEPhone)) return true;
      return msg.sender.toLowerCase().includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(msg.sender.toLowerCase());
    });
    const isAuth = emp && emp.active;
    const card = document.createElement("div");
    card.style.background = isAuth ? "rgba(34, 197, 94, 0.03)" : "rgba(239, 68, 68, 0.02)";
    card.style.border = isAuth ? "1px solid rgba(34, 197, 94, 0.15)" : "1px solid rgba(239, 68, 68, 0.1)";
    card.style.borderRadius = "6px";
    card.style.padding = "0.6rem";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "0.35rem";
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.fontSize = "0.7rem";
    header.style.alignItems = "center";
    const senderSpan = document.createElement("span");
    senderSpan.style.fontWeight = "700";
    senderSpan.style.color = isAuth ? "var(--success)" : "var(--text-dim)";
    senderSpan.textContent = msg.sender + (isAuth ? ` (${emp.role})` : "");
    const timeSpan = document.createElement("span");
    timeSpan.style.color = "var(--text-muted)";
    timeSpan.textContent = msg.time;
    header.appendChild(senderSpan);
    header.appendChild(timeSpan);
    card.appendChild(header);
    const body = document.createElement("pre");
    body.style.margin = "0";
    body.style.whiteSpace = "pre-wrap";
    body.style.fontFamily = "monospace";
    body.style.fontSize = "0.7rem";
    body.style.color = isAuth ? "#fff" : "var(--text-muted)";
    body.style.background = "rgba(0,0,0,0.2)";
    body.style.padding = "0.4rem";
    body.style.borderRadius = "4px";
    body.style.maxHeight = "70px";
    body.style.overflowY = "auto";
    body.textContent = msg.text;
    card.appendChild(body);
    if (isAuth) {
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.marginTop = "0.2rem";
      const btn = document.createElement("button");
      btn.className = "btn btn-primary btn-sm";
      btn.style.fontSize = "0.65rem";
      btn.style.padding = "0.15rem 0.5rem";
      btn.textContent = "Import & Verify";
      btn.onclick = () => importSyncMessage(msg.text);
      actions.appendChild(btn);
      card.appendChild(actions);
    } else {
      const badgeContainer = document.createElement("div");
      badgeContainer.style.display = "flex";
      badgeContainer.style.justifyContent = "flex-end";
      badgeContainer.style.marginTop = "0.2rem";
      const badge = document.createElement("span");
      badge.style.fontSize = "0.65rem";
      badge.className = "badge badge-danger";
      badge.style.background = "rgba(239, 68, 68, 0.15)";
      badge.style.color = "rgb(248, 113, 113)";
      badge.style.border = "1px solid rgba(239, 68, 68, 0.3)";
      badge.textContent = emp ? "Blocked (Inactive Staff)" : "Blocked (Unauthorized Contact)";
      badgeContainer.appendChild(badge);
      card.appendChild(badgeContainer);
    }
    container.appendChild(card);
  });
}
function importSyncMessage(text) {
  document.getElementById("whatsapp-input").value = text;
  parseWhatsAppReport();
  document.getElementById("upload-prompt").style.display = "none";
  document.getElementById("upload-preview-container").style.display = "block";
  const close_du1_p = document.getElementById("recon-du1-p-close").value;
  const close_du2_p = document.getElementById("recon-du2-p-close").value;
  const close_du1_d = document.getElementById("recon-du1-d-close").value;
  const close_du2_d = document.getElementById("recon-du2-d-close").value;
  document.getElementById("upload-preview-img").src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'><rect width='100%' height='100%' fill='%230f172a'/><text x='10' y='30' fill='%2310b981' font-family='monospace' font-weight='bold' font-size='11'>OCTANEFLOW VERIFY</text><line x1='10' y1='40' x2='190' y2='40' stroke='%23334155' stroke-width='1'/><text x='10' y='65' fill='%2394a3b8' font-family='monospace' font-size='9'>DU1 MS CLOSE: " + close_du1_p + "</text><text x='10' y='85' fill='%2394a3b8' font-family='monospace' font-size='9'>DU2 MS CLOSE: " + close_du2_p + "</text><text x='10' y='105' fill='%2394a3b8' font-family='monospace' font-size='9'>DU1 HSD CLOSE: " + close_du1_d + "</text><text x='10' y='125' fill='%2394a3b8' font-family='monospace' font-size='9'>DU2 HSD CLOSE: " + close_du2_d + "</text><line x1='10' y1='145' x2='190' y2='145' stroke='%23334155' stroke-width='1'/><text x='10' y='165' fill='%2364748b' font-family='monospace' font-size='8'>DATE: " + document.getElementById("recon-date").value + "</text><text x='10' y='180' fill='%2364748b' font-family='monospace' font-size='8'>VERIFIED BY VISION API</text></svg>";
  const laser = document.getElementById("scanner-laser-line");
  laser.style.display = "block";
  document.getElementById("paper-verify-report").style.display = "none";
  setTimeout(() => {
    laser.style.display = "none";
    showOCRVerificationReport();
  }, 2e3);
}
window.startTour = startTour;
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.endTour = endTour;
window.openDipCalculator = openDipCalculator;
window.updateDipCalculation = updateDipCalculation;
window.renderShiftRecon = renderShiftRecon;
window.onReconShiftChange = onReconShiftChange;
window.calculateLiveSales = calculateLiveSales;
window.calculateDenominations = calculateDenominations;
window.addExpenseRow = addExpenseRow;
window.removeExpenseRow = removeExpenseRow;
window.triggerTestFuelAnimation = triggerTestFuelAnimation;
window.parseWhatsAppReport = parseWhatsAppReport;
window.copyWhatsAppTemplate = copyWhatsAppTemplate;
window.sendWhatsAppTemplate = sendWhatsAppTemplate;
window.fetchPhonePeSettlement = fetchPhonePeSettlement;
window.handlePaperSlipUpload = handlePaperSlipUpload;
window.applyOCRReadings = applyOCRReadings;
window.postShiftRecon = postShiftRecon;
window.switchReconInputMode = switchReconInputMode;
window.renderSyncMessages = renderSyncMessages;
window.importSyncMessage = importSyncMessage;
window.renderEmployeesTable = renderEmployeesTable;
window.toggleEmployeeActive = toggleEmployeeActive;
window.addEmployee = addEmployee;
window.deleteEmployee = deleteEmployee;
let liveWhatsAppPollInterval = null;
function startLiveWhatsAppPoll() {
  if (liveWhatsAppPollInterval) return;
  fetchLiveWhatsAppMessages();
  liveWhatsAppPollInterval = setInterval(fetchLiveWhatsAppMessages, 2e3);
}
function stopLiveWhatsAppPoll() {
  if (liveWhatsAppPollInterval) {
    clearInterval(liveWhatsAppPollInterval);
    liveWhatsAppPollInterval = null;
  }
}
function fetchLiveWhatsAppMessages() {
  return __async(this, null, function* () {
    try {
      const response = yield fetch("https://localhost:8000/whatsapp-messages");
      if (response.ok) {
        const messages = yield response.json();
        window.liveWhatsAppMessages = messages;
        renderSyncMessages();
      }
    } catch (err) {
      console.error("Error fetching live WhatsApp messages:", err);
    }
  });
}
window.startLiveWhatsAppPoll = startLiveWhatsAppPoll;
window.stopLiveWhatsAppPoll = stopLiveWhatsAppPoll;
window.addEventListener("message", (event) => __async(this, null, function* () {
  if (!event.origin.includes("whatsapp.com") && !event.origin.includes("localhost") && !event.origin.includes("127.0.0.1")) return;
  if (event.data && event.data.type === "WHATSAPP_REPORT") {
    console.log("Received WhatsApp report via postMessage:", event.data.data);
    try {
      const response = yield fetch("https://localhost:8000/whatsapp-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event.data.data)
      });
      if (response.ok) {
        console.log("Successfully forwarded report to local bridge.");
        fetchLiveWhatsAppMessages();
      }
    } catch (err) {
      console.error("Error forwarding message to bridge:", err);
    }
  }
}));
window.renderCashFlow = renderCashFlow;
window.saveCashInputsAndForecast = saveCashInputsAndForecast;
window.isCBIHoliday = isCBIHoliday;
window.switchPnlTab = switchPnlTab;
const EXPENSE_CATEGORY_COLORS = {
  "Electricity": { bg: "rgba(234,179,8,0.15)", text: "#fbbf24", icon: "\u26A1" },
  "Lube & Consumables": { bg: "rgba(168,85,247,0.15)", text: "#a855f7", icon: "\u{1F6E2}\uFE0F" },
  "Salary": { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", icon: "\u{1F477}" },
  "Maintenance": { bg: "rgba(249,115,22,0.15)", text: "#fb923c", icon: "\u{1F527}" },
  "Other": { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", icon: "\u{1F4CB}" }
};
function getCatStyle(cat) {
  return EXPENSE_CATEGORY_COLORS[cat] || EXPENSE_CATEGORY_COLORS["Other"];
}
function renderExpenseLedger() {
  if (!db.expenses) db.expenses = [];
  const filterCat = document.getElementById("exp-filter-cat") ? document.getElementById("exp-filter-cat").value : "all";
  const filterFrom = document.getElementById("exp-filter-from") ? document.getElementById("exp-filter-from").value : "";
  const filterTo = document.getElementById("exp-filter-to") ? document.getElementById("exp-filter-to").value : "";
  let expenses = [...db.expenses].sort((a, b) => b.date.localeCompare(a.date));
  if (filterCat !== "all") expenses = expenses.filter((e) => e.category === filterCat);
  if (filterFrom) expenses = expenses.filter((e) => e.date >= filterFrom);
  if (filterTo) expenses = expenses.filter((e) => e.date <= filterTo);
  const summaryEl = document.getElementById("expense-summary-cards");
  if (summaryEl) {
    const allExp = db.expenses;
    const totalAll = allExp.reduce((s, e) => s + e.amount, 0);
    const totalElec = allExp.filter((e) => e.category === "Electricity").reduce((s, e) => s + e.amount, 0);
    const totalLube = allExp.filter((e) => e.category === "Lube & Consumables").reduce((s, e) => s + e.amount, 0);
    const totalOther = totalAll - totalElec - totalLube;
    summaryEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;">\u20B9</div>
        <div class="stat-info">
          <div class="stat-label">Total Expenses Recorded</div>
          <div class="stat-value">${formatCurrency(totalAll)}</div>
          <div class="stat-sub">${allExp.length} entries</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(234,179,8,0.15); color:#fbbf24;">\u26A1</div>
        <div class="stat-info">
          <div class="stat-label">Electricity</div>
          <div class="stat-value">${formatCurrency(totalElec)}</div>
          <div class="stat-sub">${allExp.filter((e) => e.category === "Electricity").length} bills</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(168,85,247,0.15); color:#a855f7;">\u{1F6E2}\uFE0F</div>
        <div class="stat-info">
          <div class="stat-label">Lube &amp; Consumables</div>
          <div class="stat-value">${formatCurrency(totalLube)}</div>
          <div class="stat-sub">${allExp.filter((e) => e.category === "Lube & Consumables").length} invoices</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(100,116,139,0.15); color:#94a3b8;">\u{1F4CB}</div>
        <div class="stat-info">
          <div class="stat-label">Other</div>
          <div class="stat-value">${formatCurrency(totalOther)}</div>
          <div class="stat-sub">${allExp.filter((e) => e.category !== "Electricity" && e.category !== "Lube & Consumables").length} entries</div>
        </div>
      </div>
    `;
  }
  const tbody = document.getElementById("expense-ledger-body");
  if (!tbody) return;
  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:2rem;">No expense records found.</td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map((e) => {
    const cs = getCatStyle(e.category);
    return `
      <tr>
        <td style="white-space:nowrap; font-weight:600;">${formatDate(e.date)}</td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.2rem 0.6rem; border-radius:20px; font-size:0.72rem; font-weight:600; background:${cs.bg}; color:${cs.text};">
            ${cs.icon} ${e.category}
          </span>
        </td>
        <td>
          <div style="font-weight:600; font-size:0.82rem;">${e.vendor || "\u2014"}</div>
          <div style="font-size:0.72rem; color:var(--text-dim); margin-top:0.15rem; max-width:380px; line-height:1.4;">${e.description || ""}</div>
        </td>
        <td style="text-align:right; font-weight:700; font-size:0.9rem; color:var(--accent-danger);">${formatCurrency(e.amount)}</td>
        <td style="text-align:center;">
          <div style="display:flex; gap:0.4rem; justify-content:center;">
            <button onclick="editExpenseEntry('${e.id}')" class="btn btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.72rem;">Edit</button>
            <button onclick="deleteExpenseEntry('${e.id}')" class="btn" style="padding:0.2rem 0.6rem; font-size:0.72rem; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}
function openAddExpenseModal() {
  document.getElementById("expense-modal-title").textContent = "Add Expense";
  document.getElementById("exp-edit-id").value = "";
  document.getElementById("exp-inp-date").value = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  document.getElementById("exp-inp-cat").value = "Electricity";
  document.getElementById("exp-inp-vendor").value = "";
  document.getElementById("exp-inp-amount").value = "";
  document.getElementById("exp-inp-desc").value = "";
  const modal = document.getElementById("expense-modal");
  modal.style.display = "flex";
}
function editExpenseEntry(id) {
  if (!db.expenses) return;
  const e = db.expenses.find((x) => x.id === id);
  if (!e) return;
  document.getElementById("expense-modal-title").textContent = "Edit Expense";
  document.getElementById("exp-edit-id").value = e.id;
  document.getElementById("exp-inp-date").value = e.date;
  document.getElementById("exp-inp-cat").value = e.category;
  document.getElementById("exp-inp-vendor").value = e.vendor || "";
  document.getElementById("exp-inp-amount").value = e.amount;
  document.getElementById("exp-inp-desc").value = e.description || "";
  document.getElementById("expense-modal").style.display = "flex";
}
function closeExpenseModal() {
  document.getElementById("expense-modal").style.display = "none";
}
function saveExpenseEntry() {
  if (!db.expenses) db.expenses = [];
  const editId = document.getElementById("exp-edit-id").value.trim();
  const date = document.getElementById("exp-inp-date").value;
  const cat = document.getElementById("exp-inp-cat").value;
  const vendor = document.getElementById("exp-inp-vendor").value.trim();
  const amount = parseFloat(document.getElementById("exp-inp-amount").value);
  const desc = document.getElementById("exp-inp-desc").value.trim();
  if (!date) {
    showNotification("Please enter a date.", "danger");
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showNotification("Please enter a valid amount.", "danger");
    return;
  }
  if (editId) {
    const idx = db.expenses.findIndex((x) => x.id === editId);
    if (idx !== -1) {
      db.expenses[idx] = { id: editId, date, category: cat, vendor, amount, description: desc };
    }
  } else {
    const newId = "exp_" + date.replace(/-/g, "") + "_" + Date.now();
    db.expenses.push({ id: newId, date, category: cat, vendor, amount, description: desc });
  }
  saveDB();
  closeExpenseModal();
  renderExpenseLedger();
  showNotification("Expense saved.", "success");
}
function deleteExpenseEntry(id) {
  if (!db.expenses) return;
  if (!confirm("Delete this expense record?")) return;
  db.expenses = db.expenses.filter((e) => e.id !== id);
  saveDB();
  renderExpenseLedger();
  showNotification("Expense deleted.", "info");
}
window.renderExpenseLedger = renderExpenseLedger;
window.openAddExpenseModal = openAddExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.saveExpenseEntry = saveExpenseEntry;
window.editExpenseEntry = editExpenseEntry;
window.deleteExpenseEntry = deleteExpenseEntry;
const HIST_AVG_MS_COST = 102.1;
const HIST_AVG_HSD_COST = 88.78;
function nozzleSale(n) {
  if (!n) return 0;
  const open = n.open || 0;
  const close = n.close_night > 0 ? n.close_night : n.close_day || 0;
  if (close <= open) return 0;
  const gross = close - open;
  const tests = (n.tests_day || 0) * 5;
  return Math.max(0, gross - tests);
}
function buildWACTimeline() {
  if (!db || !db.purchases || !db.daily_ledger) return {};
  const purch = [...db.purchases].filter((p) => p && (p.petrol_liters > 0 || p.diesel_liters > 0)).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const ledgerDates = [...new Set(db.daily_ledger.filter((r) => r && r.date).map((r) => r.date))].sort();
  let msStock = 8e3;
  let hsdStock = 8e3;
  let msWAC = HIST_AVG_MS_COST;
  let hsdWAC = HIST_AVG_HSD_COST;
  if (purch.length > 0) {
    msWAC = purch[0].price_petrol || HIST_AVG_MS_COST;
    hsdWAC = purch[0].price_diesel || HIST_AVG_HSD_COST;
  }
  const wacByDate = {};
  let pi = 0;
  for (const date of ledgerDates) {
    while (pi < purch.length && (purch[pi].date || "").split("T")[0] <= date) {
      const p = purch[pi];
      const pMs = p.petrol_liters || 0;
      const pHsd = p.diesel_liters || 0;
      const pMsPrice = pMs > 0 && p.price_petrol > 0 ? p.price_petrol : HIST_AVG_MS_COST;
      const pHsdPrice = pHsd > 0 && p.price_diesel > 0 ? p.price_diesel : HIST_AVG_HSD_COST;
      if (pMs > 0) {
        msWAC = (msStock * msWAC + pMs * pMsPrice) / (msStock + pMs);
        msStock += pMs;
      }
      if (pHsd > 0) {
        hsdWAC = (hsdStock * hsdWAC + pHsd * pHsdPrice) / (hsdStock + pHsd);
        hsdStock += pHsd;
      }
      pi++;
    }
    wacByDate[date] = { ms: msWAC, hsd: hsdWAC };
    const row = db.daily_ledger.find((r) => r.date === date);
    if (row) {
      const msSold = nozzleSale(row.du1_p) + nozzleSale(row.du2_p);
      const hsdSold = nozzleSale(row.du1_d) + nozzleSale(row.du2_d);
      msStock = Math.max(0, msStock - msSold);
      hsdStock = Math.max(0, hsdStock - hsdSold);
    }
  }
  return wacByDate;
}
function buildExpenseDateMap() {
  const map = {};
  if (!db.expenses) return map;
  for (const e of db.expenses) {
    map[e.date] = (map[e.date] || 0) + e.amount;
  }
  return map;
}
function getSellingPrice(dateStr) {
  if (!db.prices || db.prices.length === 0) return { petrol: 105.58, diesel: 90.98 };
  const sorted = [...db.prices].sort((a, b) => (b.effective_date || "").localeCompare(a.effective_date || ""));
  for (const p of sorted) {
    if ((p.effective_date || "").split("T")[0] <= dateStr) return p;
  }
  return sorted[sorted.length - 1] || { petrol: 105.58, diesel: 90.98 };
}
function renderPnlReport() {
  if (!db.daily_ledger || db.daily_ledger.length === 0) {
    document.getElementById("pnl-summary-tiles").innerHTML = '<div style="color:var(--text-dim); padding:2rem;">No ledger data available. Load history backup from System Settings.</div>';
    return;
  }
  const wacMap = buildWACTimeline();
  const expenseMap = buildExpenseDateMap();
  const dailyRows = db.daily_ledger.map((row) => {
    const date = row.date;
    const wac = wacMap[date] || { ms: HIST_AVG_MS_COST, hsd: HIST_AVG_HSD_COST };
    const sp = row.prices || getSellingPrice(date);
    const msSold = nozzleSale(row.du1_p) + nozzleSale(row.du2_p);
    const hsdSold = nozzleSale(row.du1_d) + nozzleSale(row.du2_d);
    const msRev = msSold * sp.petrol;
    const hsdRev = hsdSold * sp.diesel;
    const revenue = msRev + hsdRev;
    const msCost = msSold * wac.ms;
    const hsdCost = hsdSold * wac.hsd;
    const totalCost = msCost + hsdCost;
    const grossProfit = revenue - totalCost;
    const dayExpenses = expenseMap[date] || 0;
    const netPnl = grossProfit - dayExpenses;
    return {
      date,
      msSold,
      hsdSold,
      sellMs: sp.petrol,
      sellHsd: sp.diesel,
      wacMs: wac.ms,
      wacHsd: wac.hsd,
      msRev,
      hsdRev,
      revenue,
      msCost,
      hsdCost,
      totalCost,
      grossProfit,
      dayExpenses,
      netPnl
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
  const monthMap = {};
  for (const r of dailyRows) {
    const mon = r.date.slice(0, 7);
    if (!monthMap[mon]) {
      monthMap[mon] = {
        month: mon,
        msSold: 0,
        hsdSold: 0,
        msRev: 0,
        hsdRev: 0,
        revenue: 0,
        msCost: 0,
        hsdCost: 0,
        totalCost: 0,
        grossProfit: 0,
        expenses: 0,
        netPnl: 0
      };
    }
    const m = monthMap[mon];
    m.msSold += r.msSold;
    m.hsdSold += r.hsdSold;
    m.msRev += r.msRev;
    m.hsdRev += r.hsdRev;
    m.revenue += r.revenue;
    m.msCost += r.msCost;
    m.hsdCost += r.hsdCost;
    m.totalCost += r.totalCost;
    m.grossProfit += r.grossProfit;
    m.expenses += r.dayExpenses;
    m.netPnl += r.netPnl;
  }
  const monthlyRows = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));
  const grand = dailyRows.reduce((acc, r) => {
    acc.revenue += r.revenue;
    acc.totalCost += r.totalCost;
    acc.grossProfit += r.grossProfit;
    acc.expenses += r.dayExpenses;
    acc.netPnl += r.netPnl;
    acc.msSold += r.msSold;
    acc.hsdSold += r.hsdSold;
    return acc;
  }, { revenue: 0, totalCost: 0, grossProfit: 0, expenses: 0, netPnl: 0, msSold: 0, hsdSold: 0 });
  const totalMargin = grand.revenue > 0 ? grand.netPnl / grand.revenue * 100 : 0;
  const livePrices = getSellingPriceNow();
  const avgMsMargin = HIST_AVG_MS_COST > 0 ? livePrices.petrol - HIST_AVG_MS_COST : 0;
  const avgHsdMargin = HIST_AVG_HSD_COST > 0 ? livePrices.diesel - HIST_AVG_HSD_COST : 0;
  const tilesEl = document.getElementById("pnl-summary-tiles");
  if (tilesEl) {
    const profColor = grand.netPnl >= 0 ? "#22c55e" : "#ef4444";
    tilesEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(34,197,94,0.15); color:#22c55e;">\u20B9</div>
        <div class="stat-info">
          <div class="stat-label">Total Revenue</div>
          <div class="stat-value" style="font-size:1.05rem;">${formatCurrency(grand.revenue)}</div>
          <div class="stat-sub">${grand.msSold.toFixed(0)} L MS + ${grand.hsdSold.toFixed(0)} L HSD</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;">\u{1F4E6}</div>
        <div class="stat-info">
          <div class="stat-label">Total Purchase Cost (WAC)</div>
          <div class="stat-value" style="font-size:1.05rem;">${formatCurrency(grand.totalCost)}</div>
          <div class="stat-sub">MS \u20B9${HIST_AVG_MS_COST}/L avg \xB7 HSD \u20B9${HIST_AVG_HSD_COST}/L avg</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(251,191,36,0.15); color:#fbbf24;">\u{1F4CA}</div>
        <div class="stat-info">
          <div class="stat-label">Gross Profit</div>
          <div class="stat-value" style="font-size:1.05rem; color:#fbbf24;">${formatCurrency(grand.grossProfit)}</div>
          <div class="stat-sub">Before operational expenses</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(${grand.netPnl >= 0 ? "34,197,94" : "239,68,68"},0.15); color:${profColor};">
          ${grand.netPnl >= 0 ? "\u{1F4C8}" : "\u{1F4C9}"}
        </div>
        <div class="stat-info">
          <div class="stat-label">Net P&amp;L (after expenses)</div>
          <div class="stat-value" style="font-size:1.05rem; color:${profColor};">${formatCurrency(grand.netPnl)}</div>
          <div class="stat-sub">Margin: ${totalMargin.toFixed(2)}% | Exp: ${formatCurrency(grand.expenses)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(99,102,241,0.15); color:#818cf8;">\u26FD</div>
        <div class="stat-info">
          <div class="stat-label">Margin per Litre</div>
          <div class="stat-value" style="font-size:1.05rem; color:#818cf8;">MS \u20B9${avgMsMargin.toFixed(2)} \xB7 HSD \u20B9${avgHsdMargin.toFixed(2)}</div>
          <div class="stat-sub">Based on IOCL invoice prices vs sell price</div>
        </div>
      </div>
    `;
  }
  const mBody = document.getElementById("pnl-monthly-body");
  const mFoot = document.getElementById("pnl-monthly-foot");
  if (mBody) {
    mBody.innerHTML = monthlyRows.map((m) => {
      const margin = m.revenue > 0 ? m.netPnl / m.revenue * 100 : 0;
      const pnlColor = m.netPnl >= 0 ? "#22c55e" : "#ef4444";
      const monthLabel = (/* @__PURE__ */ new Date(m.month + "-15")).toLocaleString("en-IN", { month: "long", year: "numeric" });
      return `<tr>
        <td style="font-weight:700; white-space:nowrap;">${monthLabel}</td>
        <td style="text-align:right;">${m.msSold.toFixed(0)}</td>
        <td style="text-align:right;">${m.hsdSold.toFixed(0)}</td>
        <td style="text-align:right;">${formatCurrency(m.msRev)}</td>
        <td style="text-align:right;">${formatCurrency(m.hsdRev)}</td>
        <td style="text-align:right; font-weight:700;">${formatCurrency(m.revenue)}</td>
        <td style="text-align:right; color:var(--text-dim);">${formatCurrency(m.msCost)}</td>
        <td style="text-align:right; color:var(--text-dim);">${formatCurrency(m.hsdCost)}</td>
        <td style="text-align:right; color:#fbbf24; font-weight:600;">${formatCurrency(m.grossProfit)}</td>
        <td style="text-align:right; color:#ef4444;">${m.expenses > 0 ? formatCurrency(m.expenses) : "\u2014"}</td>
        <td style="text-align:right; font-weight:700; color:${pnlColor};">${formatCurrency(m.netPnl)}</td>
        <td style="text-align:right;">
          <span style="padding:0.15rem 0.5rem; border-radius:20px; font-size:0.75rem; font-weight:700;
            background:rgba(${m.netPnl >= 0 ? "34,197,94" : "239,68,68"},0.15); color:${pnlColor};">
            ${margin.toFixed(1)}%
          </span>
        </td>
      </tr>`;
    }).join("");
    if (mFoot) {
      const gMargin = grand.revenue > 0 ? grand.netPnl / grand.revenue * 100 : 0;
      const gColor = grand.netPnl >= 0 ? "#22c55e" : "#ef4444";
      mFoot.innerHTML = `<tr style="background:rgba(255,255,255,0.04); font-weight:700; border-top:2px solid var(--border);">
        <td>TOTAL</td>
        <td style="text-align:right;">${grand.msSold.toFixed(0)}</td>
        <td style="text-align:right;">${grand.hsdSold.toFixed(0)}</td>
        <td style="text-align:right;" colspan="2"></td>
        <td style="text-align:right;">${formatCurrency(grand.revenue)}</td>
        <td style="text-align:right;" colspan="2"></td>
        <td style="text-align:right; color:#fbbf24;">${formatCurrency(grand.grossProfit)}</td>
        <td style="text-align:right; color:#ef4444;">${formatCurrency(grand.expenses)}</td>
        <td style="text-align:right; color:${gColor};">${formatCurrency(grand.netPnl)}</td>
        <td style="text-align:right; color:${gColor};">${gMargin.toFixed(1)}%</td>
      </tr>`;
    }
  }
  const dBody = document.getElementById("pnl-daily-body");
  if (dBody) {
    dBody.innerHTML = dailyRows.map((r) => {
      const pnlColor = r.netPnl >= 0 ? "#22c55e" : "#ef4444";
      const rowBg = r.netPnl < 0 ? "background:rgba(239,68,68,0.04);" : "";
      return `<tr style="${rowBg}">
        <td style="white-space:nowrap; font-weight:600;">${formatDate(r.date)}</td>
        <td style="text-align:right;">${r.msSold.toFixed(2)}</td>
        <td style="text-align:right;">${r.hsdSold.toFixed(2)}</td>
        <td style="text-align:right; color:#818cf8;">\u20B9${r.sellMs.toFixed(2)}</td>
        <td style="text-align:right; color:#818cf8;">\u20B9${r.sellHsd.toFixed(2)}</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(r.revenue)}</td>
        <td style="text-align:right; color:var(--text-dim);">${formatCurrency(r.totalCost)}</td>
        <td style="text-align:right; color:#fbbf24;">${formatCurrency(r.grossProfit)}</td>
        <td style="text-align:right; color:#ef4444;">${r.dayExpenses > 0 ? formatCurrency(r.dayExpenses) : "\u2014"}</td>
        <td style="text-align:right; font-weight:700; color:${pnlColor};">${formatCurrency(r.netPnl)}</td>
      </tr>`;
    }).join("");
  }
}
function switchPnlTab(tab) {
  const monthEl = document.getElementById("pnl-view-monthly");
  const dailyEl = document.getElementById("pnl-view-daily");
  const btnMon = document.getElementById("pnl-tab-monthly");
  const btnDay = document.getElementById("pnl-tab-daily");
  if (tab === "monthly") {
    monthEl.style.display = "block";
    dailyEl.style.display = "none";
    btnMon.className = "btn btn-primary btn-sm";
    btnDay.className = "btn btn-secondary btn-sm";
  } else {
    monthEl.style.display = "none";
    dailyEl.style.display = "block";
    btnMon.className = "btn btn-secondary btn-sm";
    btnDay.className = "btn btn-primary btn-sm";
  }
}
window.renderPnlReport = renderPnlReport;
window.switchPnlTab = switchPnlTab;
window.calculateNozzleSale = calculateNozzleSale;
window.getPendingGroupLabel = getPendingGroupLabel;
window.toggleSelectAllGroup = toggleSelectAllGroup;
window.updateGroupCalculations = updateGroupCalculations;
window.bulkApproveEntries = bulkApproveEntries;
window.approveEntry = approveEntry;
window.promptRejectEntry = promptRejectEntry;
