<template>
    <BaseTab tab-name="support_snapshot">
        <div class="space-y-5 p-4 md:p-8" data-testid="support-snapshot">
            <h1 class="text-3xl font-semibold">{{ $t("konzSupportSnapshot") }}</h1>
            <UCard>
                <div class="flex flex-wrap items-center gap-3">
                    <UInput
                        v-model="supportId"
                        :placeholder="$t('konzSnapshotId')"
                        :aria-label="$t('konzSnapshotId')"
                        class="w-80"
                        @keyup.enter="store.loadId(supportId)"
                    />
                    <UButton
                        icon="i-lucide-folder-open"
                        :loading="store.loading"
                        :disabled="!supportId.trim()"
                        @click="store.loadId(supportId)"
                        >{{ $t("konzLoadSnapshot") }}</UButton
                    >
                    <UButton variant="soft" icon="i-lucide-file-text" @click="fileInput?.click()">{{
                        $t("konzLoadSnapshotFile")
                    }}</UButton>
                    <input ref="fileInput" style="display: none" type="file" accept=".txt,.log,.json" @change="loadFile" />
                </div>
                <p v-if="store.error" role="alert" class="text-error mt-3">{{ $t(store.error) }}</p>
            </UCard>
            <UCard v-if="!store.snapshot">
                <h2 class="font-semibold text-xl mb-4">{{ $t("konzSnapshotInstructions") }}</h2>
                <p class="mb-4">{{ $t("konzSnapshotExplanation") }}</p>
                <ol class="list-decimal pl-6 space-y-3 text-muted">
                    <li>{{ $t("konzSnapshotStep1") }}</li>
                    <li>{{ $t("konzSnapshotStep2") }}</li>
                    <li>{{ $t("konzSnapshotStep3") }}</li>
                </ol>
                <SupportSnapshotGuide />
            </UCard>
            <template v-else>
                <UAlert
                    color="info"
                    variant="soft"
                    :title="$t('konzSnapshotReadOnly')"
                    :description="$t('konzSnapshotSafe')"
                />
                <UCard>
                    <div class="flex flex-wrap items-center justify-between gap-4">
                        <div class="break-all">
                            <h2 class="text-xl font-semibold">{{ store.snapshot.board || store.source }}</h2>
                            <p class="text-muted text-sm mt-2">{{ store.snapshot.version }}</p>
                            <p class="text-muted text-sm mt-2">{{ store.source }}</p>
                        </div>
                        <div class="flex gap-3">
                            <UButton variant="soft" @click="saveSnapshot">{{ $t("konzSaveSnapshot") }}</UButton>
                            <UButton variant="ghost" @click="store.clear()">{{ $t("konzCloseSnapshot") }}</UButton>
                        </div>
                    </div>
                </UCard>
                <div class="flex flex-wrap gap-2">
                    <UButton
                        v-for="key in [...snapshotSections, 'cli']"
                        :key="key"
                        :variant="store.section === key ? 'solid' : 'soft'"
                        @click="store.section = key"
                        >{{ $t(sectionLabel(key)) }}</UButton
                    >
                </div>
                <UCard v-if="store.section === 'cli'">
                    <pre class="whitespace-pre-wrap break-words text-sm max-h-[65vh] overflow-auto">{{
                        store.snapshot.text
                    }}</pre>
                </UCard>
                <UCard v-else>
                    <UInput
                        v-model="store.search"
                        :placeholder="$t('konzSnapshotSearch')"
                        :aria-label="$t('konzSnapshotSearch')"
                        icon="i-lucide-search"
                        class="mb-4 w-full md:w-96"
                    />
                    <div class="overflow-auto max-h-[60vh]">
                        <table class="w-full text-sm text-left">
                            <thead class="text-muted">
                                <tr>
                                    <th class="p-2">{{ $t("konzSnapshotContext") }}</th>
                                    <th class="p-2">{{ $t("konzSnapshotCommand") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(entry, index) in store.entries"
                                    :key="index"
                                    class="border-t border-default"
                                >
                                    <td class="p-2 whitespace-nowrap">{{ entry.context }}</td>
                                    <td class="p-2">
                                        <code>{{ entry.command }}</code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p v-if="!store.entries.length" class="text-muted py-4">{{ $t("konzSnapshotEmpty") }}</p>
                </UCard>
            </template>
        </div>
    </BaseTab>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import SupportSnapshotGuide from "../SupportSnapshotGuide.vue";
import GUI from "../../js/gui";
import { useSupportSnapshotStore } from "../../stores/supportSnapshot";
import { snapshotSections } from "../../utils/supportSnapshot";
const store = useSupportSnapshotStore();
const supportId = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const labels: Record<string, string> = {
    configuration: "tabConfiguration",
    ports: "tabPorts",
    receiver: "tabReceiver",
    modes: "tabAuxiliary",
    pid: "tabPidTuning",
    power: "tabPower",
    motors: "tabMotorTesting",
    osd: "tabOsd",
    other: "konzSnapshotOther",
    cli: "konzSnapshotCli",
};
const sectionLabel = (key: string) => labels[key];
async function loadFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    try {
        if (file) {
            if (file.size > 1024 * 1024) throw new Error("konzSnapshotInvalid");
            store.loadText(await file.text(), file.name);
        }
    } catch (failure) {
        store.error = failure instanceof Error ? failure.message : "konzSnapshotInvalid";
    } finally {
        input.value = "";
    }
}
function saveSnapshot() {
    const url = URL.createObjectURL(new Blob([store.snapshot?.text || ""], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "KONz-support-snapshot.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
onMounted(() => GUI.content_ready());
</script>
