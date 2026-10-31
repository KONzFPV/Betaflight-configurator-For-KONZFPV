<template>
    <div class="text-sm space-y-1 min-w-48" data-testid="app-update-status">
        <p>
            当前软件版本：<strong>{{ updates.state.value.current.version }}</strong>
        </p>
        <div class="flex flex-wrap items-center gap-2">
            <span :class="updates.state.value.status === 'available' ? 'text-primary font-semibold' : 'text-muted'">{{
                statusText
            }}</span>
            <UButton
                v-if="updates.state.value.status === 'available'"
                size="xs"
                icon="i-lucide-download"
                @click="updateDialogOpen = true"
                >更新</UButton
            >
            <UButton
                v-if="updates.available()"
                size="xs"
                variant="link"
                color="neutral"
                :disabled="updates.state.value.status === 'checking'"
                @click="updates.check"
                >检查更新</UButton
            >
        </div>
        <div v-if="updates.available()" class="flex flex-wrap items-center gap-2">
            <label class="text-muted text-xs">更新线路</label>
            <USelect
                aria-label="更新下载线路"
                :model-value="updates.state.value.routeId ?? 0"
                :items="routeItems"
                size="xs"
                class="min-w-32"
                :disabled="busy"
                @update:model-value="updates.selectRoute(Number($event))"
            />
            <UButton size="xs" icon="i-lucide-archive" :disabled="busy" @click="updates.download('portable')"
                >免安装包下载</UButton
            >
            <UButton
                size="xs"
                icon="i-lucide-package"
                :disabled="busy || installerMissing"
                @click="updates.download('installer')"
                >安装包下载</UButton
            >
        </div>
        <p v-if="installerMissing" class="text-xs text-muted">当前发布未提供安装包。</p>
        <p v-if="updates.state.value.downloading" role="status" class="text-xs text-muted">
            下载并校验中 {{ updates.state.value.progress }}%
        </p>
        <p v-if="updates.state.value.savedPath" class="text-xs text-success break-all">
            已保存：{{ updates.state.value.savedPath }}
        </p>
        <p v-if="updates.state.value.error" role="alert" class="text-xs text-error break-all">
            {{ updates.state.value.error }}
        </p>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useAppUpdates, updateDialogOpen } from "@/composables/useAppUpdates";
const updates = useAppUpdates();
const routeItems = [
    { label: "自动选择", value: 0 },
    ...[1, 2, 3].map((value) => ({ label: `CF 线路${value}`, value })),
];
const busy = computed(() => updates.state.value.status === "checking" || updates.state.value.downloading);
const installerMissing = computed(
    () =>
        !!updates.state.value.release &&
        !updates.state.value.release.packages?.some((p: any) => p.kind === "installer"),
);
const statusText = computed(
    () =>
        ({
            idle: "尚未检查更新",
            checking: "正在检查更新…",
            available: `发现新版本 ${updates.state.value.release?.version}`,
            current: "已是最新版本",
            unpublished: "暂无已发布更新",
            error: "暂时无法检查更新",
        })[updates.state.value.status as string] || "尚未检查更新",
);
onMounted(updates.initialize);
</script>
