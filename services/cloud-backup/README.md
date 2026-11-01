# KONz 云备份服务

当前部署： https://backup.konzbf.cn/

服务独立于三条编译/更新 Worker。Windows 免安装版尚未打包，先完成真实云端验收。

## 已创建资源

- Cloudflare Worker：`konz-cloud-backup`，自定义域名 `backup.konzbf.cn`。
- D1：`konz-cloud-backup`，迁移见 migrations/。
- GitHub 私有仓库：`KONzFPV/konz-backup-inbox`。
- GitHub 公开仓库：`KONzFPV/konz-backup-library`。
- Turnstile：绑定云备份域名，公钥在 wrangler.jsonc，密钥在 Worker Secrets。
- 管理员固定 GitHub 用户 ID：`151951515`（KONzFPV）。

## 尚待完成的连接与验收

1. 使用一次性连接页创建 GitHub App，只安装到上述两个仓库，权限为仓库内容读写。
2. 安装成功后会进入管理员登录，审核会话有效 8 小时；写入使用只覆盖两个仓库的短期 installation token。
3. GitHub App 私钥、登录 secret 经 SESSION_SECRET 派生的 AES-GCM 密钥加密后保存 D1，浏览器不会取得。不要直接更换 SESSION_SECRET，否则无法解密已有 GitHub App；需先执行凭据迁移。
4. 当前 SUBMISSIONS_ENABLED=false。先用私有测试材料完成上传测试和资源用量测量，确认后开启。不得将测试占位 HEX 公开为真实固件。
5. 完成真实投稿、人工通过、公开清单原子更新、下载哈希、拒绝、下架、重试与容量验收后，再接入地面站并打包。

## 功能边界

- 支持 STM32F405、F722、F411、G473、H743 和自定义 MCU；不要求填写内部 Flash 容量和 firmware target。
- 接受本软件线性地址 Intel HEX，起点 0x08000000，连续完整 256/512/1024/2048 KiB；检查校验和、地址、EOF，分别计算文本 SHA-256 和解码镜像 SHA-256。通过格式校验不代表硬件兼容或能启动。
- 两张照片先在浏览器缩到最长 1600 像素、JPEG 重编码后上传；服务端限制大小、标记和尺寸并拒绝 EXIF/注释，不宣称已完成图像内容真伪鉴定。
- 每日全站 20 份、同一 IP 3 份，最多 100 份开放投稿；可调 wrangler.jsonc。
- 未审核材料只保存在私有仓库 draft release 附件；拒绝与过期材料 14 天后清理。发布材料目前保留私有源附件，以便恢复；增长后需配套总存储监控。
- 公开库 HEX 与照片分目录，以 ID 关联。一次 Git 提交包含所有文件和 approved/index.json，更新分支时不强推，并发冲突重试。
- 软件列表由服务端已发布状态生成；下架先停止显示并从清单移除。公开 GitHub 地址、Git 历史和已经下载的副本不能保证撤回。
- 下载强制阅读 10 秒，核对 HEX SHA-256 后保存，不自动烧录。
- GitHub/Cloudflare 的额度不等于无限存储与无限流量；尤其最大 HEX 的 Worker CPU 和峰值内存仍需真实环境测量，当前不承诺免费计划能够处理所有容量。

## 开发与部署

`pnpm install`
`pnpm exec wrangler dev`
`node --test test/*.test.mjs`
`pnpm exec wrangler d1 migrations apply konz-cloud-backup --remote`
`pnpm exec wrangler deploy`

首次部署需 Worker Secrets SESSION_SECRET、SETUP_TOKEN、TURNSTILE_SECRET。不要提交 .dev.vars、私钥、令牌或 App secret。GitHub App 连接完成后可删除 SETUP_TOKEN，封闭首次配置入口。如使用外部管理的凭据，也支持 GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、GITHUB_WRITE_TOKEN，但正式部署优先使用仓库范围受限的 GitHub App。

## 本轮验证

10 项 Node 测试通过，包括校验和损坏、缺失 EOF、地址缺口、越权回执、未登录审核、chunked 请求超限、发布并发重试、PKCS1/PKCS8 私钥签名。
已部署健康检查与独立浏览器页面验证通过。真实 GitHub App 连接、真实审核发布和最大容量 CPU 验收尚未通过，不应标为完整上线。
