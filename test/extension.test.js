const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("startup, sidebar and restore command share filtering; empty workspaces do not run tmux", async () => {
  const commands = new Map();
  const terminals = [];
  let startup;
  let provider;
  let calls = 0;
  const vscode = {
    TreeItem: class {}, ThemeIcon: class {},
    TreeItemCollapsibleState: { None: 0 }, TerminalLocation: { Panel: 1 },
    StatusBarAlignment: { Left: 1 },
    EventEmitter: class { event() {} fire() {} dispose() {} },
    workspace: {
      workspaceFolders: [{ uri: { scheme: "vscode-remote", fsPath: "/projects/app" } }],
      onDidChangeWorkspaceFolders() {},
    },
    window: {
      terminals,
      createStatusBarItem: () => ({ show() {} }),
      registerTreeDataProvider: (_id, value) => { provider = value; },
      onDidCloseTerminal() {}, showInformationMessage() {},
      createTerminal: (options) => {
        const terminal = { ...options, show() {} };
        terminals.push(terminal);
        return terminal;
      },
    },
    commands: { registerCommand: (id, callback) => commands.set(id, callback) },
  };
  const sandbox = {
    module: { exports: {} }, console,
    setTimeout: (callback) => { startup = callback; return 1; }, clearTimeout() {},
    require: (name) => {
      if (name === "vscode") return vscode;
      if (name === "./workspace-sessions") return require("../workspace-sessions");
      assert.equal(name, "child_process");
      return { execFile: (_bin, args, _options, done) => {
        calls++;
        assert.equal(args[0], "list-panes");
        done(null, "$0\tours\t1\t0\t/projects/app\t/tmp\n$1\tother\t1\t0\t/elsewhere\t/tmp", "");
      } };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../extension.js"), "utf8"), sandbox);
  sandbox.module.exports.activate({ subscriptions: [] });
  startup();
  await new Promise(setImmediate);
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].name, "ours");
  assert.equal(terminals[0].shellArgs[2], "=ours");
  assert.equal((await provider.getChildren()).length, 1);
  await commands.get("tmuxRestoreWorkspace.openAll")();
  assert.equal(terminals.length, 1);
  await commands.get("tmuxRestoreWorkspace.openSession")("other");
  assert.equal(terminals.length, 1);
  const previousCalls = calls;
  vscode.workspace.workspaceFolders = [];
  await commands.get("tmuxRestoreWorkspace.openAll")();
  assert.equal(calls, previousCalls);
  sandbox.module.exports.deactivate();
});
