/**
 * AJAZZ NJ07 / NJ08 configuration protocol ("V1" device class of the vendor
 * WebHID panel at https://nacodex.yjx2012.com/, Next.js chunk 515).
 *
 * Config, battery and version frames are confirmed against a real NJ07 MC
 * (PID 0x2167, firmware 2.0.1, ticket 0156), including a flash write
 * round-trip. The key-map frames below follow the same panel JavaScript and
 * are still unverified on hardware.
 *
 * Transport: output report 0xF0 carrying 63 bytes, answered by an input
 * report whose first data byte echoes the command. The control collection is
 * usage page 0xFF01, usage 0x10, and the panel's device picker requests
 *   [{ vendorId: 0xA8A4, productId, usagePage: 0xFF01, usage: 0x10 },
 *    { vendorId: 0xA8A5, productId, usagePage: 0xFF01, usage: 0x10 }]
 * for each product id below. 0xA8A4 is the wired mouse, 0xA8A5 the 2.4 GHz
 * dongle.
 *
 * This is the same command family as the K-snake X11 (`../ksnake`), with a
 * different first byte and different header bytes. All offsets below are in
 * "body coordinates": index 0 of the 63 bytes WebHID sends, which is also
 * index 0 of the data WebHID hands back (the report id is stripped).
 *
 * This module is transport-independent; `src/drivers/ajazz/hid.ts` does the
 * WebHID exchange.
 */

export const AJAZZ_USB_VENDOR_ID = 0xa8a4;
export const AJAZZ_DONGLE_VENDOR_ID = 0xa8a5;
export const AJAZZ_USAGE_PAGE = 0xff01;
export const AJAZZ_USAGE = 0x10;
export const AJAZZ_REPORT_ID = 0xf0;
export const AJAZZ_BODY_BYTES = 63;

export interface AjazzProduct {
  model: string;
  /** Top of the vendor panel's DPI slider for this model. */
  maxDpi: number;
}

/**
 * Product ids the vendor panel requests, with the DPI range of each model's
 * panel config (`mouse_info_nj07*.json`, `mouse_info_nj08*.json`). The panel
 * also requests 0x2255 (shared with the K-snake X11, so owned by that driver)
 * and 0x2216 on VIDs 0xA8A7/0xA8A9; those need a descriptor to tell apart.
 */
export const AJAZZ_PRODUCTS: ReadonlyMap<number, AjazzProduct> = new Map([
  [0x2157, { model: "NJ07", maxDpi: 12800 }],
  [0x2158, { model: "NJ08", maxDpi: 12800 }],
  [0x2167, { model: "NJ07 MC", maxDpi: 24000 }],
  [0x2168, { model: "NJ08 MC", maxDpi: 24000 }],
  [0x2177, { model: "NJ07 MC PRO", maxDpi: 24000 }],
  [0x2178, { model: "NJ08 MC PRO", maxDpi: 24000 }],
]);

export const AJAZZ_DPI_MIN = 50;
export const AJAZZ_DPI_STEP = 50;
export const AJAZZ_DPI_STAGES = 6;

export function ajazzIsValidDpi(dpi: number, maxDpi: number): boolean {
  return Number.isInteger(dpi) && dpi >= AJAZZ_DPI_MIN && dpi <= maxDpi;
}

/** Polling rate by 0-based index, as the config block stores it. */
export const AJAZZ_POLLING_RATES = [125, 250, 500, 1000] as const;

/** The panel's per-model config lists 125, 500 and 1000 Hz on USB and 2.4G. */
export const AJAZZ_OFFERED_POLLING_RATES = [125, 500, 1000] as const;

export function ajazzEncodePollingRate(hz: number): number | null {
  const index = (AJAZZ_POLLING_RATES as readonly number[]).indexOf(hz);
  return index === -1 ? null : index;
}

export function ajazzDecodePollingRate(index: number): number | null {
  return index >= 0 && index < AJAZZ_POLLING_RATES.length ? AJAZZ_POLLING_RATES[index] : null;
}

/** Auto-sleep choices offered in the UI, in seconds. The panel allows 0 to 100 minutes. */
export const AJAZZ_SLEEP_OPTIONS = [0, 60, 180, 300, 600, 1200, 1800, 3600] as const;

/** The panel's sleep slider runs 0 to 100 minutes and 0 means never sleep. */
export const AJAZZ_SLEEP_MAX_MINUTES = 100;

