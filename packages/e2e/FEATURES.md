# Motion Script Visual Test Scenes

Project: 960×540 (Quarter HD), 30 fps
Screenshots: first, mid, and last frame of each scene.

---

## Nodes

### Geometry

- [ ] `rect-basic`: Rect with fixed width/height, solid fill
- [ ] `rect-corner-radius`: Rect with uniform corner radius (rounded style)
- [ ] `rect-corner-radius-per-corner`: Rect with 4 different corner radii
- [ ] `rect-corner-style-angled`: Rect with angled/chamfer corner style
- [ ] `ellipse-circle`: Ellipse at 1:1 ratio (circle)
- [ ] `ellipse-arc`: Ellipse with partial sweep and startAngle
- [ ] `ellipse-pie`: Ellipse sweep creating a pie/wedge shape
- [ ] `ellipse-ratio`: Ellipse with non-1 ratio (ring/donut)
- [ ] `polygon-triangle`: 3-sided polygon
- [ ] `polygon-pentagon`: 5-sided polygon
- [ ] `polygon-hexagon`: 6-sided polygon
- [ ] `polygon-corner-radius`: Polygon with rounded corners
- [ ] `polygon-corner-angled`: Polygon with angled corners
- [ ] `polygram-star-5`: 5-point star (polygram, default ratio)
- [ ] `polygram-star-6`: 6-point star
- [ ] `polygram-star-ratio`: Star with low ratio (sharper points)
- [ ] `polygram-rounded`: Star with rounded inner/outer corners
- [ ] `path-svg-string`: Path from SVG `d` string
- [ ] `path-morph`: Animated path morph between two shapes
- [ ] `line-open`: Open multi-point line
- [ ] `line-closed`: Closed multi-point line (polygon via line)
- [ ] `line-rounded`: Line with rounded joins

### Layout

- [ ] `rect-layout-row`: Rect in row layout mode with child rects
- [ ] `rect-layout-column`: Rect in column layout mode with child rects
- [ ] `rect-layout-stack`: Rect in stack layout mode (overlapping children)
- [ ] `rect-layout-gap`: Row/column with explicit gap
- [ ] `rect-layout-padding`: Rect with uniform padding around children
- [ ] `rect-layout-padding-per-side`: Rect with different padding on each side
- [ ] `rect-size-fill`: Child using `"fill"` size inside parent
- [ ] `rect-size-hug`: Parent using `"hug"` size around children
- [ ] `rect-size-max-constraints`: Child constrained by `maxWidth`/`maxHeight`
- [ ] `flex-align`: Flex container with various alignment combinations
- [ ] `flex-main-flex`: Children with different `mainFlex` weights distributing free space
- [ ] `grid-basic`: Grid with explicit columns and uniform children
- [ ] `grid-colspan`: Grid with colSpan and rowSpan variants

### Text

- [ ] `text-basic`: Single-line text, default style
- [ ] `text-multiline-wrap`: Text with wrap and constrained width
- [ ] `text-align-variants`: Left/center/right/justify alignment in one scene
- [ ] `text-font-weight`: Multiple weights of same font family
- [ ] `text-letter-spacing`: Positive and negative letterSpacing
- [ ] `text-line-height`: Multiline text with custom lineHeight
- [ ] `text-autofit`: Text with `"autofit"` size scaling to bounds
- [ ] `text-on-path`: Text laid along a circular/curved SVG path
- [ ] `text-fill-gradient`: Text with a gradient fill instead of solid color
- [ ] `richtext-basic`: RichText with nested spans, each a different style
- [ ] `richtext-inline-stroke`: RichText span with stroke applied to one word
- [ ] `number-node-integer`: NumberNode counting from 0 to 1000
- [ ] `number-node-currency`: NumberNode formatted as currency
- [ ] `number-node-percent`: NumberNode formatted as percentage

### Media

- [ ] `image-fit-fill`: Image with `fill` fit mode
- [ ] `image-fit-fit`: Image with `fit` fit mode
- [ ] `image-fit-tile`: Image with `tile` fit mode
- [ ] `image-fit-stretch`: Image with `stretch` fit mode
- [ ] `video-playback`: Video node playing, with trim start/end
- [ ] `video-speed`: Video node at 2× speed
- [ ] `video-loop`: Video node looping over a short clip

### Camera

