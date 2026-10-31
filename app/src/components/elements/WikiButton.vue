<template>
    <div class="cf_doc_version_bt">
        <a
            id="button-documentation"
            href="#konz-wiki"
            :aria-label="$t('betaflightSupportButton')"
            @click.prevent="openWiki"
            >{{ $t("betaflightSupportButton") }}</a
        >
    </div>
</template>
<script setup lang="ts">
import { switchTab } from "@/js/tab_switch";
defineProps<{ docUrl: string }>();
function openWiki() {
    switchTab("konz_wiki", { mode: "shared" });
}
</script>
