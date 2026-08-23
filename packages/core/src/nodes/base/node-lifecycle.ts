import { EasingFunction } from "@/tween/ease/type";
import { commandParallel, commandSequence, driveCommand, type Command } from "@/tween/command";
import { SizeConstraints } from "@/attributes/layout/constraints";
import { Measurer } from "@/render/measurer";
import type { Node2D, Node2DProps } from "./node2d";

/**
 * Measure `child`'s natural size **without attaching it to `parent`** — so the
 * measurement never perturbs the parent's layout (siblings don't shift for a
 * frame). Uses the constraints + scope the parent retained from its last measure
 * pass; returns `null` if the parent hasn't been measured yet (nothing on screen
 * to reflow against), so the caller can fall back. Reads `parent.constraints`
 * and `parent._lastScope` — internal layout state the lifecycle helpers are the
 * intended in-directory consumer of.
 */
function measureDetached(parent: Node2D, child: Node2D): { width: number; height: number } | null {
    const p = parent as unknown as { constraints?: SizeConstraints; _lastScope?: Measurer };
    const scope = p._lastScope;
    // The scope (text measurement) is the essential input and is only present once
    // the parent has been laid out; without it we can't size a hug child off-tree.
    if (!scope) return null;
    // The parent's own constraints bound the child; fall back to its laid-out box,
    // then to an unbounded space — a hug child shrink-wraps regardless, so a
    // generous ceiling is fine.
    const constraints: SizeConstraints = p.constraints ?? {
        maxWidth: parent.measuredWidth || Number.MAX_SAFE_INTEGER,
        maxHeight: parent.measuredHeight || Number.MAX_SAFE_INTEGER,
    };
    const size = child.measure(constraints, scope);
    return { width: size.width ?? 0, height: size.height ?? 0 };
}

/**
 * Companion for {@link Node2D}'s animated child-management methods. The sync
 * variants (addChild/removeChild/addChildren/clearChildren/addChildAt/
 * removeChildAt) stay inline on Node2D — each is a 3–5 line method that mutates
 * `_children`/`_parent` and calls `bindAssets`/`bindChildContext`, so there is
 * no body worth moving. These are the animated overloads, returned as
 * {@link Command}s built from `child.to(...)` composed with
 * {@link commandSequence}/{@link commandParallel} — the same choreography
 * primitives a node's own multi-step commands use.
 *
 * Each command's setup (measuring the child, collapsing it, attaching/
 * detaching/reparenting) runs **lazily, once, on the command's first
 * evaluation** rather than when the function below is called — mirroring the
 * generator these replaced, whose body didn't run a single line until the
 * caller's first `.next()`. That laziness is load-bearing: a caller often does
 * `const cmd = parent.addChildAt(child, i, dur); /* lay the parent out here *\/
 * driveCmd(cmd)`, relying on the parent having a fresh `_lastScope` by the time
 * the hug/fill measurement in {@link addChildAtAnimated} actually runs. Doing
 * that measurement eagerly — when this function is called, not when the
 * command is first driven — reads whatever scope the parent happened to have
 * at call time, which is often none at all.
 *
 * The container's `gap` is handled by the per-child `gapScale` prop these helpers
 * tween in parallel with the child's box (see {@link addChildAtAnimated}); the
 * flex layout (`flex.ts`) folds each child's `gapScale` into its gap budget, so
 * the gap opens/closes in lockstep with the size instead of popping. No helper
 * here needs to know the parent's axis or gap value.
 */

/**
 * Fraction of an insert/remove's `duration` spent on the size + gap motion; the
 * remainder is the opacity fade. Splitting the two sequentially (grow → fade in,
 * fade out → shrink) keeps the fading child from overlapping siblings that are
 * still sliding: room is opened while it's invisible, then it fades in already in
 * place (and mirror-image on remove). The size phase gets the larger share since
 * it's the dominant motion and the fade only needs to read as a quick finish.
 */
const SIZE_PHASE = 0.7;

/**
 * Animated `addChildAt`: insert the child at `index` **already collapsed to 0**,
 * then grow it in — fading opacity up and expanding its box from 0 → its natural
 * size so the surrounding siblings **slide over to make room** rather than
 * jumping. The mirror of {@link removeChildAtAnimated} (which pins to the
 * measured size and shrinks to 0).
 *
 * A numeric-sized axis has its target size in hand up front. A `"hug"`/`"fill"`
 * axis does not — its size is only known once laid out — so we measure the child
 * **detached** (via {@link measureDetached}, using the parent's retained
 * constraints + scope) *before* attaching it. That keeps the child out of the
 * parent's layout flow while we size it, so the siblings never see it at full
 * width for a frame — no reflow flash. The child is then added at 0 and the tween
 * grows it to that measured size. Because the tween needs *numeric* endpoints
 * (a string size only snaps, it can't interpolate), the original size token is
 * restored once the command reaches its end so the child resumes normal reflow.
 *
 * If the parent hasn't been measured yet (no retained scope — nothing is on
 * screen to reflow against), a non-numeric axis simply can't be pre-measured;
 * it falls back to its authored token and fades in without a width tween.
 */
