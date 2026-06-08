// Shared layout/measurement constants for the timeline.

export const DEFAULT_MINOR_TICKS = 0;
export const FRAME_PX_AT_MIN_ZOOM = 36;
export const MIN_LABEL_SPACING_PX = 40;
export const PLAYHEAD_EDGE_PADDING_PX = 200;
export const DEFAULT_PADDING_X = 16;
export const NODE_ROW_HEIGHT = 32;
export const NODE_LIST_WIDTH = 200;
export const RULER_HEIGHT = 28;
export const SCENE_ROW_HEIGHT = 28;
export const INDENT_PX = 16;
export const BAR_PADDING_Y = 5;

// Horizontal inset applied to each timeline bar so adjacent bars (scenes laid
// out back-to-back, node spans that abut) show a visible gap between them.
export const BAR_MARGIN_X = 2;

// Pixels-per-frame threshold: above this, ruler shows "55f" frame labels instead of duration timestamps.
export const FRAME_MODE_PX_THRESHOLD = 8;

// Number of extra rows to render above/below the viewport so fast scrolls don't flash blank rows.
export const ROW_OVERSCAN = 4;
