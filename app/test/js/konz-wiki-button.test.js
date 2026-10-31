import { createApp, h } from "vue";
import { expect, it, vi } from "vitest";
vi.mock("../../src/js/tab_switch", () => ({ switchTab: vi.fn() }));
import { switchTab } from "../../src/js/tab_switch";
import WikiButton from "../../src/components/elements/WikiButton.vue";
it("opens built-in wiki instead of an external browser", () => {
    const host = document.createElement("div");
    const app = createApp({ render: () => h(WikiButton, { docUrl: "setup" }) });
    app.config.globalProperties.$t = () => "百科";
    app.mount(host);
    host.querySelector("a").click();
    expect(switchTab).toHaveBeenCalledWith("konz_wiki", { mode: "shared" });
    expect(host.querySelector("a").target).toBe("");
    app.unmount();
});
