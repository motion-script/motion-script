/**
 * A tiny `z = f(x, y)` expression compiler.
 *
 * The browser reference this node is modelled on used math.js from a CDN. Pulling
 * ~700 KB into the template for one feature isn't worth it, and a compiled
 * closure is considerably faster for the access pattern here: a 100×100 surface
 * is ~10,000 evaluations *per formula per frame*, so the expression must be
 * parsed once and then called, never re-parsed per vertex.
 *
 * Deliberately not `new Function(...)`: that would execute arbitrary code from
 * what is nominally a data prop. This parses a fixed grammar and can only ever
 * produce arithmetic.
 *
 * Grammar (precedence low → high):
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('-' | '+') unary | power
 *   power   := primary ('^' unary)?
 *   primary := number | ident '(' args ')' | ident | '(' expr ')'
 *
 * Note `unary` sits *above* `power`, not below it. That is what makes `-2^2`
 * evaluate to `-4` — exponentiation binds tighter than negation, as in maths,
 * math.js and Python. Putting unary lower gives `(-2)^2 = 4`, which is wrong and
 * fails silently on expressions like `-x^2`. Recursing into `unary` for the
 * exponent keeps `^` right-associative (`2^3^2 = 512`) and lets the exponent
 * itself be signed (`2^-3`).
 */

/** A compiled expression: pure, and safe to call thousands of times per frame. */
export type CompiledExpression = (x: number, y: number) => number;

/** Single-argument functions available to an expression. */
const UNARY_FNS: Record<string, (v: number) => number> = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    exp: Math.exp, log: Math.log, ln: Math.log,
    log2: Math.log2, log10: Math.log10,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sign: Math.sign, trunc: Math.trunc,
};

/** Multi-argument functions. */
const NARY_FNS: Record<string, (...args: number[]) => number> = {
    atan2: Math.atan2, pow: Math.pow, hypot: Math.hypot,
    min: Math.min, max: Math.max,
    mod: (a, b) => a % b,
};

const CONSTANTS: Record<string, number> = {
    pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E,
    tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2,
};

type Token =
    | { kind: "number"; value: number }
    | { kind: "ident"; value: string }
    | { kind: "op"; value: string };

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < source.length) {
        const ch = source[i];

        if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }

        if (isDigit(ch) || (ch === "." && isDigit(source[i + 1]))) {
            let j = i;
            while (j < source.length && (isDigit(source[j]) || source[j] === ".")) j++;
            // Exponent form: 1e-3, 2E+8
            if (source[j] === "e" || source[j] === "E") {
                const k = source[j + 1] === "+" || source[j + 1] === "-" ? j + 2 : j + 1;
                if (isDigit(source[k])) {
                    j = k;
                    while (j < source.length && isDigit(source[j])) j++;
                }
            }
            tokens.push({ kind: "number", value: Number(source.slice(i, j)) });
            i = j;
            continue;
        }

        if (isIdentStart(ch)) {
            let j = i;
            while (j < source.length && isIdentPart(source[j])) j++;
            tokens.push({ kind: "ident", value: source.slice(i, j) });
            i = j;
            continue;
        }

        if ("+-*/%^(),".includes(ch)) {
            tokens.push({ kind: "op", value: ch });
            i++;
            continue;
        }

        throw new Error(`Unexpected character '${ch}' at ${i}`);
    }

    return tokens;
}

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= "0" && ch <= "9";
const isIdentStart = (ch: string): boolean => /[A-Za-z_]/.test(ch);
const isIdentPart = (ch: string): boolean => /[A-Za-z0-9_]/.test(ch);

/**
 * Compile `source` into a callable. Throws on a syntax error, so a caller
 * rendering user-supplied text should catch and skip that formula.
 */