- [ ] `camera-zoom`: Camera zooming in on a scene
- [ ] `camera-pan`: Camera panning (origin offset) across objects
- [ ] `camera-heading`: Camera rotating (heading) around viewport center
- [ ] `camera-combined`: Zoom + pan + heading all animated together

### Control Nodes

- [ ] `mask-alpha`: Mask in alpha mode (soft edge via gradient)
- [ ] `mask-vector`: Mask in vector mode (hard geometric clip)
- [ ] `mask-luminance`: Mask in luminance mode (grayscale as transparency)
- [ ] `mask-invert`: Inverted mask (shows where mask is NOT)
- [ ] `mask-apply-fill`: Mask with `apply: "fill"` (only fill layer is masked, stroke shows through)
- [ ] `mask-apply-stroke`: Mask with `apply: "stroke"` (only stroke layer is masked)
- [ ] `boolean-toggle`: Boolean node toggling child visibility at midpoint
- [ ] `provider-theme`: Provider + ThemeProvider supplying custom theme colors
- [ ] `default-text-style`: DefaultTextStyle node overriding font family for subtree

### Grid / Pattern

- [ ] `line-grid-basic`: LineGrid with major divisions only
- [ ] `line-grid-subdivisions`: LineGrid with major and minor subdivisions
- [ ] `grid-pattern-basic`: GridPattern (infinite world-space) with default cell size
- [ ] `grid-pattern-subdivisions`: GridPattern with sub-grid lines

### Component Nodes

- [ ] `code-basic`: Code node with TypeScript snippet, default theme
- [ ] `code-theme-github-dark`: Code node with `github-dark` theme
- [ ] `code-theme-github-light`: Code node with `github-light` theme
- [ ] `code-theme-vscode-dark`: Code node with `vscode-dark` theme
- [ ] `code-theme-vscode-light`: Code node with `vscode-light` theme
- [ ] `code-line-numbers`: Code node with `showLineNumbers: true`
- [ ] `code-padding`: Code node with explicit padding on all sides
- [ ] `code-append`: Code node using `append()` to add lines with animated height reveal
- [ ] `code-prepend`: Code node using `prepend()` to insert lines at top
- [ ] `code-insert`: Code node using `insert()` at a specific line/column
- [ ] `code-remove`: Code node using `remove()` on a range of lines
- [ ] `code-replace`: Code node using `replace()` swapping one token for another
- [ ] `code-highlight`: Code node using `highlight()` to dim non-highlighted tokens
- [ ] `code-highlight-reset`: Code node calling `resetHighlight()` to un-dim all tokens
- [ ] `latex-basic`: Latex node rendering a simple formula (e.g. `E = mc^2`)
- [ ] `latex-complex`: Latex node rendering a complex expression (fraction, sum, integral)
- [ ] `latex-morph`: Latex node morphing between two formulas via `to()`
- [ ] `latex-fill-gradient`: Latex node with a gradient fill applied to glyphs
- [ ] `latex-stroke`: Latex node with stroke outline on glyphs

---

## Fills

- [ ] `fill-solid`: Solid color fill (static and animated color)
- [ ] `fill-linear-gradient`: Linear gradient, horizontal then animated angle
- [ ] `fill-radial-gradient`: Radial gradient centered on shape
- [ ] `fill-conic-gradient`: Conic gradient full sweep
- [ ] `fill-image`: Image fill on a rect
- [ ] `fill-video`: Video fill on a rect
- [ ] `fill-noise`: Noise fill, varying density and size
- [ ] `fill-stripe`: Stripe fill, varying angle and gap
- [ ] `fill-space-local`: Fill pinned to shape's own bounds (default)
- [ ] `fill-space-parent`: Fill mapped to parent bounds; shape moves across it
- [ ] `fill-space-global`: Fill anchored to viewport; node moves over it
- [ ] `fill-layered`: Multiple fill layers stacked on one shape (solid + gradient + noise)
- [ ] `overlay-basic`: Overlay fill painted over children but under stroke (grain texture over a rect with child rects)
- [ ] `overlay-video`: Video overlay across an entire subtree

---

## Strokes

