import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { isSupportId, parseSupportSnapshot, type SupportSnapshot } from "../utils/supportSnapshot";

export const useSupportSnapshotStore = defineStore("supportSnapshot", () => {
    const snapshot = ref<SupportSnapshot | null>(null);
    const source = ref("");
    const error = ref("");
    const loading = ref(false);
    const section = ref("configuration");
    const search = ref("");
    let revision = 0;
    const entries = computed(
        () =>
            snapshot.value?.entries.filter(
                (entry) =>
                    entry.section === section.value && entry.command.toLowerCase().includes(search.value.toLowerCase()),
            ) ?? [],
    );
    function loadText(text: string, label: string) {
        const parsed = parseSupportSnapshot(text);
        revision++;
        loading.value = false;
        snapshot.value = parsed;
        source.value = label;
        error.value = "";
        search.value = "";
    }
    async function loadId(id: string) {
        if (!isSupportId(id)) {
            revision++;
            loading.value = false;
            error.value = "konzSnapshotBadId";
            return;
        }
        const token = ++revision;
        loading.value = true;
        error.value = "";
        try {
            const response = await fetch(`./build-api.php?path=/api/support/${encodeURIComponent(id.trim())}`);
            if (!response.ok) throw new Error(response.status === 404 ? "konzSnapshotNotFound" : "konzSnapshotNetwork");
            const text = await response.text();
            if (token !== revision) return;
            loadText(text, id.trim());
        } catch (failure) {
            if (token === revision) error.value = failure instanceof Error ? failure.message : "konzSnapshotNetwork";
        } finally {
            if (token === revision) loading.value = false;
        }
    }
    function clear() {
        revision++;
        snapshot.value = null;
        source.value = "";
        error.value = "";
        loading.value = false;
    }
    return { snapshot, source, error, loading, section, search, entries, loadText, loadId, clear };
});
