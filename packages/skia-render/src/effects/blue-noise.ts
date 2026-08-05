/**
 * Blue-noise threshold table, 64x64, one byte per cell.
 *
 * GENERATED — do not edit by hand. Reproduce with:
 *     node packages/skia-render/scripts/gen-blue-noise.mjs > src/effects/blue-noise.ts
 *
 * Void-and-cluster (Ulichney 1993). See the generator for what the algorithm is
 * doing and why a Bayer matrix cannot substitute.
 */

/** @internal 64x64 thresholds, base64 of the raw bytes. */
const BLUE_NOISE_BASE64 =
    "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";

/** Edge length of the (square) table. It tiles, so this is also its period. */
export const BLUE_NOISE_SIZE = 64;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

let decoded: Uint8Array | null = null;

/**
 * The table as raw bytes, decoded once on first use.
 *
 * Decoded by hand rather than with `atob`, which is a browser global this
 * package must not reach for — see the platform seams in `src/platform/`. The
 * table is base64 in source only to keep it compact; the cost is one pass over
 * ~5 KB, once per process.
 */
export function blueNoiseBytes(): Uint8Array {
    if (decoded) return decoded;
    const text = BLUE_NOISE_BASE64.replace(/[^A-Za-z0-9+/]/g, "");
    const out = new Uint8Array((text.length * 3) >> 2);
    let acc = 0;
    let bits = 0;
    let written = 0;
    for (let i = 0; i < text.length; i++) {
        acc = (acc << 6) | ALPHABET.indexOf(text[i]);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[written++] = (acc >> bits) & 0xff;
        }
    }
    decoded = out.subarray(0, written);
    return decoded;
}
