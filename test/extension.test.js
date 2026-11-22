const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pathTmux = "/toolchain/bin/tmux";
const home = "/home/test user";
const userTmux = path.join(home, ".local", "opt", "tmux", "bin", "tmux");

function createExtensionHost({
  remoteName = "ssh-remote",
  executables = [pathTmux],
  incompatible = [],
  configured = "",
} = {}) {
  const commands = new Map();
  const terminals = [];
  const sentCommands = [];
  const informationMessages = [];
  const errorMessages = [];
  const calls = [];
  let startup;
  let provider;
  let tmuxServerAvailable = true;
  let sessionName = "ours";
  const vscode = {
    TreeItem: class {}, ThemeIcon: class {},
    TreeItemCollapsibleState: { None: 0 }, TerminalLocation: { Panel: 1 },
    StatusBarAlignment: { Left: 1 },
    EventEmitter: class { event() {} fire() {} dispose() {} },
    env: { remoteName },
    workspace: {
      workspaceFolders: [{
        uri: { scheme: remoteName ? "vscode-remote" : "file", fsPath: "/projects/app" },
      }],
      onDidChangeWorkspaceFolders() {},
      onDidChangeConfiguration() {},
      getConfiguration: () => ({ get: () => configured }),
    },
    window: {
      terminals,
      createStatusBarItem: () => ({ show() {} }),
      registerTreeDataProvider: (_id, value) => { provider = value; },
      onDidCloseTerminal() {},
      showInformationMessage: (message) => informationMessages.push(message),
      showErrorMessage: (message) => errorMessages.push(message),
      showWarningMessage: async () => "Kill Session",
      showInputBox: async () => "renamed",
      createTerminal: (options) => {
        const terminal = {
          ...options,
          show() {},
          dispose: () => terminals.splice(terminals.indexOf(terminal), 1),
          sendText: (command) => sentCommands.push(command),
        };
        terminals.push(terminal);
        return terminal;
      },
    },
    commands: {
      registerCommand: (id, callback) => commands.set(id, callback),
      executeCommand: async () => {},
    },
  };
  const sandbox = {
    module: { exports: {} }, console,
    process: { env: { PATH: path.dirname(pathTmux) } },
    setTimeout: (callback) => { startup = callback; return 1; }, clearTimeout() {},
    require: (name) => {
      if (name === "vscode") return vscode;
      if (name === "./workspace-sessions") return require("../workspace-sessions");
      if (name === "os") return { homedir: () => home };
      if (name === "fs/promises") {
        return { access: async (file) => {
          if (!executables.includes(file)) throw new Error("File is not executable");
        } };
      }
      if (name === "fs" || name === "path") return require(name);
      assert.equal(name, "child_process");
      return { execFile: (bin, args, _options, done) => {
        calls.push([bin, ...args]);
        if (incompatible.includes(bin)) {
          done(new Error("Command failed"), "", "server exited unexpectedly");
          return;
        }
        if (args[0] === "rename-session" || args[0] === "kill-session") {
          assert.equal(args[2], `=${sessionName}`);
          if (args[0] === "rename-session") sessionName = args[3];
          done(null, "", "");
          return;
        }
        assert.equal(args[0], "list-panes");
        if (!tmuxServerAvailable) {
          const message = "error connecting to /tmp/tmux-1017/default (No such file or directory)";
          done(Object.assign(new Error(message), { code: 1 }), "", message);
          return;
        }
        done(null, `$0\t${sessionName}\t1\t0\t/projects/app\t/tmp\n$1\tother\t1\t0\t/elsewhere\t/tmp`, "");
      } };
    },
  };
  return {
    commands,
    terminals,
    sentCommands,
    informationMessages,
    errorMessages,
    calls,
    vscode,
    get provider() { return provider; },
    stopTmuxServer() { tmuxServerAvailable = false; },
    async start() {
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../extension.js"), "utf8"), sandbox);
      sandbox.module.exports.activate({ subscriptions: [] });
      startup();
      await new Promise(setImmediate);
    },
    stop() { sandbox.module.exports.deactivate(); },
  };
}

