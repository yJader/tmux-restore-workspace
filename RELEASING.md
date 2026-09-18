# 发布准备

维护者已于 2026-09-18 确认发布。GitHub 目标为公开仓库 `yJader/tmux-restore-workspace`；Visual Studio Marketplace 尚待登录并确定 publisher ID。

## 发布范围

以 `tmux-restore-workspace/` 作为独立仓库根目录，仅发布本插件，不包含并列的 `copy-worktree-path/`。

GitHub 包含源码、测试、文档、许可证和打包配置。VSIX 可作为 GitHub Release 附件，不提交到源码仓库。

## 待确认的信息

- Visual Studio Marketplace 已注册的 publisher ID。

GitHub 维护者：JiangJie Zhang（yJader）。在正式 publisher 确定前，GitHub Release 的 VSIX 使用 `local` 标识；它不是已上架的市场版本。

原插件来源引用 [FFDFFD.tmux-restore-all](https://marketplace.visualstudio.com/items?itemName=FFDFFD.tmux-restore-all)。未核实原作者源码仓库前，不填写猜测的上游仓库链接。

## 确认后的步骤

1. 把 `package.json` 的 `publisher: local` 改为实际 publisher ID，设置此版本维护者为 author，并在 contributors 中保留原作者 FFD 的署名。保留 LICENSE.txt 原始版权声明。
2. 用实际仓库 URL 填写 `repository`、`homepage`、`bugs`，更新 README 的正式插件 ID、安装方式及发布状态。
3. 确认版本号和 CHANGELOG 发布日期，同步打包脚本中的安装包版本号。
4. 运行测试、打包并检查 VSIX 清单，在 VS Code 中验证安装及恢复。若声明 Remote SSH 已实测，先完成真实远端验证。
5. 按确认的目标创建或连接 GitHub 仓库，提交并推送源码。
6. 使用实际 publisher 授权发布到 Visual Studio Marketplace，核对原插件引用、许可和安装信息。
7. 创建 GitHub Release 并附带 VSIX，记录两个实际发布链接。

切换正式 publisher 后插件 ID 会变化。已有本地版本用户应卸载 `local.tmux-restore-workspace` 再安装正式版，避免两个衍生版本同时运行；原版也应保持禁用。

认证信息通过本机凭据或环境变量提供，不写入源码、文档或仓库。
