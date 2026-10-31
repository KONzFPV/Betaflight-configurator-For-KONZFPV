<template>
    <UModal
        v-model:open="updateDialogOpen"
        title="软件更新"
        description="选择免安装包或安装包，通过 CF 加速下载。"
        :ui="{ content: 'max-w-xl' }"
        @update:open="onOpen"
    >
        <template #body>
            <div class="space-y-4">
                <p>
                    当前版本：{{ updates.state.value.current.version }}　最新版本：{{
                        updates.state.value.release?.version
                    }}
                </p>
                <p class="text-sm text-muted whitespace-pre-wrap">{{ updates.state.value.release?.notes }}</p>
                <div class="flex flex-wrap gap-3">
                    <UButton
                        icon="i-lucide-archive"
                        :disabled="!has('portable') || updates.state.value.downloading"
                        @click="updates.download('portable')"
                        >下载免安装包</UButton
                    >
                    <UButton
                        icon="i-lucide-package"
                        :disabled="!has('installer') || updates.state.value.downloading"
                        @click="updates.download('installer')"
                        >下载安装包</UButton
                    >
                </div>
                <p v-if="!has('installer')" class="text-muted text-sm">此版本暂未提供安装包。</p>
                <div v-if="updates.state.value.downloading" role="status">
                    <p>正在通过 CF 下载并校验… {{ updates.state.value.progress }}%</p>
                    <UProgress :model-value="updates.state.value.progress" />
                </div>
                <p v-if="updates.state.value.savedPath" class="text-success break-all">
                    下载并校验完成：{{ updates.state.value.savedPath }}
                </p>
                <p v-if="updates.state.value.error" role="alert" class="text-error break-all">
                    {{ updates.state.value.error }}
                </p>
                <p class="text-sm text-muted">每个新版本只自动提醒一次，稍后仍可从页面中的“更新”入口下载。</p>
            </div>
        </template>
        <template #footer
            ><UButton color="neutral" variant="outline" @click="updates.dismiss">暂不更新</UButton></template
        >
    </UModal>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import { useAppUpdates, updateDialogOpen } from "@/composables/useAppUpdates";
import GUI from "@/js/gui";
const updates = useAppUpdates();
const has = (kind: string) => updates.state.value.release?.packages?.some((p: any) => p.kind === kind);
let timer: ReturnType<typeof setInterval>;
let polling = false;
function onOpen(open: boolean) {
    if (!open) void updates.dismiss();
}
onMounted(() => {
    updates.initialize();
    timer = setInterval(async () => {
        if (polling || !updates.available()) return;
        polling = true;
        try {
            await updates.poll();
            if (
                updates.state.value.notification &&
                !updateDialogOpen.value &&
                !GUI.flashingInProgress &&
                !document.querySelector('[role="dialog"][data-state="open"]')
            ) {
                updateDialogOpen.value = true;
                await updates.dismiss();
                updateDialogOpen.value = true;
            }
        } finally {
            polling = false;
        }
    }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>
