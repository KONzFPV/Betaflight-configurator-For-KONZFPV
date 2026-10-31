export interface SnapshotEntry {
    command: string;
    context: string;
    section: string;
}
export interface SupportSnapshot {
    text: string;
    entries: SnapshotEntry[];
    board: string;
    version: string;
}
export const snapshotSections = [
    "configuration",
    "ports",
    "receiver",
    "modes",
    "pid",
    "power",
    "motors",
    "osd",
    "other",
];

export function decodeSnapshot(payload: string): string {
    let value: unknown = payload;
    try {
        value = JSON.parse(payload);
    } catch {
        return payload;
    }
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        const object = value as Record<string, unknown>;
        for (const key of ["text", "cli", "content", "data", "dump", "output"]) {
            if (typeof object[key] === "string") return object[key] as string;
        }
    }
    throw new Error("konzSnapshotInvalid");
}

export function parseSupportSnapshot(payload: string): SupportSnapshot {
    const text = decodeSnapshot(payload).replace(/\r\n/g, "\n");
    if (!text.trim() || text.length > 1024 * 1024 || /<\s*(?:!doctype|html)\b/i.test(text))
        throw new Error("konzSnapshotInvalid");
    const version = text.match(/#\s*(Betaflight\s*\/[^\n]+|Betaflight[^\n]+)/i)?.[1] ?? "";
    const board = text.match(/(?:^|\n)\s*(?:#\s*)?board_name\s+(\S+)/)?.[1] ?? "";
    const entries: SnapshotEntry[] = [];
    let context = "master";
    let recognized = Boolean(version || board);
    for (const raw of text.split("\n")) {
        const command = raw.trim();
        if (!command || command.startsWith("#")) continue;
        if (/^(?:profile|rateprofile)\s+\d+/.test(command)) context = command;
        if (
            /^(?:set |serial |aux |resource |feature |mixer |motor |profile |rateprofile |vtxtable |led |map |rxrange |rxfail |board_name |manufacturer_id )/.test(
                command,
            )
        )
            recognized = true;
        let section = "other";
        if (/^(?:serial |resource (?:SERIAL|I2C|SPI)|set (?:serial_|softserial_|gps_))/.test(command)) section = "ports";
        else if (
            /^(?:map |rxrange |rxfail |set (?:rx_|rc_|serialrx_|sbus_|crsf_|spektrum_|mid_rc|min_check|max_check))/.test(
                command,
            )
        )
            section = "receiver";
        else if (/^(?:aux |adjrange |set (?:failsafe_|rescue_))/.test(command)) section = "modes";
        else if (
            /^(?:profile |rateprofile |set (?:p_|i_|d_|f_|d_min|pid_|roll_|pitch_|yaw_|rates|rate_|tpa_|dyn_|gyro_|dterm_|feedforward_|simplified_|anti_gravity|iterm_))/.test(
                command,
            )
        )
            section = "pid";
        else if (/^set (?:vbat_|ibat_|battery_|current_|voltage_|force_battery_)/.test(command)) section = "power";
        else if (
            /^(?:motor |mixer |mmix |servo |smix |resource (?:MOTOR|SERVO)|set (?:motor_|dshot_|servo_|digital_idle|min_throttle|max_throttle))/.test(
                command,
            )
        )
            section = "motors";
        else if (/^(?:vtxtable |set (?:osd_|vtx_|max7456_|displayport_))/.test(command)) section = "osd";
        else if (/^(?:set |feature |resource |board_name |manufacturer_id |name |led |beeper |beacon )/.test(command))
            section = "configuration";
        entries.push({ command, context, section });
    }
    if (!recognized) throw new Error("konzSnapshotInvalid");
    return { text, entries, board, version };
}

export function isSupportId(value: string): boolean {
    return /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|SUP-[A-Z0-9]{8,48})$/i.test(value.trim());
}