- [ ] `stroke-align-inside`: Stroke aligned inside shape boundary
- [ ] `stroke-align-center`: Stroke centered on shape boundary
- [ ] `stroke-align-outside`: Stroke aligned outside shape boundary
- [ ] `stroke-cap-butt`: Line ends with butt cap
- [ ] `stroke-cap-round`: Line ends with round cap
- [ ] `stroke-cap-square`: Line ends with square cap
- [ ] `stroke-join-miter`: Corner joins with miter style
- [ ] `stroke-join-round`: Corner joins with round style
- [ ] `stroke-join-bevel`: Corner joins with bevel style
- [ ] `stroke-dash-uniform`: Stroke with uniform dash pattern
- [ ] `stroke-dash-pair`: Stroke with `[on, off]` dash pair
- [ ] `stroke-dash-animated`: Animated dashOffset (marching ants)
- [ ] `stroke-gradient-fill`: Stroke using a linear gradient fill
- [ ] `stroke-layered`: Multiple strokes stacked on one shape
- [ ] `stroke-miter-limit`: High miterLimit vs low miterLimit on a sharp-angle polygon

---

## Shadows

- [ ] `shadow-drop-basic`: Basic drop shadow (blur + offset)
- [ ] `shadow-drop-offset`: Shadow with large x/y offset
- [ ] `shadow-drop-blur`: Shadow with high blur, zero offset (glow-like)
- [ ] `shadow-inner`: Inner shadow on rect
- [ ] `shadow-spread-positive`: Shadow with positive spread (expanded)
- [ ] `shadow-spread-negative`: Shadow with negative spread (contracted)
- [ ] `shadow-fill-gradient`: Shadow using a gradient fill color
- [ ] `shadow-layered`: Multiple shadows stacked (inner + outer)

---

## Effects

- [ ] `effect-blur`: Gaussian blur on a rect
- [ ] `effect-blur-backdrop`: Gaussian blur reading backdrop (frosted glass)
- [ ] `effect-directional-blur`: Motion blur along 45° axis
- [ ] `effect-directional-blur-backdrop`: Directional blur on backdrop
- [ ] `effect-grayscale`: Full desaturation of shape
- [ ] `effect-grayscale-backdrop`: Desaturate backdrop content beneath shape
- [ ] `effect-pixelate`: Mosaic pixelation on a shape (`sharpColors: false`, smooth blocks)
- [ ] `effect-pixelate-sharp`: Pixelate with `sharpColors: true` (solid-color blocks)
- [ ] `effect-pixelate-backdrop`: Pixelate backdrop (censoring effect)
- [ ] `effect-bulge-barrel`: Barrel distortion (positive strength)
- [ ] `effect-bulge-pincushion`: Pincushion distortion (negative strength)
- [ ] `effect-magnify`: Magnify a portion of backdrop
- [ ] `effect-bloom`: Bloom/glow from bright regions
- [ ] `effect-vintage`: Sepia + warmth tone
- [ ] `effect-chromatic-aberration`: RGB channel fringing
- [ ] `effect-invert`: RGB inversion
- [ ] `effect-scatter-horizontal`: Scatter with `direction: "horizontal"`
- [ ] `effect-scatter-vertical`: Scatter with `direction: "vertical"`
- [ ] `effect-scatter-both`: Scatter with `direction: "both"`
- [ ] `effect-posterize`: Color banding at low level count
- [ ] `effect-outline`: Outline band growing outside a text silhouette
- [ ] `effect-outline-inside`: Outline with `position: "inside"` on a filled disc
- [ ] `effect-vignette`: Corner falloff darkening a bright card
- [ ] `effect-grain`: Static (unanimated) film grain over a gradient
- [ ] `effect-sharpen`: Unsharp mask raising edge contrast
- [ ] `effect-edges`: Sobel edge detection on flat colour blocks
- [ ] `effect-threshold`: Two-tone luminance cut sweeping across a gradient
- [ ] `effect-radial-blur`: Zoom-style radial blur about the centre
- [ ] `effect-radial-blur-spin`: Spin-style radial blur about the centre
- [ ] `effect-halftone`: 45° dot screen at increasing cell size
- [ ] `effect-dither`: Bayer 8×8 ordered dither down to 1-bit
- [ ] `effect-duotone`: Luminance remapped onto a two-colour ramp
- [ ] `effect-curves`: Tone curve lifting shadows on a node (not an image fill)
- [ ] `effect-color-adjustment`: Contrast/saturation/temperature on a group of shapes
- [ ] `effect-rgb-shift`: Red/blue planes pulled apart on a text silhouette
- [ ] `effect-scanlines`: CRT bands darkening a bright card
- [ ] `effect-block-displace`: Horizontal band tearing at a fixed seed
- [ ] `effect-bit-crush`: Gradient snapped to the Game Boy palette
- [ ] `effect-streak`: Anamorphic glare smeared along one axis
- [ ] `effect-god-rays`: Light streaming from a disc past an occluding bar
- [ ] `effect-oil-paint`: Kuwahara brushwork — flat strokes with edges intact
- [ ] `effect-texture`: An image multiplied over the content
- [ ] `effect-ascii`: Image resolving into an ASCII glyph grid as the cell grows
- [ ] `effect-chain-order`: Two shader effects in opposite orders must differ (author-order guard)
- [ ] `effect-sksl-custom`: Custom SkSL shader as layer effect
- [ ] `effect-sksl-backdrop`: Custom SkSL shader processing backdrop

