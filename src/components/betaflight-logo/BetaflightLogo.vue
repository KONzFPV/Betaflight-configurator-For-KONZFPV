<template>
    <div class="logo" :title="tooltip">
        <div class="text-2xl font-bold max-[1055px]:text-xs">空致 KONz</div>
        <div class="text-xs mt-1 max-[1055px]:hidden">{{ configuratorVersion }}</div>
    </div>
</template>

<script>
import { computed, defineComponent } from "vue";
import { i18n } from "../../js/localization";

export default defineComponent({
    props: {
        configuratorVersion: {
            type: String,
            required: true,
        },
        firmwareVersion: {
            type: String,
            default: "",
        },
        firmwareId: {
            type: String,
            default: "",
        },
        hardwareId: {
            type: String,
            default: "",
        },
    },
    setup(props) {
        const tooltip = computed(() => {
            const lines = [`${i18n.getMessage("versionLabelConfigurator")}: ${props.configuratorVersion}`];
            if (props.firmwareVersion && props.firmwareId) {
                lines.push(`${i18n.getMessage("versionLabelFirmware")}: ${props.firmwareVersion} ${props.firmwareId}`);
            }
            if (props.hardwareId) {
                lines.push(`${i18n.getMessage("versionLabelTarget")}: ${props.hardwareId}`);
            }
            return lines.join("\n");
        });

        return { tooltip };
    },
});
</script>

<style>
.tab_container .logo {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.25rem 0 0.5rem;
    margin-bottom: 0.5rem;
}

@media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
    .tab_container .logo {
        display: none;
    }
}
</style>
