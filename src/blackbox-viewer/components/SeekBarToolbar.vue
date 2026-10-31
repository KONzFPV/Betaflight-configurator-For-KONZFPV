<template>
    <span id="seekbarToolbar" class="non-shift">
        <div id="seekbarType" class="seekBar-selection" :title="$t('konzBbvValuetoplot')">
            <USelect v-model="seekbarType" :items="seekbarOptions" size="xs" class="w-full" />
        </div>
    </span>
</template>

<script setup>
import { bbText } from "../translate";
import { computed } from "vue";
import { useGraphStore } from "../stores/graph.js";

const graphStore = useGraphStore();

const seekbarOptions = [
    { label: bbText("Average motor throttle"), value: "avgThrottle" },
    { label: bbText("Maximum stick input"), value: "maxRC" },
    { label: bbText("Maximum motor differential"), value: "maxMotorDiff" },
];

const seekbarType = computed({
    get: () => graphStore.seekBarMode || "avgThrottle",
    set: (val) => graphStore.setSeekBarMode?.(val),
});
</script>