---

## Image Filters

Applied to Image nodes and image fills.

- [ ] `filter-exposure`: Exposure boost and reduction
- [ ] `filter-blur-image`: Gaussian blur on an image
- [ ] `filter-grayscale-image`: Desaturation of an image
- [ ] `filter-alpha-image`: Alpha multiplier fading an image out
- [ ] `filter-color-matrix`: Arbitrary 4×5 color matrix transform
- [ ] `filter-curves`: Tone curve on RGB channel
- [ ] `filter-curves-per-channel`: Separate tone curves for R, G, B
- [ ] `filter-color-adjustment`: Brightness, contrast, saturation, vibrance, shadows, highlights, temperature, tint, vignette all animated

---

## Video Filters

Applied to Video nodes and video fills.

- [ ] `filter-video-exposure`: Exposure on video
- [ ] `filter-video-grayscale`: Grayscale on video
- [ ] `filter-video-color-adjustment`: Color adjustment on video
- [ ] `filter-video-posterize-time`: Frame rate reduction (posterize time)
- [ ] `filter-video-echo`: Multi-frame echo/trail effect

---

## Blend Modes

### Node Blend Modes

Node-level blend composites the entire node (fills + children + stroke) against what's beneath it.

- [ ] `blend-node-multiply`
- [ ] `blend-node-screen`
- [ ] `blend-node-overlay`
- [ ] `blend-node-darken`
- [ ] `blend-node-lighten`
- [ ] `blend-node-color-dodge`
- [ ] `blend-node-color-burn`
- [ ] `blend-node-hard-light`
- [ ] `blend-node-soft-light`
- [ ] `blend-node-difference`
- [ ] `blend-node-exclusion`
- [ ] `blend-node-hue`
- [ ] `blend-node-saturation`
- [ ] `blend-node-color`
- [ ] `blend-node-luminosity`
- [ ] `blend-node-pass-through`: `"pass-through"` vs `"normal"` isolation with semi-transparent children

### Fill Blend Modes

Fill-level blend composites each fill layer against the layers beneath it within the same shape.

- [ ] `blend-fill-multiply`: Second fill layer blending with `"multiply"` over first
- [ ] `blend-fill-screen`: Screen blend between two fill layers
- [ ] `blend-fill-overlay`: Overlay blend between two fill layers
- [ ] `blend-fill-difference`: Difference blend to invert where fills overlap
- [ ] `blend-fill-color-dodge`: Color-dodge brightening effect between fill layers
- [ ] `blend-fill-luminosity`: Luminosity blend preserving luma from top fill
- [ ] `blend-fill-layered-stack`: Three fill layers each with different blend modes stacked

### Stroke Blend Modes

Stroke has its own `fill` which also carries a `blend` property, compositing the stroke paint against the shape beneath.

- [ ] `blend-stroke-screen`: Stroke fill using `"screen"` blend over the shape fill
- [ ] `blend-stroke-multiply`: Stroke fill using `"multiply"` blend
- [ ] `blend-stroke-difference`: Stroke fill using `"difference"` blend (inverts where stroke crosses fill)

### Shadow Blend Modes

Shadow `fill` also carries `blend`, compositing the shadow color against the backdrop.

