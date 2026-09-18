# Tmux Restore Workspace

只恢复当前 VS Code 工作区相关的 tmux 会话。

基于 [FFDFFD 的 Tmux Restore All 1.2.0](https://marketplace.visualstudio.com/items?itemName=FFDFFD.tmux-restore-all) 独立维护，保留原作者 FFD 的 MIT 版权声明及许可证，见 `LICENSE.txt`。

## 功能

- **按工作区过滤**：会话创建目录或任一窗格当前目录位于工作区内才会显示、恢复，支持子目录、多文件夹工作区和符号链接。
- **自动与手动恢复**：启动时恢复，也可通过侧栏、状态栏或命令手动恢复；没有打开工作区时不恢复。
- **终端复用**：保留原插件的当前窗口内去重功能，依据已记录的终端或同名终端复用，不跨窗口去重。
- 保留原插件的会话打开、重命名和终止功能。

## 安装使用

要求 VS Code 1.85+，工作区主机已安装 tmux 并可通过 `PATH` 找到。

1. 停用原插件 `FFDFFD.tmux-restore-all`；若装过本地版 `local.tmux-restore-workspace`，也需卸载或停用。
2. 从 [GitHub Releases](https://github.com/yJader/tmux-restore-workspace/releases) 下载 VSIX，通过 **Install from VSIX...** 安装，然后重新加载窗口。
3. 打开项目即可自动恢复，或执行 `Tmux Workspace: Restore Workspace Sessions`。

快捷键：macOS 为 `Cmd+Alt+R`，其他平台为 `Ctrl+Alt+R`。

Remote SSH 需在对应远端安装本插件并停用原版。

正式插件 ID：`jader.tmux-restore-workspace`。

## 注意

归属依据目录推断，跨项目会话可能出现在多个工作区。建议创建会话时指定项目目录：

```sh
tmux new-session -s my-project -c /absolute/project/path
```

仅支持默认 tmux socket，不会自动创建会话或关闭已有终端。
