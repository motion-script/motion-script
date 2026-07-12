// ---------------------------------------------------------
// 1. Scene & Project
// ---------------------------------------------------------
export {
    createScene, fadeIn, fadeOut, ramp, MeasureScope, Clip,
    createProject, AudioFilters, PathBuilder, lerpVector2, AssetTracker
} from '@motion-script/core';
export type {
    Scene,
    SceneGenerator, BoxBounds,
    Stage,
    BlendMode, FillSpace,
    AudioFilter,


    ProjectConfig,
    Theme,
    ColorTokens,
    Typography,
    TypographyPreset,
} from '@motion-script/core';

// ---------------------------------------------------------
// 2. Nodes — Geometry
// ---------------------------------------------------------
export {
    Rect,
    Ellipse,
    Line,
    Path, Graphics, ShapeNode, RenderContext, resolvePivot, resolveAlign, resolveSize, resolvePadding, resolveCorners, resolveStroke, resolveShadow, resolveFill,
    Polygon,
    Polygram,
    LineGrid,
    GridPattern,
    Grid,
    BooleanGroup,
    MaskGroup,
} from '@motion-script/core';
export type {
    RectProps,
    EllipseProps, ShapeProps, NodeConfig,
    LineProps,
    PathProps,
    PolygonProps,
    PolygramProps,
    LineGridProps,
    GridPatternProps,
    GridProps,
    BooleanGroupProps,
    MaskGroupProps,
    FlexSize,
} from '@motion-script/core';

// ---------------------------------------------------------
// 3. Nodes — Text
// ---------------------------------------------------------
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
    TextRange,
    TextSelectionProps,
    SelectionOverrides,
} from '@motion-script/core';

// ---------------------------------------------------------
// 4. Nodes — Layout
// ---------------------------------------------------------
export {
    Row,
    Column,
    Camera,
} from '@motion-script/core';
export type {
    FlexProps,
    RowProps,
    ColumnProps,
    CameraProps,
} from '@motion-script/core';

// ---------------------------------------------------------
// 5. Nodes — Media
// ---------------------------------------------------------
export {
    Image,
    Video,
} from '@motion-script/core';
export type {
    ImageProps,
    VideoProps,
} from '@motion-script/core';

// ---------------------------------------------------------
// 6. Nodes — Scene Utilities
// ---------------------------------------------------------
export {
    Node,
    Provider,
    ThemeProvider,
} from '@motion-script/core';
export type {
    NodeProps,
    ProviderProps,
    ThemeProviderProps,
} from '@motion-script/core';

// ---------------------------------------------------------
// 7. Animation — Timing & Control
// ---------------------------------------------------------
export {
    tween,
    wait,
    sequence,
    parallel,
} from '@motion-script/core';
export type {
    FrameGenerator,
    AnimationTarget,
    Steppable,
} from '@motion-script/core';

// ---------------------------------------------------------
// 8. Animation — Easing
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 9. Animation — Lerp & Tween Options
// ---------------------------------------------------------
export {
    lerpNumber,
} from '@motion-script/core';
export type {
    LerpFunction,
    TweenOptions,
} from '@motion-script/core';

// ---------------------------------------------------------
// 10. Signals
// ---------------------------------------------------------
export {
    Signal,
    createSignal,
    isTracking,
    SignalInput,
} from '@motion-script/core';


// ---------------------------------------------------------
// 11. Fills & Styling
// ---------------------------------------------------------
export {
    Fills,
} from '@motion-script/core';
export type {
    Fill,
    FillChain,
    FillOptions,
} from '@motion-script/core';

// ---------------------------------------------------------
// 11b. Effects & Media Filters
// ---------------------------------------------------------
export {
    Effects,
    ImageFilters,
    VideoFilters,
} from '@motion-script/core';

// ---------------------------------------------------------
// 12. Shape Attributes — Stroke, Shadow, Corners, Effects
// ---------------------------------------------------------
export type {
    Stroke,
    StrokeProp,
    StrokeAlign,
    StrokeCap,
    StrokeJoin,
    Shadow,
    ShadowProp,
    Corners,
    CornerStyle,
    SceneEffect,
    BooleanOperation,
    MaskMode,
    MaskOptions,
} from '@motion-script/core';

// ---------------------------------------------------------
// 13. Text Attributes
// ---------------------------------------------------------
export type {
    TextAlign,
    TextSpan,
    FontStyle,
} from '@motion-script/core';

// ---------------------------------------------------------
// 14. Layout Attributes
// ---------------------------------------------------------
export type {
    Vector2,
    Size2D, FillResolved, StrokeResolved, ShadowResolved, CornerStyleResolved, CornerRadiusResolved,
    Padding, PaddingResolved,
    AlignKey,
    Alignment,
} from '@motion-script/core';

// ---------------------------------------------------------
// 15. Audio
// ---------------------------------------------------------
export {
    Sound,
} from '@motion-script/core';
export type {
    SoundProps,
    AudioRequest,
} from '@motion-script/core';

// ---------------------------------------------------------
// 16. Utilities
// ---------------------------------------------------------
export {
    createRef,
    clamp,
    generateList,
    createContext,
    Random,
    SeedGenerator,
} from '@motion-script/core';
export type {
    Reference,
    Context,
} from '@motion-script/core';

// ---------------------------------------------------------
// 17. Node Property Decorator
// ---------------------------------------------------------
export {
    property,
} from '@motion-script/core';
export type {
    PropOptions,
} from '@motion-script/core';

// ---------------------------------------------------------
// 18. Code Component (@motion-script/code)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 19. LaTeX Component (@motion-script/latex)
// ---------------------------------------------------------
export {
    Latex,
    buildLatexPath,
} from '@motion-script/latex';
export type {
    LatexProps,
    LatexToken,
    LatexPathResult,
} from '@motion-script/latex';
