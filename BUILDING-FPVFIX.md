# FPVFIX / InfinityFree build

Based on official Betaflight Configurator 2026.6.2 (GPL-3.0).

Use Node 24 and the supplied pnpm-lock.yaml:

```powershell
git init
git add .
git -c user.name=Builder -c user.email=builder@example.invalid commit -m "FPVFIX source"
pnpm install --frozen-lockfile
$env:NODE_OPTIONS='--max-old-space-size=8192'
node node_modules/vite/bin/vite.js build
node scripts/package-infinityfree.mjs
```

Skip Git initialization/commit if working in an existing repository. Vite reads the revision through Git.
The static frontend is generated in `src/dist`. The packaging script adds the PHP gateway, hosting rules,
connection checker and license to `release/htdocs`. Upload that folder's contents to the hosting domain's
document root. Vite alone builds the frontend; the packaging step is required for the PHP backend.

The pinned Vite 8/Rolldown build splits JavaScript into chunks small enough for InfinityFree's 1 MB limit.
The packaging step rejects oversized files. PHP >= 8.1 with cURL and an outbound HTTPS connection is required.
No Node, Docker, compiler, database or command-line process is required on the web host.

Cloud compilation and firmware retrieval use `build-api.php` on the current origin, which calls the fixed
official Betaflight cloud API. This host submits/polls/downloads; it does not run GCC or replace the official compiler.
USB/serial flashing runs in the user's browser. This variant deliberately skips automatic pre-flash backups.

The upstream Simplified Chinese language pack is extended with mode names and build-option labels;
English protocol/firmware identifiers stay unchanged. Short Chinese mode terms were compared with the
public mirror at https://bf.hs-fpv.com/v/2026.6.1/ (2026-10-29). Its sponsor, community, tracking and
video assets are not included. Original Betaflight licensing and source notices remain applicable.
