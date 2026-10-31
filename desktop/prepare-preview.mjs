import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const entries = {
    konzVisitDouyin: ["Open FPVFIX on Douyin", "访问 FPVFIX 抖音主页"],
    konzRefreshVideos: ["Refresh video list", "刷新视频列表"],
    konzVideosUnavailable: [
        "Bilibili could not refresh the list (network or verification required). Showing cached videos when available; use the channel link to view all uploads.",
        "B站暂时未能刷新列表，可能需要验证或网络不可用。有缓存时继续显示缓存视频，也可前往 UP 主主页查看全部投稿。",
    ],
    konzGuideSubmit: ["Submit support data", "提交支持数据"],
    konzGuideCopy: ["Copy and share the Support ID", "复制并分享 Support ID"],
    konzGuideId: ["The CLI returns a Support ID", "命令行返回 Support ID"],
    konzGuideExample: ["Example only; use your own returned ID.", "此处为示例，请使用实际返回的 ID。"],
    konzGuideReadOnly: [
        "View configuration and CLI output without connecting the sender’s flight controller.",
        "无需连接对方飞控，即可只读查看配置与 CLI 记录。",
    ],
    konzHardwareSources: ["Official source references for these options", "查看这些选项的官方源码依据"],
    konzHardwareSourceHint: [
        "Verified against firmware 2026.6.2. A config.h example documents another board’s wiring; it does not prove compatibility with this board. Older firmware may lack these drivers.",
        "按官方固件 2026.6.2 核对；config.h 示例仅代表该飞控的配置用法，不代表当前主板兼容。旧版固件可能没有相应驱动。",
    ],
    konzOfficialDriver: ["Official firmware source", "官方固件源码"],
    konzDriverOnly: ["Driver exists; no config.h example found", "有官方驱动，未发现 config.h 范例"],
    konzNoAcceleration: ["No acceleration (official connection)", "不使用加速"],
    konzHardwareWarning: [
        "Custom options are intended for repair technicians. If you do not know what they do, leave them unchecked; incorrect selections can make the build fail!",
        "自定义选项针对于维修师傅使用，如若你不知道是什么用处，不要勾选任何选项，会导致编译失败！！！",
    ],
    konzSettingsHint: [
        "Expert mode shows advanced settings. Disabling internet access prevents online builds and preset updates. Manual connection is for selecting a port yourself; virtual mode does not connect a real flight controller.",
        "专家模式会显示高级设置；禁止联网后无法在线编译、更新预设或加载地图。手动连接用于自行选择端口，仿真连接不会连接真实飞控。请按实际需要调整。",
    ],
    konzLocate: ["Locate again", "重新定位"],
    konzLatitude: ["Latitude", "纬度"],
    konzLongitude: ["Longitude", "经度"],
    konzCenterCoordinates: ["Go to coordinates", "定位到输入坐标"],
    konzLocationNotLocated: ["Not located", "尚未定位"],
    konzLocating: ["Locating with Windows, then the local network…", "正在获取系统定位，失败后尝试本机网络定位…"],
    konzLocationSystem: ["Windows system location", "定位来源：Windows 系统定位"],
    konzLocationIp: ["Approximate local network location", "定位来源：本机网络 IP（大致位置）"],
    konzLocationManual: ["Manually entered coordinates", "定位来源：手动输入坐标"],
    konzLocationFailed: [
        "Location unavailable. Enable Windows Location or enter coordinates manually.",
        "定位失败：请开启 Windows 定位服务，或手动输入经纬度。当前地图不代表你的位置。",
    ],
    konzLocationHint: [
        "Windows location is preferred; the IP fallback connects directly without CF or the app proxy. IP location is approximate. A system VPN or TUN may still change the network exit. This is the computer location, not flight controller GPS.",
        "优先使用系统定位，失败后通过本机网络 IP 估算位置；IP 查询不经过 CF 和应用代理。IP 定位仅为大致位置，系统级 VPN/TUN 仍可能改变出口。此处定位的是电脑，不是飞控 GPS。",
    ],
    konzWikiTranslated: ["Chinese translation of official documentation", "官方文档中文译文"],
    konzSnapshotPicture: [
        "Illustration: submit support data, copy the Support ID, and load it on the other computer",
        "操作示意：提交支持数据、复制 Support ID，再在另一台电脑加载",
    ],
    konzGroundStation: ["BF Ground Station", "BF地面站"],
    konzHomeIntro: [
        "Configure, build and flash Betaflight firmware. Read documentation and analyse flight logs locally.",
        "飞控配置、固件云编译与烧录，本地查阅文档和分析飞行日志。",
    ],
    konzVisitChannel: ["Open FPVFIX on Bilibili", "访问 FPVFIX B站主页"],
    konzVideoTutorials: ["Video tutorials", "视频教程"],
    konzViewTutorials: ["View tutorials", "查看教程"],
    konzVideoIntro: [
        "FPVFIX repair tutorials for flight controllers, ESCs and video transmitters.",
        "FPVFIX 维修教程，分享穿越机飞控、电调与图传维修经验。",
    ],
    konzWatchBilibili: ["Watch on Bilibili", "前往 B站观看"],
    konzVideoOnline: [
        "The latest videos open in your browser and require internet access.",
        "在系统浏览器打开 UP 主主页，观看最新视频，需要联网。",
    ],
    konzGroupQr: ["Scan to join FPVFIX QQ group 1075517252", "扫码加入 FPVFIX 交流群 1075517252"],
    konzCopyGroup: ["Copy group number", "复制群号"],
    konzCopied: ["Copied", "已复制"],
    konzCopyFailed: ["Copy failed; please copy the group number manually.", "复制失败，请手动复制群号。"],
    konzSupportSnapshot: ["Support snapshot", "支持快照"],
    konzSnapshotCard: [
        "Read shared configuration and CLI output without connecting a flight controller.",
        "无需连接飞控，查看分享的配置与 CLI 记录。",
    ],
    konzOpenSnapshot: ["Open snapshot", "打开支持快照"],
    konzSnapshotId: ["Enter Support ID", "请输入 Support ID"],
    konzLoadSnapshot: ["Load snapshot", "加载快照"],
    konzLoadSnapshotFile: ["Open local CLI / snapshot file", "从本地加载 CLI / 快照文件"],
    konzSnapshotInvalid: ["Invalid snapshot or file exceeds 1 MB.", "快照格式无效，或文件超过 1 MB。"],
    konzSnapshotBadId: [
        "Enter a valid official Support ID (UUID or SUP-…).",
        "请输入有效的官方 Support ID（UUID 或 SUP- 开头）。",
    ],
    konzSnapshotNotFound: [
        "This snapshot was not found or has expired.",
        "未找到该快照，可能已过期，或不属于官方支持服务。",
    ],
    konzSnapshotNetwork: [
        "Could not load the snapshot. Check the network connection and try again.",
        "快照加载失败，请检查网络后重试。",
    ],
    konzSnapshotInstructions: ["How to use", "使用说明"],
    konzSnapshotExplanation: [
        "Share a Support ID or a CLI text file for remote troubleshooting. Configuration is displayed in a separate read-only viewer.",
        "支持快照用于远程排查飞控配置问题。可加载官方 Support ID，也可直接打开对方分享的 CLI 文本文件；配置在独立的只读查看器中展示。",
    ],
    konzSnapshotStep1: [
        "On the connected flight controller, open CLI and choose Submit support data. Describe the issue and share the returned Support ID.",
        "求助者：连接飞控，进入命令行（CLI），点击“提交支持数据”，填写问题后复制生成的 Support ID。",
    ],
    konzSnapshotStep2: [
        "Enter the Support ID above, or open a saved CLI / dump / diff text file.",
        "协助者：在上方输入 Support ID 并加载，或打开保存的 CLI / dump / diff 文本文件。",
    ],
    konzSnapshotStep3: [
        "Switch categories to review settings, or read the complete CLI record. If a cloud snapshot has expired, ask for a new one or use a local file.",
        "切换分类查看配置，或阅读完整 CLI 记录。云端快照可能过期，过期后请重新提交或分享本地文件。",
    ],
    konzSnapshotReadOnly: ["Read-only support snapshot", "只读支持快照"],
    konzSnapshotSafe: [
        "This viewer does not send commands or modify the connected flight controller. Missing fields remain unspecified.",
        "此处仅查看记录，不向飞控发送命令或修改当前配置；记录中缺少的字段不会推断填充。",
    ],
    konzSaveSnapshot: ["Save CLI text", "保存 CLI 文本"],
    konzCloseSnapshot: ["Close snapshot", "关闭快照"],
    konzSnapshotSearch: ["Search configuration commands", "搜索配置命令"],
    konzSnapshotContext: ["Profile / context", "配置档 / 上下文"],
    konzSnapshotCommand: ["Recorded command / output", "记录中的命令 / 输出"],
    konzSnapshotOther: ["Other output", "其他输出"],
    konzSnapshotCli: ["Complete CLI record", "完整 CLI 记录"],
    konzSnapshotEmpty: ["No matching entries in this section.", "该分类中没有匹配的记录。"],
    konzRoute: ["Connection route", "加速线路"],
    konzLine: ["Line ", "线路"],
    konzRetest: ["Measure routes again", "重新测速"],
    konzMeasuring: ["Measuring…", "测速中…"],
    konzUnavailable: ["Unavailable", "不可用"],
    konzUntested: ["Not measured", "未测速"],
    konzNoRoute: [
        "No route is available. Retry after checking the connection.",
        "线路暂不可用，请检查网络后重新测速。",
    ],
    konzGyro: ["Gyroscope / IMU drivers", "陀螺仪 / IMU 驱动"],
    konzBarometer: ["Barometer drivers", "气压计驱动"],
    konzFlash: ["Blackbox Flash drivers", "黑匣子存储芯片驱动"],
    konzHardwareHint: [
        "These options add drivers to the cloud build. Board bus, chip-select, interrupt pins and alignment still need a matching target configuration.",
        "勾选后将驱动加入云编译。主板配置仍需正确设置总线、片选、中断引脚和传感器方向；添加驱动不能自动适配硬件。",
    ],
    konzFlashHint: [
        "Select the driver family supported by the firmware. Different capacities may share one driver. Custom definitions remain editable below.",
        "同系列不同容量芯片可能共用一个驱动。下方保留原始自定义宏，可继续编辑；实际错误请查看云编译日志。",
    ],
    konzInvalidDefines: ["Check definition syntax", "请检查宏格式"],
    konzDependencies: ["Additional required definitions", "自动补充的依赖宏"],
    konzBoardIncluded: [
        "Already included by this exact board configuration; duplicate compiler definitions are omitted",
        "主板配置已包含以下驱动或依赖，编译时自动避免重复定义",
    ],
    konzWiki: ["KONz Betaflight Wiki", "空致 KONz 中文 Wiki"],
    konzWikiCard: [
        "Offline official documentation, with Chinese getting-started guides.",
        "离线阅读官方文档，提供中文入门指南。",
    ],
    konzBlackboxCard: [
        "Open flight logs locally and inspect control response and vibration.",
        "本地打开飞行日志，查看飞行响应、振动与滤波效果。",
    ],
    konzOpenWiki: ["Open documentation", "打开 Wiki"],
    konzOpenBlackbox: ["Open Blackbox Explorer", "打开黑匣子浏览器"],
    konzWikiScope: [
        "Preview: official Wiki text is included offline. Chinese introductory guides are available; other articles retain the original English. External video and external links require internet.",
        "内置官方 Wiki 离线中文译文，命令、参数和代码保留原样。包含机器辅助翻译，技术细节请结合官方原文核对；外部视频和外链需要联网。",
    ],
    konzChineseGuide: ["Chinese guide", "中文整理"],
    konzOfficialEnglish: ["Official English original", "官方英文原文"],
    konzSource: ["Official source", "查看官方原文"],
    konzWikiFailed: ["Could not load the offline Wiki.", "离线 Wiki 加载失败，请完整解压软件后重试。"],
};
const dictionaries = await Promise.all(
    ["en", "zh_CN"].map(async (locale) =>
        JSON.parse(await fs.readFile(path.join(repo, "locales", locale, "messages.json"), "utf8")),
    ),
);
for (const [key, pair] of Object.entries(entries))
    pair.forEach((message, index) => (dictionaries[index][key] = { message }));
