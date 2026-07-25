/**
 * CSS color string parser → normalized [R, G, B, A] float tuple.
 *
 * Supported formats:
 *  - Named colors (CSS Level 4, 148 entries) and theme aliases via {@link setTheme}
 *  - Hex: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`
 *  - `rgb()` / `rgba()` — legacy comma and modern space/slash syntax
 *  - `hsl()` / `hsla()`
 *  - `lab()`, `lch()`
 *  - `oklab()`, `oklch()`
 *  - Tailwind-style opacity suffix: `"white/10"`, `"primary/90"` (percent 0–100)
 *
 * All output values are in the linear 0–1 range suitable for WebGL uniforms.
 * Named-color lookup is O(1); all other formats are parsed with lightweight
 * regex — no DOM, no `getComputedStyle`.
 */

import { CSS_COLOR_MAP } from './constants';

/** Normalized RGBA color: `[red, green, blue, alpha]` each in the 0–1 range. */
export type NormalizedColor = [number, number, number, number];

/** Loose color input accepted by prop interfaces — CSS string or pre-normalized tuple. */
export type Color = string | NormalizedColor;

// ── Color space helpers ───────────────────────────────────────────────────────

/** Applies the sRGB gamma curve to a single linear-light channel. */
function gammaEncode(c: number): number {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Converts a linear-light sRGB triple to gamma-encoded sRGB. */
function linearToSrgb(r: number, g: number, b: number, a: number): NormalizedColor {
    return [gammaEncode(r), gammaEncode(g), gammaEncode(b), a];
}

/** Bradford-adapted XYZ D65 → linear-light sRGB matrix (IEC 61966-2-1). */
function xyzD65ToLinearSrgb(X: number, Y: number, Z: number): [number, number, number] {
    return [
        3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
        -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
        0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
    ];
}

// ── Argument parser ───────────────────────────────────────────────────────────

/**
 * Splits the inner content of a CSS color function into channel tokens and
 * an alpha value. Handles the slash-alpha syntax used by modern `rgb()` /
 * `hsl()` as well as the legacy comma-alpha form used by `rgba()` / `hsla()`.
 */
function parseArgs(inner: string): { tokens: string[]; alpha: number } {
    const slashIdx = inner.lastIndexOf('/');
    let alpha = 1;
    let colorPart = inner;
    if (slashIdx !== -1) {
        const alphaStr = inner.slice(slashIdx + 1).trim();
        alpha = alphaStr.endsWith('%') ? parseFloat(alphaStr) / 100 : parseFloat(alphaStr);
        colorPart = inner.slice(0, slashIdx);
    }
    return { tokens: colorPart.trim().split(/[\s,]+/).filter(Boolean), alpha };
}

// ── Per-format parsers ────────────────────────────────────────────────────────

// Use a globalThis key so multiple bundled copies of this module (e.g. the
// prebuilt player bundle and the Vite-compiled user code) share one map.
const _g = globalThis as Record<string, unknown>;
if (!_g.__msThemeMap) _g.__msThemeMap = new Map<string, NormalizedColor>();
const THEME_COLOR_MAP = _g.__msThemeMap as Map<string, NormalizedColor>;

// Typography presets ride the same shared-global pattern as the color map, so
// the prebuilt player bundle and the user's Vite-compiled code read one registry
// — `setTheme` (called once per build at the player/headless entry points)
// populates both before any scene generator runs.
if (!_g.__msTypographyMap) _g.__msTypographyMap = new Map<string, Record<string, unknown>>();
const TYPOGRAPHY_MAP = _g.__msTypographyMap as Map<string, Record<string, unknown>>;

// Structural mirror of `@/project/config`'s `Theme` (and its color token shape),
// declared locally so this module stays a leaf — `config.ts` imports `Color`
// from here, so importing `Theme` back would be a cycle. The project's `Theme`
// is structurally compatible, so `setTheme(config.theme)` just works.
// `typography` presets are stored opaquely (the parser never reads their fields),
// so the value type is the loose `object` — this stays assignable from `Theme`'s
// `TypographyPreset` (a `TextStyle` interface, which lacks an implicit string
// index signature and so is not a `Record<string, unknown>`).
type ColorTokenInput = Color | { [key: string]: ColorTokenInput };
interface ThemeInput {
    colors?: Record<string, ColorTokenInput>;
    typography?: Record<string, object>;
}

/**
 * Recursively flatten nested color groups into dash-joined, lowercased keys
 * (`{ brand: { 500: '#…' } }` → `brand-500`), parsing each leaf to a normalized
 * color. Arrays are leaves (a pre-normalized `[R,G,B,A]` tuple); strings are
 * leaves; only plain objects recurse.
 */
function flattenColors(
    tokens: Record<string, ColorTokenInput> | undefined,
    prefix: string,
    out: Map<string, NormalizedColor>,
): void {
    if (!tokens) return;
    for (const [name, token] of Object.entries(tokens)) {
        const key = prefix ? `${prefix}-${name}` : name;
        if (token != null && !Array.isArray(token) && typeof token === 'object') {
            flattenColors(token as Record<string, ColorTokenInput>, key, out);
        } else {
            const color = token as Color;
            out.set(key.toLowerCase(), Array.isArray(color) ? (color as NormalizedColor) : parseColor(color));
        }
    }
}

/**
 * Registers a project theme: named colors (referenceable by name in any color
 * string) and typography presets (selected via a `Text`/`RichText` `variant`).
 *
 * Color entries take precedence over CSS named colors; nested color groups are
 * flattened to dash-joined names (`{ brand: { 500: … } }` → `brand-500`). Call
 * with no argument (or an empty object) to clear both registries.
 *
 * The `default` typography key is reserved: it's read directly by
 * {@link applyTextDefaults} (not just via `variant`) and applied to every
 * `Text`/`RichText` as a project-wide base style.
 *
 * @example
 * setTheme({
 *   colors: { brand: "#ff6b35", accent: { 500: "oklch(70% 0.2 145)" } },
 *   typography: {
 *     default: { fontFamily: "Inter", fontSize: 32 },
 *     header: { fontSize: 96, fontWeight: 700 },
 *   },
 * });
 * // Later: fill="brand", fill="accent-500", <Text variant="header" />
 */
export function setTheme(theme: ThemeInput = {}): void {
    THEME_COLOR_MAP.clear();
    TYPOGRAPHY_MAP.clear();
    flattenColors(theme.colors, '', THEME_COLOR_MAP);
    if (theme.typography) {
        for (const [name, preset] of Object.entries(theme.typography)) {
            // Stored opaquely; `applyTextDefaults` reads fields by key. The `object`
            // preset is widened to the readable record shape at this boundary only.
            TYPOGRAPHY_MAP.set(name.toLowerCase(), preset as Record<string, unknown>);
        }
    }
}

/** Looks up a registered typography preset by variant name (case-insensitive);
 *  `undefined` if none is registered. */
export function getTypographyPreset(name: string): Record<string, unknown> | undefined {
    return TYPOGRAPHY_MAP.get(name.toLowerCase());
}

/** Looks up a color name in the theme map first, then the CSS named-color table. */
function parseNamedColor(str: string): NormalizedColor | null {
    return THEME_COLOR_MAP.get(str) ?? CSS_COLOR_MAP.get(str) ?? null;
}

/** Parses `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` hex strings. */
function parseHex(str: string): NormalizedColor | null {
    if (!str.startsWith('#')) return null;
    let hex = str.slice(1);
    // Expand shorthand: #RGB → #RRGGBB, #RGBA → #RRGGBBAA
    if (hex.length === 3 || hex.length === 4)
        hex = hex.split('').map(c => c + c).join('');
    const int = parseInt(hex, 16);
    if (hex.length === 6)
        return [(int >> 16 & 255) / 255, (int >> 8 & 255) / 255, (int & 255) / 255, 1];
    if (hex.length === 8)
        return [(int >>> 24) / 255, (int >> 16 & 255) / 255, (int >> 8 & 255) / 255, (int & 255) / 255];
    return null;
}

/** Parses `rgb()` / `rgba()` — both percentage and 0-255 channel forms. */
function parseRgb(str: string): NormalizedColor | null {
    const m = str.match(/^rgba?\s*\((.+)\)/);
    if (!m) return null;
    const { tokens, alpha } = parseArgs(m[1]);
    const r = tokens[0].endsWith('%') ? parseFloat(tokens[0]) / 100 : parseFloat(tokens[0]) / 255;
    const g = tokens[1].endsWith('%') ? parseFloat(tokens[1]) / 100 : parseFloat(tokens[1]) / 255;
    const b = tokens[2].endsWith('%') ? parseFloat(tokens[2]) / 100 : parseFloat(tokens[2]) / 255;
    // Legacy rgba() puts alpha as 4th comma arg; modern rgb() uses slash (handled by parseArgs).
    const a = tokens.length > 3 ? parseFloat(tokens[3]) : alpha;
    return [r, g, b, a];
}

/** Parses `hsl()` / `hsla()`. Hue unit suffixes (`deg`, `rad`, `turn`) are stripped by `parseFloat`. */
function parseHsl(str: string): NormalizedColor | null {
    const m = str.match(/^hsla?\s*\((.+)\)/);
    if (!m) return null;
    const { tokens, alpha } = parseArgs(m[1]);
    const h = parseFloat(tokens[0]);
    const s = parseFloat(tokens[1]) / 100;
    const l = parseFloat(tokens[2]) / 100;
    const a = tokens.length > 3 ? parseFloat(tokens[3]) : alpha;
    const k = (n: number) => (n + h / 30) % 12;
    const chroma = s * Math.min(l, 1 - l);
    const f = (n: number) => l - chroma * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4), a];
}

