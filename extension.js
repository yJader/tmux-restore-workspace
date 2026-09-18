const vscode = require("vscode");
const { execFile } = require("child_process");
const { parseWorkspaceSessions } = require("./workspace-sessions");

const COMMAND_OPEN_ALL = "tmuxRestoreWorkspace.openAll";
const COMMAND_OPEN_SESSION = "tmuxRestoreWorkspace.openSession";
const COMMAND_RENAME_SESSION = "tmuxRestoreWorkspace.renameSession";
const COMMAND_KILL_SESSION = "tmuxRestoreWorkspace.killSession";
const COMMAND_REFRESH = "tmuxRestoreWorkspace.refresh";
const VIEW_SESSIONS = "tmuxRestoreWorkspace.sessions";
const launchedTerminals = new Map();
let sessionProvider;
let autoRestoreTimer;

function listTmuxSessions() {
  const directories = (vscode.workspace.workspaceFolders || [])
    .filter((folder) => ["file", "vscode-remote"].includes(folder.uri.scheme))
    .map((folder) => folder.uri.fsPath);
  if (directories.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    execFile(
      "tmux",
      [
        "list-panes",
        "-a",
        "-F",
        "#{session_id}\t#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_path}\t#{pane_current_path}",
      ],
      { encoding: "utf8", timeout: 5000 },
      (error, stdout, stderr) => {
        if (error) {
          const message = `${stderr || error.message}`.trim();
          if (
            message.includes("no server running")
            || message.includes("no sessions")
          ) {
            resolve([]);
            return;
          }

          if (error.code === "ENOENT") {
            reject(new Error("tmux was not found on the workspace host."));
            return;
          }

          reject(new Error(message));
          return;
        }

        resolve(parseWorkspaceSessions(stdout, directories));
      },
    );
  });
}

function renameTmuxSession(oldName, newName) {
  return new Promise((resolve, reject) => {
    execFile(
      "tmux",
      ["rename-session", "-t", `=${oldName}`, newName],
      { encoding: "utf8", timeout: 5000 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }

        if (error.code === "ENOENT") {
          reject(new Error("tmux was not found on the workspace host."));
          return;
        }

        reject(new Error(`${stderr || error.message}`.trim()));
      },
    );
  });
}

function killTmuxSession(sessionName) {
  return new Promise((resolve, reject) => {
    execFile(
      "tmux",
      ["kill-session", "-t", `=${sessionName}`],
      { encoding: "utf8", timeout: 5000 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }

        if (error.code === "ENOENT") {
          reject(new Error("tmux was not found on the workspace host."));
          return;
        }

        reject(new Error(`${stderr || error.message}`.trim()));
      },
    );
  });
}

class TmuxSessionItem extends vscode.TreeItem {
  constructor(session) {
    super(session.name, vscode.TreeItemCollapsibleState.None);

    this.sessionName = session.name;
    const windowLabel = session.windows === 1 ? "window" : "windows";
    const attachLabel = session.attached > 0
      ? `${session.attached} attached`
      : "detached";

    this.description = `${session.windows} ${windowLabel} · ${attachLabel}`;
    this.tooltip = `${session.name} — click to open or focus`;
    this.iconPath = new vscode.ThemeIcon(
      session.attached > 0 ? "terminal" : "terminal-view-icon",
    );
    this.contextValue = "tmuxSession";
    this.command = {
      command: COMMAND_OPEN_SESSION,
      title: "Open tmux session",
      arguments: [session.name],
    };
  }
}

class TmuxSessionProvider {
  constructor() {
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
  }

  refresh() {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(item) {
    return item;
  }

  async getChildren(item) {
    if (item) {
      return [];
    }

    const sessions = await listTmuxSessions();
    return sessions.map((session) => new TmuxSessionItem(session));
  }

  dispose() {
    this.changeEmitter.dispose();
  }
}

function findOpenTerminal(sessionName) {
  const mappedTerminal = launchedTerminals.get(sessionName);

  if (mappedTerminal && vscode.window.terminals.includes(mappedTerminal)) {
    return mappedTerminal;
  }

  const matchingTerminal = vscode.window.terminals.find(
    (terminal) => terminal.name === sessionName,
  );
  if (matchingTerminal) {
    launchedTerminals.set(sessionName, matchingTerminal);
  }

  return matchingTerminal;
}

function createTmuxTerminal(sessionName) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const cwd = workspaceFolders && workspaceFolders.length > 0
    ? workspaceFolders[0].uri
    : undefined;

  const terminal = vscode.window.createTerminal({
    name: sessionName,
    shellPath: "tmux",
    shellArgs: ["attach-session", "-t", `=${sessionName}`],
    cwd,
    env: { TMUX: null },
    iconPath: new vscode.ThemeIcon("terminal-tmux"),
    location: vscode.TerminalLocation.Panel,
  });

  launchedTerminals.set(sessionName, terminal);
  return terminal;
}

function openTmuxSession(sessionName, show = true, refresh = true) {
  let terminal = findOpenTerminal(sessionName);
  const created = !terminal;

  if (!terminal) {
    terminal = createTmuxTerminal(sessionName);
  }

  if (show) {
    terminal.show(false);
  }

  if (refresh && sessionProvider) {
    sessionProvider.refresh();
  }
  return { terminal, created };
}

