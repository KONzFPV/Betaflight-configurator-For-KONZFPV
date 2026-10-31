import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/js/gui", () => ({ default: { flashingInProgress: false } }));
import GUI from "../../src/js/gui";
import { installUiShortcuts } from "../../src/js/uiShortcuts";
let cleanup;
afterEach(() => {
    cleanup?.();
    document.body.style.removeProperty("--ui-scale");
    localStorage.clear();
    delete window.fpvfixDesktop;
    GUI.flashingInProgress = false;
});
describe("application shortcuts", () => {
    it("Ctrl wheel scales within bounds and Ctrl O resets to 100 percent", () => {
        cleanup = installUiShortcuts();
        const wheel = (delta) => {
            const event = new WheelEvent("wheel", { ctrlKey: true, deltaY: delta, cancelable: true });
            window.dispatchEvent(event);
            return event;
        };
        expect(wheel(-100).defaultPrevented).toBe(true);
        expect(Number(document.body.style.getPropertyValue("--ui-scale"))).toBe(1.05);
        for (let i = 0; i < 30; i++) wheel(-100);
        expect(Number(document.body.style.getPropertyValue("--ui-scale"))).toBe(1.5);
        for (let i = 0; i < 40; i++) wheel(100);
        expect(Number(document.body.style.getPropertyValue("--ui-scale"))).toBe(0.5);
        const reset = new KeyboardEvent("keydown", { key: "o", ctrlKey: true, cancelable: true });
        window.dispatchEvent(reset);
        expect(reset.defaultPrevented).toBe(true);
        expect(Number(document.body.style.getPropertyValue("--ui-scale"))).toBe(1);
        expect(JSON.parse(localStorage.getItem("uiScale")).uiScale).toBe(1);
    });
    it("normal scrolling and typing O are not intercepted", () => {
        cleanup = installUiShortcuts();
        const wheel = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
        window.dispatchEvent(wheel);
        expect(wheel.defaultPrevented).toBe(false);
        const key = new KeyboardEvent("keydown", { key: "o", cancelable: true });
        window.dispatchEvent(key);
        expect(key.defaultPrevented).toBe(false);
    });
    it("F5 calls desktop refresh, but not during single flash; cleanup removes hooks", () => {
        const refresh = vi.fn();
        window.fpvfixDesktop = { refresh };
        cleanup = installUiShortcuts();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", cancelable: true }));
        expect(refresh).toHaveBeenCalledOnce();
        GUI.flashingInProgress = true;
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", cancelable: true }));
        expect(refresh).toHaveBeenCalledOnce();
        cleanup();
        GUI.flashingInProgress = false;
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "F5", cancelable: true }));
        expect(refresh).toHaveBeenCalledOnce();
    });
});
