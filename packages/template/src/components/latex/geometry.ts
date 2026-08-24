
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { browserAdaptor } from '@mathjax/src/js/adaptors/browserAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';

import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js';
import '@mathjax/src/js/input/tex/bbox/BboxConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';
import { PathCommand } from '@motion-script/core';

// --- MathJax Setup (synchronous, browser-only) ---

const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);

const texJax = new TeX({
    packages: [
        'base', 'ams', 'boldsymbol', 'newcommand',
        'cancel', 'color', 'mhchem', 'physics',
        'bbox', 'mathtools',
    ],
});

const svgJax = new SVG({ fontCache: 'local' });
const mjDoc = mathjax.document('', { InputJax: texJax, OutputJax: svgJax });

// --- Public API ---

/** A single rendered glyph or shape with its character key and path commands. */
export interface LatexToken {
    /** Character this token represents, or a synthetic key for non-glyph shapes. */
    token: string;
    path: PathCommand[];
}

export interface LatexPathResult {
    /** All tokens in render order. */
    tokens: LatexToken[];
    /** Flat array of all path commands (for legacy single-path rendering). */
    commands: PathCommand[];
    width: number;
    height: number;
    /**
     * Bounding box over every token, in token coordinate space:
     * [minX, minY, maxX, maxY]. All tokens share this frame, so passing it as
     * each path's center frame keeps their relative layout (instead of each
     * glyph centering on its own bbox).
     */
    bounds: [number, number, number, number];
}

export function buildLatexPath(text: string, fontSize: number): LatexPathResult {
    const node = mjDoc.convert(text, {
        display: true,
        em: 16,
        ex: 8,
        containerWidth: 80 * 16,
    });

    const svgEl = adaptor.firstChild(node) as HTMLElement;
    const heightAttr = adaptor.getAttribute(svgEl, 'height') ?? '';
    const heightEx = parseFloat(heightAttr) || 0;
    const svgString = adaptor.innerHTML(node);

    return fastBuildLatex(svgString, fontSize, heightEx);
}

// --- High-Speed Matrix Math ---

type Matrix = [number, number, number, number, number, number]; // [a, b, c, d, tx, ty]
const identityMatrix: Matrix = [1, 0, 0, 1, 0, 0];

function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
}

function parseTransform(str: string | null): Matrix {
    if (!str) return identityMatrix;
    let m: Matrix = [...identityMatrix];
    const re = /([a-z]+)\(([^)]+)\)/g;
    let match;
    while ((match = re.exec(str)) !== null) {
        const type = match[1];
        const args = match[2].split(/[ ,]+/).map(parseFloat);
        if (type === 'translate') {
            m = multiplyMatrix(m, [1, 0, 0, 1, args[0] || 0, args[1] || 0]);
        } else if (type === 'scale') {
            const sx = args[0] || 1;
            const sy = args[1] !== undefined ? args[1] : sx;
            m = multiplyMatrix(m, [sx, 0, 0, sy, 0, 0]);
        } else if (type === 'matrix') {
            m = multiplyMatrix(m, [args[0], args[1], args[2], args[3], args[4], args[5]]);
        }
    }
    return m;
}

function applyMatrix(x: number, y: number, m: Matrix): [number, number] {
    return [
        x * m[0] + y * m[2] + m[4],
        x * m[1] + y * m[3] + m[5],
    ];
}

// --- Glyph ID → character decoding ---

/**
 * MathJax SVG glyph IDs look like "MJX-1-TEX-N-78" or "MJX-1-TEX-I-1D465".
 * The last segment is the Unicode codepoint in hex.
 */
function glyphIdToChar(id: string): string {
    const parts = id.split('-');
    const hex = parts[parts.length - 1];
    const cp = parseInt(hex, 16);
    if (!isNaN(cp)) {
        try { return String.fromCodePoint(cp); } catch { /* fall through */ }
    }
    return id;
}

// --- Core Fast Traversal Engine ---

type RawToken = { token: string; cmds: Array<{ cmd: string; args: number[] }> };

