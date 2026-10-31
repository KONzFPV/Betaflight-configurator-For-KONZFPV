<template>
    <UButton size="sm" icon="i-lucide-layers" :disabled="singleBusy || !api" @click="open = true">飞控批量烧录</UButton>
    <UModal
        v-model:open="open"
        title="飞控批量烧录"
        description="统一固件，五个独立USB DFU设备，自动识别并写入 DFU 设备。"
        :ui="{ content: 'max-w-6xl' }"
    >
        <template #body>
            <div class="space-y-6">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <span class="rounded-lg bg-primary/10 text-primary p-3"
                            ><UIcon name="i-lucide-layers" class="size-6"
                        /></span>
                        <div>
                            <h3 class="font-bold text-lg">批量烧录工作台</h3>
                            <p class="text-sm text-muted">同一份固件 · 最多 5 台并行写入</p>
                        </div>
                    </div>
                    <UBadge :color="state.running ? 'success' : 'neutral'" variant="subtle"
                        >{{ state.running ? "正在等待设备" : "待机" }} · {{ state.active }} / 5</UBadge
                    >
                </div>
                <UiBox title="固件来源" type="neutral">
                    <div class="flex flex-wrap gap-3">
                        <UButton
                            icon="i-lucide-cloud-download"
                            :disabled="locked || !onlineName || !onlineHex"
                            @click="invoke('online')"
                            >使用当前在线编译固件</UButton
                        >
                        <UButton
                            icon="i-lucide-folder-open"
                            color="neutral"
                            variant="outline"
                            :disabled="locked"
                            @click="invoke('select')"
                            >选择本地固件</UButton
                        >
                    </div>
                    <p v-if="!onlineName" class="text-muted text-sm mt-3">
                        在线固件：先在烧写工具中完成云编译并加载，再回到此处选择。
                    </p>
                    <p v-else class="text-muted text-sm mt-3 break-all">当前在线固件：{{ onlineName }}</p>
                    <div v-if="state.firmware" class="mt-4 rounded-lg bg-elevated p-4 space-y-2">
                        <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-file-check-2" class="text-primary size-5 shrink-0" /><span
                                class="font-semibold break-all"
                                >{{ state.firmware.name }}</span
                            >
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-sm">
                            <UBadge color="neutral" variant="subtle">{{ state.firmware.source }}</UBadge
                            ><span class="text-muted">{{ (state.firmware.bytes / 1024).toFixed(1) }} KiB</span>
                        </div>
                        <details class="text-xs text-muted">
                            <summary class="cursor-pointer">SHA-256 校验值</summary>
                            <code class="block break-all mt-2">{{ state.firmware.sha256 }}</code>
                        </details>
                    </div>
                    <div
                        v-else
                        class="mt-4 rounded-lg border border-dashed border-default p-5 text-center text-muted text-sm"
                    >
                        选择一份在线或本地 HEX / BIN 固件开始准备
                    </div>
                </UiBox>
                <div class="rounded-lg bg-error/10 p-4 space-y-3">
                    <p class="text-error font-bold text-sm">
                        仅支持同品牌、同型号、同固件的飞控。DFU 模式不能自动核对板型，写入时请勿断电。
                    </p>
                    <UCheckbox
                        v-model="confirmed"
                        :disabled="locked"
                        label="我已核对所有飞控的品牌、型号，并确认所选固件适用。"
                    />
                </div>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap gap-3">
                        <UButton
                            icon="i-lucide-play"
                            :disabled="!state.firmware || !confirmed || locked || singleBusy"
                            @click="invoke('start')"
                            >启动自动烧录</UButton
                        >
                        <UButton
                            icon="i-lucide-square"
                            color="neutral"
                            variant="outline"
                            :disabled="!state.running || working"
                            @click="invoke('stop')"
                            >停止自动烧录</UButton
                        >
                    </div>
                    <span class="text-sm text-muted" role="status">{{
                        state.resetting
                            ? "已停止，等待当前设备完成后自动清空"
                            : state.running
                              ? "插入 DFU 设备后自动分配设备"
                              : state.active
                                ? "等待正在写入的任务结束"
                                : "准备好后启动"
                    }}</span>
                </div>
                <p v-if="error || state.error" role="alert" class="text-error text-sm">{{ error || state.error }}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    <section
                        v-for="slot in state.slots"
                        :key="slot.index"
                        class="border border-default rounded-xl overflow-hidden min-w-0"
                    >
                        <div class="bg-elevated px-4 py-3 flex items-center justify-between">
                            <span class="font-semibold text-sm">USB DFU设备{{ slot.index + 1 }}</span
                            ><UIcon
                                :name="
                                    slot.result === 'success'
                                        ? 'i-lucide-circle-check'
                                        : slot.result === 'error' || slot.result === 'warning'
                                          ? 'i-lucide-circle-alert'
                                          : 'i-lucide-cpu'
                                "
                                :class="
                                    slot.result === 'success'
                                        ? 'text-success'
                                        : slot.result === 'warning'
                                          ? 'text-warning'
                                          : slot.result === 'error'
                                            ? 'text-error'
                                            : 'text-muted'
                                "
                            />
                        </div>
                        <div class="p-4 space-y-3">
                            <p class="text-xs font-mono text-muted break-all">{{ slot.serial || "等待 DFU 设备" }}</p>
                            <p
                                class="text-sm font-medium"
                                :class="
                                    slot.result === 'error'
                                        ? 'text-error'
                                        : slot.result === 'success'
                                          ? 'text-success'
                                          : ''
                                "
                            >
                                {{ slot.status }}
                            </p>
                            <UProgress
                                :model-value="slot.progress"
                                :color="
                                    slot.result === 'warning'
                                        ? 'warning'
                                        : slot.result === 'error'
                                          ? 'error'
                                          : slot.result === 'success'
                                            ? 'success'
                                            : 'primary'
                                "
                            />
                            <p class="text-xs text-muted">{{ slot.progress }}%</p>
                            <p v-if="slot.timings?.totalMs" class="text-xs text-muted">
                                总用时 {{ (slot.timings.totalMs / 1000).toFixed(1) }} 秒
                            </p>
                            <details class="text-xs text-muted">
                                <summary class="cursor-pointer">查看设备日志</summary>
                                <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{{
                                    slot.logs.join("\n") || "尚无日志"
                                }}</pre>
                            </details>
                        </div>
                    </section>
                </div>
            </div>
        </template>
    </UModal>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import UiBox from "@/components/elements/UiBox.vue";