export function ajazzIsValidSleepSeconds(seconds: number): boolean {
  if (seconds === 0) return true; // the panel's "never sleep"
  return (
    Number.isInteger(seconds) &&
    seconds >= 60 &&
    seconds % 60 === 0 &&
    seconds / 60 <= AJAZZ_SLEEP_MAX_MINUTES
  );
}

const CMD = {
  GET_VERSION: 0x04,
  GET_KEYS: 0x08,
  SET_KEYS: 0x09,
  GET_CONFIG: 0x0e,
  SET_CONFIG: 0x0f,
  GET_BATTERY: 0x30,
} as const;

export const AJAZZ_CMD = CMD;

/** Config block as the panel's `getMouseConfigInfo()` / `setMouseConfigData()` see it. */
export interface AjazzConfig {
  lightMode: number;
  /** 0-based index into AJAZZ_POLLING_RATES */
  reportRate: number;
  /** Number of enabled DPI stages (the panel's `dpi_count` / `dpi_flag`). */
  dpiCount: number;
  /** 0-based active DPI stage */
  dpiIndex: number;
  /** Six little-endian uint16 DPI stages */
  stages: number[];
  /** 0 forward, 1 reverse */
  scrollFlag: number;
  lodValue: number;
  /** Bit 0 is the panel's "line correction" (angle snapping). */
  sensorFlag: number;
  keyRespond: number;
  /** Auto-sleep in minutes, 0 = never */
  sleepMinutes: number;
  highspeedMode: number;
  /**
   * The panel writes `wakeup << 4 | moveLight` here but reads both fields back
   * from the high nibble, so it is carried as one opaque byte.
   */
  wakeByte: number;
}

/** What the panel substitutes when the config block reads back blank or erased. */
export const AJAZZ_BLANK_CONFIG: Readonly<AjazzConfig> = {
  lightMode: 0,
  reportRate: 3,
  dpiCount: 6,
  dpiIndex: 2,
  stages: [800, 1600, 2400, 3200, 5000, 12000],
  scrollFlag: 0,
  lodValue: 1,
  sensorFlag: 53,
  keyRespond: 8,
  sleepMinutes: 10,
  highspeedMode: 0,
  wakeByte: 0x10,
};

function body(...head: number[]): Uint8Array {
  const out = new Uint8Array(AJAZZ_BODY_BYTES);
  out.set(head);
  return out;
}

function le16(lo: number, hi: number): number {
  return ((hi & 0xff) << 8) | (lo & 0xff);
}

export function ajazzGetVersionRequest(): Uint8Array {
  return body(CMD.GET_VERSION, 0x01);
}

export function ajazzGetBatteryRequest(): Uint8Array {
  return body(CMD.GET_BATTERY, 0x01);
}

export function ajazzGetConfigRequest(): Uint8Array {
  return body(CMD.GET_CONFIG, 0x01, 0x0b, 0x2e);
}

/**
 * The panel keeps the last five printable characters of the reply after the
 * two header bytes ("x.y.z"); the rest of the report is padding.
 */
export function ajazzDecodeVersion(reply: Uint8Array): string | null {
  if (reply[0] !== CMD.GET_VERSION) return null;
  const printable = [...reply.slice(2)].filter((b) => b >= 32 && b <= 126);
  return printable.length ? String.fromCharCode(...printable.slice(-5)) : null;
}

/** Battery percent at byte 7 and a charge flag at byte 8 (nonzero while charging). */
export function ajazzDecodeBattery(reply: Uint8Array): { percent: number; charging: boolean } | null {
  if (reply[0] !== CMD.GET_BATTERY || reply.length < 9) return null;
  return { percent: reply[7], charging: reply[8] !== 0 };
}

/**
 * Decode a GET_CONFIG reply. Like the panel, an all-zero or all-0xFF run at
 * bytes 13 to 15 means the flash was never written and the defaults apply.
 */
export function ajazzDecodeConfig(reply: Uint8Array): AjazzConfig | null {
  if (reply[0] !== CMD.GET_CONFIG || reply.length < 54) return null;
  const run = [reply[13], reply[14], reply[15]];
  if (run.every((b) => b === 0) || run.every((b) => b === 0xff)) {
    return { ...AJAZZ_BLANK_CONFIG, stages: [...AJAZZ_BLANK_CONFIG.stages] };
  }
  return {
    lightMode: reply[8],
    reportRate: reply[9] - 1,
    dpiCount: reply[10],
    dpiIndex: Math.max(reply[11] - 1, 0),
    stages: Array.from({ length: AJAZZ_DPI_STAGES }, (_, i) => le16(reply[12 + i * 2], reply[13 + i * 2])),
    scrollFlag: reply[47],
    lodValue: reply[48],
    sensorFlag: reply[49],
    keyRespond: reply[50],
    sleepMinutes: reply[51],
    highspeedMode: reply[52],
    wakeByte: reply[53],
  };
}

