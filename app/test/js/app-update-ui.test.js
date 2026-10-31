import { expect, it, vi, afterEach } from "vitest";
import { createApp, h, nextTick } from "vue";
import { TooltipProvider } from "reka-ui";
import { createRouter, createMemoryHistory } from "vue-router";
const { check, download, dismiss, selectRoute } = vi.hoisted(() => ({ check: vi.fn(), download: vi.fn(), dismiss: vi.fn(), selectRoute: vi.fn() }));
vi.mock("../../src/composables/useAppUpdates", async () => {
    const { ref } = await import("vue");
    const state = ref({
        current: { version: "Preview9" },
        status: "available",
        release: { version: "Preview10", notes: "test", packages: [{ kind: "portable" }, { kind: "installer" }] },
        downloading: false,
    });
    return {
        updateDialogOpen: ref(true),
        useAppUpdates: () => ({
            state,
            check,
            download,
            dismiss,
            selectRoute,
            initialize: () => {},
            available: () => true,
            poll: () => {},
        }),
    };
});
vi.mock("../../src/js/gui", () => ({ default: { flashingInProgress: false } }));
import AppUpdateStatus from "../../src/components/elements/AppUpdateStatus.vue";
import AppUpdateDialog from "../../src/components/dialogs/AppUpdateDialog.vue";
let app, host;
afterEach(() => {
    app?.unmount();
    host?.remove();
});
it("shows software version/update state and both package choices wired independently", async () => {
    host = document.createElement("div");
    document.body.append(host);
    app = createApp({
        render: () => h(TooltipProvider, {}, { default: () => [h(AppUpdateStatus), h(AppUpdateDialog)] }),
    });
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: "/", component: { render: () => null } }],
    });
    app.use(router);
    await router.push("/");
    await router.isReady();
    app.mount(host);
    for (let i = 0; i < 5; i++) await nextTick();
    expect(document.body.textContent).toContain("当前软件版本：Preview9");
    expect(document.body.textContent).toContain("发现新版本 Preview10");
    expect(document.body.textContent).toContain("更新线路");
    const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
    button("下载免安装包").click();
    expect(download).toHaveBeenCalledWith("portable");
    button("下载安装包").click();
    expect(download).toHaveBeenCalledWith("installer");
    button("免安装包下载").click();
    expect(download).toHaveBeenLastCalledWith("portable");
    button("安装包下载").click();
    expect(download).toHaveBeenLastCalledWith("installer");
    button("暂不更新").click();
    expect(dismiss).toHaveBeenCalledOnce();
});
