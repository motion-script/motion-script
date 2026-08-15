import { SkiaMeasurer } from "@motion-script/skia-render/measurer";

/**
 * Browser alias for {@link SkiaMeasurer}.
 *
 * A real subclass rather than a re-export, so `instanceof WebMeasurer` and the
 * name in a stack trace both still mean something, and so a future
 * browser-specific measurement path has an obvious home. Text measurement itself
 * is pure Skia paragraph layout and needs no platform code at all.
 */
export class WebMeasurer extends SkiaMeasurer { }