test("startup, sidebar and restore command share filtering; empty workspaces do not run tmux", async () => {
  const host = createExtensionHost();
  const { commands, terminals, sentCommands, informationMessages, vscode } = host;
  await host.start();
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].name, "ours");
  assert.equal(terminals[0].shellPath, undefined);
  assert.equal(terminals[0].shellArgs, undefined);
  assert.deepEqual(sentCommands, [`'${pathTmux}' attach-session -t '=ours'`]);
  assert.equal((await host.provider.getChildren()).length, 1);
  await commands.get("tmuxRestoreWorkspace.openAll")();
  assert.equal(terminals.length, 1);
  await commands.get("tmuxRestoreWorkspace.openSession")("other");
  assert.equal(terminals.length, 1);
  host.stopTmuxServer();
  assert.equal((await host.provider.getChildren()).length, 0);
  await commands.get("tmuxRestoreWorkspace.openAll")();
  assert.equal(
    informationMessages.at(-1),
    "No tmux sessions belong to the current workspace.",
  );
  const previousCalls = host.calls.length;
  vscode.workspace.workspaceFolders = [];
  await commands.get("tmuxRestoreWorkspace.openAll")();
  assert.equal(host.calls.length, previousCalls);
  host.stop();
});

test("remote reload restores one tmux terminal even when VS Code revives terminals late", async () => {
  const originalHost = createExtensionHost();
  await originalHost.start();
  const [originalTerminal] = originalHost.terminals;
  originalHost.stop();

  const reconnectedHost = createExtensionHost();
  await reconnectedHost.start();
  // VS Code only revives persistent terminals. Model its replay arriving
  // after the reconnected extension host has already run startup restore.
  if (!originalTerminal.isTransient) {
    reconnectedHost.terminals.push(originalTerminal);
  }

  assert.deepEqual(reconnectedHost.terminals.map((terminal) => terminal.name), ["ours"]);
  assert.deepEqual(reconnectedHost.sentCommands, [`'${pathTmux}' attach-session -t '=ours'`]);
  reconnectedHost.stop();
});

test("startup reuses an existing terminal in the current remote window", async () => {
  const host = createExtensionHost();
  const existingTerminal = { name: "ours", show() {} };
  host.terminals.push(existingTerminal);

  await host.start();

  assert.deepEqual(host.terminals, [existingTerminal]);
  assert.deepEqual(host.sentCommands, []);
  host.stop();
});

test("local tmux terminals still support VS Code persistence", async () => {
  const host = createExtensionHost({ remoteName: null });
  await host.start();

  assert.equal(host.terminals[0].isTransient, false);
  host.stop();
});

test("a compatible user-installed tmux handles listing, attachment, rename and kill", async () => {
  const host = createExtensionHost({
    executables: [pathTmux, userTmux],
    incompatible: [pathTmux],
  });
  await host.start();
  assert.deepEqual(host.calls.map(([bin, command]) => [bin, command]), [
    [pathTmux, "list-panes"],
    [userTmux, "list-panes"],
  ]);
  assert.deepEqual(host.sentCommands, [`'${userTmux}' attach-session -t '=ours'`]);

  host.terminals[0].dispose();
  await host.commands.get("tmuxRestoreWorkspace.openSession")("ours");
  assert.equal(host.sentCommands.at(-1), `'${userTmux}' attach-session -t '=ours'`);
  await host.commands.get("tmuxRestoreWorkspace.renameSession")("ours");
  await host.commands.get("tmuxRestoreWorkspace.killSession")("renamed");
  assert.deepEqual(host.calls.filter(([, command]) => command !== "list-panes"), [
    [userTmux, "rename-session", "-t", "=ours", "renamed"],
    [userTmux, "kill-session", "-t", "=renamed"],
  ]);
  assert.equal(host.terminals.length, 0);
  assert.deepEqual(host.errorMessages, []);
  host.stop();
});

test("the machine setting overrides discovery for a custom tmux path", async () => {
  const configured = "/custom builds/tmux";
  const host = createExtensionHost({ configured });
  await host.start();

  assert.deepEqual(host.calls.map(([bin]) => bin), [configured]);
  assert.deepEqual(host.sentCommands, [`'${configured}' attach-session -t '=ours'`]);
  host.stop();
});
