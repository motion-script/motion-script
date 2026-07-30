/**
 * A callable reference that acts as both getter and setter.
 * - `ref()` → returns the current value (throws if not yet assigned)
 * - `ref(value)` → sets the current value
 */
export interface Reference<T> {
    (): T;
    (node: T | null): void;
    /**
     * Phantom — never assigned at runtime, and never called. It exists so that
     * `T` appears in a *contravariant* position, which is what makes
     * {@link RefTarget} safe. The call signatures alone can't decide it: the
     * zero-arg getter `(): T` is assignable to any `(x) => void`, so a slot
     * typed as just the setter would silently accept a `Reference` of an
     * unrelated node type.
     * @internal
     */
    readonly __accepts?: (node: T) => void;
}

/**
 * A slot that can *receive* a `T` — a `Reference<T>`, or one declared as any
 * **supertype** of `T`.
 *
 * This is the type a node's `ref` prop takes, and the widening is deliberate:
 * the framework only ever writes into a ref (`props.ref(this)` in the `Node`
 * constructor) and the author only ever reads, so handing a `Rect` to a
 * `Reference<ShapeNode>` is sound in both directions — the write stores a
 * subtype, the read yields the supertype the author asked for. That is what
 * lets one ref hold whichever shape a factory happened to build:
 *
 * ```tsx
 * const ref = createRef<ShapeNode>();
 * <Rect ref={ref} />      // ✔ Rect is a ShapeNode
 * <Ellipse ref={ref} />   // ✔ so is Ellipse
 * ```
 *
 * The opposite direction stays an error, because it is the unsound one: a
 * `Reference<Rect>` on a `<Text>` would be handed a `Text` at runtime while
 * still typing every read as a `Rect`.
 *
 * A plain setter function is accepted too, which makes React-style callback
 * refs (`ref={n => …}`) work without a separate type.
 */
export type RefTarget<T> = {
    (node: T | null): void;
    readonly __accepts?: (node: T) => void;
};

/**
 * Creates a typed reference holder — analogous to React's `createRef`,
 * but expressed as a single overloaded function rather than a `{ current }` object.
 */
export function createRef<T>(): Reference<T> {
    let current: T | null = null;

    function ref(): T;
    function ref(node: T | null): void;
    function ref(node?: T | null): T | void {
        if (node !== undefined) {
            current = node;
        } else {
            if (current === null) {
                throw new Error("Reference not assigned yet");
            }
            return current;
        }
    }

    return ref;
}
