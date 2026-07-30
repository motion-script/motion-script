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

**`trails`** — echoes the node along its own motion, the node-level counterpart
of the video `echo` filter and sharing its vocabulary. Derived from the node's
sampled velocity exactly as `motionBlur` is, rather than from a buffer of past
frames, which keeps it a pure function of the playhead: a backward scrub lands on
the same trail a forward play would, and a single-frame render shows it in full.
The trade is that a tap extrapolates along the current velocity, so a trail
spanning a sharp curve straightens.

`EffectGeometry` gains `velocity` and `angularVelocity` so a shader effect can
read the node's sampled motion directly, instead of every velocity-derived effect
needing its own resolve step the way `motionBlur` has.

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
