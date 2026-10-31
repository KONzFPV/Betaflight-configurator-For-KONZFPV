<template>
    <TimedConfirmation
        :open="open || manualOpen"
        :seconds="manualOnly ? 0 : 5"
        title="空致 KONz · 软件使用说明"
        :description="manualOnly ? '软件使用说明，可随时关闭。' : '首次使用前请阅读，5 秒后可关闭。'"
        :confirm-label="manualOnly ? '关闭说明' : '我已阅读，进入软件'"
        @confirm="accept"
    >
        <div class="text-base leading-relaxed space-y-5">
            <p>BF本地端软件由FPVFIX制作，空致为FPVFIX旗下品牌。如需飞塔可以淘宝/咸鱼搜索：空致KONz。</p>
            <p>如需穿越机飞控电调图传维修，抖音/B站搜索:FPVFIX，同时有免费的0基础学习飞控电调维修教程！</p>
            <p class="text-lg" data-testid="free-notice">软件为免费！免费！如若付费购买请立即退款！</p>
            <div>
                <p>对比原本优化了什么内容？</p>
                <p>
                    答：最大特点是无需科学以及任何代理编译固件烧录，内置有三条线路！！！会择优选择。如果突然使用不了或者有科学，可以选择不使用加速！
                </p>
                <p>
                    新增模拟与高清图传OSD同时编译选项！以及多个接收机协议同时编译！以及多个电机协议同时编译！等等，默认已将磁力计与LED64以及舵机烧录功能勾选！并且可以获取编译好的固件！并且有一个可以批量烧录飞控固件的功能！仅支持同一个品牌、同一个固件的飞控！！！！个人DIY批量友好。
                </p>
            </div>
            <div>
                <p>针对于维修师傅：</p>
                <p>如若使用BMI270去替代ICM42688P，烧录固件的时候可以直接通过自定义选项去勾选，无需手动打代码！</p>
            </div>
            <p class="text-lg" data-testid="resale-notice">
                请勿倒卖软件！倒卖可耻！需要穿越机飞控电调图传维修代组等业务可以找FPVFIX！！！
            </p>
        </div>
    </TimedConfirmation>
</template>
<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import TimedConfirmation from "./TimedConfirmation.vue";
const props = defineProps<{ manualOpen?: boolean; manualOnly?: boolean }>();
const emit = defineEmits<{ showOptions: []; close: [] }>();
const storageKey = "konz-welcome-notice-2026-10-v1";
const optionsKey = "konz-initial-settings-shown-v1";
let acknowledged = false;
try {
    acknowledged = localStorage.getItem(storageKey) === "accepted";
} catch {
    /* Show the notice when storage is unavailable. */
}
const open = ref(false);
onMounted(async () => {
    if (props.manualOnly) return;
    await nextTick();
    open.value = !acknowledged;
    if (acknowledged) showOptionsOnce();
});
function showOptionsOnce() {
    try {
        if (localStorage.getItem(optionsKey) === "shown") return;
        localStorage.setItem(optionsKey, "shown");
    } catch {
        /* Continue when settings storage is unavailable. */
    }
    emit("showOptions");
}
async function accept() {
    if (props.manualOnly) {
        emit("close");
        return;
    }
    try {
        localStorage.setItem(storageKey, "accepted");
    } catch {
        /* Continue without persistence. */
    }
    emit("close");
    open.value = false;
    await nextTick();
    showOptionsOnce();
}
</script>
