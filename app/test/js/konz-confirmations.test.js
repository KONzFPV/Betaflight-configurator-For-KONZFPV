import { createApp, h, nextTick, reactive } from "vue";
import { TooltipProvider } from "reka-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimedConfirmation from "../../src/components/dialogs/TimedConfirmation.vue";
import KonzWelcomeNotice from "../../src/components/dialogs/KonzWelcomeNotice.vue";
import FlasherBoardBuildTab from "../../src/components/tabs/firmware-flasher/FlasherBoardBuildTab.vue";
import BatchFlashPanel from "../../src/components/tabs/firmware-flasher/BatchFlashPanel.vue";
let app, host;
function mount(component, initialProps = {}) {
    const props = reactive(initialProps);
    host = document.createElement("div");
    document.body.append(host);
    app = createApp({ render: () => h(TooltipProvider, {}, { default: () => h(component, props) }) });
    app.component("UModal", {
        props: ["open", "dismissible", "close"],
        setup:
            (p, { slots }) =>
            () =>
                p.open ? h("div", { "data-modal": "true" }, [slots.body?.(), slots.footer?.()]) : null,
    });
    app.component("UButton", {
        inheritAttrs: false,
        props: ["disabled"],
        setup:
            (p, { slots, attrs }) =>
            () =>
                h("button", { ...attrs, disabled: p.disabled }, slots.default?.()),
    });
    for (const name of ["UIcon", "UBadge", "UProgress", "UCheckbox"])
        app.component(name, {
            setup:
                (_p, { slots }) =>
                () =>
                    h("div", slots.default?.()),
        });
    app.config.globalProperties.$t = (key) => key;
    app.mount(host);
    return props;
}
const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));
afterEach(() => {
    app?.unmount();
    host?.remove();
    vi.useRealTimers();
    localStorage.clear();
    delete window.fpvfixDesktop;
});
describe("mandatory reading confirmation", () => {
    it("5 seconds is required, then welcome acceptance persists across remount", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
        const showOptions = vi.fn();
        mount(KonzWelcomeNotice, { onShowOptions: showOptions });
        await nextTick();
        await nextTick();
        expect(showOptions).not.toHaveBeenCalled();
        expect(button("我已阅读").disabled).toBe(true);
        button("我已阅读").click();
        await nextTick();
        await nextTick();
        expect(document.querySelector("[role=dialog][data-state=open]")).not.toBeNull();
        await vi.advanceTimersByTimeAsync(4900);
        expect(button("我已阅读").disabled).toBe(true);
        await vi.advanceTimersByTimeAsync(100);
        expect(button("我已阅读").disabled).toBe(false);
        button("我已阅读").click();
        await nextTick();
        await nextTick();
        expect(document.querySelector("[role=dialog][data-state=open]")).toBeNull();
        expect(showOptions).toHaveBeenCalledOnce();
        app.unmount();
        host.remove();
        mount(KonzWelcomeNotice, { onShowOptions: showOptions });
        await nextTick();
        await nextTick();
        expect(showOptions).toHaveBeenCalledOnce();
        expect(document.querySelector("[role=dialog][data-state=open]")).toBeNull();
    });
    it("shows settings once after an existing welcome acknowledgement without repeating the welcome", async () => {
        localStorage.setItem("konz-welcome-notice-2026-10-v1", "accepted");
        const showOptions = vi.fn();
        mount(KonzWelcomeNotice, { onShowOptions: showOptions });
        await nextTick();
        await nextTick();
        expect(document.querySelector("[role=dialog][data-state=open]")).toBeNull();
        expect(showOptions).toHaveBeenCalledOnce();
        expect(localStorage.getItem("konz-initial-settings-shown-v1")).toBe("shown");
        app.unmount();
        host.remove();
        mount(KonzWelcomeNotice, { onShowOptions: showOptions });
        await nextTick();
        await nextTick();
        expect(showOptions).toHaveBeenCalledOnce();
    });
    it("10 second confirmation and cancellation stay disabled until elapsed; reopening resets countdown", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
        const accepted = vi.fn();
        const props = mount(TimedConfirmation, {
            open: true,
            seconds: 10,
            title: "自定义",
            confirmLabel: "开启",
            cancelLabel: "取消",
            onConfirm: accepted,
        });
        await vi.advanceTimersByTimeAsync(9900);
        expect(button("开启").disabled).toBe(true);
        expect(button("取消").disabled).toBe(true);
        button("开启").click();
        expect(accepted).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(100);
        button("开启").click();
        expect(accepted).toHaveBeenCalledOnce();
        props.open = false;
        await nextTick();
        await nextTick();
        props.open = true;
        await nextTick();
        await nextTick();
        expect(button("开启").disabled).toBe(true);
        expect(button("开启").textContent).toContain("10s");
    });
});
describe("batch firmware source UI", () => {
    it("provides both sources and transfers the exact online HEX with filename", async () => {
        const status = {
            running: false,
            active: 0,
            firmware: null,
            slots: Array.from({ length: 5 }, (_, index) => ({ index, progress: 0, status: "等待设备", logs: [] })),
        };
        const batch = vi.fn(async () => status);
        window.fpvfixDesktop = { batch };
        mount(BatchFlashPanel, { singleBusy: false, onlineName: "cloud.hex", onlineHex: ":00000001FF" });
        await nextTick();
        await nextTick();
        button("飞控批量烧录").click();
        await nextTick();
        await nextTick();
        expect(button("选择本地固件")).toBeDefined();
        expect(button("使用当前在线编译固件").disabled).toBe(false);
        expect(button("启动自动烧录").disabled).toBe(true);
        button("使用当前在线编译固件").click();
        await nextTick();
        await nextTick();
        expect(batch).toHaveBeenCalledWith({
            action: "online",
            confirmed: false,
            name: "cloud.hex",
            hex: ":00000001FF",
        });
        expect(document.querySelectorAll("section").length).toBe(5);
    });
    it("does not offer an unavailable online firmware as usable", async () => {
        window.fpvfixDesktop = { batch: vi.fn(async () => ({ running: false, active: 0, slots: [] })) };
        mount(BatchFlashPanel, { singleBusy: false, onlineName: "", onlineHex: null });
        await nextTick();
        await nextTick();
        button("飞控批量烧录").click();
        await nextTick();
        await nextTick();
        expect(button("使用当前在线编译固件").disabled).toBe(true);
    });
});