/**
 * SET_CONFIG always rewrites the whole block; bytes 4 to 7 and 24 to 46 stay
 * zero exactly as the panel sends them.
 */
export function ajazzEncodeSetConfig(config: AjazzConfig): Uint8Array {
  const out = body(CMD.SET_CONFIG, 0x01, 0x0a, 0x2f);
  out[8] = config.lightMode;
  out[9] = config.reportRate + 1;
  out[10] = config.dpiCount;
  out[11] = config.dpiIndex + 1;
  config.stages.slice(0, AJAZZ_DPI_STAGES).forEach((dpi, i) => {
    out[12 + i * 2] = dpi & 0xff;
    out[13 + i * 2] = (dpi >> 8) & 0xff;
  });
  out[47] = config.scrollFlag;
  out[48] = config.lodValue;
  out[49] = config.sensorFlag;
  out[50] = config.keyRespond;
  out[51] = config.sleepMinutes;
  out[52] = config.highspeedMode;
  out[53] = config.wakeByte;
  return out;
}

/**
 * Button map ("V1" `getMouseKeys()` / `setMouseKeys()` / `resetAllMouseKeys()`).
 *
 * GET_KEYS is body `[0x08, 0x01, 0x0B, 0x2C]`; the reply echoes `0x08` and
 * carries six four-byte slots at reply[7..30]. SET_KEYS is body
 * `[0x09, 0x01, 0x22, 0x30]` with eight slots at body[7..38]: the six
 * remappable buttons followed by two fixed wheel entries (scroll up, scroll
 * down), exactly as the panel's template sends them. `resetAllMouseKeys()`
 * sends the same frame with the six factory defaults up front.
 *
 * Slot types come from the panel's `keys.json` catalog: 32 = mouse button
 * (code1 = HID bitmask, 0 = disabled), 16 = keyboard (code1 = modifier bits,
 * code2 = HID usage), 33 = special (DPI loop [85,0,0], scroll [56,1/255]),
 * 48 = consumer/media (code1 = consumer usage low byte, code2 = page bits),
 * 112 = a macro slot (code1 = macro index). A slot read back as type 0 or
 * 0xff means the panel keeps its default for that button.
 */

/** User-remappable buttons in wire order. */
export const AJAZZ_BUTTON_NAMES = ["Left", "Right", "Middle", "Backward", "Forward", "DPI"] as const;

/** Remappable wire slots; slots 6-7 are the fixed wheel entries. */
export const AJAZZ_KEY_SLOTS = 6;
export const AJAZZ_KEY_WIRE_SLOTS = 8;

/** Button function types from the vendor key catalog. */
export const AJAZZ_KEY_TYPE = {
  keyboard: 16,
  mouse: 32,
  special: 33,
  media: 48,
  macro: 112,
} as const;

/** One button slot: four raw bytes, carried losslessly. */
export interface AjazzKeyBinding {
  type: number;
  code1: number;
  code2: number;
  code3: number;
}

export function ajazzIsKnownKeyType(type: number): boolean {
  return (
    type === AJAZZ_KEY_TYPE.keyboard ||
    type === AJAZZ_KEY_TYPE.mouse ||
    type === AJAZZ_KEY_TYPE.special ||
    type === AJAZZ_KEY_TYPE.media ||
    type === AJAZZ_KEY_TYPE.macro
  );
}

/** Factory button map from every model's `mouse_info_*.json` DefaultProfile. */
export const AJAZZ_DEFAULT_KEYS: ReadonlyArray<AjazzKeyBinding> = [
  { type: 32, code1: 1, code2: 0, code3: 0 },
  { type: 32, code1: 2, code2: 0, code3: 0 },
  { type: 32, code1: 4, code2: 0, code3: 0 },
  { type: 32, code1: 8, code2: 0, code3: 0 },
  { type: 32, code1: 16, code2: 0, code3: 0 },
  { type: 33, code1: 85, code2: 0, code3: 0 },
];

/** Fixed wheel entries the panel always appends as wire slots 6-7. */
export const AJAZZ_FIXED_WHEEL_KEYS: ReadonlyArray<AjazzKeyBinding> = [
  { type: 33, code1: 56, code2: 1, code3: 0 },
  { type: 33, code1: 56, code2: 255, code3: 0 },
];