function fastBuildLatex(svgString: string, fontSize: number, heightEx: number): LatexPathResult {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    // Pre-parse the glyph dictionary from <defs>
    const glyphMap = new Map<string, Array<{ cmd: string; args: number[] }>>();
    const defs = doc.getElementsByTagName("path");
    for (let i = 0; i < defs.length; i++) {
        const id = defs[i].getAttribute("id");
        const d = defs[i].getAttribute("d");
        if (id && d) {
            glyphMap.set(`#${id}`, expandToAbsolute(tokenisePath(d)));
        }
    }

    // Collect raw tokens — each <use> is one token, rects/paths are grouped as synthetic tokens
    const rawTokens: RawToken[] = [];
    let synthIdx = 0;

    function pushCmds(token: string, cmds: Array<{ cmd: string; args: number[] }>) {
        rawTokens.push({ token, cmds });
    }

    function traverse(node: Element, currentMatrix: Matrix) {
        let nodeMatrix = currentMatrix;

        const transformStr = node.getAttribute("transform");
        if (transformStr) {
            nodeMatrix = multiplyMatrix(nodeMatrix, parseTransform(transformStr));
        }

        const nodeName = node.nodeName.toLowerCase();

        if (nodeName === "use") {
            const href = node.getAttribute("href") || node.getAttribute("xlink:href");
            const x = parseFloat(node.getAttribute("x") || "0");
            const y = parseFloat(node.getAttribute("y") || "0");

            if (href && glyphMap.has(href)) {
                const glyphCommands = glyphMap.get(href)!;
                const cmds: Array<{ cmd: string; args: number[] }> = [];
                for (const gc of glyphCommands) {
                    const shiftedArgs = [...gc.args];
                    for (let j = 0; j < shiftedArgs.length; j += 2) {
                        const [nx, ny] = applyMatrix(shiftedArgs[j] + x, shiftedArgs[j + 1] + y, nodeMatrix);
                        shiftedArgs[j] = nx;
                        shiftedArgs[j + 1] = ny;
                    }
                    cmds.push({ cmd: gc.cmd, args: shiftedArgs });
                }
                // Derive character from glyph ID
                const rawId = href.startsWith('#') ? href.slice(1) : href;
                pushCmds(glyphIdToChar(rawId), cmds);
            }
        } else if (nodeName === "rect") {
            const x = parseFloat(node.getAttribute("x") || "0");
            const y = parseFloat(node.getAttribute("y") || "0");
            const w = parseFloat(node.getAttribute("width") || "0");
            const h = parseFloat(node.getAttribute("height") || "0");

            if (w > 0 && h > 0) {
                const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
                const tp = pts.map(p => applyMatrix(p[0], p[1], nodeMatrix));
                pushCmds(`__rect_${synthIdx++}`, [
                    { cmd: 'M', args: [tp[0][0], tp[0][1]] },
                    { cmd: 'L', args: [tp[1][0], tp[1][1]] },
                    { cmd: 'L', args: [tp[2][0], tp[2][1]] },
                    { cmd: 'L', args: [tp[3][0], tp[3][1]] },
                    { cmd: 'Z', args: [] },
                ]);
            }
        } else if (nodeName === "path" && node.parentNode?.nodeName.toLowerCase() !== "defs") {
            const d = node.getAttribute("d");
            if (d) {
                const abs = expandToAbsolute(tokenisePath(d));
                const cmds: Array<{ cmd: string; args: number[] }> = [];
                for (const gc of abs) {
                    const shiftedArgs = [...gc.args];
                    for (let j = 0; j < shiftedArgs.length; j += 2) {
                        const [nx, ny] = applyMatrix(shiftedArgs[j], shiftedArgs[j + 1], nodeMatrix);
                        shiftedArgs[j] = nx;
                        shiftedArgs[j + 1] = ny;
                    }
                    cmds.push({ cmd: gc.cmd, args: shiftedArgs });
                }
                pushCmds(`__path_${synthIdx++}`, cmds);
            }
        }

        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType === 1 && child.nodeName.toLowerCase() !== "defs") {
                traverse(child as Element, nodeMatrix);
            }
        }
    }

    const svg = doc.getElementsByTagName("svg")[0];
    if (svg) traverse(svg, identityMatrix);
    if (rawTokens.length === 0) return { tokens: [], commands: [], width: 0, height: 0, bounds: [0, 0, 0, 0] };

    // Compute bounding box across all raw commands
    const allAbs = rawTokens.flatMap(t => t.cmds);
    const { minX, minY, maxX, maxY } = svgBBox(allAbs);
    const svgW = maxX - minX;
    const svgH = maxY - minY;

    let scale: number;
    if (heightEx > 0 && svgH > 0) {
        const exInCoords = svgH / heightEx;
        scale = fontSize / (2 * exInCoords);
    } else {
        scale = svgH > 0 ? fontSize / svgH : 1;
    }

    const ocx = (minX + maxX) / 2;
    const ocy = (minY + maxY) / 2;

    const tx = (svgX: number) => (svgX - ocx) * scale;
    const ty = (svgY: number) => (svgY - ocy) * scale;

    function rawCmdsToPathCommands(cmds: Array<{ cmd: string; args: number[] }>): PathCommand[] {
        const out: PathCommand[] = [];
        for (const { cmd, args: a } of cmds) {
            switch (cmd) {
                case 'M': out.push({ type: 'M', x: tx(a[0]), y: ty(a[1]) }); break;
                case 'L': out.push({ type: 'L', x: tx(a[0]), y: ty(a[1]) }); break;
                case 'Q': out.push({ type: 'Q', x1: tx(a[0]), y1: ty(a[1]), x: tx(a[2]), y: ty(a[3]) }); break;
                case 'C': out.push({ type: 'C', x1: tx(a[0]), y1: ty(a[1]), x2: tx(a[2]), y2: ty(a[3]), x: tx(a[4]), y: ty(a[5]) }); break;
                case 'Z': out.push({ type: 'Z' }); break;
            }
        }
        return out;
    }

    const tokens: LatexToken[] = rawTokens.map(rt => ({
        token: rt.token,
        path: rawCmdsToPathCommands(rt.cmds),
    }));

    const commands = tokens.flatMap(t => t.path);

    // Shared center frame for all tokens, in token coordinate space. tx/ty map
    // the SVG bbox corners; this is the frame every token's path is laid out in.
    const bounds: [number, number, number, number] = [
        tx(minX), ty(minY), tx(maxX), ty(maxY),
    ];

    return { tokens, commands, width: svgW * scale, height: svgH * scale, bounds };
}