export function addChildAtAnimated(
    parent: Node2D,
    child: Node2D,
    index: number,
    duration: number,
    easing?: EasingFunction,
): Command<Record<string, never>> {
    let animation: Command<Node2DProps> | null = null;
    let isNumericW = false;
    let isNumericH = false;
    let origW: Node2DProps["width"];
    let origH: Node2DProps["height"];

    const setup = (): Command<Node2DProps> => {
        const targetOpacity = child.opacity;
        // Remember the authored size tokens so a hug/fill axis can be restored
        // after the numeric grow-in tween finishes.
        origW = child.width;
        origH = child.height;
        isNumericW = typeof origW === "number";
        isNumericH = typeof origH === "number";

        // Pre-measure any non-numeric axis while the child is still detached, so
        // sizing it can't shift the parent's existing children for a frame.
        const detached = isNumericW && isNumericH ? null : measureDetached(parent, child);

        // Resolve each axis' grow-to target: a numeric axis uses its authored
        // size; a hug/fill axis uses the detached measurement (or gives up the
        // width tween if the parent isn't measured yet).
        const tweenW = isNumericW || detached !== null;
        const tweenH = isNumericH || detached !== null;
        const targetW = isNumericW ? (origW as number) : (detached?.width ?? 0);
        const targetH = isNumericH ? (origH as number) : (detached?.height ?? 0);

        // Collapse the axes we can tween to 0 before inserting, so the child
        // enters taking no room and the siblings hold their positions.
        // `gapScale: 0` also suppresses the gap this child would add, so the
        // flanking gap opens from 0 rather than snapping in the instant it
        // attaches.
        child.set({
            opacity: 0,
            gapScale: 0,
            ...(tweenW ? { width: 0 } : {}),
            ...(tweenH ? { height: 0 } : {}),
        } as Partial<Node2DProps>);
        parent.addChildAt(child, index);

        const sizeProps: Partial<Node2DProps> = {};
        if (tweenW) sizeProps.width = targetW;
        if (tweenH) sizeProps.height = targetH;
        // Two sequential phases so the fading-in child never overlaps siblings
        // that are still sliding: first open the box and the flanking gap
        // (opacity held at 0, so nothing is visible while the space is being
        // made), then fade the now-placed child in. `gapScale` 0 → 1 tracks the
        // size so siblings slide over continuously instead of jumping by `gap`.
        const grow = duration * SIZE_PHASE;
        const fade = duration - grow;
        return commandSequence<Node2DProps>(
            child,
            commandParallel<Node2DProps>(
                child,
                child.to(sizeProps, grow, easing),
                child.to({ gapScale: 1 } as Partial<Node2DProps>, grow, easing),
            ),
            child.to({ opacity: targetOpacity } as Partial<Node2DProps>, fade, easing),
        );
    };

    return driveCommand(duration, (t) => {
        if (!animation) animation = setup();
        animation.at(t);
        if (t >= 1) {
            // Restore any hug/fill token so the child reflows naturally from
            // here on; the tween already landed the axis on its measured pixel
            // size, so this is seamless.
            const restore: Partial<Node2DProps> = {};
            if (!isNumericW) restore.width = origW;
            if (!isNumericH) restore.height = origH;
            if (!isNumericW || !isNumericH) child.set(restore as Partial<Node2DProps>);
        }
    });
}

/**
 * Animated `removeChildAt`: fade+size the child out, then detach it.
 *
 * The child stays in the tree — animating out — until the command reaches its
 * end (`t === 1`), matching the "insert"/"remove" seekability
 * `packages/components/code` established: a host asking for a time before the
 * end sees the child still present, mid-fade; only reaching the end detaches it.
 * Seeking back below the end after having reached it re-attaches the child at
 * its original index, so the animation stays a function of `t` in both
 * directions rather than a one-way commit.
 */
