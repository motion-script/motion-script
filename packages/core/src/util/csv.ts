/** One parsed data record: column name → cell value (string, or number/boolean
 *  when the column auto-coerces — see {@link ParseCSVOptions.numeric} and
 *  {@link ParseCSVOptions.boolean}). */
export type DataRecord = Record<string, string | number | boolean>;

export interface ParseCSVOptions {
    /** Field separator. Default: ','. */
    delimiter?: string;
    /**
     * Which columns to coerce to `number`. An explicit list forces just those
     * columns; `false` disables coercion entirely (every cell stays a string).
     * Default (omitted/`true`): auto-detect — a column becomes numeric only if
     * every non-empty cell in it parses as a finite number, so a text column
     * that happens to contain a numeric-looking value here and there is left
     * alone rather than partially coerced.
     */
    numeric?: string[] | boolean;
    /**
     * Which columns to coerce to `boolean`, same shape/semantics as
     * {@link numeric}. Default (omitted/`true`): auto-detect — a column
     * becomes boolean only if every non-empty cell is exactly `"true"` or
     * `"false"`. Never applied to a column already coerced to numeric.
     */
    boolean?: string[] | boolean;
}

/**
 * Parse CSV text into an array of row records keyed by the header row.
 * Handles quoted fields (embedded delimiters, newlines, and `""` escapes) and
 * both CRLF/LF line endings. Synchronous and dependency-free, so it's safe to
 * call at module-eval time on text pulled in via a `?raw` import.
 */
export function parseCSV(text: string, options: ParseCSVOptions = {}): DataRecord[] {
    const delimiter = options.delimiter ?? ',';
    const rows = splitRows(text, delimiter);
    if (rows.length === 0) return [];

    const header = rows[0].map(cell => cell.trim());
    const body = rows.slice(1);

    const records: Record<string, string>[] = body.map(row => {
        const record: Record<string, string> = {};
        header.forEach((key, i) => { record[key] = row[i] ?? ''; });
        return record;
    });

    const numericCols = resolveNumericColumns(header, records, options.numeric);
    const booleanCols = resolveBooleanColumns(header, records, numericCols, options.boolean);
    if (numericCols.length === 0 && booleanCols.length === 0) return records;

    return records.map(record => {
        const out: DataRecord = { ...record };
        for (const col of numericCols) {
            const raw = record[col];
            if (raw === '') continue;
            out[col] = Number(raw);
        }
        for (const col of booleanCols) {
            const raw = record[col];
            if (raw === '') continue;
            out[col] = raw === 'true';
        }
        return out;
    });
}

/**
 * `parseData` only ever runs as an inlined literal — `@motion-script/cli`'s
 * build-time macro replaces `parseData("file.csv")` call sites with the
 * already-parsed rows before this body ever executes. This implementation exists
 * purely so the call type-checks and so an unresolved call site (a project not
 * built by the CLI, or a non-literal argument the macro couldn't statically
 * inline) fails loudly instead of silently returning nothing.
 */
export function parseData(file: string, _options?: ParseCSVOptions): DataRecord[] {
    throw new Error(
        `parseData("${file}") must be called with a static string literal so the ` +
        `@motion-script/cli macro can inline it at build time. If you're seeing this ` +
        `error at runtime, either the project wasn't built by the CLI, or this call's ` +
        `argument isn't a plain string literal.`
    );
}

/** Decide which columns to coerce, per {@link ParseCSVOptions.numeric}. */
function resolveNumericColumns(
    header: string[],
    records: Record<string, string>[],
    numeric: string[] | boolean | undefined,
): string[] {
    if (numeric === false) return [];
    if (Array.isArray(numeric)) return numeric;

    return header.filter(col => {
        let sawValue = false;
        for (const record of records) {
            const raw = record[col];
            if (raw === '') continue;
            if (!Number.isFinite(Number(raw))) return false;
            sawValue = true;
        }
        return sawValue;
    });
}

/** Decide which columns to coerce, per {@link ParseCSVOptions.boolean}. */
function resolveBooleanColumns(
    header: string[],
    records: Record<string, string>[],
    numericCols: string[],
    bool: string[] | boolean | undefined,
): string[] {
    if (bool === false) return [];
    if (Array.isArray(bool)) return bool;

    const numericSet = new Set(numericCols);
    return header.filter(col => {
        if (numericSet.has(col)) return false;
        let sawValue = false;
        for (const record of records) {
            const raw = record[col];
            if (raw === '') continue;
            if (raw !== 'true' && raw !== 'false') return false;
            sawValue = true;
        }
        return sawValue;
    });
}

/**
 * Split raw CSV text into rows of raw (unquoted) string cells. A minimal
 * hand-rolled scanner rather than a `split(',')`/`split('\n')` pair so quoted
 * fields can safely contain the delimiter, newlines, and escaped (`""`) quotes.
 */
function splitRows(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let sawAnyField = false;

    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { pushField(); rows.push(row); row = []; sawAnyField = false; };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') { inQuotes = true; sawAnyField = true; continue; }
        if (ch === delimiter) { sawAnyField = true; pushField(); continue; }
        if (ch === '\r') continue;
        if (ch === '\n') { if (sawAnyField || field) pushRow(); continue; }
        field += ch;
        sawAnyField = true;
    }
    // Flush a final row left over when the text has no trailing newline.
    if (sawAnyField || field) pushRow();

    return rows;
}
