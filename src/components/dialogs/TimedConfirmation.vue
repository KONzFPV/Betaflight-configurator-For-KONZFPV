<template>
    <UModal
        :open="open"
        :title="title"
        :description="description"
        :close="false"
        :dismissible="false"
        :ui="{ content: 'max-w-3xl' }"
    >
        <template #body
            ><div class="space-y-3 text-error font-bold whitespace-pre-line" data-testid="timed-notice"><slot /></div
        ></template>
        <template #footer>
            <div class="flex justify-end gap-3 w-full">
                <UButton
                    v-if="cancelLabel"
                    color="neutral"
                    variant="outline"
                    :disabled="remaining > 0"
                    @click="emit('cancel')"
                    >{{ cancelLabel }}</UButton
                >
                <UButton :disabled="remaining > 0" @click="confirm">{{
                    remaining > 0 ? confirmLabel + "（" + remaining + "s）" : confirmLabel
                }}</UButton>
            </div>
        </template>
    </UModal>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
const props = defineProps<{
    open: boolean;
    seconds: number;
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel?: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const remaining = ref(props.seconds);
let deadline = 0;
let timer: ReturnType<typeof setInterval> | undefined;
watch(
    () => props.open,
    (open) => {
        clearInterval(timer);
        if (open) {
            deadline = performance.now() + props.seconds * 1000;
            remaining.value = props.seconds;
            timer = setInterval(() => {
                remaining.value = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
            }, 100);
        }
    },
    { immediate: true },
);
function confirm() {
    if (performance.now() >= deadline && remaining.value === 0) emit("confirm");
}
onBeforeUnmount(() => clearInterval(timer));
</script>
