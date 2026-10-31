<template>
    <div class="flex flex-wrap items-start justify-between gap-3" data-testid="app-usage-hint">
        <div class="text-sm leading-relaxed space-y-1">
            <p class="text-muted">如若卡住按键盘 F5 刷新 · Ctrl＋鼠标滚轮：放大 / 缩小 · Ctrl＋O：重置页面大小</p>
            <p class="text-muted">批量烧录页面启动自动烧录后无法F5刷新软件</p>
            <p class="font-bold text-error">免费软件！禁止倒卖！如若付费购买及时退款！如若遇到BUG请在交流群反馈</p>
        </div>
        <DistributionLinks class="ml-auto" />
        <AppUpdateStatus />
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-info" @click="noticeOpen = true"
            >软件说明</UButton
        >
        <KonzWelcomeNotice :manual-open="noticeOpen" manual-only @close="noticeOpen = false" />
    </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import AppUpdateStatus from "./AppUpdateStatus.vue";
import DistributionLinks from "./DistributionLinks.vue";
import KonzWelcomeNotice from "../dialogs/KonzWelcomeNotice.vue";
const noticeOpen = ref(false);
</script>
