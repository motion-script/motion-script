// =============================================================
// Project & Scene
// =============================================================
export {
    createProject,
    createScene,
} from '@motion-script/core';
export type {
    ProjectConfig,
    Theme,
    ColorTokens,
    Typography,
    TypographyPreset,
    Scene,
    SceneGenerator,
    Stage,
    BoxBounds,
} from '@motion-script/core';

// =============================================================
// Node & Provider — the base scene-graph primitives
// =============================================================
export {
    Node,
    Provider,
    ThemeProvider,
} from '@motion-script/core';
export type {
    NodeProps,
    NodeConfig,
    ProviderProps,
    ThemeProviderProps,
} from '@motion-script/core';

// =============================================================
// Nodes — Geometry
// =============================================================
export {
    ShapeNode,
    Rect,
    Ellipse,
    Line,
    Path,
    Polygon,
    Polygram,
    LineGrid,
    GridPattern,
    Grid,
    BooleanGroup,
    MaskGroup,
} from '@motion-script/core';
export type {
    ShapeProps,
    RectProps,
    EllipseProps,
    LineProps,
    PathProps,
    PolygonProps,
    PolygramProps,
    LineGridProps,
    GridPatternProps,
    GridProps,
    BooleanGroupProps,
    BooleanOperation,
    MaskGroupProps,
    MaskMode,
    MaskOptions,
} from '@motion-script/core';

// =============================================================
// Nodes — Layout
// =============================================================
export {
    Row,
    Column,
    Camera,
    RotatedBox,
} from '@motion-script/core';
export type {
    FlexProps,
    FlexSize,
    RowProps,
    ColumnProps,
    CameraProps,
} from '@motion-script/core';

// =============================================================
// Nodes — Text
// =============================================================
export {
    Text,
    RichText,
    NumberNode,
    DefaultTextStyle,
    TextSelection,
} from '@motion-script/core';
export type {
    TextProps,
    RichTextProps,
    NumberProps,
    NumberFormat,
    DefaultTextStyleProps,
    TextSelectionProps,
    TextRange,
    SelectionOverrides,
    TextStyle,
    TextAlign,
    TextSpan,
    FontStyle,
} from '@motion-script/core';

// =============================================================
// Nodes — Media
// =============================================================
export {
    Image,
    Video,
} from '@motion-script/core';
export type {
    ImageProps,
    VideoProps,
} from '@motion-script/core';

// =============================================================
// Nodes — Audio
// =============================================================
export {
    Sound,
    AudioFilters,
    ramp,
} from '@motion-script/core';
export type {
    SoundProps,
    AudioRequest,
    AudioFilter,
} from '@motion-script/core';

// =============================================================
// 3D — the View3D node and the Graphics3D API
// =============================================================
// There is one 3D node; everything inside it is described with `Graphics3D`.
// `Geo`/`Mat`/`Tex` build the geometry/material/texture descriptors, and the lerps
// are what make a Vector3/Euler/Quaternion signal interpolate rather than snap.
// `Surface2D` is the 2D→3D bridge: a child of `View3D` whose 2D content is
// rasterized offscreen and bound to a material by `Tex.surface(name)`.
export {
    View3D,
    Graphics3D,
    Geo,
    Mat,
    Tex,
    lerpVector3,
    lerpEuler3,
    slerpQuaternion,
    quaternionFromEuler,
    normalizeQuaternion,
    resolveVector3,
    evaluateParametric,
    resolveSurfaceSource,
} from '@motion-script/core';
export type {
    View3DProps,
    Graphics3DOp,
    Vector3,
    Vector3Input,
    Euler3,
    EulerOrder,
    Quaternion,
    Transform3D,
    Side3D,
    Blending3D,
    Geometry3D,
    Material3D,
    MaterialCommon3D,
    MeshShorthand3D,
    Uniform3D,
    Texture3D,
    TextureOptions3D,
    SurfaceTexture3D,
    SurfaceSource3D,
    ResolvedSurfaceSource,
    Light3D,
    Camera3D,
    Fog3D,
    Background3D,
    Environment3D,
    ShadowSettings3D,
    ToneMapping3D,
    PostEffect3D,
    LineMode3D,
    ModelAnimation3D,
} from '@motion-script/core';

// =============================================================
// Rendering — Graphics builder, RenderContext & asset declaration
// =============================================================
export {
    Graphics,
    RenderContext,
    PathBuilder,
    Clip,
    Measurer,
    AssetTracker,
} from '@motion-script/core';

/**
 * @deprecated Renamed to {@link Measurer}. It never was a "scope" in the sense
 * the rest of the codebase uses the word — it measures text, and that is the
 * whole of it. The alias keeps a custom node that types a `measure(constraints,
 * scope: MeasureScope)` override compiling; it will be removed in the next major.
 */
export { Measurer as MeasureScope } from '@motion-script/core';

