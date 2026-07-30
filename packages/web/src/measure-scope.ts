import { SkiaMeasureScope } from "@motion-script/skia-render/measure-scope";

/**
 * Browser alias for {@link SkiaMeasureScope}.
 *
 * A real subclass rather than a re-export, so `instanceof WebMeasureScope` and the
 * name in a stack trace both still mean something, and so a future
 * browser-specific measurement path has an obvious home. Text measurement itself
 * is pure Skia paragraph layout and needs no platform code at all.
 */
export class WebMeasureScope extends SkiaMeasureScope { }
