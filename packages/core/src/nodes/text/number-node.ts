import { EaseFunction } from "@/tween/ease/type";
import { FrameGenerator } from "@/tween/generator";
import { AnimationBuilder } from "@/tween/animation-builder";
import { property } from "@/attributes/properties/decorator";
import { NodeConfig } from "../base/node";
import { Text, TextProps } from "./text-node";


/** How a {@link NumberNode}'s value is formatted via `Intl.NumberFormat`. */
export type NumberFormat = "currency" | "percent" | "number";


export interface NumberProps extends Omit<TextProps, "text"> {
    /** The numeric value to display. Tweenable — `to({ value })` counts. */
    value: number;
    /**
     * Formatting style passed to `Intl.NumberFormat`:
     * - `'number'` — plain decimal (the default)
     * - `'currency'` — money, using {@link NumberProps.currencyCode}
     * - `'percent'` — multiplies by 100 and appends `%` (so `0.42` → `42%`)
     */
    format: NumberFormat;
    /**
     * BCP 47 locale tag controlling digit grouping, decimal mark, and currency
     * placement (e.g. `'en-US'`, `'de-DE'`, `'ja-JP'`). Defaults to the host
     * environment's locale.
     */
    locale: string | string[] | undefined;
    /**
     * ISO 4217 currency code (e.g. `'USD'`, `'EUR'`, `'JPY'`). Required by
     * `Intl.NumberFormat` when {@link NumberProps.format} is `'currency'`;
     * ignored otherwise.
     */
    currencyCode: string;
    /** Minimum number of fraction digits to show. */
    /**
     * Fixed number of decimal places to show. Pins both the minimum and maximum
     * fraction digits, so the display always has exactly this many decimals —
     * which keeps a counting animation from flickering trailing digits as the
     * value crosses integer boundaries. Leave unset to use the locale/format
     * default (currency → 2, percent/number → as needed).
     */
    decimals: number | undefined;
    /** Group digits with the locale's thousands separator (e.g. `1,000`). */
    useGrouping: boolean;
}


/**
 * Renders a number formatted with `Intl.NumberFormat`, so the displayed string
 * stays locale-correct (grouping, decimal mark, currency symbol placement).
 * Extends {@link Text} — and so is a `Shape` — inheriting all of its font,
 * fill, layout, and measurement behaviour; the displayed `text` is derived
 * reactively from {@link value} and the format props rather than set directly.
 *
 * Because {@link value} is a plain numeric prop, `to({ value })` interpolates
 * it like any other number, giving a counting / rolling animation for free.
 *
 * @example
 * const price = createRef<NumberNode>();
 * <NumberNode ref={price} value={0} format={'currency'} currencyCode={'USD'} />
 * yield* price().to({ value: 1299.99 }, 1.5);   // counts up to "$1,299.99"
 */
export class NumberNode extends Text {

    @property({ default: 0 }) declare readonly value: number;
    @property({ default: "number" }) declare readonly format: NumberFormat;
    @property({ default: undefined }) declare readonly locale: string | string[] | undefined;
    @property({ default: "USD" }) declare readonly currencyCode: string;
    @property({ default: undefined }) declare readonly decimals: number | undefined;
    @property({ default: true }) declare readonly useGrouping: boolean;

    constructor(props: NodeConfig<NumberNode, NumberProps>) {
        super(props as NodeConfig<Text, TextProps>);
        // Drive the inherited `text` from value + format reactively: reading the
        // format props inside the binding subscribes to them, so any change —
        // including a `to({ value })` tween — reformats and re-renders. Bound
        // after super() so all the format-prop signals already exist.
        this.applyProp("text", () => this.formatted());
    }

    /** Build the `Intl.NumberFormat` options from the current format props. */
    private formatOptions(): Intl.NumberFormatOptions {
        // `Intl` names the plain style `'decimal'`; we expose it as `'number'`.
        const style = this.format === "number" ? "decimal" : this.format;
        const options: Intl.NumberFormatOptions = {
            style,
            useGrouping: this.useGrouping,
        };
        if (this.format === "currency") options.currency = this.currencyCode;
        // A single `decimals` pins both bounds so the digit count is fixed.
        if (this.decimals !== undefined) {
            options.minimumFractionDigits = this.decimals;
            options.maximumFractionDigits = this.decimals;
        }
        return options;
    }

    /** The current value rendered through `Intl.NumberFormat`. */
    formatted(): string {
        return new Intl.NumberFormat(this.locale, this.formatOptions()).format(this.value);
    }

    /** Animate {@link value} to `to`, counting through the formatted display. */
    *countTo(to: number, duration: number, easing?: EaseFunction): FrameGenerator {
        yield* this.to({ value: to } as Partial<TextProps>, duration, easing);
    }

    // Widen the inherited typings so authors get `value` (and the format props)
    // in `to()`/`set()` autocomplete. The runtime is key-driven and already
    // writes any registered signal, so only the static types need broadening.
    override to(to: Partial<NumberProps>, duration: number, easing?: EaseFunction): AnimationBuilder<NumberProps> {
        return super.to(to as Partial<TextProps>, duration, easing) as unknown as AnimationBuilder<NumberProps>;
    }

    override set(props: { [K in keyof NumberProps]?: NumberProps[K] | (() => NumberProps[K]) }): void {
        super.set(props as Partial<TextProps>);
    }
}
