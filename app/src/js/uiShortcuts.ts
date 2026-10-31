import { applyUiScale } from "./UiScale";
import { set as setConfig } from "./ConfigStorage";
import GUI from "./gui";

/** Install application-wide shortcuts and return their cleanup function. */
export function installUiShortcuts(target: Window = window) {
    function setScale(value: number) {
        const scale = applyUiScale(value);
        setConfig({ uiScale: scale });
    }
    function reset() {
        setScale(1);
    }
    function wheel(event: WheelEvent) {
        if (!event.ctrlKey || event.deltaY === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = Number(target.getComputedStyle(target.document.body).getPropertyValue("--ui-scale")) || 1;
        setScale(Math.round((current + (event.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100);
    }
    function keydown(event: KeyboardEvent) {
        if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "o") {
            event.preventDefault();
            event.stopImmediatePropagation();
            reset();
        } else if (event.key === "F5") {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (GUI.flashingInProgress) return;
            const desktop = (target as any).fpvfixDesktop;
            if (desktop?.refresh) void desktop.refresh();
            else target.location.reload();
        }
    }
    target.addEventListener("wheel", wheel, { capture: true, passive: false });
    target.addEventListener("keydown", keydown, true);
    target.addEventListener("konz-reset-scale", reset);
    return () => {
        target.removeEventListener("wheel", wheel, true);
        target.removeEventListener("keydown", keydown, true);
        target.removeEventListener("konz-reset-scale", reset);
    };
}
