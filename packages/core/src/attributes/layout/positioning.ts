/**
 * Which frame of reference a node's box is placed in.
 *
 * Layout is normally *relative*: a parent measures its children, hands each one a
 * cell inside its own content box, and the child's `x`/`y` offset from there. An
 * *absolute* child steps out of that — it is skipped by its parent's flow pass
 * (it consumes no gap, takes no flex share, and never contributes to a `hug`
 * size) and is placed against the **stage** instead, so its `x`/`y` read as
 * scene-root coordinates no matter how deeply it is nested.
 *
 * Two props decide it, and they mirror the CSS pair they're named after: a
 * container declares the default for everything it holds
 * ({@link ChildPositioning}), and any one child can disagree
 * ({@link RelativeToParent}).
 */

/**
 * The positioning a container hands its children — `Node.childPositioning`.
 *
 * - `'relative'` (default) — children are laid out by this node: measured against
 *   its content box and placed by its `flow` pass.
 * - `'absolute'` — children are pinned to the stage. This node still *owns* them
 *   (they render inside its scope, so its `opacity`, `clip`, `blend`, `effects`
 *   and rotation/scale still apply), but it no longer positions or sizes them.
 */
export type ChildPositioning = "relative" | "absolute";

/**
 * One child's override of its parent's {@link ChildPositioning} —
 * `Node.relativeToParent`.
 *
 * - `'inherit'` (default) — take the parent's `childPositioning`.
 * - `'relative'` — be laid out by the parent even inside an absolute container.
 * - `'absolute'` — pin to the stage even inside a relative container.
 *
 * A node with no parent is `'relative'`: there is nothing above it to be absolute
 * against.
 */
export type RelativeToParent = "inherit" | ChildPositioning;

/** Every legal {@link ChildPositioning}, for validation and editor pickers. */
export const CHILD_POSITIONING: readonly ChildPositioning[] = ["relative", "absolute"];

/** Every legal {@link RelativeToParent}. */
export const RELATIVE_TO_PARENT: readonly RelativeToParent[] = ["inherit", "relative", "absolute"];

/**
 * Resolve one child's effective positioning: its own `relativeToParent` unless
 * that defers, in which case the parent's `childPositioning`. A missing parent
 * resolves to `'relative'`.
 *
 * The single rule both the layout pass and the constructor-time size defaults
 * read, so "is this child in the flow?" is never answered twice.
 */
/** @internal */
export function resolvePositioning(
    own: RelativeToParent,
    parentDefault: ChildPositioning | undefined,
): ChildPositioning {
    if (own !== "inherit") return own;
    return parentDefault ?? "relative";
}
