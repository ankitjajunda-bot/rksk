function createSubmissionFingerprint(payload) {
  const normalized = JSON.stringify(payload);
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest) {
    return normalized;
  }
  return normalized;
}
function buildPendingSubmissionEntry({ session, submissionType, entryData, deviceId }) {
  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fingerprint = createSubmissionFingerprint({
    submittedBy: (session == null ? void 0 : session.username) || "unknown",
    submissionType,
    entryData,
    deviceId: deviceId || ""
  });
  return {
    id: submissionId,
    submittedBy: (session == null ? void 0 : session.username) || "unknown",
    submittedByName: (session == null ? void 0 : session.displayName) || (session == null ? void 0 : session.username) || "Unknown",
    submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
    locally_saved_at: (/* @__PURE__ */ new Date()).toISOString(),
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
  var _a;
  const pendingEntries = Array.isArray((_a = global.db) == null ? void 0 : _a.pending_entries) ? global.db.pending_entries : [];
  const fingerprint = createSubmissionFingerprint({
    submittedBy,
    submissionType,
    entryData
  });
  return pendingEntries.find((entry) => {
    if (!entry || !entry.submission_fingerprint) return false;
    return entry.submission_fingerprint === fingerprint && ["queued", "syncing", "pending", "pending_approval", "approved"].includes(entry.status);
  });
}
function getSubmissionDisplayStatus(entry) {
  const status = (entry == null ? void 0 : entry.status) || "queued";
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