/** Parses `lab(L a b)` (CIE L*a*b*, D50 white point). */
function parseLab(str: string): NormalizedColor | null {
    const m = str.match(/^lab\s*\((.+)\)/);
    if (!m) return null;
    const { tokens, alpha } = parseArgs(m[1]);
    const L = parseFloat(tokens[0]);
    const a = parseFloat(tokens[1]);
    const b = parseFloat(tokens[2]);
    return labToNormalized(L, a, b, alpha);
}

/** Parses `lch(L C H)` (CIE L*C*h°, polar form of Lab). */
function parseLch(str: string): NormalizedColor | null {
    const m = str.match(/^lch\s*\((.+)\)/);
    if (!m) return null;
    const { tokens, alpha } = parseArgs(m[1]);
    const L = parseFloat(tokens[0]);
    const C = parseFloat(tokens[1]);
    const H = parseFloat(tokens[2]);
    const rad = H * (Math.PI / 180);
    return labToNormalized(L, C * Math.cos(rad), C * Math.sin(rad), alpha);
}

/** Parses `oklab(L a b)` (Oklab perceptually uniform color space). */
function parseOklab(str: string): NormalizedColor | null {
    const m = str.match(/^oklab\s*\((.+)\)/);
    if (!m) return null;
    const { tokens, alpha } = parseArgs(m[1]);
    // L: 0–1 as number, or 0%–100% (100% = 1); a, b: 100% = 0.4 per CSS Color 4.
    const L = tokens[0].endsWith('%') ? parseFloat(tokens[0]) / 100 : parseFloat(tokens[0]);
    const a = tokens[1].endsWith('%') ? parseFloat(tokens[1]) / 100 * 0.4 : parseFloat(tokens[1]);
    const b = tokens[2].endsWith('%') ? parseFloat(tokens[2]) / 100 * 0.4 : parseFloat(tokens[2]);
    return oklabToNormalized(L, a, b, alpha);
}

