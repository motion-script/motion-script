import { PathCommand } from "@/render/descriptors/path";

/**
 * Parse an SVG path `d` string into a {@link PathCommand} array.
 *
 * Tokenizes on command letters and numbers (supporting scientific notation), then
 * consumes the fixed argument count for each command. Implicit repeated commands
 * — e.g. `L 1 1 2 2` meaning two line-tos, or extra coordinate pairs after an `M`
 * meaning implicit line-tos per the SVG spec — are handled by looping while
 * numeric tokens remain before the next command letter.
 */
export function parsePathString(d: string): PathCommand[] {
    const cmds: PathCommand[] = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?[\d.]+(?:e[-+]?\d+)?)/gi;
    const tokens: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) tokens.push(m[0]);

    let i = 0;
    const num = () => parseFloat(tokens[i++]);
    const moreArgs = () => i < tokens.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(tokens[i]);

    while (i < tokens.length) {
        const t = tokens[i++];
        switch (t) {
            // M/m with extra coordinate pairs implies subsequent L/l commands.
            case "M":
            case "m":
                cmds.push({ type: t, x: num(), y: num() });
                while (moreArgs()) cmds.push({ type: t === "M" ? "L" : "l", x: num(), y: num() });
                break;
            case "L":
            case "l":
                do { cmds.push({ type: t, x: num(), y: num() }); } while (moreArgs());
                break;
            case "H":
            case "h":
                do { cmds.push({ type: t, x: num() }); } while (moreArgs());
                break;
            case "V":
            case "v":
                do { cmds.push({ type: t, y: num() }); } while (moreArgs());
                break;
            case "C":
            case "c":
                do {
                    cmds.push({ type: t, x1: num(), y1: num(), x2: num(), y2: num(), x: num(), y: num() });
                } while (moreArgs());
                break;
            case "S":
            case "s":
                do { cmds.push({ type: t, x2: num(), y2: num(), x: num(), y: num() }); } while (moreArgs());
                break;
            case "Q":
            case "q":
                do { cmds.push({ type: t, x1: num(), y1: num(), x: num(), y: num() }); } while (moreArgs());
                break;
            case "T":
            case "t":
                do { cmds.push({ type: t, x: num(), y: num() }); } while (moreArgs());
                break;
            case "A":
            case "a":
                do {
                    cmds.push({
                        type: t,
                        rx: num(), ry: num(), rotation: num(),
                        largeArc: num() as 0 | 1, sweep: num() as 0 | 1,
                        x: num(), y: num(),
                    });
                } while (moreArgs());
                break;
            case "Z":
            case "z":
                cmds.push({ type: "Z" });
                break;
        }
    }
    return cmds;
}

/**
 * Coerce loose {@link PathData} into a {@link PathCommand} array, parsing strings.
 * Nullish input yields an empty command list rather than throwing downstream —
 * a `Path` whose `d` hasn't been set yet (or was cleared) is a valid empty shape,
 * and morphing/measuring it should degrade gracefully.
 */
export function toPathCommands(d: import("@/render/descriptors/path").PathData | null | undefined): PathCommand[] {
    if (d == null) return [];
    return typeof d === "string" ? parsePathString(d) : d;
}