const translations = {
    "Open a flight log": "打开飞行日志",
    "Analyse a recorded log, or download one from a connected flight controller.":
        "分析本地日志，或从已连接的飞控下载日志。",
    "Open log file": "打开日志文件",
    "Download the onboard log from the connected flight controller": "从已连接的飞控下载机载日志",
    "Connect a flight controller that has a recorded log": "请连接存有日志的飞控",
    "Download from FC": "从飞控下载",
    "Getting started with Blackbox": "黑匣子使用入门",
    "Export Workspaces": "导出工作区",
    "Export your workspace configurations to file": "导出工作区配置文件",
    "User Settings": "用户设置",
    "Keyboard Shortcuts": "键盘快捷键",
    Playback: "回放",
    "Jump to start of video": "跳到视频开头",
    "Jump to start of log": "跳到日志开头",
    "Jump back": "后退",
    "Play/Pause": "播放 / 暂停",
    "Jump forward": "前进",
    "Jump to end of log": "跳到日志结尾",
    "Jump to end of video": "跳到视频结尾",
    Workspace: "工作区",
    "No workspace": "未选择工作区",
    "Rename this workspace": "重命名此工作区",
    "Save current graph setup to this workspace": "将当前图表设置保存到此工作区",
    "Workspace name": "工作区名称",
    Cancel: "取消",
    Rename: "重命名",
    "Configure graphs": "图表设置",
    "Add graph": "添加图表",
    "Remove all": "全部移除",
    "Drag to reorder graph": "拖动以调整图表顺序",
    Label: "名称",
    "Axis label": "坐标轴名称",
    "Add field": "添加字段",
    "Remove graph": "移除此图表",
    Save: "保存",
    Close: "关闭",
    Legend: "图例",
    "Graph settings": "图表设置",
    View: "视图",
    Speed: "速度",
    Zoom: "缩放",
    Time: "时间",
    "Advanced User Settings": "高级用户设置",
    "Mixer Settings": "混控设置",
    Custom: "自定义",
    "Select custom craft display": "选择自定义机型显示",
    "Stick Settings": "摇杆显示",
    Units: "单位",
    "Display actual units on stick display": "摇杆显示实际单位",
    "Stick Trails": "摇杆轨迹",
    "Show stick trails": "显示摇杆轨迹",
    "Invert Yaw": "反转偏航",
    "Invert yaw in stick display": "反转摇杆显示中的偏航方向",
    Mode: "模式",
    "Stick mode preview": "摇杆模式预览",
    Display: "显示",
    "Legend units": "图例单位",
    "Display actual units on legend": "在图例中显示实际单位",
    Gradient: "渐变背景",
    "Show the gradient background": "显示渐变背景",
    TimeBar: "时间指示线",
    "Show the vertical timebar": "显示垂直时间线",
    Preferences: "偏好设置",
    "Speed units": "速度单位",
    "Altitude units": "高度单位",
    "Reset to defaults": "恢复默认设置",
    Apply: "应用",
    Configuration: "配置",
    "Flight Controller": "飞控",
    Log: "日志",
    "Log header": "日志头信息",
    "Log fields": "日志字段",
    "Toggle legend": "显示 / 隐藏图例",
    "Toggle analyser": "显示 / 隐藏频谱分析",
    "Spectrum analyser": "频谱分析",
    "Spectrum Analyser": "频谱分析",
    Sync: "同步",
    Video: "视频",
    Offset: "偏移",
    Smoothing: "平滑",
    Scale: "比例",
    Color: "颜色",
    Centre: "中心",
    Min: "最小值",
    Max: "最大值",
    Field: "字段",
    Fields: "字段",
    Value: "数值",
    Parameter: "参数",
    Parameters: "参数",
    "Export CSV": "导出 CSV",
    "Export GPX": "导出 GPX",
    "Save changes": "保存更改",
    Reset: "重置",
};
Object.assign(translations, {
    ...JSON.parse(await fs.readFile(path.join(repo, "src/blackbox-viewer/chinese.json"), "utf8")),
    ...translations,
});
const keyFor = new Map();
for (const [english, chinese] of Object.entries(translations)) {
    const key = "konzBbv" + english.replace(/[^a-zA-Z0-9]/g, "");
    keyFor.set(english, key);
    dictionaries[0][key] = { message: english };
    dictionaries[1][key] = { message: chinese };
}
for (const file of await fs.readdir(path.join(repo, "src/blackbox-viewer/components"))) {
    if (!file.endsWith(".vue")) continue;
    const filename = path.join(repo, "src/blackbox-viewer/components", file);
    let code = await fs.readFile(filename, "utf8");
    const end = code.lastIndexOf("</template>");
    let template = code.slice(0, end);
    template = template.replace(
        /(?<![:\w-])(label|title|placeholder|aria-label|help|text)="([^"\n]+)"/g,
        (all, attr, value) => (keyFor.has(value) ? `:${attr}="$t('${keyFor.get(value)}')"` : all),
    );
    template = template.replace(/>(\s*)([^<>{}\n]+?)(\s*)</g, (all, a, text, b) =>
        keyFor.has(text.trim()) ? `>${a}{{ $t('${keyFor.get(text.trim())}') }}${b}<` : all,
    );
    for (const [english, key] of keyFor) template = template.replaceAll(`'${english}'`, `$t('${key}')`);
    code = template + code.slice(end);
    await fs.writeFile(filename, code);
}
for (let index = 0; index < 2; index++)
    await fs.writeFile(
        path.join(repo, "locales", ["en", "zh_CN"][index], "messages.json"),
        JSON.stringify(dictionaries[index], null, 4) + "\n",
    );