/** GET_KEYS request body observed in vendor JS: [0x08, 0x01, 0x0B, 0x2C]. */
export function ajazzGetKeysRequest(): Uint8Array {
  return body(CMD.GET_KEYS, 0x01, 0x0b, 0x2c);
}

/**
 * Decode a GET_KEYS reply: six slots of four bytes at reply[7..30] (the
 * vendor slices 7). Returns null when the reply answers another command.
 */
export function ajazzDecodeKeys(reply: Uint8Array): AjazzKeyBinding[] | null {
  if (reply[0] !== CMD.GET_KEYS || reply.length < 7 + AJAZZ_KEY_SLOTS * 4) return null;
  const bindings: AjazzKeyBinding[] = [];
  for (let i = 0; i < AJAZZ_KEY_SLOTS; i++) {
    bindings.push({
      type: reply[7 + i * 4],
      code1: reply[8 + i * 4],
      code2: reply[9 + i * 4],
      code3: reply[10 + i * 4],
    });
  }
  return bindings;
}

/**
 * Plausibility gate for decoded key maps. A crossed report from another
 * command decodes to zeroed/garbage slot types; real maps always carry
 * nonzero, non-0xff types (32/33/48 catalog, 16 keyboard combos, 112 macros).
 */
export function ajazzKeysLookPlausible(keys: readonly AjazzKeyBinding[]): boolean {
  return keys.length === AJAZZ_KEY_SLOTS && keys.every((key) => key.type !== 0 && key.type !== 0xff);
}

/**
 * Encode a SET_KEYS request, mirroring vendor `setMouseKeys()`: head
 * [0x09, 0x01, 0x22, 0x30], the six bindings at body[7..30], then the two
 * fixed wheel entries at body[31..38].
 */
export function ajazzEncodeSetKeys(keys: readonly AjazzKeyBinding[]): Uint8Array {
  const slots = [...keys].slice(0, AJAZZ_KEY_SLOTS);
  while (slots.length < AJAZZ_KEY_SLOTS) slots.push({ type: 32, code1: 0, code2: 0, code3: 0 });
  const out = body(CMD.SET_KEYS, 0x01, 0x22, 0x30);
  [...slots, ...AJAZZ_FIXED_WHEEL_KEYS].forEach((key, n) => {
    out[7 + n * 4] = key.type & 0xff;
    out[8 + n * 4] = key.code1 & 0xff;
    out[9 + n * 4] = key.code2 & 0xff;
    out[10 + n * 4] = key.code3 & 0xff;
  });
  return out;
}

/**
 * Remappable actions from the vendor key catalog (display label + bytes).
 * Keyboard usages use the type-16 encoding with a zero modifier byte; combos
 * with modifiers still read back losslessly as opaque bindings. Macro slots
 * (type 112) are intentionally absent: the panel keeps macros in localStorage
 * and uploads them separately, so there is no fixed onboard slot count yet.
 */
