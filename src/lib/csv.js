// WHAT THIS FILE DOES
// Reads CSV text (a spreadsheet saved as "comma-separated values") into a
// list of rows. The first line is the column names; every other line
// becomes an object like { name: "Odesa", wrb: "0.95" }. Values stay as
// text here; the file that asked for the CSV decides which are numbers.
//
// It understands quoted values, so a cell like "Kyiv, city" with a comma
// inside quotes stays one cell, and "" inside quotes means one ".
//
// WHO EDITS IT
// Nobody, normally.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  // Remove a byte-order mark that Excel sometimes adds at the very start.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  // Skip empty lines, then pair each value with its column name.
  const nonEmpty = rows.filter((line) => line.some((value) => value.trim() !== ""));
  if (nonEmpty.length === 0) return { columns: [], rows: [] };
  const columns = nonEmpty[0].map((name) => name.trim());
  const records = nonEmpty.slice(1).map((line) =>
    Object.fromEntries(columns.map((column, index) => [column, (line[index] ?? "").trim()]))
  );
  return { columns, rows: records };
}

// Turns a list of objects back into CSV text, for downloads.
export function toCsv(records, columns = Object.keys(records[0] || {})) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(","), ...records.map((record) => columns.map((column) => escape(record[column])).join(","))].join("\n") + "\n";
}
