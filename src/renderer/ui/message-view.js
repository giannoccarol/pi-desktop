"use strict";
(function exposeMessageView(root) {
  function messageTime(value, t) {
    const tr = t || (root.i18n ? root.i18n.t : (k) => k);
    if (value == null) return { timestamp: null, label: tr("time.notAvailable") };
    let timestamp = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(timestamp)) timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return { timestamp: null, label: tr("time.notAvailable") };
    if (timestamp > 0 && timestamp < 1e12) timestamp *= 1000;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return { timestamp: null, label: tr("time.notAvailable") };
    return {
      timestamp,
      label: date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  }

  const USER_STATUS_DEFS = {
    sending: { rank: 0, key: "status.sending" },
    localQueued: { rank: 1, label: "in coda nell’app · non ancora inviato" },
    received: { rank: 1, key: "status.received" },
    queued: { rank: 1, key: "status.queued" },
    processing: { rank: 2, key: "status.processing" },
    retrying: { rank: 2, key: "status.retrying" },
    done: { rank: 3, key: "status.done" },
    historical: { rank: 3, key: "status.historical" },
    failed: { rank: 4, key: "status.failed" },
    interrupted: { rank: 4, key: "status.interrupted" },
    error: { rank: 4, key: "status.error" },
  };

  function getStatusMeta(status, t) {
    const tr = t || (root.i18n ? root.i18n.t : (k) => k);
    const def = USER_STATUS_DEFS[status];
    if (!def) return null;
    return { rank: def.rank, label: def.label || tr(def.key) };
  }

  function nextStatusAllowed(currentStatus, currentRank, nextStatus) {
    if (!USER_STATUS_DEFS[nextStatus]) return false;
    const next = USER_STATUS_DEFS[nextStatus];
    const reactivatingLocalQueue = currentStatus === "localQueued" && nextStatus === "sending";
    if (!reactivatingLocalQueue && nextStatus !== "error" && next.rank < currentRank) return false;
    return true;
  }

  const api = { messageTime, USER_STATUS_DEFS, getStatusMeta, nextStatusAllowed };
  root.piMessageView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