- [ ] `blend-shadow-screen`: Drop shadow using `"screen"` blend (lightening glow)
- [ ] `blend-shadow-multiply`: Drop shadow using `"multiply"` blend (darkening shadow)
- [ ] `blend-shadow-color-dodge`: Drop shadow using `"color-dodge"` (bloom-like outer glow)

---

## Transforms

- [ ] `transform-position`: Rect animating x, y position
- [ ] `transform-rotation`: Shape spinning full rotation
- [ ] `transform-scale-uniform`: Uniform scale animation
- [ ] `transform-scale-xy`: Independent scaleX and scaleY (squash and stretch)
- [ ] `transform-opacity`: Opacity fade in/out
- [ ] `transform-pivot-center`: Rotation around center pivot
- [ ] `transform-pivot-corner`: Rotation around top-left corner pivot
- [ ] `transform-pivot-custom`: Rotation around arbitrary custom pivot point
- [ ] `transform-combined`: Position + rotation + scale all animated simultaneously

---

## Easing Functions

Each shows a ball moving across the screen with that easing, easeIn/easeOut/easeInOut.

- [ ] `ease-sine`
- [ ] `ease-quad`
- [ ] `ease-cubic`
- [ ] `ease-quart`
- [ ] `ease-quint`
- [ ] `ease-expo`
- [ ] `ease-circ`
- [ ] `ease-back`
- [ ] `ease-elastic`
- [ ] `ease-bounce`

---

## Cardinal Coordinates

- [ ] `cardinal-node-topleft`: Anchoring/measuring from topLeft of a node
- [ ] `cardinal-node-topcenter`: topCenter
- [ ] `cardinal-node-topright`: topRight
- [ ] `cardinal-node-leftcenter`: centerLeft
- [ ] `cardinal-node-center`: center
- [ ] `cardinal-node-rightcenter`: centerRight
- [ ] `cardinal-node-bottomleft`: bottomLeft
- [ ] `cardinal-node-bottomcenter`: bottomCenter
- [ ] `cardinal-node-bottomright`: bottomRight
- [ ] `cardinal-graphics-points`: Cardinal points used in a graphics/drawable context
- [ ] `cardinal-graphics-rect`: `Graphics().rect({ pivot, x, y })` for all nine named anchors, animating rotation/scale
- [ ] `cardinal-graphics-text`: `Graphics().text({ pivot, x, y })` for all nine named anchors, no authored box, animating rotation/scale
- [ ] `cardinal-graphics-ellipse`: `Graphics().ellipse({ pivot, x, y })` for all nine named anchors, animating rotation/scale
- [ ] `cardinal-graphics-polygon`: `Graphics().polygon({ pivot, x, y })` for all nine named anchors, animating rotation/scale
- [ ] `cardinal-graphics-polygram`: `Graphics().polygram({ pivot, x, y })` for all nine named anchors, animating rotation/scale

---

## Shape Start / End

`start` and `end` (0–1) partially reveal any shape's path outline.

- [ ] `shape-start-end-rect`: Rect animated from `start=0,end=0` to `end=1` (draws itself in)
- [ ] `shape-start-end-ellipse`: Ellipse revealing arc from start to end
- [ ] `shape-start-end-polygon`: Polygon drawing its perimeter progressively
- [ ] `shape-start-end-line`: Line animating `start` and `end` to trim both ends

---

## Path Morphing

- [ ] `morph-triangle-to-star`: Triangle shape morphing into 5-point star
- [ ] `morph-circle-to-rect`: Ellipse morphing into rectangle path
- [ ] `morph-complex-shapes`: Two arbitrary SVG paths morphing together

---

## Opacity & Visibility

- [ ] `opacity-node`: Node-level opacity animated
- [ ] `opacity-fill`: Fill-level opacity animated independently of node
- [ ] `opacity-stroke`: Stroke-level opacity animated
- [ ] `opacity-passthrough-vs-normal`: Pass-through vs normal node blend isolation with semi-transparent children

---

## Presets

- [ ] `preset-riso`: Presets.riso ramping in from its no-op state
- [ ] `preset-vhs`: Presets.vhs ramping in from its no-op state
- [ ] `preset-crt`: Presets.crt ramping in from its no-op state
- [ ] `preset-gameboy`: Presets.gameboy ramping in (also guards chain order)
- [ ] `preset-comic`: Presets.comic on a CMYK process screen
- [ ] `preset-paper`: Presets.paper — the texture-based material template
