<template>
    <figure class="rounded-xl border border-default p-4 mt-5 bg-elevated" :aria-label="$t('konzSnapshotPicture')">
        <div class="grid md:grid-cols-3 gap-4">
            <div class="rounded-lg border border-default bg-default p-4">
                <p class="font-bold mb-3">① {{ $t('tabCLI') }}</p>
                <div class="font-mono text-sm p-3 bg-elevated rounded mb-3"># status<br /># diff all<br /># …</div>
                <span class="inline-block rounded bg-primary text-inverted font-semibold px-3 py-2">{{ $t('konzGuideSubmit') }}</span>
            </div>
            <div class="rounded-lg border border-default bg-default p-4">
                <p class="font-bold mb-3">② {{ $t('konzGuideCopy') }}</p>
                <p class="text-sm mb-3">{{ $t('konzGuideId') }}</p>
                <code class="block border-2 border-primary rounded p-3 break-all">ID: SUP-EXAMPLE</code>
                <p class="text-muted text-xs mt-3">{{ $t('konzGuideExample') }}</p>
            </div>
            <div class="rounded-lg border border-default bg-default p-4">
                <p class="font-bold mb-3">③ {{ $t('konzLoadSnapshot') }}</p>
                <div class="border border-default rounded px-3 py-2 text-muted text-sm mb-3">SUP-EXAMPLE</div>
                <span class="inline-block rounded bg-primary text-inverted font-semibold px-3 py-2">{{ $t('konzLoadSnapshot') }}</span>
                <p class="text-sm mt-3">{{ $t('konzGuideReadOnly') }}</p>
            </div>
        </div>
        <figcaption class="text-muted text-sm mt-3">{{ $t('konzSnapshotPicture') }}</figcaption>
    </figure>
</template>
<script setup lang="ts">
</script>
