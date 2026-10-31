# 空致 KONz · BF 地面站

面向穿越机玩家、维修人员和批量装机用户的 Windows 桌面工具，基于 **Betaflight Configurator 2026.6.2** 定制，由 **FPVFIX / 空致 KONz** 维护。

**软件免费获取，无需付费购买。** 如遇 BUG，可在交流群反馈。

[下载最新版本](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases/latest) · [查看全部版本](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases) · [反馈问题](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/issues)

> 这是基于 Betaflight 的第三方定制项目，并非 Betaflight 官方发行版。软件版本（例如 Preview9）与飞控固件版本（例如 2026.6.2）分别管理。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 飞控连接与配置 | 查看传感器、端口、接收机、模式、PID、OSD 等；支持中文与 English |
| 三条 CF 加速线路 | 用于云编译、固件及预设获取；支持测速、择优和手动选择，编译仍由官方云服务完成 |
| 多协议固件编译 | 模拟 / 高清 OSD 同时编译，接收机和电机协议支持多选 |
| 自定义硬件选项 | 提供有依据的驱动宏选择，方便维修替换芯片；仍需核对板级引脚和总线 |
| 飞控批量烧录 | 最多 5 台 STM32 / APM32 USB DFU 设备并行处理，写入后逐字节读回校验 |
| USB DFU HEX 备份 | 支持的 STM32 / APM32 内部 Flash 完整读取两次，比对一致后导出带地址的 Intel HEX |
| 本地资料与工具 | 中文 Wiki、黑匣子浏览器、支持快照查看、维修教程入口 |
| 软件更新入口 | 首页及连接后的设置页显示当前软件版本和更新状态，每个新发布版本只自动提醒一次 |

默认启用专家模式。固件构建默认选项包括 DSHOT、LED64、磁力计和舵机，实际以对应固件版本与所选主板支持情况为准。驱动选项不代表任意芯片都能直接替换。

## 下载与运行

当前提供 **Windows x64 免安装 ZIP**：

1. 前往 [Releases](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases) 下载 Windows-x64.zip。
2. 将整个压缩包解压到本地文件夹。
3. 运行文件夹中的 **空致 KONz.exe**。
4. 保留同目录下的资源文件，不能只复制 EXE 单独运行。

客户无需另外安装 Node.js 或 Python。建议在 Windows 10 / 11 x64 上使用；其他系统尚未提供本项目的验证发行包。

每个 Release 附带源码归档及校验文件。安装 EXE 只有在该 Release 实际提供时才可下载，目前的免安装包不需要安装程序。

## 连接飞控

- 左侧绿色设备名称表示**串口已选中**；完成连接后显示红色“断开连接”。
- 可开启自动连接。默认过滤普通系统串口及未知 USB 串口，保留支持列表中的设备；需要调试其他串口时，可在选项中开启显示全部串口。
- 菜单隐藏 VID / PID 数字，底层识别仍保留，支持列表包含 STM32、APM32、AT32 等。
- USB DFU 与正常飞控串口是两种模式。进入 DFU 后，设备不能作为正常飞控串口连接。
- 使用 USB DFU 需正确的设备驱动，当前桌面 DFU 工具通常需要 WinUSB。先核实具体设备，避免给其他 USB 设备误装驱动。

备份面板中的“连接飞控 / 进入 USB DFU”会尝试连接选中的飞控，再请求切换至 DFU；已经连接时直接请求切换。若超时，可按飞控说明通过 BOOT 按键 / 焊盘手动进入 DFU 后重新扫描。

## 固件编译与单台烧录

1. 选择飞控主板和固件版本。
2. 核对 OSD、接收机、电机及其他构建选项。
3. 从网络加载编译固件，或点击独立的“从本地电脑加载固件”按钮。
4. 核实设备与固件匹配后开始烧录。

本地 HEX 按原始数据处理，不会再次插入云编译主板配置，适用于包含完整内部 Flash 的备份文件。原始 BIN 在普通单台加载流程中用于 ESP32，不应把 STM32 BIN 直接当作 ESP32 固件烧写；STM32 完整备份请使用导出的 HEX。

更换主板会重置旧构建选项和固件结果。手动烧录波特率默认 115200，首次使用不会默认勾选。

## 批量烧录

批量模式适用于**同品牌、同型号、同固件**的飞控。DFU 模式无法可靠替你判断板型，请在启动前人工核对。

