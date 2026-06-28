import { Node, NodeConfig, NodeProps } from "./node";
import { property } from "@/attributes/properties/decorator";
import { ContextMap } from "@/util/context";
import { ThemeToken, DataToken, SeedToken } from "@/runtime/builtin-context";

export interface ThemeProviderProps extends NodeProps {
    /** Named values (e.g. colors) merged onto any ancestor theme, read via
     * `node.useContext(ThemeToken)`. */
    theme: Record<string, unknown>;
    /** Arbitrary data merged onto any ancestor data bag, read via
     * `node.useContext(DataToken)`. */
    data: Record<string, unknown>;
    /** A default seed passed down the tree, read via `node.useContext(SeedToken)`. */
    seed: string | number;
}

/**
 * Provides theme / data / seed to its descendants. A convenience wrapper over
 * the same context machinery as {@link Provider}: it sets three built-in tokens
 * at once and **merges** `theme`/`data` onto any ancestor provider's values
 * (nested `ThemeProvider`s accumulate; nearest wins per key), while `seed`
 * overrides the inherited seed.
 *
 * Layout-transparent like {@link Provider} — it carries context, not appearance.
 */
export class ThemeProvider extends Node<ThemeProviderProps> {
    @property({ default: undefined }) declare readonly theme?: Record<string, unknown>;
    @property({ default: undefined }) declare readonly data?: Record<string, unknown>;
    @property({ default: undefined }) declare readonly seed?: string | number;

    constructor(props: NodeConfig<ThemeProvider, ThemeProviderProps>) {
        super(props);
    }

    protected override provideContext(parent: ContextMap): ContextMap {
        let next = parent;
        if (this.theme) next = next.with(ThemeToken, { ...parent.get(ThemeToken), ...this.theme });
        if (this.data) next = next.with(DataToken, { ...parent.get(DataToken), ...this.data });
        if (this.seed !== undefined) next = next.with(SeedToken, this.seed);
        return next;
    }
}
