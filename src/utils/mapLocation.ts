export interface MapLocation { latitude: number; longitude: number; accuracy?: number; source: "system" | "ip" }

export function validLocation(value: unknown): value is Omit<MapLocation, "source"> {
    if (!value || typeof value !== "object") return false;
    const { latitude, longitude } = value as MapLocation;
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export async function locateMap(): Promise<MapLocation | null> {
    const desktop = window.fpvfixDesktop;
    for (const source of ["system", "ip"] as const) {
        try {
            let result;
            if (desktop) result = await desktop.locate({ source });
            else if (source === "system") {
                result = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
                    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
                    reject, { timeout: 8000, maximumAge: 60000 },
                ));
            } else {
                // A browser cannot bypass its proxy; the desktop uses an isolated direct session.
                const response = await fetch("https://get.geojs.io/v1/ip/geo.json", { signal: AbortSignal.timeout(8000) });
                if (!response.ok) continue;
                const value = await response.json();
                result = { latitude: Number(value.latitude), longitude: Number(value.longitude) };
            }
            if (validLocation(result)) return { ...result, source };
        } catch { /* A denied or unavailable system location falls back to the local network. */ }
    }
    return null;
}
