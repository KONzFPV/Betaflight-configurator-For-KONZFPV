import { createApp, h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "reka-ui";
vi.mock("../../src/js/gui", () => ({ default: { content_ready: vi.fn() } }));
vi.mock("../../src/js/tab_switch", () => ({ switchTab: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getCurrentLocale: () => "zh_CN" } }));
vi.mock("i18next-vue", () => ({ useTranslation: () => ({ t: (key) => key, i18next: { language: "zh_CN" } }) }));
import KonzWikiTab from "../../src/components/tabs/KonzWikiTab.vue";
import LandingTab from "../../src/components/tabs/LandingTab.vue";
let app, host;
function mount(component) {
    host = document.createElement("div");
    document.body.append(host);
    app = createApp({ render: () => h(TooltipProvider, {}, { default: () => h(component) }) });
    app.config.globalProperties.$t = (key) => key;
    app.mount(host);
}
const tick = async () => {
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();
};
afterEach(() => {
    app?.unmount();
    host?.remove();
    vi.unstubAllGlobals();
    delete window.fpvfixDesktop;
});
describe("local wiki source switch", () => {
    it("shows original offline in place, switches back, and keeps the official web source button", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url) => ({
                ok: true,
                json: async () =>
                    String(url).includes("catalog")
                        ? [{ id: "wiki", title: "Wiki", body: "# Original English body", zh: "# 中文译文测试" }]
                        : {},
            })),
        );
        mount(KonzWikiTab);
        await tick();
        await tick();
        expect(host.querySelector("article").textContent).toContain("中文译文测试");
        const toggle = [...host.querySelectorAll("button")].find((b) => b.textContent.includes("查看原文"));
        expect(toggle).toBeDefined();
        toggle.click();
        await nextTick();
        expect(host.querySelector("article").textContent).toContain("Original English body");
        expect(
            [...host.querySelectorAll("a")].some(
                (a) => a.href.startsWith("https://betaflight.com/docs/wiki/") && a.target === "_blank",
            ),
        ).toBe(true);
        [...host.querySelectorAll("button")].find((b) => b.textContent.includes("查看中文译文")).click();
        await nextTick();
        expect(host.querySelector("article").textContent).toContain("中文译文测试");
    });
});
describe("compact homepage", () => {
    it("retains both creator profiles and copies the group number through desktop without tutorial navigation", async () => {
        const copyGroup = vi.fn(async () => true);
        window.fpvfixDesktop = { copyGroup };
        mount(LandingTab);
        await tick();
        const links = [...host.querySelectorAll("a")].map((a) => a.href);
        expect(links.some((h) => h.includes("space.bilibili.com/3546875475003918"))).toBe(true);
        expect(links.some((h) => h.includes("douyin.com/user/"))).toBe(true);
        expect(host.textContent).not.toContain("konzVideoTutorials");
        expect(host.textContent).not.toContain("konzViewTutorials");
        [...host.querySelectorAll("button")].find((b) => b.textContent.includes("konzCopyGroup")).click();
        await tick();
        expect(copyGroup).toHaveBeenCalledOnce();
        expect(host.textContent).toContain("konzCopied");
    });
});