export function removeChildAtAnimated(
    parent: Node2D,
    index: number,
    duration: number,
    easing?: EasingFunction,
): Command<Record<string, never>> {
    let child: Node2D | null = null;
    let animation: Command<Node2DProps> | null = null;
    let setupDone = false;

    const setup = (): void => {
        setupDone = true;
        // Out of range: nothing to animate — `child`/`animation` stay null, and
        // every apply() below becomes a no-op.
        if (index < 0 || index >= parent.children.length) return;
        child = parent.children[index];

        // Pin to current rendered size so the shrink reflows siblings in the
        // parent layout.
        const lw = child.measuredWidth;
        const lh = child.measuredHeight;
        child.set({ width: lw, height: lh } as Partial<Node2DProps>);

        // Mirror of the insert: fade the child out first (box held at full
        // size, so it doesn't overlap siblings mid-fade), then collapse the
        // box and close the gap. `gapScale` 1 → 0 tracks the shrink so the gap
        // closes continuously.
        const fade = duration * (1 - SIZE_PHASE);
        const shrink = duration - fade;
        animation = commandSequence<Node2DProps>(
            child,
            child.to({ opacity: 0 } as Partial<Node2DProps>, fade, easing),
            commandParallel<Node2DProps>(
                child,
                child.to({ width: 0, height: 0 } as Partial<Node2DProps>, shrink, easing),
                child.to({ gapScale: 0 } as Partial<Node2DProps>, shrink, easing),
            ),
        );
    };

    return driveCommand(duration, (t) => {
        if (!setupDone) setup();
        if (!animation || !child) return;
        const done = t >= 1;
        if (!done && child.parent !== parent) {
            // Seeking back into the animation after it had reached the end —
            // the child is what's animating out, so put it back.
            parent.addChildAt(child, Math.min(index, parent.children.length));
        }
        animation.at(t);
        if (done) {
            parent.removeChild(child);
            // The child is detached now, so its 0 gapScale no longer affects any
            // layout — but the same node can be re-added later (scenes reuse
            // refs), and a plain (non-animated) addChild wouldn't reset it.
            // Restore the default so a stale 0 can't silently swallow a gap on
            // re-insert.
            child.set({ gapScale: 1 } as Partial<Node2DProps>);
        }
    });
}

/**
 * Animated `reparent`: fade+size the node out of its current parent, then
 * reparent it and fade+size it in. The handoff happens at the animation's
 * midpoint (`t === 0.5`) — seeking across it in either direction moves the node
 * between parents to match, the same bidirectional membership rule
 * {@link removeChildAtAnimated} uses.
 */
export function reparentAnimated(
    node: Node2D,
    newParent: Node2D,
    duration: number,
    easing?: EasingFunction,
): Command<Record<string, never>> {
    const half = duration / 2;
    let animation: Command<Node2DProps> | null = null;
    let oldParent: Node2D | null = null;

    const setup = (): Command<Node2DProps> => {
        const targetOpacity = node.opacity;
        oldParent = node.parent;

        // Pin to current rendered size so exit shrink reflows the old parent.
        const lw = node.measuredWidth;
        const lh = node.measuredHeight;
        node.set({ width: lw, height: lh } as Partial<Node2DProps>);

        // Exit the old parent (fade out, then collapse the box + gap) over the
        // first half, then enter the new one (open the box + gap, then fade
        // in) over the second — one flat sequence, so evaluating any `t` walks
        // and settles every phase before it first. That is what makes the
        // *enter* tweens' `from` correct even when a driven host asks for a
        // time straight into the enter half without ever having evaluated the
        // exit half first: `commandSequence` re-settles every prior phase on
        // each call, so by the time an enter tween's `from` is lazily
        // snapshotted (its own first evaluation), the exit phase has already
        // collapsed the node to the state enter grows from.
        const exitFade = half * (1 - SIZE_PHASE);
        const exitShrink = half - exitFade;
        const enterGrow = half * SIZE_PHASE;
        const enterFade = half - enterGrow;
        return commandSequence<Node2DProps>(
            node,
            node.to({ opacity: 0 } as Partial<Node2DProps>, exitFade, easing),
            commandParallel<Node2DProps>(
                node,
                node.to({ width: 0, height: 0 } as Partial<Node2DProps>, exitShrink, easing),
                node.to({ gapScale: 0 } as Partial<Node2DProps>, exitShrink, easing),
            ),
            commandParallel<Node2DProps>(
                node,
                node.to({ width: lw, height: lh } as Partial<Node2DProps>, enterGrow, easing),
                node.to({ gapScale: 1 } as Partial<Node2DProps>, enterGrow, easing),
            ),
            node.to({ opacity: targetOpacity } as Partial<Node2DProps>, enterFade, easing),
        );
    };

    return driveCommand(duration, (t) => {
        if (!animation) animation = setup();
        const elapsed = t * duration;
        const inNewParent = elapsed >= half;
        if (inNewParent && node.parent !== newParent) {
            if (oldParent) oldParent.removeChild(node);
            newParent.addChild(node);
        } else if (!inNewParent && node.parent !== oldParent) {
            newParent.removeChild(node);
            if (oldParent) oldParent.addChild(node);
        }
        animation.at(t);
    });
}
