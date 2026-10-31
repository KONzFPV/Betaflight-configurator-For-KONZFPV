# 开发与构建

[返回文档目录](README.md) · [更新与发布](UPDATES.md)

克隆仓库后，先在仓库根目录执行 cd app。以下开发命令均在 app/ 目录执行。当前定制 Windows 版使用 Electron，入口在 desktop/；上游 Tauri / Android 工程另行保留。

## 环境与前端

使用 Node.js 24、pnpm 11.25。Python 网络辅助程序使用 Python 3.12。客户运行成品无需安装这些工具。

~~~powershell
cd app
pnpm install --frozen-lockfile
pnpm exec vite build
~~~

前端输出为 src/dist。Vite 会读取 Git 提交信息，应在正常 Git checkout 中构建。

前端测试使用 pnpm exec vitest run，可传入相关测试文件；桌面层的测试、辅助程序构建与隔离验证参数见 [桌面工程说明](../app/desktop/README.md)。

## Windows 桌面包

1. 安装 desktop/requirements-network.txt 中的 Python 依赖，将 desktop/network_helper.py 构建为辅助程序。
2. 准备匹配 desktop/package.mjs 中版本的 Windows x64 Electron 运行时。
3. 准备包含 esbuild 与 electron-builder 的打包工具目录。
4. 生成前端后执行：

~~~powershell
node desktop/package.mjs <打包工具目录> <Electron运行时目录> <网络辅助程序目录> <输出目录>
~~~

网络辅助程序目录应包含 fpvfix-network.exe 及其依赖。具体 PyInstaller 命令与目录示例见 [桌面工程说明](../app/desktop/README.md)。

打包输出位于指定目录的 release/ 下。分发完整 ZIP，不能只取主 EXE；不完整解压会导致启动时无法读取 ICU 等运行时资源。

## 发布前核对

- 根据改动运行相关前端、桌面和网络测试；实体飞控验证情况写入 Release 说明。
- 使用 desktop/app-release.ts 管理软件展示版本与递增 build。
- 按 [更新与发布](UPDATES.md) 生成清单、校验下载包并发布对应源码。
- 根目录 LICENSE 和 desktop/licenses/ 中第三方许可应随产品保留。

## 其他构建资料

- [WebAuthn / 本地 HTTPS](development/WEBAUTHN_SETUP.md)。
- [保留的上游构建说明](upstream/README.md)。
- [早期网页部署记录](archive/README.md)。
