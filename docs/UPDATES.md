# GitHub Releases + 三条CF更新部署
日期：2026-10-31。仓库已固定为 https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV 。此文档用于维护者发布版本和部署三条CF更新路由。GitHub Release发布与CF Worker部署是两个独立步骤，发布后应分别核验。

仓库源码已集中到 app/。本文中的 desktop/ 路径和命令均相对于 app/，执行命令前先从仓库根目录进入 app/。

## 客户端已完成
- 首页和已连接设置页共用AppUsageHint右侧，显示软件Preview9及更新状态；固件版本2026.6.2单独保留。
- 启动时查更新，可手动再次检查；最新build大于当前build才视为新版本。
- 以build为一次发布标识，将已提醒build数组写入AppData/空致 KONz/updates/notified.json，换页面或重启不重复提醒；新build才再次提醒。重装保留AppData也保留记录，清除用户数据后会重新提醒。
- 自动提醒避开首次说明及其他已打开弹窗；忽略后页面更新入口保留。绝不强制更新。
- 点击更新后可选免安装zip/安装exe。只有Release清单实际存在的包才可下载，缺安装包时显示“此版本暂未提供安装包”。
- 保存对话框选目标路径→原生网络helper通过CF ECH流式写入.part→校验大小/SHA-256→改为目标文件名。失败尝试其他CF线路，全部失败显示错误。不会自动启动安装程序、覆盖软件或重启飞控。

## 发布一次更新
1. 先把项目开源源码与GPL许可提交到上述仓库，空仓库需要先有commit/tag。
2. 修改desktop/app-release.ts中的build递增、version展示值，再构建目标版本。
3. 目前只生成免安装版。若需用户选择安装包，需额外构建Windows安装器并将exe与zip一同发布；客户端支持选择，不会伪造不存在的exe。本轮没有制作安装程序。
4. 用仓库内desktop/create-update-manifest.mjs生成更新清单，例如：
```powershell
node desktop/create-update-manifest.mjs --build 10 --version Preview10 --tag konz-preview10 --output update-manifest.json --portable KONz-Preview10-Windows-x64.zip --installer KONz-Preview10-Setup.exe --notes "修复说明"
```
若没有安装包，去掉--installer整对参数。工具计算实际字节数和SHA-256。
5. 创建名为konz-preview10的GitHub Release，上传上述zip、可选exe、update-manifest.json和对应源码zip。清单tag必须与Release tag一致，包名和字节数必须匹配。
6. 当前Worker读取GitHub /releases/latest，所以要发布为正式Release，不勾选pre-release。Preview只是客户端展示名。若以后要真正的稳定/预览双渠道，应扩展列表筛选；不能把pre-release当成latest。
7. 先在草稿中上传全部资产和清单，检查后一次发布，避免半成品清单被客户端发现。

## CF三线路部署
保留三条原域名：
1 fpvfix-gateway.mgsmdx.workers.dev
2 fix2.485250443.workers.dev
3 bf2.862462150.workers.dev

源码desktop/worker-desktop.mjs导入desktop/updates-worker.mjs并保留原build/presets转发逻辑。deployment/worker-with-updates.mjs是单文件打包结果，可用于审核更新端点。
每个所属CF账号的原Worker都需合并/部署更新路由（账号可能不同，不应只部署一条）。部署前与线上原代码核对，保留线上额外的support API及限流规则；本轮未读取/覆盖线上源码。
GET /updates/latest → 查询固定仓库最新正式Release并读取其update-manifest.json。
GET /updates/download/{tag}/{asset.zip|asset.exe} → 仅从固定仓库获取，跟随受限GitHub资产域名重定向并流式转发。
请求无自定义URL参数；版本与包名检查；清单≤64KiB；只允许GET；下载不缓存错误。
客户端版本检查与包下载都使用既有CF原生helper，不经GitHub直连；helper延用三线路/ECH/本机下载。该选项独立于固件编译“不使用加速”，因为用户明确更新采用CF。

当前单文件Worker包含基础build/presets路由。若线上Worker有新功能，应将updatesResponse并入原最新脚本再部署，不建议未经比较直接整份覆盖。可以在三个账号分别使用wrangler deploy <reviewed-worker-path> --name <existing-worker-name>，不要创建新随机域名导致客户端地址不匹配。

## 上线验证
三条GET /updates/latest：没有Release应204；发布清单后应200且build正确。
仅发布安装包或免安装包时，另一按钮应禁用并说明；全部资产完整才发布正式版。
从旧版本测：首次出现一次弹窗→暂不更新→重启/切页面/再检查都不弹；更新build后再次提醒一次。
选择两种包各下载一次，核对SHA-256；模拟一条线路失败切换、全部失败提示、大小/哈希错误拒绝、取消保存不下载；刷写中不自动重启。
当前下载为用户主动保存文件，若今后要“自动安装/替换”，需要另外设计签名发布、进程退出、权限、回滚，不属于本轮功能。

官方参考：
https://docs.github.com/en/rest/releases/releases#get-the-latest-release
https://developers.cloudflare.com/workers/platform/limits/
https://www.electron.build/v26/docs/features/auto-update/
Cloudflare Worker响应需流式，128MB内存不能整包缓冲当前约295MB zip；免费请求额度按账户计算，不因同账户三个Worker变成三倍。
