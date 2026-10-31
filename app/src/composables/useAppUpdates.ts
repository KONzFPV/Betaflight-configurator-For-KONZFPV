import { ref } from "vue";
import { APP_RELEASE } from "../../desktop/app-release";
const api = () => (window as any).fpvfixDesktop?.updates;
const state = ref<any>({ current: APP_RELEASE, status: "idle", release: null, error: "", notification: false });
export const updateDialogOpen = ref(false);
let initialized = false;
export function useAppUpdates() {
    async function invoke(action: string, extra = {}) {
        if (!api()) return;
        state.value = await api()({ action, ...extra });
    }
    async function check() {
        try {
            await invoke("check");
        } catch (e) {
            state.value.error = String(e);
            state.value.status = "error";
        }
    }
    function initialize() {
        if (initialized || !api()) return;
        initialized = true;
        void check();
    }
    async function dismiss() {
        await invoke("acknowledge");
        updateDialogOpen.value = false;
    }
    async function download(kind: string) {
        try {
            if (!state.value.release || state.value.status === "error") await check();
            await invoke("download", { kind });
        } catch (e) {
            state.value.error = String(e);
        }
    }
    async function selectRoute(routeId: number) {
        try {
            await invoke("route", { routeId });
            await check();
        } catch (e) {
            state.value.error = String(e);
        }
    }
    return {
        state,
        check,
        initialize,
        dismiss,
        download,
        selectRoute,
        poll: () => invoke("status"),
        available: () => !!api(),
    };
}
