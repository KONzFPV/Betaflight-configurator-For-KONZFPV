# 应用源码

[项目首页](../README.md) · [开发与构建](../docs/BUILDING.md) · [目录说明](../docs/REPOSITORY.md)

Vue 前端、Electron 桌面层、网络辅助程序和平台工程都位于本目录。内部文件保持原有相对位置。

从仓库根目录进入本目录后运行开发命令：

~~~powershell
cd app
pnpm install --frozen-lockfile
pnpm exec vite build
~~~

- src/：主界面与飞控配置。
- desktop/：Windows 桌面、DFU、网络和软件更新。
- test/：功能测试。
- resources/、assets/、libraries/、locales/：资源、依赖库和语言。
- android/、src-tauri/：保留的上游平台工程。
- scripts/、server/：工程脚本和网页服务端。

客户使用的完整免安装包在 [Releases](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases/latest)。