// --- SVG Path Utilities ---

type RawCmd = { cmd: string; args: number[] };

function tokenisePath(d: string): RawCmd[] {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
    const out: RawCmd[] = [];
    let cur: RawCmd | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) {
        if (m[1]) { cur = { cmd: m[1], args: [] }; out.push(cur); }
        else if (cur) cur.args.push(parseFloat(m[2]));
    }
    return out;
}

function argCount(cmd: string): number {
    switch (cmd.toUpperCase()) {
        case 'M': return 2; case 'L': return 2; case 'H': return 1; case 'V': return 1;
        case 'C': return 6; case 'S': return 4; case 'Q': return 4; case 'T': return 2;
        case 'A': return 7; case 'Z': return 0; default: return 0;
    }
}

interface Pt { x: number; y: number }

function expandToAbsolute(raw: RawCmd[]): Array<{ cmd: string; args: number[] }> {
    const out: Array<{ cmd: string; args: number[] }> = [];
    let cx = 0, cy = 0;
    let mx = 0, my = 0;
    let prevCmd = '';
    let prevCtrl: Pt = { x: 0, y: 0 };

    for (const { cmd, args } of raw) {
        const up = cmd.toUpperCase();
        const rel = cmd === cmd.toLowerCase() && up !== 'Z';
        const n = argCount(up);
        const reps = n === 0 ? 1 : Math.max(1, Math.ceil(args.length / n));

        for (let r = 0; r < reps; r++) {
            const a = args.slice(r * n, r * n + n);
            const absX = (i: number) => rel ? a[i] + cx : a[i];
            const absY = (i: number) => rel ? a[i] + cy : a[i];

            switch (up) {
                case 'M': {
                    const x = absX(0), y = absY(1);
                    const emitCmd = r === 0 ? 'M' : 'L';
                    out.push({ cmd: emitCmd, args: [x, y] });
                    cx = x; cy = y;
                    if (r === 0) { mx = x; my = y; }
                    prevCmd = emitCmd;
                    prevCtrl = { x: cx, y: cy };
                    break;
                }
                case 'Z':
                    out.push({ cmd: 'Z', args: [] });
                    cx = mx; cy = my;
                    prevCmd = 'Z';
                    break;
                case 'L': {
                    const x = absX(0), y = absY(1);
                    out.push({ cmd: 'L', args: [x, y] });
                    cx = x; cy = y;
                    prevCmd = 'L';
                    prevCtrl = { x: cx, y: cy };
                    break;
                }
                case 'H': {
                    const x = rel ? a[0] + cx : a[0];
                    out.push({ cmd: 'L', args: [x, cy] });
                    cx = x;
                    prevCmd = 'L';
                    prevCtrl = { x: cx, y: cy };
                    break;
                }
                case 'V': {
                    const y = rel ? a[0] + cy : a[0];
                    out.push({ cmd: 'L', args: [cx, y] });
                    cy = y;
                    prevCmd = 'L';
                    prevCtrl = { x: cx, y: cy };
                    break;
                }
                case 'C': {
                    const x1 = absX(0), y1 = absY(1);
                    const x2 = absX(2), y2 = absY(3);
                    const x = absX(4), y = absY(5);
                    out.push({ cmd: 'C', args: [x1, y1, x2, y2, x, y] });
                    prevCtrl = { x: x2, y: y2 };
                    cx = x; cy = y;
                    prevCmd = 'C';
                    break;
                }
                case 'S': {
                    const x1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cx - prevCtrl.x : cx;
                    const y1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cy - prevCtrl.y : cy;
                    const x2 = absX(0), y2 = absY(1);
                    const x = absX(2), y = absY(3);
                    out.push({ cmd: 'C', args: [x1, y1, x2, y2, x, y] });
                    prevCtrl = { x: x2, y: y2 };
                    cx = x; cy = y;
                    prevCmd = 'S';
                    break;
                }
                case 'Q': {
                    const x1 = absX(0), y1 = absY(1);
                    const x = absX(2), y = absY(3);
                    out.push({ cmd: 'Q', args: [x1, y1, x, y] });
                    prevCtrl = { x: x1, y: y1 };
                    cx = x; cy = y;
                    prevCmd = 'Q';
                    break;
                }
                case 'T': {
                    const x1 = prevCmd === 'Q' || prevCmd === 'T' ? 2 * cx - prevCtrl.x : cx;
                    const y1 = prevCmd === 'Q' || prevCmd === 'T' ? 2 * cy - prevCtrl.y : cy;
                    const x = absX(0), y = absY(1);
                    out.push({ cmd: 'Q', args: [x1, y1, x, y] });
                    prevCtrl = { x: x1, y: y1 };
                    cx = x; cy = y;
                    prevCmd = 'T';
                    break;
                }
            }
        }
    }

    if (out.length > 0 && out[out.length - 1].cmd !== 'Z') {
        out.push({ cmd: 'Z', args: [] });
    }

    return out;
}

function svgBBox(abs: Array<{ cmd: string; args: number[] }>): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const touch = (x: number, y: number) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    for (const { cmd, args } of abs) {
        switch (cmd) {
            case 'M': case 'L': touch(args[0], args[1]); break;
            case 'C': touch(args[0], args[1]); touch(args[2], args[3]); touch(args[4], args[5]); break;
            case 'Q': touch(args[0], args[1]); touch(args[2], args[3]); break;
        }
    }
    return { minX, minY, maxX, maxY };
}
