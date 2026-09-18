const path = require("node:path");
const fs = require("node:fs");

function canonicalPath(value) {
  if (!value || !path.isAbsolute(value)) return undefined;
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function belongsToWorkspace(directory, roots) {
  const candidate = canonicalPath(directory);
  if (!candidate) return false;
  return roots.some((root) => {
    const relative = path.relative(root, candidate);
    return relative === "" || (relative !== ".."
      && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  });
}

function parseWorkspaceSessions(output, directories) {
  const roots = directories.map(canonicalPath).filter(Boolean);
  const sessions = new Map();
  // One row per pane; session_path retains the session's original directory.
  for (const row of output.split(/\r?\n/).filter(Boolean)) {
    const [id, name, windows, attached, origin, current] = row.split("\t");
    if (!/^\$\d+$/.test(id) || !name) continue;
    if (!belongsToWorkspace(origin, roots) && !belongsToWorkspace(current, roots)) continue;
    sessions.set(id, {
      id, name,
      windows: Number.parseInt(windows, 10) || 0,
      attached: Number.parseInt(attached, 10) || 0,
    });
  }
  return [...sessions.values()];
}

module.exports = { parseWorkspaceSessions };
