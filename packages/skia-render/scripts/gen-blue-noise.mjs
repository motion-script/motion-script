/**
 * Generates the blue-noise threshold table used by the `dither` effect.
 *
 * Void-and-cluster (Ulichney, "The void-and-cluster method for dither array
 * generation", 1993). The result is a permutation of 0..N-1 over a toroidal
 * grid with the defining property of blue noise: every threshold level, taken as
 * a binary pattern, is *homogeneously* distributed — no clumps and no gaps at
 * any density. That is what a Bayer matrix cannot do; Bayer's levels are a
 * recursive lattice, so its structure is visible as a grid at every density.
 *
 * Run once and commit the output — this is a constant, not a build step:
 *
 *     node packages/skia-render/scripts/gen-blue-noise.mjs > src/effects/blue-noise.ts
 *
 * Deterministic: the PRNG is seeded, so re-running reproduces the same table.
 */

const SIZE = 64;
const N = SIZE * SIZE;

/**
 * Gaussian energy kernel. sigma 1.5 is Ulichney's value — it is what defines
 * "cluster" and "void" at the scale the eye notices. The kernel is truncated at
 * 3 sigma and applied toroidally, so the table tiles seamlessly.
 */
const SIGMA = 1.5;
const RADIUS = Math.ceil(SIGMA * 3);
const KERNEL = [];
for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        KERNEL.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA))]);
    }
}

/** Seeded xorshift, so the committed table is reproducible. */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 0x100000000;
    };
}

const idx = (x, y) => ((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE);

/** Add (or remove) one point's Gaussian contribution to the energy field. */
function splat(energy, p, sign) {
    const px = p % SIZE;
    const py = (p / SIZE) | 0;
    for (const [dx, dy, w] of KERNEL) {
        energy[idx(px + dx, py + dy)] += sign * w;
    }
}

/** The filled cell sitting in the densest neighbourhood. */
function tightestCluster(energy, filled) {
    let best = -1;
    let bestEnergy = -Infinity;
    for (let i = 0; i < N; i++) {
        if (filled[i] && energy[i] > bestEnergy) { bestEnergy = energy[i]; best = i; }
    }
    return best;
}

/** The empty cell sitting in the emptiest neighbourhood. */
function largestVoid(energy, filled) {
    let best = -1;
    let bestEnergy = Infinity;
    for (let i = 0; i < N; i++) {
        if (!filled[i] && energy[i] < bestEnergy) { bestEnergy = energy[i]; best = i; }
    }
    return best;
}

const random = rng(0x9e3779b9);
const filled = new Uint8Array(N);
const energy = new Float64Array(N);

// Seed: a sparse random pattern, then relax it until moving the tightest
// cluster into the largest void is a no-op — that fixed point is the prototype
// binary pattern every rank is grown from.
const SEED_COUNT = Math.floor(N / 10);
for (let placed = 0; placed < SEED_COUNT;) {
    const p = Math.floor(random() * N);
    if (filled[p]) continue;
    filled[p] = 1;
    splat(energy, p, 1);
    placed++;
}

for (;;) {
    const cluster = tightestCluster(energy, filled);
    filled[cluster] = 0;
    splat(energy, cluster, -1);

    const empty = largestVoid(energy, filled);
    if (empty === cluster) { filled[cluster] = 1; splat(energy, cluster, 1); break; }
    filled[empty] = 1;
    splat(energy, empty, 1);
}

const rank = new Int32Array(N).fill(-1);
const prototype = filled.slice();
const prototypeEnergy = energy.slice();

// Phase 1 — ranks below the prototype's density, assigned by repeatedly removing
// the tightest cluster. Counting down means the last point standing is rank 0,
// i.e. the very first pixel to turn on as the threshold rises.
let remaining = SEED_COUNT;
for (let r = SEED_COUNT - 1; r >= 0; r--) {
    const cluster = tightestCluster(energy, filled);
    filled[cluster] = 0;
    splat(energy, cluster, -1);
    rank[cluster] = r;
    remaining--;
}
void remaining;

// Phase 2 — ranks from the prototype up to half density, by filling the largest
// void each time.
filled.set(prototype);
energy.set(prototypeEnergy);
for (let r = SEED_COUNT; r < N / 2; r++) {
    const empty = largestVoid(energy, filled);
    filled[empty] = 1;
    splat(energy, empty, 1);
    rank[empty] = r;
}

// Phase 3 — the upper half. Past half density the roles swap: what matters is
// that the *unset* pixels stay homogeneous, so the field is rebuilt from the
// zeros and the tightest cluster of zeros takes the next rank.
energy.fill(0);
for (let i = 0; i < N; i++) if (!filled[i]) splat(energy, i, 1);
const holes = filled.map((v) => (v ? 0 : 1));
for (let r = N / 2; r < N; r++) {
    const cluster = tightestCluster(energy, holes);
    holes[cluster] = 0;
    splat(energy, cluster, -1);
    rank[cluster] = r;
}

// Ranks are a permutation of 0..N-1; quantize to a byte for the texture. The
// +0.5 centres each level in its bucket so the darkest and lightest thresholds
// are not both clipped to an endpoint.
const bytes = new Uint8Array(N);
for (let i = 0; i < N; i++) {
    if (rank[i] < 0) throw new Error(`cell ${i} never ranked`);
    bytes[i] = Math.min(255, Math.floor(((rank[i] + 0.5) / N) * 256));
}

const base64 = Buffer.from(bytes).toString("base64");
// Emitted as concatenated string literals rather than one long line: a raw
// newline inside a quoted literal is a parse error, and a template literal
// would have to be escaped through this generator's own template.
const wrapped = (base64.match(/.{1,96}/g) ?? [])
    .map((line) => `"${line}"`)
    .join("\n    + ");

process.stdout.write(`/**
 * Blue-noise threshold table, ${SIZE}x${SIZE}, one byte per cell.
 *
 * GENERATED — do not edit by hand. Reproduce with:
 *     node packages/skia-render/scripts/gen-blue-noise.mjs > src/effects/blue-noise.ts
 *
 * Void-and-cluster (Ulichney 1993). See the generator for what the algorithm is
 * doing and why a Bayer matrix cannot substitute.
 */

/** @internal ${SIZE}x${SIZE} thresholds, base64 of the raw bytes. */
const BLUE_NOISE_BASE64 =
    ${wrapped};

/** Edge length of the (square) table. It tiles, so this is also its period. */
export const BLUE_NOISE_SIZE = ${SIZE};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

let decoded: Uint8Array | null = null;

/**
 * The table as raw bytes, decoded once on first use.
 *
 * Decoded by hand rather than with \`atob\`, which is a browser global this
 * package must not reach for — see the platform seams in \`src/platform/\`. The
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
`);
