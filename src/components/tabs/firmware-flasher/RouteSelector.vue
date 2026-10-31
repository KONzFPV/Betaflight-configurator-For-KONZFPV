<template>
    <div v-if="desktop" class="flex flex-wrap items-center gap-2" data-testid="route-selector">
        <span class="text-sm">{{ $t("konzRoute") }}</span>
        <USelect
            :model-value="selected"
            :items="items"
            class="min-w-48"
            :disabled="disabled"
            :aria-label="$t('konzRoute')"
            @update:model-value="select"
        />
        <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            color="neutral"
            size="sm"
            :loading="busy"
            :disabled="disabled"
            :aria-label="$t('konzRetest')"
            @click="probe"
        />
        <span v-if="error" role="alert" class="text-sm text-error">{{ error }}</span>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTranslation } from "i18next-vue";

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ ready: []; changed: [] }>();
const { t } = useTranslation();
const desktop = window.fpvfixDesktop;
const selected = ref(1);
const busy = ref(false);
const error = ref("");
const routes = ref(
    [1, 2, 3].map((id) => ({ id, available: null as boolean | null, latencyMs: null as number | null })),
);
const items = computed(() => [
    { value: 0, label: t("konzNoAcceleration") },
    ...routes.value.map((route) => ({
        value: route.id,
        label: `${t("konzLine")}${route.id} · ${busy.value ? t("konzMeasuring") : route.available === true ? `${route.latencyMs} ms` : route.available === false ? t("konzUnavailable") : t("konzUntested")}`,
    })),
]);
async function probe() {
    if (!desktop || busy.value) return;
    busy.value = true;
    error.value = "";
    try {
        const result = await desktop.routes({ action: "probe" });
        routes.value = result.routes;
        selected.value = result.selected;
        if (result.selected !== 0 && !result.routes.some((route) => route.available)) error.value = t("konzNoRoute");
    } catch {
        error.value = t("konzNoRoute");
    } finally {
        busy.value = false;
        emit("ready");
    }
}
async function select(value: number) {
    if (!desktop) return;
    try {
        const result = await desktop.routes({ action: "select", routeId: value });
        selected.value = result.selected;
        error.value = "";
        emit("changed");
    } catch {
        error.value = t("konzNoRoute");
    }
}
onMounted(() => {
    if (desktop) void probe();
    else emit("ready");
});
</script>
