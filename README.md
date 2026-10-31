# 空致 KONz · BF 地面站

基于 **Betaflight Configurator 2026.6.2** 定制的 Windows 桌面工具，由 **FPVFIX / 空致 KONz** 维护，面向穿越机玩家、维修人员和批量装机用户。

**软件免费。下载成品请进入 Releases，仓库中的 Code → Download ZIP 是源码。**

[下载最新版本](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases/latest) · [使用指南](docs/USAGE.md) · [全部文档](docs/README.md) · [反馈问题](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/issues)

## 下载与运行

1. 在 [最新发布](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases/latest) 下载 **Windows-x64.zip**。
2. **完整解压整个压缩包**，再运行文件夹中的 **空致 KONz.exe**。
3. 保留同目录的 DLL、资源和子文件夹；不要只复制 EXE。

当前提供 Windows 10 / 11 x64 免安装包，客户无需安装 Node.js 或 Python。安装包仅在对应 Release 实际提供时可选。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 飞控配置 | 传感器、端口、接收机、模式、PID、OSD 等，支持简体中文 / English |
| 三条 CF 加速线路 | 云编译、固件与预设获取，支持测速、自动择优和手动切换 |
| 多协议构建 | 模拟 / 高清 OSD、接收机和电机协议多选，自定义硬件驱动选项 |
| USB DFU 工具 | STM32 / APM32 内部 Flash HEX 备份，最多 5 台设备批量烧录并读回校验 |
| 本地工具 | 中文 Wiki、黑匣子浏览器、支持快照查看 |
| 软件更新 | 显示软件版本与更新状态，每个新版本只自动提醒一次，通过 CF 下载并校验更新包 |

备份范围、设备连接、参数恢复及烧录注意事项见 [使用指南](docs/USAGE.md)。软件更新需部署 CF Worker，发布步骤见 [更新与发布](docs/UPDATES.md)。

## 按需查阅

| 我想做什么 | 入口 |
| --- | --- |
| 下载、连接飞控、备份和烧录 | [使用指南](docs/USAGE.md) |
| 找说明或了解文件放在哪里 | [文档目录](docs/README.md) · [仓库结构](docs/REPOSITORY.md) |
| 修改代码、构建 Windows 版 | [开发与构建](docs/BUILDING.md) |
| 发布 GitHub Release、部署 CF 更新 | [更新与发布](docs/UPDATES.md) |
| 查阅上游和早期网页版本 | [上游资料](docs/upstream/README.md) · [历史记录](docs/archive/README.md) |

## 联系与反馈

- [GitHub Issues](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/issues)
- FPVFIX 交流群：**1075517252**
- 抖音 / B站搜索：**FPVFIX**；[B站主页](https://space.bilibili.com/3546875475003918)
- 空致 KONz 为 FPVFIX 旗下品牌。

## 开源与致谢

这是基于 [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator) 的第三方定制项目，并非 Betaflight 官方发行版。软件版本（如 Preview9）与飞控固件版本分别管理。

原代码及本项目修改遵循 [GNU GPL v3](LICENSE)，保留原作者及第三方许可。感谢 Betaflight 和各依赖项目的贡献者。[上游 README](docs/upstream/README.md) 保留供追溯。

软件可免费获取，请勿冒用 FPVFIX / 空致 KONz 名义收费或宣称获得官方授权；品牌说明不改变开源许可证授予的权利。
