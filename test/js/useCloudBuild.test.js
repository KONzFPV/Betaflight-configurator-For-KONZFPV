import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

import { useCloudBuild } from "../../src/composables/useCloudBuild";

function makeParams(buildApiOverrides = {}) {
    return {
        buildApi: {
            getBuildLogUrl: (key) => `./build-api.php?path=/api/builds/${key}/log`,
            requestBuild: vi
                .fn()
                .mockResolvedValue({ key: "build-key", url: "http://example.test/fw.hex", file: "fw.hex" }),
            requestBuildStatus: vi.fn().mockResolvedValue({ status: "queued" }),
            loadTargetFirmware: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
            ...buildApiOverrides,
        },
        $t: (key) => key,
        setBoardConfig: vi.fn(),
        processFile: vi.fn(),
        flashingMessage: vi.fn(),
        enableLoadRemoteFileButton: vi.fn(),
        FLASH_MESSAGE_TYPES: { NEUTRAL: "neutral", INVALID: "invalid" },
    };
}

const targetDetail = { target: "TEST_TARGET", release: "1.0.0", cloudBuild: true };
const additionalParams = { isConfigLocal: false };

describe("useCloudBuild", () => {
    let scope;
    let cloudBuild;
    let params;

    beforeEach(() => {
        vi.useFakeTimers();
        params = makeParams();

        scope = effectScope();
        scope.run(() => {
            cloudBuild = useCloudBuild(params);
        });
    });

    afterEach(() => {
        scope.stop();
        vi.runAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("polls build status on the 5s interval, and stops polling on scope dispose", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        // First call happened synchronously inside requestCloudBuild to check for cached success.
        const callsBeforePoll = params.buildApi.requestBuildStatus.mock.calls.length;

        await vi.advanceTimersByTimeAsync(5000);
        expect(params.buildApi.requestBuildStatus.mock.calls).toHaveLength(callsBeforePoll + 1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(params.buildApi.requestBuildStatus.mock.calls).toHaveLength(callsBeforePoll + 2);

        scope.stop();

        const callsAtDispose = params.buildApi.requestBuildStatus.mock.calls.length;
        await vi.advanceTimersByTimeAsync(20000);

        // No further polling after the effect scope is disposed.
        expect(params.buildApi.requestBuildStatus.mock.calls).toHaveLength(callsAtDispose);
    });

    it("cleanup() followed by scope.stop() does not throw (idempotent double dispose)", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, additionalParams);

        expect(() => {
            cloudBuild.cleanup();
            scope.stop();
        }).not.toThrow();
    });

    it("sends both OSD formats, multiple radios and motors, and optional hardware as flat compile options", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, {
            selectedRadioProtocol: ["USE_SERIALRX_CRSF", "USE_SERIALRX_SBUS", "USE_SERIALRX_IBUS"],
            selectedOsdProtocol: ["USE_OSD_SD", "USE_OSD_HD"],
            selectedMotorProtocol: ["USE_DSHOT", "USE_PWM_OUTPUT"],
            selectedOptions: [{ value: "USE_LED_STRIP_64" }, { value: "USE_MAG" }, { value: "USE_SERVOS" }],
        });

        expect(params.buildApi.requestBuild).toHaveBeenCalledWith({
            target: "TEST_TARGET",
            release: "1.0.0",
            options: [
                "CLOUD_BUILD",
                "USE_SERIALRX_CRSF",
                "USE_SERIALRX_SBUS",
                "USE_SERIALRX_IBUS",
                "USE_OSD_SD",
                "USE_OSD_HD",
                "USE_DSHOT",
                "USE_PWM_OUTPUT",
                "USE_LED_STRIP_64",
                "USE_MAG",
                "USE_SERVOS",
            ],
        });
    });

    it("accepts legacy and object selections, omits UI markers and deduplicates custom defines", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, {
            selectedRadioProtocol: "USE_SERIALRX_CRSF",
            selectedTelemetryProtocol: "-1",
            selectedOsdProtocol: [{ value: "USE_OSD_SD" }, { value: "USE_OSD_HD" }, null],
            selectedMotorProtocol: { value: "USE_DSHOT" },
            selectedOptions: [null, "", { value: "USE_GPS" }],
            expertMode: true,
            customDefinesTags: ["USE_OSD_HD", " USE_SERIALRX_SBUS "],
        });

        expect(params.buildApi.requestBuild.mock.calls[0][0].options).toEqual([
            "CLOUD_BUILD",
            "USE_SERIALRX_CRSF",
            "USE_OSD_SD",
            "USE_OSD_HD",
            "USE_DSHOT",
            "USE_GPS",
            "USE_SERIALRX_SBUS",
        ]);
    });

    it("allows empty OSD and radio selections without serializing arrays or empty tokens", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, {
            selectedRadioProtocol: [],
            selectedOsdProtocol: [],
            selectedTelemetryProtocol: null,
            selectedMotorProtocol: [],
        });

        expect(params.buildApi.requestBuild.mock.calls[0][0].options).toEqual(["CLOUD_BUILD"]);
    });

    it("keeps core builds free of optional radio, OSD and custom defines", async () => {
        await cloudBuild.requestCloudBuild(targetDetail, {
            coreBuildMode: true,
            selectedRadioProtocol: ["USE_SERIALRX_CRSF", "USE_SERIALRX_SBUS"],
            selectedOsdProtocol: ["USE_OSD_SD", "USE_OSD_HD"],
            expertMode: true,
            customDefinesTags: ["USE_GPS"],
        });

        expect(params.buildApi.requestBuild.mock.calls[0][0].options).toEqual(["CORE_BUILD"]);
    });
});
