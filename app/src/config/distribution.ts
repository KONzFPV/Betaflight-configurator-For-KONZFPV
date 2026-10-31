export const DISTRIBUTION = {
    web: import.meta.env.VITE_KONZ_WEB_URL || "",
    windows: "https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases/latest",
    android: "https://github.com/KONzFPV/Betaflight-configurator-For-KONZFPV/releases/latest/download/KONz-Android.apk",
} as const;
