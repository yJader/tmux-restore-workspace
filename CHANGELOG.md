# Changelog

## 1.0.5 - 2026-11-22

- 自动从扩展宿主的 `PATH` 和常见安装目录选择能连接当前 tmux server 的客户端，修复 Remote SSH 下旧版客户端无法列举会话的问题。
- 列举、附加、重命名和终止会话使用探测到的客户端。自定义安装可通过 `tmuxRestoreWorkspace.tmuxPath` 指定绝对路径。

## 1.0.4 - 2026-11-19

- 修复远程窗口断线重载后重复打开 tmux 终端标签的问题。远程窗口中的新标签由扩展重新附加到原有 tmux 会话。
- 升级后，在终端面板关闭旧版创建的 tmux 标签，再运行 `Tmux Workspace: Restore Workspace Sessions`，即可换成新版标签。

## 1.0.3 - 2026-10-20

- 修复 tmux server 未启动时错误提示无法列举 session 的问题；现在会正常提示当前工作区没有 session。

## 1.0.2 - 2026-10-17

- 修复恢复工作区 tmux 会话后无法正确转发终端通知的问题。
- 使用 VS Code 默认 Shell 创建终端，再执行 `tmux attach-session`，确保 Shell Integration 可用。

## 1.0.1 - 2026-09-18

- 将 publisher 从本地开发标识 `local` 改为实际发布者 `jader`，修复 Marketplace 上传时的发布者不匹配错误。
- 插件 ID 改为 `jader.tmux-restore-workspace`；安装前需停用或卸载旧的 `local` 版本。
- 打包文件名自动跟随版本号，功能保持不变。

## 1.0.0 - 2026-09-18

基于 [Tmux Restore All 1.2.0](https://marketplace.visualstudio.com/items?itemName=FFDFFD.tmux-restore-all)（FFDFFD / FFD）的独立维护版本。

### 新增与调整

- 按会话创建目录或任一窗格当前目录过滤工作区相关会话。
- 自动恢复、批量恢复和侧栏使用统一过滤规则。
- 支持多文件夹工作区、符号链接及目录边界匹配；无工作区时不恢复。
- 使用独立插件 ID 和命令、视图前缀。
- 打开、重命名及终止会话使用精确名称匹配，避免 tmux 前缀匹配误选。
- 添加过滤、恢复流程测试及独立 tmux 服务器集成验证。

### 继承自原插件

- 自动恢复、批量恢复、会话侧栏与恢复快捷键。
- 当前 VS Code 窗口内的已有终端复用；不提供跨窗口去重。
- 打开或聚焦、重命名及终止会话。
- 原始 MIT 许可证与作者版权声明。
