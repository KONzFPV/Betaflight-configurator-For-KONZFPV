<template>
    <UButton size="sm" icon="i-lucide-hard-drive-download" :disabled="singleBusy || !api" @click="show"
        >USB DFU备份HEX</UButton
    >
    <UModal
        v-model:open="open"
        title="STM32 / APM32 USB DFU · 完整 HEX 备份"
        description="读取完整内部 Flash，包含保存在其中的固件与设置。"
        :ui="{ content: 'max-w-3xl' }"
    >
        <template #body>
            <div class="space-y-5">
                <div class="flex flex-wrap items-center gap-3">
                    <UButton
                        icon="i-lucide-cpu"
                        :disabled="locked || singleBusy"
                        :loading="entry.busy.value"
                        @click="entry.connectAndEnter"
                    >
                        连接飞控 / 进入 USB DFU
                    </UButton>
                    <UButton
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-usb"
                        :disabled="locked || singleBusy"
                        @click="entry.chooseAndEnter"
                        >选择其他飞控</UButton
                    >
                    <p class="text-sm text-muted">{{ entry.selectedLabel.value }}</p>
                </div>
                <p v-if="entry.status.value" role="status" class="text-sm text-muted">{{ entry.status.value }}</p>
                <p v-if="entry.error.value" role="alert" class="text-error text-sm">{{ entry.error.value }}</p>
                <UiBox title="选择 USB DFU 设备" type="neutral">
                    <div class="flex flex-wrap gap-3">
                        <USelect
                            v-model="selected"
                            :items="items"
                            placeholder="请选择 STM32 / APM32 USB DFU 设备"
                            class="flex-1 min-w-56"
                            :disabled="locked"
                        />
                        <UButton
                            icon="i-lucide-refresh-cw"
                            color="neutral"
                            variant="outline"
                            :disabled="locked"
                            @click="scan"
                            >扫描设备</UButton
                        >
                    </div>
                    <p v-if="!devices.length" class="text-muted text-sm mt-3">
                        让 STM32 / APM32 飞控进入 USB DFU 模式并安装 WinUSB 驱动，然后扫描设备。
                    </p>
                </UiBox>
                <p class="text-sm text-muted">
                    完整读取内部 Flash 两次，比对一致后导出 Intel
                    HEX。遇到读保护将停止，不会解锁或擦除。外置黑匣子存储器及 SD 卡不包含在内。
                </p>
                <div class="space-y-2" role="status">
                    <p>{{ state.status }}</p>
                    <UProgress :model-value="state.progress" />
                    <p v-if="state.savedPath" class="text-success break-all">{{ state.savedPath }}</p>
                    <p v-if="state.sha256" class="text-xs text-muted break-all">SHA-256：{{ state.sha256 }}</p>
                </div>
                <p v-if="error || state.error" role="alert" class="text-error text-sm whitespace-pre-wrap">
                    {{ error || state.error }}
                </p>
            </div>
        </template>
        <template #footer>
            <UButton
                icon="i-lucide-download"
                :disabled="locked || !selected || singleBusy"
                :loading="state.busy || saving"
                @click="save"
                >完整读取并保存 HEX</UButton
            >
        </template>
    </UModal>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import { dfuBackupOpen, useDfuEntry } from "@/composables/useDfuEntry";
import UiBox from "@/components/elements/UiBox.vue";
defineProps<{ singleBusy: boolean }>();
const api = (window as any).fpvfixDesktop?.backup;
const entry = useDfuEntry();
const open = dfuBackupOpen;
const scanning = ref(false),
    saving = ref(false),
    error = ref(""),
    selected = ref("");
const devices = ref<any[]>([]);
const state = ref<any>({ busy: false, progress: 0, status: "待机", error: "" });
const locked = computed(() => scanning.value || saving.value || state.value.busy || entry.busy.value);
const items = computed(() =>
    devices.value.map((d) => ({ label: `${d.family} · ${d.serial} · ${d.bytes / 1024} KiB`, value: d.key })),
);
async function show() {
    open.value = true;
    if (!state.value.busy && !saving.value) await scan();
}
async function scan() {
    scanning.value = true;
    error.value = "";
    devices.value = [];
    selected.value = "";
    try {
        devices.value = await api({ action: "scan" });
        selected.value = devices.value[0]?.key || "";
    } catch (e) {
        error.value = String(e);
    } finally {
        scanning.value = false;
    }
}
async function save() {
    saving.value = true;
    error.value = "";
    try {
        state.value = await api({ action: "save", key: selected.value });
    } catch (e) {
        error.value = String(e);
    } finally {
        saving.value = false;
    }
}
watch(entry.busy, (value, before) => {
    if (before && !value && open.value) void scan();
});
let timer: ReturnType<typeof setInterval>;
let polling = false;
onMounted(() => {
    if (!api) return;
    if (open.value && !entry.busy.value) void scan();
    const poll = async () => {
        if (polling) return;
        polling = true;
        try {
            state.value = await api({ action: "status" });
        } catch (e) {
            error.value = String(e);
        } finally {
            polling = false;
        }
    };
    void poll();
    timer = setInterval(poll, 700);
});
onBeforeUnmount(() => clearInterval(timer));
</script>
