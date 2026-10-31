# 仓库结构

[返回文档目录](README.md)

成品与源码分别存放：客户下载包、更新清单和对应源码归档在 [Releases](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases)；主分支保留可继续开发的完整工程。

## 常用入口

| 路径 | 用途 |
| --- | --- |
| [src/](../src) | Vue 主界面、飞控连接和配置逻辑 |
| [desktop/](../desktop) | 本项目 Windows Electron 层、DFU 工具、网络辅助程序、CF 更新和打包 |
| [test/](../test) | 前端及功能回归测试；桌面测试也位于 desktop/ |
| [docs/](.) | 使用、构建、发布、上游和历史资料 |
| [locales/](../locales) | 语言资源 |
| [resources/](../resources) | 离线 Wiki、主板资料和运行所需静态资源 |

## 其他工程目录

| 路径 | 用途 |
| --- | --- |
| [assets/](../assets)、[distribution/](../distribution) | 应用图标、平台发行资源 |
| [libraries/](../libraries) | 随项目保留的依赖资源与库 |
| [scripts/](../scripts)、[server/](../server) | 工程脚本与早期网页服务端 |
| [android/](../android)、[src-tauri/](../src-tauri) | 上游移动端 / Tauri 工程；不是当前定制 Electron 免安装包的生成入口 |
| [.github/](../.github) | GitHub 模板、社区说明及保留的上游工作流；上游工作流不等同于本项目 Windows 发布流程 |
| .devcontainer/、.vscode/、.storybook/、.husky/ | 开发环境、组件预览和 Git hooks 配置 |

## 根目录保留什么

- README.md、LICENSE：项目入口与许可。
- package.json、pnpm-lock.yaml：当前前端依赖和锁定版本。
- package-lock.json：保留的上游 npm 锁文件，部分上游工作流仍引用 npm ci；本项目按 pnpm 构建。
- vite.config.js、nuxt-ui.vite.js、capacitor.config.*：构建与平台配置。
- eslint.config.js、.prettier*、.npmrc、.nvmrc 等：工具按固定位置读取的配置。
- AGENTS.md：仓库开发约定。

构建配置、源文件路径及平台目录保留原位，避免整理文档时改变构建行为。auto-imports.d.ts、components.d.ts 是工具生成的本地类型声明，已由 .gitignore 忽略。

## 整理约定

新使用说明放 docs/，旧版本记录放 docs/archive/；公共开发资料放 docs/development/，上游说明放 docs/upstream/。客户下载包和安装器发布到 Releases，构建产物按 .gitignore 留在本地。新增依赖或源码移动时同步检查配置和引用。
