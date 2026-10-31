> 历史网页版本构建记录，保留供追溯。当前 Windows 桌面版请看 [开发与构建](../BUILDING.md)。文中的命令均相对于 app/ 目录执行。

# Build this modified 2026.6.2 website

Use Node.js 24 and pnpm 11.25.0. This source snapshot includes pnpm-lock.yaml with the dependency versions used for the delivered website.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
git init
git add src/components/tabs/FirmwareFlasherTab.vue src/components/tabs/firmware-flasher/FlasherBoardBuildTab.vue src/composables/useCloudBuild.js
git -c user.name=Builder -c user.email=builder@localhost commit -m "Local modified 2026.6.2 build"
pnpm run build
```

Skip the git initialization steps when building inside an existing Git checkout with a commit. The upstream Vite config reads git rev-parse --short HEAD. Build output is src/dist.

The .npmrc hoisted layout matches the dependency availability expected by upstream source imports. workbox-window 7.4.1 is declared directly because the PWA virtual module imports it from the app root. Use the provided pnpm lockfile for this snapshot; package-lock.json is retained from upstream for provenance and was not used for this build.

Full web production build completed successfully. Upstream emits non-fatal warnings about old Three.js exports, CSS :deep syntax and large chunks; these were not introduced by the OSD/receiver changes.

Functional validation: compiled static site opened in a Chromium browser, selected 2RAW_THUNDER_H7 / firmware 2026.6.2, verified Analog + Digital defaults, selected CRSF + SBUS + IBUS together, and clicked online firmware loading. The official build service returned cached success for build 28d496c4af28c61cc5a3620130148a3c; firmware parsed successfully as 499051 bytes. No hardware was flashed.

Original application: https://github.com/betaflight/betaflight-configurator/tree/2026.6.2
License: GPL-3.0; see LICENSE.