export const AJAZZ_BUTTON_ACTIONS: ReadonlyArray<{
  label: string;
  type: number;
  code1: number;
  code2: number;
  code3: number;
}> = [
  { label: "Escape", type: 16, code1: 0, code2: 41, code3: 0 },
  { label: "Tab", type: 16, code1: 0, code2: 43, code3: 0 },
  { label: "Caps Lock", type: 16, code1: 0, code2: 57, code3: 0 },
  { label: "Enter", type: 16, code1: 0, code2: 40, code3: 0 },
  { label: "Space", type: 16, code1: 0, code2: 44, code3: 0 },
  { label: "Backspace", type: 16, code1: 0, code2: 42, code3: 0 },
  { label: "Insert", type: 16, code1: 0, code2: 73, code3: 0 },
  { label: "Delete", type: 16, code1: 0, code2: 76, code3: 0 },
  { label: "Home", type: 16, code1: 0, code2: 74, code3: 0 },
  { label: "End", type: 16, code1: 0, code2: 77, code3: 0 },
  { label: "Page Up", type: 16, code1: 0, code2: 75, code3: 0 },
  { label: "Page Down", type: 16, code1: 0, code2: 78, code3: 0 },
  { label: "Left Arrow", type: 16, code1: 0, code2: 80, code3: 0 },
  { label: "Right Arrow", type: 16, code1: 0, code2: 79, code3: 0 },
  { label: "Up Arrow", type: 16, code1: 0, code2: 82, code3: 0 },
  { label: "Down Arrow", type: 16, code1: 0, code2: 81, code3: 0 },
  { label: "F1", type: 16, code1: 0, code2: 58, code3: 0 },
  { label: "F2", type: 16, code1: 0, code2: 59, code3: 0 },
  { label: "F3", type: 16, code1: 0, code2: 60, code3: 0 },
  { label: "F4", type: 16, code1: 0, code2: 61, code3: 0 },
  { label: "F5", type: 16, code1: 0, code2: 62, code3: 0 },
  { label: "F6", type: 16, code1: 0, code2: 63, code3: 0 },
  { label: "F7", type: 16, code1: 0, code2: 64, code3: 0 },
  { label: "F8", type: 16, code1: 0, code2: 65, code3: 0 },
  { label: "F9", type: 16, code1: 0, code2: 66, code3: 0 },
  { label: "F10", type: 16, code1: 0, code2: 67, code3: 0 },
  { label: "F11", type: 16, code1: 0, code2: 68, code3: 0 },
  { label: "F12", type: 16, code1: 0, code2: 69, code3: 0 },
  { label: "Left click", type: 32, code1: 1, code2: 0, code3: 0 },
  { label: "Right click", type: 32, code1: 2, code2: 0, code3: 0 },
  { label: "Middle click", type: 32, code1: 4, code2: 0, code3: 0 },
  { label: "Backward", type: 32, code1: 8, code2: 0, code3: 0 },
  { label: "Forward", type: 32, code1: 16, code2: 0, code3: 0 },
  { label: "Disabled", type: 32, code1: 0, code2: 0, code3: 0 },
  { label: "DPI loop", type: 33, code1: 85, code2: 0, code3: 0 },
  { label: "Scroll up", type: 33, code1: 56, code2: 1, code3: 0 },
  { label: "Scroll down", type: 33, code1: 56, code2: 255, code3: 0 },
  { label: "Volume +", type: 48, code1: 233, code2: 0, code3: 0 },
  { label: "Volume −", type: 48, code1: 234, code2: 0, code3: 0 },
  { label: "Mute", type: 48, code1: 226, code2: 0, code3: 0 },
  { label: "Play/Pause", type: 48, code1: 205, code2: 0, code3: 0 },
  { label: "Stop", type: 48, code1: 183, code2: 0, code3: 0 },
  { label: "Prev track", type: 48, code1: 182, code2: 0, code3: 0 },
  { label: "Next track", type: 48, code1: 181, code2: 0, code3: 0 },
  { label: "Multimedia", type: 48, code1: 131, code2: 1, code3: 0 },
  { label: "Homepage", type: 48, code1: 35, code2: 2, code3: 0 },
  { label: "Web refresh", type: 48, code1: 39, code2: 2, code3: 0 },
  { label: "Web stop", type: 48, code1: 38, code2: 2, code3: 0 },
  { label: "Web forward", type: 48, code1: 37, code2: 2, code3: 0 },
  { label: "Web backward", type: 48, code1: 36, code2: 2, code3: 0 },
  { label: "Web favorites", type: 48, code1: 42, code2: 2, code3: 0 },
  { label: "Web search", type: 48, code1: 33, code2: 2, code3: 0 },
  { label: "Calculator", type: 48, code1: 146, code2: 1, code3: 0 },
  { label: "My Computer", type: 48, code1: 148, code2: 1, code3: 0 },
  { label: "Mail", type: 48, code1: 138, code2: 1, code3: 0 },
];

/** Display label for a binding, or null when the catalog cannot name it. */
export function ajazzBindingLabel(binding: AjazzKeyBinding): string | null {
  if (binding.type === AJAZZ_KEY_TYPE.macro && Number.isInteger(binding.code1) && binding.code1 >= 0) {
    return `Macro ${binding.code1 + 1}`;
  }
  return AJAZZ_BUTTON_ACTIONS.find(
    (action) =>
      action.type === binding.type &&
      action.code1 === binding.code1 &&
      action.code2 === binding.code2 &&
      action.code3 === binding.code3,
  )?.label ?? null;
}

/** Catalog binding for a display label, or null for unknown labels. */
export function ajazzFindButtonAction(label: string): AjazzKeyBinding | null {
  const action = AJAZZ_BUTTON_ACTIONS.find((entry) => entry.label === label);
  return action ? { type: action.type, code1: action.code1, code2: action.code2, code3: action.code3 } : null;
}