// =============================================================
// Fill & Color
// =============================================================
export {
    Fills,
    parseColor,
    resolveFill,
    resolveFillArray,
    prepareFill,
    lerpFillArray,
} from '@motion-script/core';
export type {
    Fill,
    FillChain,
    FillOptions,
    VideoFillOptions,
    // Placement of an image/video source inside the shape it paints:
    // `crop` -> `fit` -> `zoom` -> `anchor`, plus the raw-matrix escape hatch.
    MediaPlacementOptions,
    ImageFit,
    ImageCrop,
    ImageMatrix,
    FillResolved,
    // A custom SkSL shader as a fill. `coords` picks what `fragCoord` means;
    // uniforms are keyed by their declared name, and a `ShaderTexture` binds an
    // image to a `uniform shader` declaration.
    ShaderFillProp,
    ShaderFillResolved,
    ShaderFillCoords,
    ShaderTexture,
    SkSLUniformRecord,
    FractalNoiseBasis,
    // The colour type every fill, stroke, shadow and 3D material accepts —
    // a CSS string (incl. `oklch()`, theme tokens, `"white/10"`) or a
    // pre-normalized RGBA tuple.
    Color,
    NormalizedColor,
    BlendMode,
    FillSpace,
} from '@motion-script/core';

// =============================================================
// Shape Attributes — Stroke, Shadow, Corners
// =============================================================
export {
    resolveStroke,
    resolveStrokeArray,
    lerpStrokeArray,
    resolveShadow,
    resolveShadowArray,
    lerpShadowArray,
    resolveCorners,
} from '@motion-script/core';
export type {
    Stroke,
    StrokeProp,
    StrokeAlign,
    StrokeCap,
    StrokeJoin,
    StrokeResolved,
    Shadow,
    ShadowProp,
    ShadowResolved,
    Corners,
    CornerStyle,
    CornerStyleResolved,
    CornerRadiusResolved,
    SceneEffect,
} from '@motion-script/core';

// =============================================================
// Layout Attributes — Vector2, Size, Insets, Anchor
// =============================================================
export {
    lerpVector2,
    resolveSize,
    resolveInsets,
    resolveAnchor,
} from '@motion-script/core';
export type {
    Vector2,
    Size2D,
    Insets,
    InsetsResolved,
    AnchorKey,
    Anchor,
} from '@motion-script/core';

// =============================================================
// Effects & Media Filters
// =============================================================
export {
    Effects,
    FX,
    EffectChain,
    ImageFilters,
    VideoFilters,
    ImageFilterChain,
    FilterChain,
} from '@motion-script/core';

export type {
    /** The `effects` prop type — what a node actually accepts. */
    Effect,
    EffectMode,
    EffectAxis,
    EffectSurface,
    EffectOptions,
    ImageFilter,
    VideoFilter,
    /** The scene effects that also work as a media filter — see {@link ImageFilters}. */
    EffectFilter,
    MediaFilter,
    VideoMediaFilter,
} from '@motion-script/core';

/**
 * Per-builder options. Every effect builder takes exactly one argument: one of
 * these, or the dominant scalar it wraps.
 */
export type {
    BlurOptions,
    DirectionalBlurOptions,
    GrayscaleOptions,
    PixelateOptions,
    BulgeOptions,
    MagnifyOptions,
    BloomOptions,
    VintageOptions,
    ChromaticAberrationOptions,
    InvertOptions,
    ScatterOptions,
    PosterizeOptions,
    MotionBlurOptions,
    SkSLOptions,
    OutlineOptions,
    VignetteOptions,
    GrainOptions,
    SharpenOptions,
    EdgesOptions,
    ThresholdOptions,
    RadialBlurOptions,
    HalftoneOptions,
    DitherOptions,
    DuotoneOptions,
    CurvesOptions,
    ColorAdjustmentOptions,
    RgbShiftOptions,
    ScanlinesOptions,
    BlockDisplaceOptions,
    BitCrushOptions,
    AsciiOptions,
    StreakOptions,
    GodRaysOptions,
    OilPaintOptions,
    TextureOptions,
    DisplaceOptions,
    WaveOptions,
    TwirlOptions,
    ProgressiveBlurOptions,
    KaleidoscopeOptions,
    TrailsOptions,
} from '@motion-script/core';

/**
 * Per-builder options for the filters that exist only as filters. Everything
 * else on {@link ImageFilters} takes the matching effect options above, minus
 * `mode` — a filter is on the fill's own pixels, so there is no backdrop to
 * point it at.
 */
export type {
    BlurFilterOptions,
    GrayscaleFilterOptions,
    AlphaFilterOptions,
    ExposureFilterOptions,
    ColorMatrixFilterOptions,
    CurvesFilterOptions,
    ColorAdjustmentFilterOptions,
    PosterizeTimeFilterOptions,
    VideoEchoFilterOptions,
} from '@motion-script/core';

