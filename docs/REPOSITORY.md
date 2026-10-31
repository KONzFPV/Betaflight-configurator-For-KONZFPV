# 仓库结构

[返回文档目录](README.md)

仓库首页只保留项目入口、完整源码文件夹、文档和必须位于仓库层的 GitHub / Git 配置。

~~~text
app/              完整应用工程与开发配置
docs/             使用、构建、发布与历史资料
.github/          工作流、问题模板与社区说明
.devcontainer/    GitHub Codespaces / 容器开发入口
README.md         项目首页
LICENSE           GPL-3.0 许可证
~~~

另外保留 .gitignore、.gitattributes 和 .coderabbit.yaml，供 Git / 仓库服务识别。

## 应用内部

| 路径 | 用途 |
| --- | --- |
| [app/src/](../app/src) | Vue 主界面、飞控连接与配置 |
| [app/desktop/](../app/desktop) | 定制 Windows Electron 层、DFU、CF 网络与软件更新 |
| [app/test/](../app/test) | 前端与功能回归测试；桌面测试也在 desktop/ |
| [app/resources/](../app/resources) | 离线 Wiki、主板资料与静态资源 |
| [app/locales/](../app/locales) | 语言资源 |
| [app/assets/](../app/assets)、[app/distribution/](../app/distribution) | 图标与平台发行资源 |
| [app/libraries/](../app/libraries) | 随工程保留的库 |
| [app/scripts/](../app/scripts)、[app/server/](../app/server) | 工程脚本与早期网页服务端 |
| [app/android/](../app/android)、[app/src-tauri/](../app/src-tauri) | 保留的上游移动端与 Tauri 工程 |

package.json、依赖锁、Vite / ESLint 等开发配置一起放在 app/。开发时先 cd app；VS Code 可直接打开 app/ 文件夹。

app/LICENSE 与仓库根 LICENSE 内容一致，供打包脚本从应用目录收集许可证。成品和对应版本源码归档继续发布到 [Releases](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases)。

## 自动化兼容

上游构建工作流保留在 .github/workflows/。检出源码后，它们将 app/ 内容复制到临时 CI 工作目录，以兼容原来使用仓库根路径的工具、缓存和产物步骤；这不会改动 GitHub 主分支的目录布局，也兼容尚未迁移的旧 tag。翻译工作流直接使用 .github/crowdin.yml 中的 app/locales/ 路径。

本项目 Windows 发布流程仍见 [开发与构建](BUILDING.md) 与 [更新与发布](UPDATES.md)。构建输出和本地依赖由 .gitignore 排除。
