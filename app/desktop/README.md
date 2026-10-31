# 空致 KONz Windows 免安装预览版

[文档目录](../../docs/README.md) · [开发与构建](../../docs/BUILDING.md) · [更新与发布](../../docs/UPDATES.md)

基于 Betaflight Configurator 2026.6.2，Electron 45.1.0，Windows x64。当前只生成免安装 ZIP，安装版等待试用反馈。

## 功能

- 双 OSD 默认同时选择；接收机、电机协议多选，电机默认仅 DSHOT。
- 固件支持时默认选择 LED64、磁力计、舵机，并保留原有默认项。
- 连接飞控、打开烧写工具默认开启专家模式。
- 陀螺仪、气压计、黑匣子存储驱动选择器将对应宏加入原始自定义宏框。提交时补充依赖宏，主板总线、片选、中断与方向仍需正确的 target 配置。
- 可单独导出编译好的固件，刷写不再强制先保存备份。
- 三条固定官方资源中转线路，每次打开烧写工具并行检测，自动选择最快可用线路，支持手动选择与重新测速。显示的是两次 HTTPS 健康检查往返耗时均值。
- 读取请求可回退线路，提交编译的 POST 请求遇到连接中断不自动重发，避免重复任务。
- 仅简体中文与 English，默认中文。离线 Wiki 317 篇官方正文，入门页与设置指南有中文整理，其余正文保留英文。黑匣子常用界面汉化。

- 首页为 BF地面站，含 B站 / 抖音：FPVFIX、维修介绍、交流群二维码与群号复制。视频教程目前提供指定 B站主页入口，分类为穿越机飞控电调图传维修教程。
- 支持快照：读取官方 Support ID、加载本地 CLI / dump / diff 文本，分组显示端口、接收机、模式、PID、电源、电机、OSD 和完整 CLI。查看器独立只读，不将快照写入飞控。
- 主板配置使用官方 config 快照的精确 SHA-256 索引去重驱动宏；未知校验值不推断已包含的驱动。

## 架构

main.ts 启动仅监听回环地址的本地服务（正常端口 49539，QA 端口 49540），使用隔离、沙箱渲染进程。preload.ts 仅开放固定请求与线路状态 IPC。旧 Worker 不转发支持快照 API 时，客户端仅在收到明确的 Unsupported endpoint 后访问固定的官方支持服务（Cloudflare 边缘，TLS 校验开启）；不会因 POST 超时自动重发。

route_transport.py 通过 curl_cffi / BoringSSL 发起 HTTPS 并使用 ECH，三条固定 Worker 分别刷新自身 DNS HTTPS 记录。TLS 证书验证保持开启，不使用系统 HTTP/SOCKS 代理，不改变系统 DNS 或代理设置。

线路转发官方 build API、固件与预设。编译由官方服务器执行，CF 仅中转，USB 和串口始终在本机。

网络可达性依赖客户网络与 CF ECH。三条线路仍共享 CF 平台，不等于三个完全独立的运营商链路；隐藏客户端入口地址也不构成鉴权或防攻击机制。

## 重建

从仓库根目录先执行 cd app，以下命令均相对于 app/。

开发需要 Node 24、pnpm 11.25、Python 3.12。客户使用成品不需这些工具，不需 .NET / WebView2。

1. pnpm install --frozen-lockfile
2. 可选：node desktop/prepare-preview.mjs <betaflight.com源码目录> 更新离线文档；中文整理位于 desktop/wiki-zh。
3. pnpm exec eslint --ext .js,.vue,.ts src
4. pnpm exec vitest run test/js/useCloudBuild.test.js test/js/fpvfix-flashing.test.js test/js/sidebar_items.test.js test/js/hardwareBuildOptions.test.js test/js/supportSnapshot.test.js
5. pnpm exec vite build
6. 建立 Python venv，pip install -r desktop/requirements-network.txt
7. python desktop/test_routes.py
8. python -m PyInstaller --noconfirm --clean --onedir --console --name fpvfix-network --distpath desktop/helper --workpath desktop/helper-work --specpath desktop --paths desktop --collect-all curl_cffi --collect-all certifi --hidden-import _cffi_backend --add-data "<仓库绝对路径>/desktop/network-seed.json;." desktop/network_helper.py
9. pnpm --dir desktop install

从 Electron 官方 release 下载 electron-v45.1.0-win32-x64.zip，核对官方 SHASUMS256 后解压至 desktop/electron-runtime。

node desktop/package.mjs desktop desktop/electron-runtime desktop/helper/fpvfix-network dist-desktop

输出 dist-desktop/release/KONz-2026.6.2-Preview9-Windows-x64.zip 与 win-unpacked/空致 KONz.exe。保留整个目录，不要只分发 EXE。

## 验证

FPVFIX_QA_PROFILE 指向隔离配置目录，不复用用户串口或文件权限。FPVFIX_SELFTEST=1 运行本地服务、网络及资源自测，结果写入该配置目录并退出。普通启动不运行自测。

交付 verification 记录实际网络、云编译、导出结果。导出通过测试保存适配器核对字节和校验和，没有自动操作 Windows 保存对话框，也没有连接或刷写实体飞控。

## 许可

Betaflight 原代码及修改遵循根目录 LICENSE（GPL-3.0），保留原作者信息。Wiki 来源 https://github.com/betaflight/betaflight.com ，保留作者、原文链接及说明。第三方中文镜像仅用于术语参考，没有打包其宣传内容或逐字复制其译文。

Electron / Chromium、Python、curl_cffi / curl-impersonate / BoringSSL、certifi、PyInstaller 许可证随包附带。运行时包含所需 DLL，DFU 的 WinUSB 是设备驱动，不能由运行库替代。
