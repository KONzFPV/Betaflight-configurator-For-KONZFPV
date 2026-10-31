<template>
    <div class="space-y-3 mb-4" data-testid="hardware-options">
        <p class="text-sm font-bold text-error" role="note">{{ $t("konzHardwareWarning") }}</p>
        <p class="text-sm text-muted">{{ $t("konzHardwareHint") }}</p>
        <details class="rounded-lg border border-default p-3">
            <summary class="cursor-pointer text-sm">{{ $t("konzHardwareSources") }}</summary>
            <p class="text-muted text-sm my-3">{{ $t("konzHardwareSourceHint") }}</p>
            <div class="grid md:grid-cols-2 gap-3 text-sm">
                <div v-for="(proof, flag) in evidence.flags" :key="flag">
                    <code class="block break-all">{{ flag }}</code>
                    <a :href="proof.firmware" target="_blank" rel="noopener noreferrer" class="text-primary underline">{{ $t('konzOfficialDriver') }}</a>
                    <a v-if="proof.config" :href="proof.config" target="_blank" rel="noopener noreferrer" class="text-primary underline ml-3">config.h（{{ proof.configCount }}）</a>
                    <span v-else class="text-muted ml-3">{{ $t('konzDriverOnly') }}</span>
                </div>
            </div>
        </details>
        <details v-for="group in hardwareBuildGroups" :key="group.key" class="rounded-lg border border-default p-3">
            <summary class="cursor-pointer font-semibold">{{ $t(group.key) }}</summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <UCheckbox
                    v-for="option in group.options"
                    :key="option.label"
                    :label="option.label"
                    :description="option.flags.join(' ')"
                    :model-value="hardwareOptionSelected(modelValue, option)"
                    @update:model-value="
                        emit('update:modelValue', toggleHardwareOption(modelValue, option, $event === true))
                    "
                />
            </div>
        </details>
        <p class="text-sm text-muted">{{ $t("konzFlashHint") }}</p>
        <p v-if="included.length" class="text-sm text-muted">
            {{ $t("konzBoardIncluded") }}: <code>{{ included.join(" ") }}</code>
        </p>
        <p v-if="invalidTags.length" class="text-sm text-error" role="alert">
            {{ $t("konzInvalidDefines") }}: {{ invalidTags.join(" ") }}
        </p>
        <p v-if="dependencies.length" class="text-sm text-muted">
            {{ $t("konzDependencies") }}: <code>{{ dependencies.join(" ") }}</code>
        </p>
    </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import evidence from "@/data/hardwareEvidence.json";
import {
    hardwareBuildGroups,
    hardwareOptionSelected,
    toggleHardwareOption,
    expandHardwareDefines,
    redundantHardwareDefines,
} from "@/utils/hardwareBuildOptions";
const props = defineProps<{ modelValue: string[]; configHash?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();
const invalidTags = computed(() =>
    props.modelValue.filter((tag) => !/^[A-Z][A-Z0-9_]*(?:=[A-Za-z0-9_.+-]*)?$/.test(tag)),
);
const dependencies = computed(() =>
    expandHardwareDefines(props.modelValue).filter((tag) => !props.modelValue.includes(tag)),
);
const included = computed(() => redundantHardwareDefines(expandHardwareDefines(props.modelValue), props.configHash));
</script>
