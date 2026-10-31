# 网页版与 Android

[文档目录](README.md) · [Windows 构建](BUILDING.md)

## InfinityFree 响应式网页

网页版使用与桌面相同的 Vue / HTML 前端，手机和电脑均可访问。它是完整网页资源包，不能只上传一个 index.html。

在 app/ 执行：

~~~powershell
$env:VITE_KONZ_WEB_URL='https://你的实际域名'
pnpm install --frozen-lockfile
pnpm exec vite build
node scripts/package-infinityfree.mjs <新的输出目录>
~~~

将生成的 htdocs/ 内全部内容（包括 .htaccess）上传到网站 htdocs/。使用 HTTPS，部署后打开 /deployment-check.html 验证 PHP cURL 和官方编译接口。PHP 服务器仅转发固定官方 API，编译在官方服务器执行。不要上传桌面 EXE 或 Python helper 到网站。

首页、Wiki、配置快照、编译界面适配手机；真正连接或烧录飞控取决于浏览器 Web Serial / WebUSB 能力。桌面 Chrome / Edge 较完整；手机浏览器不能保证串口支持，Android 用户连接飞控建议使用 APK 和 OTG。Windows 五路批量烧录及双读完整备份依赖桌面原生工具，不在网页或 APK 中伪装可用。

桌面专用 IP 优选使用 curl_cffi/ECH，不修改系统网络。网页受浏览器安全模型限制，不能直接指定连接 IP；网页编译走同源 PHP。Android 通过 Capacitor 原生 HTTP 访问三条现有 CF Worker，不需要修改 Worker CORS。

## Android APK

Android 工程为 app/android/，复用前端与既有原生串口、蓝牙、TCP、USB DFU、文件选择插件。应用 ID 为 com.konz.configurator.android，名称为空致 KONz，避免与官方版覆盖安装。

本地需要 Node.js 24、pnpm、JDK 21、Android SDK 36。先构建前端，然后：

~~~powershell
node capacitor.config.generator.mjs
pnpm exec cap sync android
cd android
.\gradlew.bat assembleRelease
~~~

发布版签名环境变量为 KONZ_KEYSTORE 和 KONZ_KEYSTORE_PASSWORD，证书别名 konz，类型 PKCS12。签名私钥和密码不能提交 Git；后续 APK 必须使用相同密钥才能覆盖更新。

GitHub Actions 的 KONz Android APK 工作流可手动运行，使用仓库 Secrets：KONZ_ANDROID_KEYSTORE（Base64 PKCS12）和 KONZ_ANDROID_KEYSTORE_PASSWORD。工作流只构建并上传 Artifact，审核后将 KONz-Android.apk 作为 Release 附件上传。网页 URL 通过 workflow_dispatch 的 web_url 输入设置。

APK 的 CF 请求支持 GET 回退、POST 单次提交；正常系统证书校验保持开启。是否能连接特定飞控仍需实体 Android、OTG、设备供电和授权验证；构建通过不代表所有设备均已实测。

## 平台入口

app/src/config/distribution.ts 管理三个公开入口。网页版实际域名通过 VITE_KONZ_WEB_URL 在构建时注入；未配置时显示待上线。Windows 下载进入本仓库 Release，Android 固定附件名 KONz-Android.apk。
