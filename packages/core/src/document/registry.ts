import type { Node } from "@/nodes/node/node";
import type { Command } from "@/tween/command";
import type { EasingFunction } from "@/tween/ease/type";
import type { NodeSpec } from "./types";

/**
 * The **code** half of the document model.
 *
 * A document names a node type and a command type with a string. Something has
 * to turn `"rect"` into a class and `"fillTo"` into an animation, and that
 * something is deliberately a registry rather than a table in the database:
 * node types are code — a class with `@property` declarations, a `renderSelf`,
 * and `@command()` methods — and code is versioned with the library, not with
 * the document. A document that referenced a type by anything other than a
 * stable key would break the moment the class was renamed.
 *
 * This is also where a **custom node** joins the system. Register the class
 * under a key and every document can use it, with no change to the schema, the
 * evaluator or the renderer:
 *
 * ```ts
 * class Blob extends Node2D<BlobProps> { … }
 * registerNodeType("blob", Blob);
 * // { "type": "blob", "props": { "wobble": 0.4 } }
 * ```
 */

/** Constructs a node from its authored props. Every built-in node class matches this. */
export type NodeConstructor = new (props?: Record<string, unknown>) => Node;

/** One registered node type. */
export interface NodeTypeEntry {
    /** Stable key, matching `NodeSpec.type`. */
    key: string;
    /** The class to construct. */
    ctor: NodeConstructor;
}

/**
 * Builds the {@link Command} a `CommandSpec` stands for.
 *
 * Called **once per compile**, in timeline order, with `target` already in the
 * state the previous command left it — that is what fixes the command's `from`
 * value and makes the returned `Command.at(t)` pure thereafter. See
 * `tween/command.ts` and `document/timeline.ts`.
 *
 * @param target   The node the command acts on (the scene root for `target: null`).
 * @param params   The spec's `params`, verbatim.
 * @param duration Seconds, already defaulted by the caller.
 * @param easing   Resolved from the spec's `EaseSpec`, or `undefined`.
 */
export type CommandFactory = (
    target: Node,
    params: Record<string, unknown>,
    duration: number,
    easing?: EasingFunction,
) => Command<Record<string, unknown>>;

/** One registered command type. */
export interface CommandTypeEntry {
    key: string;
    factory: CommandFactory;
    /**
     * Structural commands change *which nodes exist* rather than what their
     * props are, so the timeline has to know about them before it compiles
     * anything — a command cannot be built against a node that has not been
     * created yet. `add` and `remove` are the only two today.
     */
    structural?: boolean;
}

const nodeTypes = new Map<string, NodeTypeEntry>();
const commandTypes = new Map<string, CommandTypeEntry>();

/**
 * Register a node class under a document key.
 *
 * Re-registering the same key with the same class is a no-op, so a module that
 * is evaluated twice (a hot reload, a duplicated dependency) is harmless.
 * Re-registering it with a *different* class throws: two classes answering to
 * one key means a document renders differently depending on import order, which
 * is not a failure anyone would find by looking at the document.
 */
export function registerNodeType(key: string, ctor: NodeConstructor): void {
    const existing = nodeTypes.get(key);
    if (existing) {
        if (existing.ctor === ctor) return;
        throw new Error(
            `Node type "${key}" is already registered to a different class ` +
            `(${existing.ctor.name} vs ${ctor.name}). Keys must be unique — a document ` +
            `naming this type would otherwise resolve differently depending on import order.`,
        );
    }
    nodeTypes.set(key, { key, ctor });
}

/** The class registered under `key`, or `undefined`. */
export function resolveNodeType(key: string): NodeConstructor | undefined {
    return nodeTypes.get(key)?.ctor;
}

/** Every registered node key, for a host offering a palette. Sorted, so the order is stable. */
export function nodeTypeKeys(): string[] {
    return [...nodeTypes.keys()].sort();
}

/** Register a command type. Same uniqueness rule as {@link registerNodeType}. */
export function registerCommandType(
    key: string,
    factory: CommandFactory,
    options?: { structural?: boolean },
): void {
    const existing = commandTypes.get(key);
    if (existing) {
        if (existing.factory === factory) return;
        throw new Error(
            `Command type "${key}" is already registered to a different factory. ` +
            `Keys must be unique.`,
        );
    }
    commandTypes.set(key, { key, factory, structural: options?.structural });
}

/** The command registered under `key`, or `undefined`. */
export function resolveCommandType(key: string): CommandTypeEntry | undefined {
    return commandTypes.get(key);
}

/** Every registered command key. Sorted, so the order is stable. */
export function commandTypeKeys(): string[] {
    return [...commandTypes.keys()].sort();
}

/**
 * Register every `@command()` method on a node class as a document command.
 *
 * The dispatch table the decorator always implied: `getCommandMeta` already
 * enumerates a class's animations, so the keys come from the class rather than
 * from a list beside it that drifts the moment either is edited.
 *
 * `params` are passed as the method's **leading** arguments, by name, in the
 * order `argNames` gives — the convention every built-in already follows is
 * that `duration` and `easing` come last, so a host renders a form for the
 * leading arguments and drives the timing itself.
 */
export function registerNodeCommand(
    key: string,
    method: string,
    argNames: readonly string[] = [],
): void {
    registerCommandType(key, (target, params, duration, easing) => {
        const fn = (target as unknown as Record<string, unknown>)[method];
        if (typeof fn !== "function") {
            throw new Error(
                `Command "${key}" needs a "${method}" method on ${target.constructor.name}, ` +
                `which has none. Check the node's type key.`,
            );
        }
        const args = argNames.map((n) => params[n]);
        return (fn as (...a: unknown[]) => Command<Record<string, unknown>>)
            .call(target, ...args, duration, easing);
    });
}

/**
 * Reset both registries. Test-only — a suite that registers a throwaway node
 * type should not leak it into the next file.
 *
 * @internal
 */
export function clearRegistries(): void {
    nodeTypes.clear();
    commandTypes.clear();
}

/** Everything a host needs to describe one node type. Used by editors, not by rendering. */
export function describeNodeType(key: string): NodeTypeEntry | undefined {
    return nodeTypes.get(key);
}

/** Build a node from its spec. Throws on an unknown type — see {@link NodeSpec.type}. */
export function instantiate(spec: NodeSpec): Node {
    const ctor = resolveNodeType(spec.type);
    if (!ctor) {
        throw new Error(
            `Unknown node type "${spec.type}" (node ${spec.id}). ` +
            `Register it with registerNodeType("${spec.type}", TheClass) before building.`,
        );
    }
    return new ctor(spec.props);
}