const wikiSource = process.argv[2];
if (wikiSource) {
    const root = path.join(wikiSource, "docs/wiki");
    const output = path.join(repo, "resources/konz-wiki");
    await fs.mkdir(output, { recursive: true });
    await fs.cp(path.join(wikiSource, "static/img"), path.join(output, "img"), { recursive: true });
    const pages = [];
    async function walk(dir) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }
            const relative = path.relative(root, full).replaceAll("\\", "/");
            if (!/\.mdx?$/.test(entry.name)) {
                if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(entry.name)) {
                    const dst = path.join(output, "assets", relative);
                    await fs.mkdir(path.dirname(dst), { recursive: true });
                    await fs.copyFile(full, dst);
                }
                continue;
            }
            let body = await fs.readFile(full, "utf8");
            const front = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
            const title =
                front?.[1].match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1] ||
                body.match(/^#\s+(.+)$/m)?.[1] ||
                entry.name.replace(/\.mdx?$/, "");
            body = body
                .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
                .replace(/^import .+;?\r?\n/gm, "")
                .replace(/^:::(\w+)?\s*(.*)$/gm, "$2");
            body = body.replaceAll("/img/", "./resources/konz-wiki/img/");
            body = body.replace(/(!\[[^\]]*\]\()([^\s)]+)(\))/g, (all, a, url, b) => {
                if (/^(?:https?:|\.\/resources\/|data:)/.test(url)) return all;
                const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), url));
                return a + "./resources/konz-wiki/assets/" + resolved + b;
            });
            const id = relative.replace(/\.mdx?$/, "");
            let zh;
            try {
                zh = await fs.readFile(
                    path.join(here, "wiki-zh", id === "getting-started/setup-guide" ? "setup-guide.md" : `${id}.md`),
                    "utf8",
                );
            } catch {}
            const titleZh =
                id === "wiki" ? "欢迎使用 Wiki" : id === "getting-started/setup-guide" ? "设置指南（中文）" : undefined;
            pages.push({ id, title, titleZh, body, zh });
        }
    }
    await walk(root);
    pages.sort((a, b) =>
        a.id === "wiki"
            ? -1
            : b.id === "wiki"
              ? 1
              : a.id === "getting-started/setup-guide"
                ? -1
                : b.id === "getting-started/setup-guide"
                  ? 1
                  : a.id.localeCompare(b.id),
    );
    await fs.writeFile(path.join(output, "catalog.json"), JSON.stringify(pages));
    await fs.copyFile(path.join(wikiSource, "README.md"), path.join(output, "UPSTREAM-README.md"));
    await fs.writeFile(
        path.join(output, "SOURCE.txt"),
        "Official Betaflight Wiki snapshot: https://github.com/betaflight/betaflight.com\nOriginal authors: Betaflight contributors. GPL-3.0. Chinese introductory guides: KONz.\n",
    );
    console.log(`Offline Wiki: ${pages.length} articles, ${pages.filter((p) => p.zh).length} Chinese guides`);
}
