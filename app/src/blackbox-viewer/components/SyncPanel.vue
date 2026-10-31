<template>
    <div class="toolbar-panel log-sync-panel">
        <h4>{{ $t('konzBbvLogsync') }}</h4>
        <div class="flex items-center gap-0.5">
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-back"
                size="xs"
                :title="$t('konzBbvMovelogearlier')"
                @click="$emit('sync-back')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-align-start-vertical"
                size="xs"
                :title="$t('konzBbvStartloghere')"
                @click="$emit('sync-here')"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-step-forward"
                size="xs"
                :title="$t('konzBbvMoveloglater')"
                @click="$emit('sync-forward')"
            />
            <UInput
                :model-value="appStore.videoOffsetDisplay"
                size="xs"
                class="w-16 font-mono"
                :title="$t('konzBbvEnteratimeoffset')"
                @change="$emit('offset-change', $event.target.value)"
            />
            <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-align-center-vertical"
                size="xs"
                :title="$t('konzBbvSmartSyncAltM')"
                @click="$emit('smart-sync')"
            />
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from "../stores/app.js";

defineEmits(["sync-back", "sync-forward", "sync-here", "smart-sync", "offset-change"]);

const appStore = useAppStore();
</script>