/** Parses `oklch(L C H)` (polar form of Oklab). */
function parseOklch(str: string): NormalizedColor | null {
    const m = str.match(/^oklch\s*\((.+)\)/);
    if (!m) return null;
    const { tokens, alpha } = parseArgs(m[1]);
    // L: 0–1 or percentage; C: 0–0.4 or percentage (100% = 0.4).
    const L = tokens[0].endsWith('%') ? parseFloat(tokens[0]) / 100 : parseFloat(tokens[0]);
    const C = tokens[1].endsWith('%') ? parseFloat(tokens[1]) / 100 * 0.4 : parseFloat(tokens[1]);
    const H = parseFloat(tokens[2]);
    const rad = H * (Math.PI / 180);
    return oklabToNormalized(L, C * Math.cos(rad), C * Math.sin(rad), alpha);
}

// ── CIE conversion helpers ────────────────────────────────────────────────────

/** Converts CIE L*a*b* (D50) to a normalized sRGB color. */
function labToNormalized(L: number, a: number, b: number, alpha: number): NormalizedColor {
    const e = 0.008856, k = 903.3;
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    const X = (fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * 0.95047;
    const Y = L > k * e ? ((L + 16) / 116) ** 3 : L / k;
    const Z = (fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * 1.08883;
    const [lr, lg, lb] = xyzD65ToLinearSrgb(X, Y, Z);
    return linearToSrgb(lr, lg, lb, alpha);
}

/** Converts Oklab to a normalized sRGB color using the standard Björn Ottosson matrix. */
function oklabToNormalized(L: number, a: number, b: number, alpha: number): NormalizedColor {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    return linearToSrgb(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.6956065236 * s,
        alpha,
    );
}

// ── Opacity suffix ─────────────────────────────────────────────────────────────

/**
 * Splits a Tailwind-style opacity suffix (`"white/10"`, `"primary/90"`) off the
 * end of a color string. The suffix is a slash followed by a number (optionally
 * with a `%`) interpreted as a percentage 0–100.
 *
 * Only a trailing slash that sits *outside* any parentheses is treated as an
 * opacity modifier, so the internal slash-alpha syntax of `rgb()` / `hsl()`
 * (e.g. `rgb(0 0 255 / 0.25)`) is left untouched.
 *
 * @returns the bare color string and the opacity fraction (1 when absent).
 */
function splitOpacitySuffix(str: string): { color: string; opacity: number } {
    if (str.includes('(')) return { color: str, opacity: 1 };
    const m = str.match(/^(.*[^/])\/\s*([\d.]+)%?$/);
    if (!m) return { color: str, opacity: 1 };
    const pct = parseFloat(m[2]);
    if (!Number.isFinite(pct)) return { color: str, opacity: 1 };
    return { color: m[1].trim(), opacity: Math.max(0, Math.min(1, pct / 100)) };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Parses a CSS color string into a normalized `[R, G, B, A]` array (0.0–1.0).
 *
 * Supported formats: named colors (CSS + theme), hex, rgb/rgba, hsl/hsla,
 * lab, lch, oklab, oklch, plus a Tailwind-style opacity suffix (`"white/10"`).
 * Falls back to opaque black and logs a warning for unrecognised input.
 */
export function parseColor(cssStr: string): NormalizedColor {
    const { color: str, opacity } = splitOpacitySuffix(cssStr.trim().toLowerCase());
    const parsed =
        parseNamedColor(str) ??
        parseHex(str) ??
        parseRgb(str) ??
        parseHsl(str) ??
        parseLab(str) ??
        parseLch(str) ??
        parseOklab(str) ??
        parseOklch(str) ??
        (console.warn(`[Motion Engine] Unsupported color format: "${cssStr}". Defaulting to black.`), [0, 0, 0, 1] as NormalizedColor);
    // Clone before applying opacity: named/theme lookups return cached tuples.
    if (opacity !== 1) return [parsed[0], parsed[1], parsed[2], parsed[3] * opacity];
    return parsed;
}