describe("custom hardware acknowledgement across sessions", () => {
    function boardProps() {
        const state = reactive({
            selectedOptions: [],
            selectedRadioProtocol: [],
            selectedOsdProtocol: [],
            selectedMotorProtocol: [],
            radioProtocolOptions: [],
            telemetryProtocolOptions: [],
            osdProtocolOptions: [],
            motorProtocolOptions: [],
            optionsListOptions: [],
            customDefinesTags: [],
            customOptionsEnabled: false,
            expertOptionsVisible: true,
        });
        return {
            state,
            boardSelection: { state: { selectedBoard: "TEST" }, getSelectMenuItems: () => [] },
            ...Object.fromEntries(
                [
                    "onBuildTypeChange",
                    "onBoardChange",
                    "onDetectBoard",
                    "onFirmwareVersionChange",
                    "onExpertModeChange",
                    "onShowDevelopmentReleasesChange",
                    "onRadioProtocolChange",
                    "onTelemetryProtocolChange",
                    "onOsdProtocolChange",
                    "onMotorProtocolChange",
                    "onOptionsChange",
                    "removeSelectedBuildOption",
                    "onCommitChange",
                    "onCommitCreate",
                ].map((key) => [key, () => {}]),
            ),
        };
    }
    it("requires first acknowledgement, then enables without another countdown after remount", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
        const props = boardProps();
        mount(FlasherBoardBuildTab, props);
        button("开启自定义选项").click();
        await nextTick();
        await nextTick();
        expect(button("我已了解").disabled).toBe(true);
        await vi.advanceTimersByTimeAsync(10000);
        button("我已了解").click();
        await nextTick();
        await nextTick();
        expect(props.state.customOptionsEnabled).toBe(true);
        expect(localStorage.getItem("konz-custom-options-ack-v1")).toBe("accepted");
        props.state.customDefinesTags = ["ACCGYRO_BMI270"];
        button("关闭自定义选项").click();
        await nextTick();
        expect(props.state.customDefinesTags).toEqual([]);
        app.unmount();
        host.remove();
        const reopened = boardProps();
        mount(FlasherBoardBuildTab, reopened);
        button("开启自定义选项").click();
        await nextTick();
        await nextTick();
        expect(reopened.state.customOptionsEnabled).toBe(true);
        expect(document.querySelector("[role=dialog][data-state=open]")).toBeNull();
    });
});
