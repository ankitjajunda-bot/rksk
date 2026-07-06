// ============================================================
// OctaneFlow Production Submission Flow (V1)
// ============================================================

function createSubmissionFingerprint(payload) {
  return JSON.stringify(payload);
}

function buildPendingSubmissionEntry({ session, submissionType, entryData, deviceId }) {
  const empId = (session && session.id) ? session.id : "unknown";
  const dateStr = (entryData && entryData.date) ? entryData.date.replace(/-/g, "") : new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const shiftStr = ((entryData && entryData.shift) ? entryData.shift : "DAY").toUpperCase();
  const typeStr = submissionType.toUpperCase();
  
  // Phase 6: Deterministic Submission ID
  const submissionId = `ENTRY_${empId}_${dateStr}_${shiftStr}_${typeStr}`;
  
  const fingerprint = createSubmissionFingerprint({
    submittedBy: (session && session.username) || "unknown",
    submissionType,
    entryData,
    deviceId: deviceId || ""
  });

  return {
    id: submissionId,
    submittedBy: (session && session.username) || "unknown",
    submittedByName: (session && session.displayName) || (session && session.username) || "Unknown",
    submittedAt: new Date().toISOString(),
    locally_saved_at: new Date().toISOString(),
    deviceId: deviceId || "",
    status: "queued",
    submission_type: submissionType,
    entryData,
    rejectionReason: "",
    reviewedBy: "",
    reviewedAt: "",
    submission_fingerprint: fingerprint,
    _dirty: true
  };
}

function findDuplicateSubmission({ submissionType, entryData, submittedBy }) {
  const activeDb = (typeof db !== "undefined") ? db : null;
  const pendingEntries = (activeDb && Array.isArray(activeDb.pending_entries)) ? activeDb.pending_entries : [];
  
  const fingerprint = createSubmissionFingerprint({
    submittedBy,
    submissionType,
    entryData
  });

  return pendingEntries.find((entry) => {
    if (!entry) return false;
    // Match by exact deterministic ID or matching fingerprint to prevent duplicate inserts
    const empId = entry.id ? entry.id.split('_')[1] : null;
    const dateStr = entryData.date ? entryData.date.replace(/-/g, "") : "";
    const shiftStr = entryData.shift ? entryData.shift.toUpperCase() : "";
    const typeStr = submissionType.toUpperCase();
    const targetId = `ENTRY_${empId}_${dateStr}_${shiftStr}_${typeStr}`;
    
    if (entry.id === targetId) return true;
    if (entry.submission_fingerprint === fingerprint && ["queued", "syncing", "pending", "pending_approval", "approved"].includes(entry.status)) return true;
    return false;
  });
}

function getSubmissionDisplayStatus(entry) {
  const status = (entry && entry.status) || "queued";
  const map = {
    queued: "Queued",
    syncing: "Syncing",
    pending: "Pending Approval",
    pending_approval: "Pending Approval",
    approved: "Approved",
    rejected: "Rejected",
    posted: "Posted",
    failed: "Failed",
    conflicted: "Conflicted"
  };
  return map[status] || "Queued";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildPendingSubmissionEntry,
    findDuplicateSubmission,
    getSubmissionDisplayStatus,
    createSubmissionFingerprint
  };
}
