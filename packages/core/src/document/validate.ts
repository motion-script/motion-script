import type {
    AnimationDocument,
    CommandSpec,
    EaseSpec,
    NodeSpec,
    SceneDocument,
    StillDocument,
} from "./types";

/**
 * Schema validation for a {@link SceneDocument}.
 *
 * Hand-rolled rather than pulled from a schema library because
 * `@motion-script/core` has **no runtime dependencies**, and a renderer that
 * makes every consumer install a validator to draw a rectangle has made the
 * wrong trade. A host with its own schema stack (motion-studio has zod) mirrors
 * these rules; this is the copy the engine itself trusts.
 *
 * It checks *structure*, not props. Whether `cornerRadius` accepts a string is
 * the node class's business — it declares that with `@property`, and it is
 * checked where it is applied. What can only be checked here is what spans
 * rows: that a parent exists, that the tree has no cycle, that a command's
 * target was created before the command runs.
 */

/** One problem with a document. `path` locates it, JSON-Pointer style. */
export interface ValidationIssue {
    /** Where the problem is — `"nodes[2].parent"`, `"commands[7].at"`. */
    path: string;
    /** What is wrong, in a sentence a host can show. */
    message: string;
}

/** The result of {@link validateDocument}. */
export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}

const EASE_KINDS = new Set(["linear", "in", "out", "inOut"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A finite, non-negative number — what every time and duration field must be. */
function isTime(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function checkEase(ease: unknown, path: string, issues: ValidationIssue[]): void {
    if (ease === undefined) return;
    if (!isPlainObject(ease)) {
        issues.push({ path, message: "easing must be an object with a `kind`." });
        return;
    }
    const { kind } = ease as Partial<EaseSpec>;
    if (typeof kind !== "string" || !EASE_KINDS.has(kind)) {
        issues.push({
            path: `${path}.kind`,
            message: `easing kind must be one of ${[...EASE_KINDS].join(", ")} (got ${JSON.stringify(kind)}).`,
        });
    }
}

function checkNodeSpec(node: unknown, path: string, issues: ValidationIssue[]): node is NodeSpec {
    if (!isPlainObject(node)) {
        issues.push({ path, message: "node must be an object." });
        return false;
    }
    let ok = true;
    const { id, type, parent, order, props, name } = node as Partial<NodeSpec>;

    if (typeof id !== "string" || id.length === 0) {
        issues.push({ path: `${path}.id`, message: "id must be a non-empty string." });
        ok = false;
    }
    if (typeof type !== "string" || type.length === 0) {
        issues.push({ path: `${path}.type`, message: "type must be a non-empty string." });
        ok = false;
    }
    if (parent !== null && typeof parent !== "string") {
        issues.push({ path: `${path}.parent`, message: "parent must be a node id or null." });
        ok = false;
    }
    if (typeof order !== "number" || !Number.isFinite(order)) {
        issues.push({ path: `${path}.order`, message: "order must be a finite number." });
        ok = false;
    }
    if (!isPlainObject(props)) {
        issues.push({ path: `${path}.props`, message: "props must be an object (`{}` when nothing is set)." });
        ok = false;
    }
    if (name !== undefined && typeof name !== "string") {
        issues.push({ path: `${path}.name`, message: "name must be a string when present." });
        ok = false;
    }
    return ok;
}

function checkCommandSpec(cmd: unknown, path: string, issues: ValidationIssue[]): cmd is CommandSpec {
    if (!isPlainObject(cmd)) {
        issues.push({ path, message: "command must be an object." });
        return false;
    }
    let ok = true;
    const { id, type, target, at, duration, params } = cmd as Partial<CommandSpec>;

    if (typeof id !== "string" || id.length === 0) {
        issues.push({ path: `${path}.id`, message: "id must be a non-empty string." });
        ok = false;
    }
    if (typeof type !== "string" || type.length === 0) {
        issues.push({ path: `${path}.type`, message: "type must be a non-empty string." });
        ok = false;
    }
    if (target !== null && typeof target !== "string") {
        issues.push({ path: `${path}.target`, message: "target must be a node id, or null for the scene root." });
        ok = false;
    }
    if (!isTime(at)) {
        issues.push({ path: `${path}.at`, message: "at must be a finite number of seconds >= 0." });
        ok = false;
    }
    if (duration !== undefined && !isTime(duration)) {
        issues.push({ path: `${path}.duration`, message: "duration must be a finite number of seconds >= 0." });
        ok = false;
    }
    if (!isPlainObject(params)) {
        issues.push({ path: `${path}.params`, message: "params must be an object (`{}` when there are none)." });
        ok = false;
    }
    checkEase((cmd as Partial<CommandSpec>).easing, `${path}.easing`, issues);
    return ok;
}

/**
 * Check that ids are unique, every `parent` resolves, and no node is its own
 * ancestor.
 *
 * The cycle check is not defensive padding: a parent loop makes the layout walk
 * recurse until the stack overflows, and the trace points at the layout engine
 * rather than at the two rows that point at each other.
 */
function checkTree(nodes: NodeSpec[], base: string, issues: ValidationIssue[]): void {
    const byId = new Map<string, number>();
    nodes.forEach((n, i) => {
        if (byId.has(n.id)) {
            issues.push({ path: `${base}[${i}].id`, message: `duplicate node id "${n.id}".` });
            return;
        }
        byId.set(n.id, i);
    });

    for (let i = 0; i < nodes.length; i++) {
        const parent = nodes[i].parent;
        if (parent !== null && !byId.has(parent)) {
            issues.push({
                path: `${base}[${i}].parent`,
                message: `parent "${parent}" is not a node in this document.`,
            });
        }
    }

    // Walk each node to the root; a revisit within one walk is a cycle.
    const settled = new Set<string>();
    for (const node of nodes) {
        if (settled.has(node.id)) continue;
        const seen = new Set<string>();
        let cursor: NodeSpec | undefined = node;
        while (cursor) {
            if (seen.has(cursor.id)) {
                issues.push({
                    path: `${base}[${byId.get(cursor.id)}].parent`,
                    message: `node "${cursor.id}" is its own ancestor — parent chain forms a cycle.`,
                });
                break;
            }
            seen.add(cursor.id);
            if (settled.has(cursor.id)) break;
            const parentId: string | null = cursor.parent;
            cursor = parentId === null ? undefined : nodes[byId.get(parentId) ?? -1];
        }
        for (const id of seen) settled.add(id);
    }
}

/** Validate a still: a node tree, and nothing about time. */
function validateStill(doc: StillDocument, issues: ValidationIssue[]): void {
    if (!Array.isArray(doc.nodes)) {
        issues.push({ path: "nodes", message: "nodes must be an array." });
        return;
    }
    const ok: NodeSpec[] = [];
    doc.nodes.forEach((n, i) => {
        if (checkNodeSpec(n, `nodes[${i}]`, issues)) ok.push(n);
    });
    checkTree(ok, "nodes", issues);
    if (doc.root !== undefined && !isPlainObject(doc.root)) {
        issues.push({ path: "root", message: "root must be an object of canvas props." });
    }
}

/**
 * Validate an animation: commands, and the tree they imply.
 *
 * The tree lives inside the `add` commands, so it is extracted and checked with
 * the same rules a still's is — a cycle or a missing parent is the same bug
 * whichever document it appears in.
 */
function validateAnimation(doc: AnimationDocument, issues: ValidationIssue[]): void {
    if (!Array.isArray(doc.commands)) {
        issues.push({ path: "commands", message: "commands must be an array." });
        return;
    }
    if (doc.duration !== undefined && !isTime(doc.duration)) {
        issues.push({ path: "duration", message: "duration must be a finite number of seconds >= 0." });
    }
    if (doc.root !== undefined && !isPlainObject(doc.root)) {
        issues.push({ path: "root", message: "root must be an object of canvas props." });
    }

    const valid: CommandSpec[] = [];
    const ids = new Set<string>();
    doc.commands.forEach((c, i) => {
        if (!checkCommandSpec(c, `commands[${i}]`, issues)) return;
        if (ids.has(c.id)) {
            issues.push({ path: `commands[${i}].id`, message: `duplicate command id "${c.id}".` });
            return;
        }
        ids.add(c.id);
        valid.push(c);
    });

    // The nodes an `add` brings into being, plus when each arrives.
    const nodes: NodeSpec[] = [];
    const addedAt = new Map<string, number>();
    valid.forEach((c, i) => {
        if (c.type !== "add") return;
        const spec = (c.params as { node?: unknown }).node;
        const path = `commands[${i}].params.node`;
        if (!checkNodeSpec(spec, path, issues)) return;
        if (addedAt.has(spec.id)) {
            issues.push({ path: `${path}.id`, message: `node "${spec.id}" is added more than once.` });
            return;
        }
        addedAt.set(spec.id, c.at);
        nodes.push(spec);
    });
    checkTree(nodes, "commands", issues);

    // A command cannot act on a node that does not exist yet. This is the one
    // ordering rule the document has, and it is the one a timeline editor
    // breaks by dragging a tween earlier than the node it animates.
    valid.forEach((c, i) => {
        if (c.target === null || c.type === "add") return;
        const added = addedAt.get(c.target);
        if (added === undefined) {
            issues.push({
                path: `commands[${i}].target`,
                message: `target "${c.target}" is never added by this animation.`,
            });
        } else if (c.at < added) {
            issues.push({
                path: `commands[${i}].at`,
                message:
                    `command runs at ${c.at}s but its target "${c.target}" is not added until ${added}s.`,
            });
        }
    });
}

/**
 * Validate a scene document.
 *
 * Returns every issue rather than throwing on the first: a host showing a
 * document's problems wants the list, and a fix-one-rerun loop over a large
 * scene is what makes an importer feel broken.
 */
export function validateDocument(doc: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!isPlainObject(doc)) {
        return { valid: false, issues: [{ path: "", message: "document must be an object." }] };
    }
    const kind = (doc as Partial<SceneDocument>).kind;
    if (kind === "still") {
        validateStill(doc as unknown as StillDocument, issues);
    } else if (kind === "animation") {
        validateAnimation(doc as unknown as AnimationDocument, issues);
    } else {
        issues.push({
            path: "kind",
            message: `kind must be "still" or "animation" (got ${JSON.stringify(kind)}).`,
        });
    }

    return { valid: issues.length === 0, issues };
}

/**
 * {@link validateDocument}, but throwing. For a caller that has no UI to show
 * issues in and wants the document or an error.
 */
export function assertValidDocument(doc: unknown): SceneDocument {
    const { valid, issues } = validateDocument(doc);
    if (!valid) {
        const detail = issues.map((i) => `  ${i.path || "<root>"}: ${i.message}`).join("\n");
        throw new Error(`Invalid scene document:\n${detail}`);
    }
    return doc as SceneDocument;
}
