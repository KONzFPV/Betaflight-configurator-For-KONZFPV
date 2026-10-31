import { expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import { TooltipProvider } from "reka-ui";
import DfuBackupPanel from "../../src/components/tabs/firmware-flasher/DfuBackupPanel.vue";
const { primary, choose } = vi.hoisted(() => ({ primary: vi.fn(), choose: vi.fn() }));
vi.mock("../../src/composables/useDfuEntry", async () => {
    const { ref } = await import("vue");
    return {
        dfuBackupOpen: ref(true),
        useDfuEntry: () => ({
            busy: ref(false),
            error: ref(""),
            status: ref(""),
            selectedLabel: ref("STM32"),
            connectAndEnter: primary,
            chooseAndEnter: choose,
        }),
    };
});
it("primary button invokes DFU directly, alternate chooser stays separate", async () => {
    window.fpvfixDesktop = { backup: vi.fn(async (job) => (job.action === "scan" ? [] : { busy: false })) };
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp({
        render: () => h(TooltipProvider, {}, { default: () => h(DfuBackupPanel, { singleBusy: false }) }),
    });
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: "/", component: { render: () => null } }],
    });
    app.use(router);
    await router.push("/");
    await router.isReady();
    app.config.globalProperties.$t = (key) => key;
    try {
        app.mount(host);
        for (let i = 0; i < 5; i++) await nextTick();
        [...document.querySelectorAll("button")]
            .find((b) => b.textContent.trim() === "连接飞控 / 进入 USB DFU")
            .click();
        await nextTick();
        expect(primary).toHaveBeenCalledOnce();
        expect(choose).not.toHaveBeenCalled();
        [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "选择其他飞控").click();
        expect(choose).toHaveBeenCalledOnce();
    } finally {
        app.unmount();
        host.remove();
        delete window.fpvfixDesktop;
    }
});