async function renameSession(target) {
  const oldName = typeof target === "string"
    ? target
    : target && (target.sessionName || target.label);

  if (!oldName) {
    vscode.window.showErrorMessage("Select a tmux session to rename.");
    return;
  }

  let sessions;
  try {
    sessions = await listTmuxSessions();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Unable to list tmux sessions: ${error.message}`,
    );
    return;
  }

  const existingNames = new Set(sessions.map((session) => session.name));
  if (!existingNames.has(oldName)) return;
  const newName = await vscode.window.showInputBox({
    prompt: `Rename tmux session "${oldName}"`,
    value: oldName,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) {
        return "Session name cannot be empty.";
      }
      if (value.includes(":") || value.includes(".")) {
        return "Tmux session names cannot contain ':' or '.'.";
      }
      if (value !== oldName && existingNames.has(value)) {
        return `A tmux session named "${value}" already exists.`;
      }
      return undefined;
    },
  });

  if (newName === undefined || newName === oldName) {
    return;
  }

  try {
    await renameTmuxSession(oldName, newName);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Unable to rename tmux session "${oldName}": ${error.message}`,
    );
    return;
  }

  const terminal = findOpenTerminal(oldName);
  launchedTerminals.delete(oldName);
  let terminalTitleSynced = true;
  if (terminal && vscode.window.terminals.includes(terminal)) {
    launchedTerminals.set(newName, terminal);
    try {
      terminal.show(false);
      await vscode.commands.executeCommand(
        "workbench.action.terminal.renameWithArg",
        { name: newName },
      );
    } catch (error) {
      terminalTitleSynced = false;
    }
  }

  if (sessionProvider) {
    sessionProvider.refresh();
  }

  if (terminalTitleSynced) {
    vscode.window.showInformationMessage(
      `Renamed tmux session "${oldName}" to "${newName}".`,
    );
  } else {
    vscode.window.showWarningMessage(
      `Renamed tmux session to "${newName}", but the open terminal tab `
        + "could not be retitled. Reopen the terminal to update its label.",
    );
  }
}

async function killSession(target) {
  const sessionName = typeof target === "string"
    ? target
    : target && (target.sessionName || target.label);

  if (!sessionName) {
    vscode.window.showErrorMessage("Select a tmux session to kill.");
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Kill tmux session "${sessionName}"? All processes in this session `
      + "will be terminated.",
    { modal: true },
    "Kill Session",
  );
  if (confirmation !== "Kill Session") {
    return;
  }

  try {
    if (!(await listTmuxSessions()).some((session) => session.name === sessionName)) return;
    await killTmuxSession(sessionName);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Unable to kill tmux session "${sessionName}": ${error.message}`,
    );
    return;
  }

  const terminal = findOpenTerminal(sessionName);
  launchedTerminals.delete(sessionName);
  if (terminal && vscode.window.terminals.includes(terminal)) {
    terminal.dispose();
  }

  if (sessionProvider) {
    sessionProvider.refresh();
  }
  vscode.window.showInformationMessage(
    `Killed tmux session "${sessionName}".`,
  );
}

async function openAllTmuxSessions() {
  let sessions;

  try {
    sessions = await listTmuxSessions();
  } catch (error) {
    vscode.window.showErrorMessage(
      `Unable to list tmux sessions: ${error.message}`,
    );
    return;
  }

  if (sessions.length === 0) {
    vscode.window.showInformationMessage("No tmux sessions belong to the current workspace.");
    return;
  }

  const opened = sessions.map(
    (session) => openTmuxSession(session.name, false, false),
  );
  opened[0].terminal.show(false);
  if (sessionProvider) {
    sessionProvider.refresh();
  }

  const created = opened.filter((result) => result.created).length;
  const reused = opened.length - created;
  const reusedDetails = reused > 0 ? `; reused ${reused} open terminal(s)` : "";
  vscode.window.showInformationMessage(
    `Opened ${created} tmux terminal(s)${reusedDetails}.`,
  );
}

function activate(context) {
  sessionProvider = new TmuxSessionProvider();

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "$(terminal-tmux) Restore workspace tmux";
  statusBarItem.tooltip = "Restore tmux sessions belonging to this workspace";
  statusBarItem.command = COMMAND_OPEN_ALL;
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    sessionProvider,
    vscode.window.registerTreeDataProvider(VIEW_SESSIONS, sessionProvider),
    vscode.commands.registerCommand(COMMAND_OPEN_ALL, openAllTmuxSessions),
    vscode.commands.registerCommand(
      COMMAND_OPEN_SESSION,
      async (target) => {
        const sessionName = typeof target === "string"
          ? target
          : target && (target.sessionName || target.label);
        if (!(await listTmuxSessions()).some((session) => session.name === sessionName)) return;
        return openTmuxSession(sessionName, true);
      },
    ),
    vscode.commands.registerCommand(COMMAND_RENAME_SESSION, renameSession),
    vscode.commands.registerCommand(COMMAND_KILL_SESSION, killSession),
    vscode.workspace.onDidChangeWorkspaceFolders(() => sessionProvider.refresh()),
    vscode.commands.registerCommand(
      COMMAND_REFRESH,
      () => sessionProvider.refresh(),
    ),
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [session, launchedTerminal] of launchedTerminals) {
        if (launchedTerminal === terminal) {
          launchedTerminals.delete(session);
          sessionProvider.refresh();
          break;
        }
      }
    }),
  );

  // Restore existing tmux sessions after the terminal API has initialized.
  autoRestoreTimer = setTimeout(() => {
    openAllTmuxSessions().catch((error) => {
      console.error("[tmux-restore-workspace] auto-restore failed:", error);
    });
  }, 500);
}

function deactivate() {
  if (autoRestoreTimer) {
    clearTimeout(autoRestoreTimer);
    autoRestoreTimer = undefined;
  }
  launchedTerminals.clear();
  sessionProvider = undefined;
}

module.exports = { activate, deactivate };