const props = defineProps<{ singleBusy: boolean; onlineName?: string; onlineHex?: string | null }>();
const api = (window as any).fpvfixDesktop?.batch;
const open = ref(false),
    confirmed = ref(false),
    working = ref(false),
    error = ref("");
const state = ref<any>({ running: false, active: 0, firmware: null, slots: [] });
const locked = computed(
    () =>
        state.value.running ||
        state.value.active > 0 ||
        state.value.backupBusy ||
        state.value.resetting ||
        working.value,
);
async function invoke(action: string) {
    working.value = true;
    try {
        error.value = "";
        state.value = await api({
            action,
            confirmed: confirmed.value,
            ...(action === "online" ? { name: props.onlineName, hex: props.onlineHex } : {}),
        });
        if (action === "select" || action === "online") confirmed.value = false;
    } catch (e) {
        error.value = String(e);
    } finally {
        working.value = false;
    }
}
watch(open, (value, previous) => {
    if (previous && !value) {
        confirmed.value = false;
        void invoke("reset");
    }
});
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
    if (api) {
        void invoke("status");
        timer = setInterval(async () => {
            try {
                state.value = await api({ action: "status" });
            } catch (e) {
                error.value = String(e);
            }
        }, 700);
    }
});
onBeforeUnmount(() => {
    clearInterval(timer);
    if (api) void api({ action: "reset" });
});
</script>