- 最多 5 路并行，每台设备按身份区分。
- 先检查容量，再写入，然后读取写入范围并逐字节比对，最后单独请求退出 DFU。
- 读回不一致或容量不匹配会报错。
- 写入校验完成但退出 DFU 未确认时，单独提示手动重插，不把退出响应异常直接当成写入失败。
- 同一批次不反复写入同一设备。关闭面板后停止接收新设备，当前任务结束再自动清空；重新选择固件后可重试同一台。
- 自动烧录期间禁用 F5 刷新，停止并等待任务结束后恢复。

设备日志保存在用户数据目录的 batch/device-logs.ndjson，反馈故障时可附上对应设备的日志，避免只提供退出码。

## HEX 备份包含什么

备份读取指定设备描述的完整**内部 Flash**，其中保存的程序和已保存参数都应包含在内。读取两次、长度一致且逐字节相同后才允许保存，并显示 SHA-256。

- 不包含外置黑匣子 Flash、SD 卡、全部芯片状态或源码。
- 遇到读保护直接停止，备份流程不自动解锁或擦除。
- 不同型号、容量、固件及参数存储布局不能当作可互换。
- 尚未保存到飞控的界面修改，不会凭空出现在 Flash 备份中。
- 备份数据结构有效不等于参数值符合预期；恢复后请核对端口、接收机、模式、PID、蜂鸣器等关键配置。
- 实际设备、驱动和 bootloader 存在差异，软件测试通过不等同于所有飞控均已实机通过。

## 软件在线更新

预期流程：

**显示当前软件版本与更新状态 → 发现新版只提醒一次 → 用户点击更新 → 选择免安装包 / 安装包 → 通过三条 CF 线路下载 → 检查大小和 SHA-256 → 保存文件。**

忽略某一版后，重启软件或切换页面不会再次自动弹窗；页面中的更新入口仍保留。发布更高 build 后才会再次提醒。清除用户数据后提醒记录也会被清除。

更新由用户选择，不会在飞控烧录中强制重启软件，也不会自动运行下载的安装程序。未发布的安装包不会伪装成可下载。

**当前状态：客户端和发布工具已加入；三个 CF Worker 的更新端点仍需部署，才可在线启用。** 未部署或网络不可达时，界面会显示暂时无法检查更新，不代表已经是最新版本。

维护者发布时需提供 update-manifest.json、实际下载包和对应源码。详见 [软件更新部署说明](docs/UPDATES.md)。此功能更新的是电脑端软件，不是飞控无线固件 OTA。

## 开发与构建

开发环境：Node.js 24、pnpm；原生网络辅助程序使用 Python 3.12。上游还有 Tauri / Android 相关结构，本项目定制的 Windows 发行层位于 desktop/，不能仅按上游 Tauri 说明构建此版本。

```bash
pnpm install --frozen-lockfile
pnpm exec vite build
```

桌面主进程为 desktop/main.ts，预加载桥接为 desktop/preload.ts，Windows 发行包由 desktop/package.mjs 生成。打包需要匹配的 Electron 运行时、electron-builder / esbuild 工具目录和编译好的网络辅助程序：

```bash
node desktop/package.mjs <打包工具目录> <Electron运行时目录> <网络辅助程序目录> <输出目录>
```

功能验证包括前端 Vitest、桌面烧录 / 备份 / 更新测试、网络线路测试和成品界面检查。实体设备验证情况应以对应 Release 的说明为准。

目录概览：

- src/：主界面、连接逻辑和配置工具。
- desktop/：Electron、DFU 备份与批量工具、CF 网络和软件更新。
- test/：功能与回归测试。
- locales/：语言资源。
- docs/：本项目说明。
- [README.upstream.md](README.upstream.md)：保留的上游 README。
- [LICENSE](LICENSE)：GPL-3.0 许可证。

## 反馈与联系

- [GitHub Issues](https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/issues)
- FPVFIX 交流群：**1075517252**
- 抖音 / B站搜索：**FPVFIX**
- [FPVFIX B站主页](https://space.bilibili.com/3546875475003918)
- 空致 KONz 为 FPVFIX 旗下品牌。

反馈时建议附上软件版本、飞控主板 / MCU、固件版本、操作步骤、错误提示和设备日志。请先移除日志中的私人信息。

## 开源与致谢

基于 [Betaflight Configurator](https://github.com/betaflight/betaflight-configurator)；感谢 Betaflight 及各依赖项目的贡献者。

原代码及本项目修改遵循 **GNU GPL v3**。使用、修改和再分发应遵守 [LICENSE](LICENSE)，保留版权和许可证说明，并按许可证要求提供对应源码。第三方依赖保留各自许可。

软件可免费获取，请勿冒用 FPVFIX / 空致 KONz 的名义收费或宣称获得官方授权。品牌说明不改变开源许可证授予的权利。
