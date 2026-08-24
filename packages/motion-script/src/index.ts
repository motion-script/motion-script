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
    // What a scene generator receives: the composition it draws into, the
    // canvas it draws onto, and a seeded source for anything random.
    Stage,
    NodeTime,
    AttachScope,
    BoxBounds,
} from '@motion-script/core';

// =============================================================
// Node & Provider — the base scene-graph primitives
//
// `Node` is dimension-agnostic (tree, signals, tweens, context, clock); `Node2D`
// adds layout and 2D drawing, and is what a custom 2D node extends. `Node3D` and
// its subclasses live in the 3D section below.
// =============================================================
export {
    Node,
    Node2D,
    // The scene's root container: layout frame, background paint and camera in
    // one node. Reached as `stage.canvas`.
    Canvas2D,
    Provider,
    ThemeProvider,
} from '@motion-script/core';
export type {
    NodeProps,
    Node2DProps,
    Canvas2DProps,
    NodeConfig,
    NodeChildren,
    NodeDimension,
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
// 3D — the Canvas3D node and the Graphics3D API
// =============================================================
// There is one 3D node; everything inside it is described with `Graphics3D`.
// `Geo`/`Mat`/`Tex` build the geometry/material/texture descriptors, and the lerps
// are what make a Vector3/Euler/Quaternion signal interpolate rather than snap.
// `Surface2D` is the 2D→3D bridge: a child of `Canvas3D` whose 2D content is
// rasterized offscreen and bound to a material by `Tex.surface(name)`.
export {
    Canvas3D,
    // The 3D scene graph. `Node3D` is the base; the rest are what you write.
    Node3D,
    Group3D,
    Mesh3D,
    Box3D, Sphere3D, Plane3D, Cylinder3D, Cone3D, Torus3D, TorusKnot3D,
    Circle3D, Ring3D, Capsule3D, Polyhedron3D, Extrude3D, Lathe3D, Tube3D,
    Instances3D, Points3D, Line3D, Sprite3D, Model3D,
    AmbientLight3D, HemisphereLight3D, DirectionalLight3D,
    PointLight3D, SpotLight3D, RectAreaLight3D,
    PerspectiveCamera3D, OrthographicCamera3D,
    Fog3D, Background3D, Environment3D, Shadows3D, ToneMapping3D, PostEffects3D,
    Graphics3D,
    Scene3D,
    RenderContext3D,
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
    Canvas3DProps,
    Node3DProps, Group3DProps, Mesh3DProps, Material3DProps,
    Box3DProps, Sphere3DProps, Plane3DProps, Cylinder3DProps, Cone3DProps,
    Torus3DProps, TorusKnot3DProps, Circle3DProps, Ring3DProps, Capsule3DProps,
    Polyhedron3DProps, Extrude3DProps, Lathe3DProps, Tube3DProps,
    Instances3DProps, Points3DProps, Line3DProps, Sprite3DProps, Model3DProps,
    AmbientLight3DProps, HemisphereLight3DProps, DirectionalLight3DProps,
    PointLight3DProps, SpotLight3DProps, RectAreaLight3DProps,
    PerspectiveCamera3DProps, OrthographicCamera3DProps,
    Fog3DProps, Background3DProps, Environment3DProps,
    Shadows3DProps, ToneMapping3DProps, PostEffects3DProps,
    Node3DRenderState,
    Graphics3DOp,
    Scene3DOp,
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
    LightData3D,
    CameraData3D,
    FogData3D,
    BackgroundData3D,
    EnvironmentData3D,
    ShadowSettingsData3D,
    ToneMappingData3D,
    PostEffectData3D,
    LineMode3D,
    ModelAnimation3D,
} from '@motion-script/core';

// =============================================================
// Rendering — Graphics2D builder, RenderContext2D & asset declaration
// =============================================================
export {
    Graphics2D,
    PathBuilder,
    Clip,
} from '@motion-script/core';
export type {
    RenderContext2D,
    RenderPass2D,
    Measurer2D,
    AssetTracker,
    TextBlockSource,
} from '@motion-script/core';

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
// Effects & Media Adjustments
// =============================================================
export {
    Effects,
    FX,
    EffectChain,
    Adjustments,
    VideoAdjustments,
    AdjustmentChain,
    VideoAdjustmentChain,
    /** @deprecated Renamed to {@link Adjustments}. Removed in the next major. */
    ImageFilters,
    /** @deprecated Renamed to {@link VideoAdjustments}. Removed in the next major. */
    VideoFilters,
} from '@motion-script/core';

export type {
    /** The `effects` prop type — what a node actually accepts. */
    Effect,
    EffectMode,
    EffectAxis,
    EffectSurface,
    EffectOptions,
    /** What an image fill's `preset.adjustments` accepts — one, a list, or a chain. */
    ImageAdjustment,
    VideoAdjustment,
    /** The scene effects that also work as a media adjustment — see {@link Adjustments}. */
    EffectAdjustment,
    MediaAdjustment,
    VideoOnlyAdjustment,
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
    GlassOptions,
    LutOptions,
} from '@motion-script/core';

/**
 * Per-builder options for the filters that exist only as filters. Everything
 * else on {@link Adjustments} takes the matching effect options above, minus
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
    GlassEffect,
    LutEffect,
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
//
// One command shape, always: `node.to(a, 1)` is a single command, not a builder
// you can append to. Sequence two with `sequence(...)`, run them together with
// `parallel(...)` — the same two combinators everything else composes through.
export {
    command,
    driveCommand,
    getCommandMeta,
    isCommand,
    makeCommand,
    commandSequence,
    commandParallel,
} from '@motion-script/core';
export type { Command, CommandMeta, CommandOptions } from '@motion-script/core';

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
