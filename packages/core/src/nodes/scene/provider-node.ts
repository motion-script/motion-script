import { Node2D, NodeConfig, Node2DProps } from "@/nodes/2d/node2d";
import { property } from "@/attributes/properties/decorator";
import { Context, ContextMap } from "@/util/context";

export interface ProviderProps<T> extends Node2DProps {
    /** The context token this provider supplies to its descendants. */
    context: Context<T>;
    /** The value to provide. Omitted → the token's default value. */
    value: T;
}

/**
 * Generic context provider — the JSX-facing counterpart to {@link createContext}.
 * Wraps its children and supplies a token's value to everything below it;
 * descendants read it with `node.useContext(token)`. Nesting providers for the
 * same token shadows nearest-ancestor-wins.
 *
 * @example Inline use
 * ```tsx
 * const Money = createContext<number>(0, "money");
 * <Provider context={Money} value={500}>
 *   <MyNode />   // useContext(Money) === 500
 * </Provider>
 * ```
 *
 * @example Reusable, pre-bound provider — extend and fix the token
 * ```tsx
 * class MoneyProvider extends Provider<number> {
 *   protected override resolveContext() { return Money; }
 * }
 * <MoneyProvider value={500}>…</MoneyProvider>
 * ```
 *
 * It's a layout-transparent container: it has no paint of its own and
 * stack-centers its children (the base {@link Node2D} layout), so dropping a
 * provider into a tree changes inheritance, not appearance.
 */
export class Provider<T = unknown> extends Node2D<ProviderProps<T>> {
    @property({ default: undefined }) declare readonly context?: Context<T>;
    @property({ default: undefined }) declare readonly value?: T;

    constructor(props: NodeConfig<Provider<T>, ProviderProps<T>>) {
        super(props);
    }

    /** The token to provide. Override in a subclass to bind a fixed token so
     * authors don't re-pass `context` on every use. */
    protected resolveContext(): Context<T> | undefined {
        return this.context;
    }

    /** The value to provide. Override alongside {@link resolveContext} for a
     * provider that computes its value rather than taking it as a prop. */
    protected resolveValue(): T | undefined {
        return this.value;
    }

    protected override provideContext(parent: ContextMap): ContextMap {
        const ctx = this.resolveContext();
        if (!ctx) return parent;
        const v = this.resolveValue();
        return parent.with(ctx, v !== undefined ? v : ctx.defaultValue);
    }
}
