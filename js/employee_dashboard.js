function initEmployeeDatePicker() {
  const dayEl = document.getElementById("emp-date-day");
  const monthEl = document.getElementById("emp-date-month");
  const yearEl = document.getElementById("emp-date-year");
  if (!dayEl || !monthEl || !yearEl) return;
  if (dayEl.children.length > 0) return;
  let daysHtml = "";
  for (let i = 1; i <= 31; i++) {
    daysHtml += `<option value="${i}">${i}</option>`;
  }
  dayEl.innerHTML = daysHtml;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let monthsHtml = "";
  months.forEach((m, idx) => {
    monthsHtml += `<option value="${idx + 1}">${m}</option>`;
  });
  monthEl.innerHTML = monthsHtml;
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  let yearsHtml = "";
  for (let y = currentYear; y >= currentYear - 2; y--) {
    yearsHtml += `<option value="${y}">${y}</option>`;
  }
  yearEl.innerHTML = yearsHtml;
  const today = /* @__PURE__ */ new Date();
  dayEl.value = today.getDate();
  monthEl.value = today.getMonth() + 1;
  yearEl.value = today.getFullYear();
}
function updateEmpSubmissionTypeView() {
  var _a;
  const type = (_a = document.getElementById("emp-submission-type")) == null ? void 0 : _a.value;
  const nozzleSection = document.getElementById("emp-nozzle-section");
  const phonepeSection = document.getElementById("emp-phonepe-section");
  const cashSection = document.getElementById("emp-cash-section");
  const depositSection = document.getElementById("emp-deposit-section");
  const liveTotals = document.getElementById("emp-live-totals");
  if (type === "deposit") {
    if (nozzleSection) nozzleSection.style.display = "none";
    if (phonepeSection) phonepeSection.style.display = "none";
    if (cashSection) cashSection.style.display = "none";
    if (liveTotals) liveTotals.style.display = "none";
    if (depositSection) depositSection.style.display = "flex";
  } else {
    if (nozzleSection) nozzleSection.style.display = "flex";
    if (phonepeSection) phonepeSection.style.display = "flex";
    if (cashSection) cashSection.style.display = "flex";
    if (depositSection) depositSection.style.display = "none";
    updateEmpLiveCalc();
  }
}
