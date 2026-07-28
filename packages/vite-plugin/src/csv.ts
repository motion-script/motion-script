/**
 * Minimal RFC 4180 CSV encoding and decoding.
 *
 * The precomp cache is almost entirely tabular — one row per dependency, per node
 * lifespan, per asset — and JSON spends most of its bytes repeating the same
 * field names on every one of those rows. CSV states each name once, which makes
 * the files dramatically smaller, readable in any editor, greppable, and
 * line-diffable when a project chooses to commit them.
 *
 * Deliberately small: quoting, embedded delimiters/newlines, and CRLF tolerance
 * are handled because getting those wrong corrupts data silently. Nothing else is
 * — no streaming, no type inference, no dialects. Callers know their own columns
 * and convert types themselves.
 */

/** A field needs quoting if it contains a delimiter, a quote, or a line break. */
const NEEDS_QUOTING = /[",\r\n]/;

function encodeField(value: string): string {
    if (!NEEDS_QUOTING.test(value)) return value;
    // A literal quote is escaped by doubling it, per RFC 4180.
    return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Render `rows` as CSV with `header` as the first line.
 *
 * Every value is stringified as-is; `null`/`undefined` become the empty field,
 * which {@link parseCsv} returns as `''`. A caller that must distinguish "absent"
 * from "empty string" needs its own sentinel — the format cannot express both.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
    const lines: string[] = [header.map(encodeField).join(',')];
    for (const row of rows) {
        lines.push(row.map(v => encodeField(v === null || v === undefined ? '' : String(v))).join(','));
    }
    // Trailing newline so the file ends cleanly and diffs don't show a "\ No
    // newline at end of file" marker.
    return lines.join('\n') + '\n';
}

/**
 * Parse CSV into rows of raw strings, **excluding** the header line.
 *
 * Returns `null` when the text doesn't start with the expected header — a cheap
 * guard that a file is the one we think it is, and that its columns haven't been
 * reordered by a hand edit or an older release. Callers treat `null` as "discard
 * this cache", which costs a re-measure rather than risking misread columns.
 */
export function parseCsv(text: string, expectedHeader: readonly string[]): string[][] {
    const rows = parseRows(text);
    if (rows.length === 0) return [];

    const header = rows[0];
    if (header.length !== expectedHeader.length) return [];
    for (let i = 0; i < header.length; i++) {
        if (header[i] !== expectedHeader[i]) return [];
    }
    // A trailing newline yields one empty final row; drop rows that are entirely blank.
    return rows.slice(1).filter(r => r.length > 1 || r[0] !== '');
}

/**
 * Split CSV text into rows of fields, honouring quoted sections.
 *
 * A single character-wise scan rather than a line split, because a quoted field
 * may legitimately contain both commas and newlines — splitting on lines first
 * would tear such a row in half.
 */
function parseRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (quoted) {
            if (ch !== '"') { field += ch; continue; }
            // A doubled quote inside a quoted field is one literal quote.
            if (text[i + 1] === '"') { field += '"'; i++; continue; }
            quoted = false;
            continue;
        }

        if (ch === '"' && field === '') { quoted = true; continue; }
        if (ch === ',') { row.push(field); field = ''; continue; }
        if (ch === '\n' || ch === '\r') {
            // Treat CRLF as one break so a file written on Windows (or normalized
            // by git) parses identically to one written with bare newlines.
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }
        field += ch;
    }

    // Whatever is buffered when the text ends is a final, unterminated row.
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
