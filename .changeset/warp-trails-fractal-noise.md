---
"@motion-script/core": minor
"@motion-script/web": minor
---

Add the warp family, progressive blur, trails, hue rotation, and a fractal-noise fill.

Six new scene effects, one new fill, and one new field — closing the gaps the
effect set had around displacement, ramped blur, symmetry and procedural texture.

**`displace`** — resamples the content at a position pushed around by a second
image, rather than recolouring it. The general warp: point it at a normal map for
glass, at noise for haze, at a gradient for a directional smear. `channel` picks
whether the map's red/green, luminance or alpha drives the offset. In
`mode: 'backdrop'` it is refraction — the scene bends through the node's
silhouette while the node's own edges stay sharp.

**`wave`** and **`twirl`** — the two procedural warps worth spelling out, needing
no asset. `wave` offsets by a sine of the pixel's own coordinate, in parallel
bands or concentric rings; its `phase` wraps, so a linear tween over 360 loops
seamlessly. `twirl` rotates about a point with a falloff, so the middle spins and
the rim stays pinned.

**`progressiveBlur`** — blur whose radius ramps across the node, linearly or
radially, instead of being uniform. In `mode: 'backdrop'` this is the frosted
panel whose blur *fades out* rather than ending at a hard line, which a plain
backdrop blur cannot express.

**`kaleidoscope`** — folds the content into mirrored wedges about a point.
Animating `angle` sweeps fresh source material through the sampled wedge while
the pattern stays locked, which is not what rotating the node does.

**`trails`** — composites the node with a trail of its own past frames, the
node-level counterpart of the video `echo` filter and sharing its vocabulary.
Note it is history-dependent: exact under linear playback and export, and it
refills after a backwards scrub, exactly as `echo` does after a cold seek.

**`colorAdjustment({ hue })`** — luma-preserving hue rotation in degrees, on both
the scene effect and the media filter. `invert({ channel: 'hue' })` is the fixed
180° case of the same rotation and is unchanged.

**`Fills.fractalNoise`** — a continuous noise *field* rather than the speckle
`Fills.noise` paints: octaves of `value`, `simplex`, `ridged` or `worley` noise
summed at rising frequency, mapped onto a colour ramp. Cloud, smoke, marble,
terrain, cells. It composes with the effect layer rather than duplicating it —
`duotone` over it is marble, `threshold` over it is an organic matte — and it
removes the need to import a PNG for most material looks. The first fill rendered
by a shader rather than by generating pixels on the CPU.

`Fills.noise` also gains a `seed`, so its speckle can finally be animated;
its tile cache is now bounded, since an animated seed would otherwise retain one
full-size texture per frame.
