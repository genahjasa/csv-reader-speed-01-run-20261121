// Fast drop-in for csv-reader 1.0.0.
//
// Same answers as the reference reader, produced a different way: instead of
// growing every field one character at a time, this parser remembers where a
// field starts and cuts it out with one slice when the field ends, so plain
// text is never copied character by character. Lines with no quotes and no
// stray carriage returns are split in one native call. Only the rare broken
// pieces (a doubled quote, a carriage return inside quotes, a stray CR, junk
// after a closing quote) are stitched together from segments.
//
// Semantics (matching csv-reader 1.0.0 exactly):
// - a U+FEFF at the very start is dropped; a record ends at LF or CRLF and a
//   line left with no characters is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field opening with a quote runs to the next quote that is not doubled
//   ("" inside it is one quote, each CRLF or lone CR inside it reads as LF);
//   what follows its closing quote up to the next comma or line break is
//   appended as it stands (quote_junk, when the field ends); a quote that
//   never closes is a literal character and the text after it is read again
//   as unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character; fields stay
//   strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds
//   the records after it, each padded with "" (short_row, with fields: its
//   field count) or cut (long_row, with extra: the cut fields) to the first
//   record's width;
// - each error is {code, line, row} in the order met: line the 1-based line
//   its record starts on (every LF, CRLF and lone CR inside quotes counted),
//   row its record's index in rows (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Dependency-free ES module.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of text. */
const END_COMMA = 0;
const END_BREAK = 1;
const END_TEXT = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const s = String(input.text);
  const header = input.header === true;
  const n = s.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // next character to read
  let line = 1; // line that character is on
  if (n > 0 && s.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows.
  let recLine = 1;
  let recRow = null;

  // Result of the field just read: its value and how it ended.
  let fVal = '';
  let fEnd = END_TEXT;

  // Reads an unquoted field starting at pos, with `init` already in front of
  // it ("" normally, '"' for a quote that never closed, or a quoted value
  // whose junk follows). Stops at a comma, a line break, or the end of text.
  // A CR not followed by LF is dropped and reported as stray_cr.
  function plainField(init) {
    let val = init;
    let start = pos;
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 44) {
        // Comma: the field ends here, the record goes on.
        fVal = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
        pos += 1;
        fEnd = END_COMMA;
        return;
      }
      if (c === 10) {
        fVal = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
        pos += 1;
        line += 1;
        fEnd = END_BREAK;
        return;
      }
      if (c === 13) {
        if (s.charCodeAt(pos + 1) === 10) {
          fVal = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
          pos += 2;
          line += 1;
          fEnd = END_BREAK;
          return;
        }
        // Lone CR outside quotes: dropped, reported, scanning continues.
        // Keep what came before it so the field still reads as one string.
        val = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }
    fVal = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
    fEnd = END_TEXT;
  }

  // Reads a quoted field whose opening quote is at pos.
  function quotedField() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let val = '';
    let start = pos;
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 34) {
        if (s.charCodeAt(pos + 1) === 34) {
          // Doubled quote inside: one literal quote, scanning continues.
          val = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
          val += '"';
          pos += 2;
          start = pos;
          continue;
        }
        // The closing quote.
        val = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
        pos += 1;
        if (pos >= n) {
          fVal = val;
          fEnd = END_TEXT;
          return;
        }
        const d = s.charCodeAt(pos);
        if (d === 44) {
          pos += 1;
          fVal = val;
          fEnd = END_COMMA;
          return;
        }
        if (d === 10) {
          pos += 1;
          line += 1;
          fVal = val;
          fEnd = END_BREAK;
          return;
        }
        if (d === 13 && s.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          fVal = val;
          fEnd = END_BREAK;
          return;
        }
        // Junk follows the closing quote: read it as unquoted, appended.
        plainField(val);
        if (fVal.length > val.length) {
          errors.push({ code: 'quote_junk', line: recLine, row: recRow });
        }
        return;
      }
      if (c === 13) {
        // CRLF and a lone CR inside quotes are each one LF.
        val = val === '' ? s.slice(start, pos) : val + s.slice(start, pos);
        val += '\n';
        line += 1;
        pos += s.charCodeAt(pos + 1) === 10 ? 2 : 1;
        start = pos;
        continue;
      }
      if (c === 10) line += 1;
      pos += 1;
    }
    // The quote never closes: it is a literal character, and the text after
    // it is read again as an unquoted field, line count rewound.
    pos = open + 1;
    line = openLine;
    errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
    plainField('"');
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && s.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    // Fast path: this record's line holds no quote and no stray CR, so it is
    // one record of plain fields separated by commas. A trailing CR here is
    // the CRLF line break itself, not a stray one. The quote and CR searches
    // stop at the first hit anywhere, which is always near (quotes are
    // frequent in these files), so no copy of the line is needed to test it.
    const le = s.indexOf('\n', pos);
    const lineEnd = le === -1 ? n : le;
    let segEnd = lineEnd;
    if (le !== -1 && segEnd > pos && s.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
    let fields = null;
    let lastQuoted = false;
    if (segEnd > pos) {
      const q = s.indexOf('"', pos);
      const r = s.indexOf('\r', pos);
      if ((q === -1 || q >= segEnd) && (r === -1 || r >= segEnd)) {
        fields = s.slice(pos, segEnd).split(',');
        pos = le === -1 ? n : le + 1;
        if (le !== -1) line += 1;
      }
    }

    if (fields === null) {
      fields = [];
      let ended;
      do {
        lastQuoted = s.charCodeAt(pos) === 34;
        if (lastQuoted) quotedField();
        else plainField('');
        fields.push(fVal);
        ended = fEnd;
      } while (ended === END_COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
