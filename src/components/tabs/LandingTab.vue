<template>
    <BaseTab tab-name="landing">
        <div class="p-4 md:p-8 space-y-6 max-w-7xl mx-auto" data-testid="konz-home">
            <AppUsageHint />
            <UCard>
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 py-2">
                    <div>
                        <p class="text-primary font-semibold mb-3">空致 KONz · FPVFIX</p>
                        <h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                            {{ $t("konzGroundStation") }}
                        </h1>
                        <p class="text-muted max-w-2xl">{{ $t("konzHomeIntro") }}</p>
                    </div>
                    <div class="shrink-0 space-y-3">
                        <UButton size="lg" icon="i-lucide-zap" @click="switchTab('firmware_flasher')">{{
                            $t("tabFirmwareFlasher")
                        }}</UButton>
                    </div>
                </div>
            </UCard>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                <UCard v-for="tool in tools" :key="tool.tab">
                    <div class="flex items-center gap-3 mb-4">
                        <span class="rounded-lg bg-primary/10 p-2 text-primary flex"
                            ><UIcon :name="tool.icon" class="size-6"
                        /></span>
                        <h2 class="text-lg font-semibold">{{ $t(tool.title) }}</h2>
                    </div>
                    <p class="text-muted text-sm leading-relaxed min-h-12 mb-5">{{ $t(tool.description) }}</p>
                    <UButton
                        variant="soft"
                        trailing-icon="i-lucide-arrow-right"
                        @click="switchTab(tool.tab, { mode: 'shared' })"
                        >{{ $t(tool.button) }}</UButton
                    >
                </UCard>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <UCard>
                    <p class="text-primary text-sm font-semibold mb-3">FPVFIX</p>
                    <h2 class="text-xl font-bold mb-3">专注飞控电调图传维修</h2>
                    <p class="text-muted leading-relaxed text-sm mb-5">
                        穿越机飞控、电调与图传维修服务，同时提供免费的 0 基础飞控电调维修教程。
                    </p>
                    <div class="flex flex-wrap gap-3">
                        <UButton :href="channel" target="_blank" rel="noopener noreferrer" icon="i-lucide-play">{{
                            $t("konzVisitChannel")
                        }}</UButton
                        ><UButton
                            :href="douyin"
                            target="_blank"
                            rel="noopener noreferrer"
                            icon="i-lucide-video"
                            color="neutral"
                            variant="outline"
                            >{{ $t("konzVisitDouyin") }}</UButton
                        >
                    </div>
                </UCard>
                <UCard>
                    <div class="flex flex-wrap items-center gap-5">
                        <img :src="groupQr" :alt="$t('konzGroupQr')" class="w-32 h-32 rounded-lg shrink-0" />
                        <div class="space-y-3">
                            <h2 class="text-xl font-semibold">FPVFIX 交流群</h2>
                            <p class="text-lg font-semibold select-text">交流群号：1075517252</p>
                            <UButton variant="soft" icon="i-lucide-copy" @click="copyGroup">{{
                                $t(copied ? "konzCopied" : "konzCopyGroup")
                            }}</UButton>
                            <p v-if="copyError" role="alert" class="text-error text-sm">{{ $t("konzCopyFailed") }}</p>
                        </div>
                    </div>
                </UCard>
            </div>
        </div>
    </BaseTab>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppUsageHint from "../elements/AppUsageHint.vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { switchTab } from "../../js/tab_switch";
import groupQr from "../../images/konz/fpvfix-qq-group.png";
const douyin =
    "https://www.douyin.com/user/MS4wLjABAAAAxbnsuwFWxWYqxu5EHanhlgdwTvzB6L2o5mZ5_RIZx7xvJjm4EVekC_DOK2clZaOe?from_tab_name=main";
const channel = "https://space.bilibili.com/3546875475003918";
const tools = [
    {
        tab: "konz_wiki",
        title: "konzWiki",
        description: "konzWikiCard",
        button: "konzOpenWiki",
        icon: "i-lucide-book-open",
    },
    {
        tab: "blackbox_viewer",
        title: "tabBlackboxViewer",
        description: "konzBlackboxCard",
        button: "konzOpenBlackbox",
        icon: "i-lucide-chart-line",
    },
    {
        tab: "support_snapshot",
        title: "konzSupportSnapshot",
        description: "konzSnapshotCard",
        button: "konzOpenSnapshot",
        icon: "i-lucide-life-buoy",
    },
];
const copied = ref(false);
const copyError = ref(false);
async function copyGroup() {
    try {
        if ((window as any).fpvfixDesktop?.copyGroup) await (window as any).fpvfixDesktop.copyGroup();
        else await navigator.clipboard.writeText("1075517252");
        copied.value = true;
        copyError.value = false;
    } catch {
        copyError.value = true;
    }
}
onMounted(() => GUI.content_ready());
</script>
