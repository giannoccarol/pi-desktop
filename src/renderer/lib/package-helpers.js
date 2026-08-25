"use strict";
(function exposePackageHelpers(root) {
  function npmNameFromSource(source) {
    if (!source?.startsWith("npm:")) return null;
    let spec = source.slice(4);
    const versionAt = spec.lastIndexOf("@");
    if (versionAt > spec.indexOf("/")) spec = spec.slice(0, versionAt);
    else if (!spec.startsWith("@") && versionAt > 0) spec = spec.slice(0, versionAt);
    return spec;
  }
  function installedPackageNames(installedPackages) {
    const names = new Set();
    for (const entry of installedPackages || []) {
      const n = npmNameFromSource(entry.source);
      if (n) names.add(n);
    }
    return names;
  }
  function installedEntryForName(installedPackages, name) {
    return (installedPackages || []).find((e) => npmNameFromSource(e.source) === name) || null;
  }
  function formatDownloads(value) {
    const count = Number(value) || 0;
    if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e7 ? 0 : 1)}M`;
    if (count >= 1e3) return `${(count / 1e3).toFixed(count >= 1e5 ? 0 : 1)}K`;
    return count.toLocaleString("it-IT");
  }
  const api = { npmNameFromSource, installedPackageNames, installedEntryForName, formatDownloads };
  root.piPackageHelpers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