/** Effect data types, for naming an effect value or building one by hand. */
export type {
    BlurEffect,
    DirectionalBlurEffect,
    GrayscaleEffect,
    PixelateEffect,
    BulgeEffect,
    MagnifyEffect,
    BloomEffect,
    VintageEffect,
    ChromaticAberrationEffect,
    InvertEffect,
    InvertChannel,
    ScatterEffect,
    PosterizeEffect,
    MotionBlurEffect,
    MotionBlurAlignment,
    SkSLEffect,
    SkSLUniform,
    SkSLUniformValue,
    OutlineEffect,
    OutlinePosition,
    VignetteEffect,
    GrainEffect,
    SharpenEffect,
    EdgesEffect,
    EdgeKernel,
    ThresholdEffect,
    RadialBlurEffect,
    RadialBlurStyle,
    HalftoneEffect,
    HalftoneShape,
    HalftoneSeparation,
    DitherEffect,
    DitherMatrix,
    DuotoneEffect,
    CurvesEffect,
    ColorAdjustmentEffect,
    RgbShiftEffect,
    ScanlinesEffect,
    BlockDisplaceEffect,
    BitCrushEffect,
    BitCrushPalette,
    AsciiEffect,
    AsciiCharset,
    StreakEffect,
    GodRaysEffect,
    OilPaintEffect,
    TextureEffect,
    DisplaceEffect,
    DisplaceChannel,
    WaveEffect,
    WaveShape,
    TwirlEffect,
    ProgressiveBlurEffect,
    ProgressiveBlurShape,
    KaleidoscopeEffect,
    TrailsEffect,
} from '@motion-script/core';

// =============================================================
// Animation — Tweening & Sequencing
// =============================================================
export {
    tween,
    wait,
    sequence,
    parallel,
    fadeIn,
    fadeOut,
    lerpNumber,
} from '@motion-script/core';
export type {
    FrameGenerator,
    AnimationTarget,
    Steppable,
    LerpFunction,
    TweenOptions,
} from '@motion-script/core';

// An animation as a **value** rather than as control flow: a declared duration
// plus `at(t)`, so a host can ask what it looks like at a time instead of
// running it to one. Still `yield*`-able, so authoring reads the same — but a
// scene built only from these can be scrubbed in constant time, which one built
// from generators cannot. `@command` marks the methods on a node that return one,
// and is what a host scans for to know a node's animations without running them.
export {
    command,
    driveCommand,
    getCommandMeta,
    isCommand,
    makeCommand,
    commandSequence,
    commandParallel,
} from '@motion-script/core';
export type { Command } from '@motion-script/core';

// =============================================================
// Animation — Easing
// =============================================================
export {
    linear,
    easeIn,
    easeOut,
    easeInOut
} from '@motion-script/core';
export type {
    EasingFunction,
    EaseParams,
    StandardEase
} from '@motion-script/core';

// =============================================================
// Signals
// =============================================================
export {
    Signal,
    createSignal,
    isTracking,
    SignalInput,
} from '@motion-script/core';

// =============================================================
// Node Property Decorators
// =============================================================
export {
    property,
    // Attribute-typed variants: `@property` with the mapper/tween pair for a
    // known attribute already filled in, so a custom node declares a paint or
    // layout prop without importing the resolver/lerp pair behind it.
    fillProperty,
    strokeProperty,
    shadowProperty,
    effectsProperty,
    colorProperty,
    cornerRadiusProperty,
    cornerStyleProperty,
    pathProperty,
    insetsProperty,
    anchorProperty,
    vector2Property,
    sizeProperty,
    textProperty,
} from '@motion-script/core';
export type {
    PropOptions,
    AttributePropOptions,
} from '@motion-script/core';

// =============================================================
// Utilities
// =============================================================
export {
    createRef,
    clamp,
    generateList,
    createContext,
    ContextMap,
    Random,
    SeedGenerator,
    parseCSV,
    parseData,
} from '@motion-script/core';
export type {
    Reference,
    RefTarget,
    Context,
    DataRecord,
    ParseCSVOptions,
} from '@motion-script/core';

// =============================================================
// Editor selection — node boxes, hit testing, transient overrides
// =============================================================
// The geometry an editor needs to lay a selection gizmo over the canvas: where a
// node's pixels landed, and which node is under a point. Both are pure functions
// over a scene's node tree, so a host can use them directly; a player embedding
// reaches the same thing through `MotionPlayer`'s ref (`getNodeBox`, `pickNode`,
// `setNodeOverride`). Points and boxes are in viewport space — origin at the
// viewport centre, y-up.
export {
    nodeBox,
    pickNode,
    collectBoxes,
} from '@motion-script/core';
export type {
    NodeBox,
    NodeOverride,
    TreeState,
} from '@motion-script/core';

// =============================================================
// Code Component (@motion-script/code)
// =============================================================
export {
    Code,
    word,
    lines,
    loadCodeLanguage,
    initSyntaxHighlighter,
    registerCodeTheme,
    resolveTheme,
    compileStyle,
} from '@motion-script/code';
export type {
    CodeProps,
    CodeRange,
    CodeHighlightStyle,
    CodeStyleRule,
    CodeTheme,
    CodeThemeName,
} from '@motion-script/code';

// =============================================================
// LaTeX Component (@motion-script/latex)
// =============================================================
export {
    Latex,
    buildLatexPath,
} from '@motion-script/latex';
export type {
    LatexProps,
    LatexToken,
    LatexPathResult,
} from '@motion-script/latex';
