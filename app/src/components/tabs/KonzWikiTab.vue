<template>
    <BaseTab tab-name="konz_wiki">
        <div class="p-5 space-y-4">
            <h1 class="text-2xl font-bold">{{ $t("konzWiki") }}</h1>
            <p class="text-sm text-muted">{{ $t("konzWikiScope") }}</p>
            <div v-if="error" role="alert">{{ error }}</div>
            <div v-else class="grid grid-cols-1 md:grid-cols-[17rem_1fr] gap-6">
                <aside class="space-y-3">
                    <UInput v-model="search" :placeholder="$t('search')" icon="i-lucide-search" class="w-full" />
                    <div class="max-h-[65vh] overflow-auto space-y-1">
                        <UButton
                            v-for="page in filtered"
                            :key="page.id"
                            block
                            :variant="selected === page.id ? 'soft' : 'ghost'"
                            color="neutral"
                            class="justify-start text-left whitespace-normal"
                            @click="selected = page.id"
                        >
                            {{ chinese ? page.titleZh || page.title : page.title }}
                        </UButton>
                    </div>
                </aside>
                <div v-if="current" class="min-w-0">
                    <div class="flex items-center flex-wrap gap-3 mb-4">
                        <UBadge color="neutral" variant="subtle">{{
                            !showOriginal && chinese && (current.zh || current.translatedHtml)
                                ? $t("konzWikiTranslated")
                                : $t("konzOfficialEnglish")
                        }}</UBadge>
                        <UButton
                            :to="`https://betaflight.com/docs/wiki/${current.id === 'wiki' ? '' : current.id}`"
                            target="_blank"
                            variant="link"
                            size="sm"
                            >{{ $t("konzSource") }}</UButton
                        >
                        <UButton color="neutral" variant="outline" size="sm" @click="showOriginal = !showOriginal">{{
                            showOriginal ? "查看中文译文" : "查看原文"
                        }}</UButton>
                    </div>
                    <article class="konz-wiki-article" @click="followLink" v-html="html"></article>
                </div>
            </div>
        </div>
    </BaseTab>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTranslation } from "i18next-vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";

interface WikiPage {
    id: string;
    title: string;
    titleZh?: string;
    body: string;
    zh?: string;
    translatedHtml?: string;
}
const pages = ref<WikiPage[]>([]);
const selected = ref("wiki");
const search = ref("");
const showOriginal = ref(false);
const error = ref("");
const { t, i18next } = useTranslation();
const chinese = computed(() => {
    void i18next.language;
    return i18n.getCurrentLocale() === "zh_CN";
});
const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    return pages.value.filter(
        (page) => !q || `${page.title} ${page.titleZh || ""} ${page.id} ${page.zh || ""}`.toLowerCase().includes(q),
    );
});
const current = computed(() => pages.value.find((page) => page.id === selected.value));
const html = computed(() => {
    const page = current.value;
    if (!page) return "";
    if (!showOriginal.value && chinese.value && page.translatedHtml && !page.zh)
        return DOMPurify.sanitize(page.translatedHtml);
    const text = !showOriginal.value && chinese.value && page.zh ? page.zh : page.body;
    return DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
});
function followLink(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("#")) return;
    const url = new URL(href, `https://betaflight.com/docs/wiki/${selected.value}`);
    if (url.hostname !== "betaflight.com" || !url.pathname.startsWith("/docs/wiki")) return;
    const id =
        decodeURIComponent(
            url.pathname
                .replace(/^\/docs\/wiki\/?/, "")
                .replace(/\.mdx?$/, "")
                .replace(/\/$/, ""),
        ) || "wiki";
    const page = pages.value.find((entry) => entry.id === id || entry.id === `${id}/index`);
    if (page) {
        event.preventDefault();
        selected.value = page.id;
    }
}
onMounted(async () => {
    GUI.content_ready();
    try {
        const response = await fetch("./resources/konz-wiki/catalog.json");
        if (!response.ok) throw new Error("Wiki unavailable");
        pages.value = await response.json();
        const translations = await fetch("./resources/konz-wiki/translations.json");
        if (translations.ok) {
            const data = await translations.json();
            pages.value = pages.value.map((page) => ({
                ...page,
                titleZh: data[page.id]?.titleZh || page.titleZh,
                translatedHtml: data[page.id]?.html,
            }));
        }
    } catch {
        error.value = t("konzWikiFailed");
    }
});
</script>
