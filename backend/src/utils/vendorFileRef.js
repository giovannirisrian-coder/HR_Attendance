/**
 * Serialize / parse vendor submission file references stored in DB.
 * New format: { path, name } where path is gcs:… or local:…
 * Legacy format: plain filename under uploads/documents/
 */

function serializeVendorFileRef({ storagePath, originalName }) {
  return JSON.stringify({
    path: storagePath,
    name: originalName || 'attachment',
  });
}

function parseVendorFileRef(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object' && val.path) {
    return {
      path: String(val.path),
      name: val.name ? String(val.name) : String(val.path),
      legacyLocal: Boolean(val.legacyLocal),
    };
  }
  const s = String(val);
  try {
    const j = JSON.parse(s);
    if (j && typeof j.path === 'string') {
      return {
        path: j.path,
        name: j.name ? String(j.name) : j.path,
        legacyLocal: false,
      };
    }
  } catch {
    /* legacy plain filename */
  }
  return { path: s, name: s, legacyLocal: true };
}

function parseOtherSupportingRefs(val) {
  if (val == null) return [];
  let arr = val;
  if (Buffer.isBuffer(val)) {
    try {
      arr = JSON.parse(val.toString('utf8'));
    } catch {
      return [];
    }
  } else if (typeof val === 'string') {
    try {
      arr = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => parseVendorFileRef(item)).filter(Boolean);
}

function otherSupportingToStored(refs) {
  return JSON.stringify(
    refs.map((r) => {
      const parsed = parseVendorFileRef(r);
      if (!parsed) return null;
      if (parsed.legacyLocal) return parsed.path;
      return { path: parsed.path, name: parsed.name };
    }).filter(Boolean)
  );
}

module.exports = {
  serializeVendorFileRef,
  parseVendorFileRef,
  parseOtherSupportingRefs,
  otherSupportingToStored,
};
