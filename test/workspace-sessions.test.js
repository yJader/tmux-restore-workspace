const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseWorkspaceSessions } = require("../workspace-sessions");

test("filters origins and panes, respects directory boundaries and deduplicates sessions", () => {
  const output = [
    "$0\torigin\t2\t0\t/projects/app\t/tmp",
    "$0\torigin\t2\t0\t/projects/app\t/projects/app/src",
    "$1\tpane\t1\t1\t/tmp\t/projects/app/src",
    "$2\tother\t1\t0\t/projects/app-other\t/projects/app-other",
    "$3\tsecond-root\t1\t0\t/second\t/tmp",
    "$4\tparent\t1\t0\t/projects\t/tmp",
  ].join("\n");
  assert.deepEqual(parseWorkspaceSessions(output, ["/projects/app/", "/second"])
    .map((session) => session.name), ["origin", "pane", "second-root"]);
  assert.deepEqual(parseWorkspaceSessions(output, []), []);
});

test("real tmux lists only the matching workspace; symlink roots work", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-tmux-"));
  const socket = `workspace-test-${process.pid}`;
  const tmux = (...args) => execFileSync("tmux", ["-L", socket, "-f", "/dev/null", ...args], { encoding: "utf8" });
  t.after(() => {
    try { tmux("kill-server"); } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  const project = path.join(temp, "project with spaces");
  const other = `${project}-other`;
  const alias = path.join(temp, "alias");
  fs.mkdirSync(project);
  fs.mkdirSync(other);
  fs.symlinkSync(project, alias);
  tmux("new-session", "-d", "-s", "matching", "-c", project, "sleep 60");
  tmux("new-session", "-d", "-s", "unrelated", "-c", other, "sleep 60");
  const rows = tmux("list-panes", "-a", "-F",
    "#{session_id}\t#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_path}\t#{pane_current_path}");
  assert.deepEqual(parseWorkspaceSessions(rows, [alias]).map((s) => s.name), ["matching"]);
});
