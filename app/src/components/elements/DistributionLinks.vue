<template>
    <nav aria-label="其他平台" class="flex flex-col gap-1 text-sm" data-testid="distribution-links">
        <UButton
            :href="links.web || undefined"
            :disabled="!links.web"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-globe"
            size="xs"
            variant="link"
            >{{ links.web ? "网页版访问" : "网页版待上线" }}</UButton
        >
        <UButton
            :href="links.windows"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-monitor-down"
            size="xs"
            variant="link"
            >电脑版下载</UButton
        >
        <UButton
            :href="links.android"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-smartphone"
            size="xs"
            variant="link"
            >Android 下载</UButton
        >
    </nav>
</template>
<script setup lang="ts">
import { DISTRIBUTION as links } from "@/config/distribution";
</script>
