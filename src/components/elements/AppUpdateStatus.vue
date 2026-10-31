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
                size="xs"
                variant="link"
                color="neutral"
                :disabled="updates.state.value.status === 'checking'"
                @click="updates.check"
                >检查更新</UButton
            >
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useAppUpdates, updateDialogOpen } from "@/composables/useAppUpdates";
const updates = useAppUpdates();
const statusText = computed(
    () =>
        ({
            idle: "尚未检查更新",
            checking: "正在检查更新…",
            available: `发现新版本 ${  updates.state.value.release?.version}`,
            current: "已是最新版本",
            unpublished: "暂无已发布更新",
            error: "暂时无法检查更新",
        })[updates.state.value.status as string] || "尚未检查更新",
);
onMounted(updates.initialize);
</script>