export function compileExpression(source: string): CompiledExpression {
    const tokens = tokenize(source);
    let pos = 0;

    const peek = (): Token | undefined => tokens[pos];
    const eat = (value: string): boolean => {
        const token = peek();
        if (token?.kind === "op" && token.value === value) { pos++; return true; }
        return false;
    };
    const expect = (value: string): void => {
        if (!eat(value)) throw new Error(`Expected '${value}' at token ${pos}`);
    };

    function parseExpr(): CompiledExpression {
        let left = parseTerm();
        for (;;) {
            if (eat("+")) { const r = parseTerm(), l = left; left = (x, y) => l(x, y) + r(x, y); }
            else if (eat("-")) { const r = parseTerm(), l = left; left = (x, y) => l(x, y) - r(x, y); }
            else return left;
        }
    }

    function parseTerm(): CompiledExpression {
        let left = parseUnary();
        for (;;) {
            if (eat("*")) { const r = parseUnary(), l = left; left = (x, y) => l(x, y) * r(x, y); }
            else if (eat("/")) { const r = parseUnary(), l = left; left = (x, y) => l(x, y) / r(x, y); }
            else if (eat("%")) { const r = parseUnary(), l = left; left = (x, y) => l(x, y) % r(x, y); }
            else return left;
        }
    }

    function parseUnary(): CompiledExpression {
        if (eat("-")) { const operand = parseUnary(); return (x, y) => -operand(x, y); }
        if (eat("+")) return parseUnary();
        return parsePower();
    }

    function parsePower(): CompiledExpression {
        const base = parsePrimary();
        // The exponent parses as a *unary*, which gives both right-associativity
        // (2^3^2 = 2^(3^2)) and signed exponents (2^-3).
        if (eat("^")) {
            const exponent = parseUnary();
            return (x, y) => Math.pow(base(x, y), exponent(x, y));
        }
        return base;
    }

    function parsePrimary(): CompiledExpression {
        const token = peek();
        if (!token) throw new Error("Unexpected end of expression");

        if (token.kind === "number") {
            pos++;
            const value = token.value;
            return () => value;
        }

        if (token.kind === "ident") {
            pos++;
            const name = token.value;

            if (eat("(")) {
                const args: CompiledExpression[] = [];
                if (!eat(")")) {
                    do { args.push(parseExpr()); } while (eat(","));
                    expect(")");
                }
                return makeCall(name, args);
            }

            if (name === "x") return (x) => x;
            if (name === "y") return (_x, y) => y;
            const constant = CONSTANTS[name];
            if (constant !== undefined) return () => constant;
            throw new Error(`Unknown identifier '${name}'`);
        }

        if (eat("(")) {
            const inner = parseExpr();
            expect(")");
            return inner;
        }

        throw new Error(`Unexpected token '${token.value}'`);
    }

    function makeCall(name: string, args: CompiledExpression[]): CompiledExpression {
        const unary = UNARY_FNS[name];
        if (unary) {
            if (args.length !== 1) throw new Error(`${name}() takes 1 argument`);
            const [a] = args;
            return (x, y) => unary(a(x, y));
        }

        const nary = NARY_FNS[name];
        if (nary) {
            // Specialise the common arities so the hot path doesn't allocate an
            // array per vertex.
            if (args.length === 2) {
                const [a, b] = args;
                return (x, y) => nary(a(x, y), b(x, y));
            }
            return (x, y) => nary(...args.map((arg) => arg(x, y)));
        }

        throw new Error(`Unknown function '${name}'`);
    }

    const compiled = parseExpr();
    if (pos !== tokens.length) throw new Error(`Unexpected trailing input at token ${pos}`);
    return compiled;
}

/**
 * Compile with memoisation, returning `null` for anything that doesn't parse.
 *
 * Both halves matter for this node: the builder re-runs every frame, so an
 * uncached compile would re-parse each formula 60 times a second; and a caller
 * feeding in half-typed or invalid expressions wants that formula skipped, not an
 * exception thrown out of the render pass.
 */
const cache = new Map<string, CompiledExpression | null>();

export function compileExpressionCached(source: string): CompiledExpression | null {
    const trimmed = source.trim();
    if (trimmed === "") return null;

    const hit = cache.get(trimmed);
    if (hit !== undefined) return hit;

    let compiled: CompiledExpression | null;
    try {
        compiled = compileExpression(trimmed);
    } catch {
        compiled = null;
    }
    cache.set(trimmed, compiled);
    return compiled;
}
