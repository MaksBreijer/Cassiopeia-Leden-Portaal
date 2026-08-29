const path = require("path");

const MAX_IMPORT_ROWS = 250;
const MAX_PDF_PAGES = 25;

const FIELD_ALIASES = {
  name: ["naam", "name", "volledigenaam", "lidnaam"],
  firstName: ["voornaam", "firstname", "first"],
  lastName: ["achternaam", "lastname", "surname", "familyname"],
  email: ["email", "emailadres", "mail", "mailadres"],
  yearLayer: ["lichting", "jaarlaag", "jaar", "dispuutsjaar", "cohort"],
  roleTitle: ["functie", "rol", "role", "titel"],
  memberStatus: ["status", "lidstatus", "memberstatus"],
  committee: ["commissie", "committee"],
  phone: ["telefoon", "telefoonnummer", "mobiel", "mobile", "phone"],
  address: ["adres", "woonadres", "address"],
  bio: ["bio", "biografie", "omschrijving", "notitie", "notes"]
};

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function aliasField(value) {
  const normalized = normalizeHeader(value);
  return Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || "";
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value.trim());
      value = "";
    } else if (char === "\n") {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (quoted) throw new Error("Het CSV-bestand bevat een niet-afgesloten aanhalingsteken.");
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim()));
}

function chooseDelimiter(text) {
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => {
      let rows;
      try {
        rows = parseDelimited(text, delimiter).slice(0, 12);
      } catch (error) {
        return { delimiter, score: -1 };
      }
      const widths = rows.map((row) => row.length).filter((width) => width > 1);
      const aliasCount = rows.slice(0, 5).reduce((total, row) => total + row.filter(aliasField).length, 0);
      const consistent = widths.length ? widths.filter((width) => width === widths[0]).length : 0;
      return { delimiter, score: aliasCount * 20 + consistent * 2 + Math.max(0, ...(widths || [0])) };
    })
    .sort((a, b) => b.score - a.score)[0].delimiter;
}

function normalizedStatus(value) {
  const status = normalizeHeader(value);
  return ["oud", "reunist", "alumnus", "alumni", "reunisten"].includes(status) ? "oud" : "actief";
}

function headerMapping(rows) {
  let best = null;
  rows.slice(0, 12).forEach((row, index) => {
    const fields = row.map(aliasField);
    const recognized = fields.filter(Boolean).length;
    const hasEmail = fields.includes("email");
    const hasName = fields.includes("name") || fields.includes("firstName") || fields.includes("lastName");
    const score = recognized * 5 + (hasEmail ? 3 : 0) + (hasName ? 3 : 0);
    if (!best || score > best.score) best = { index, fields, score, recognized, hasEmail, hasName };
  });
  if (!best || best.recognized < 2 || !best.hasEmail || !best.hasName) return null;
  return best;
}

function recordsFromRows(rows, defaultYear = "") {
  const mapping = headerMapping(rows);
  if (!mapping) return [];

  const records = rows.slice(mapping.index + 1).map((cells, offset) => {
    const values = {};
    mapping.fields.forEach((field, index) => {
      if (field && values[field] === undefined) values[field] = String(cells[index] || "").trim();
    });
    const name = values.name || [values.firstName, values.lastName].filter(Boolean).join(" ");
    return {
      sourceRow: mapping.index + offset + 2,
      name: name.trim(),
      email: String(values.email || "").trim().toLowerCase(),
      yearLayer: String(values.yearLayer || defaultYear || "").trim(),
      roleTitle: String(values.roleTitle || "").trim(),
      memberStatus: normalizedStatus(values.memberStatus),
      committee: String(values.committee || "").trim(),
      phone: String(values.phone || "").trim(),
      address: String(values.address || "").trim(),
      bio: String(values.bio || "").trim()
    };
  });
  return records.filter((record) => record.name || record.email || record.yearLayer);
}

function recordsFromUnstructuredPdf(rows, defaultYear = "") {
  const records = [];
  rows.forEach((cells, index) => {
    const line = cells.join(" ").replace(/\s+/g, " ").trim();
    const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!emailMatch) return;
    const email = emailMatch[0].toLowerCase();
    const beforeEmail = line.slice(0, emailMatch.index).replace(/^[\s|;,:-]+|[\s|;,:-]+$/g, "");
    const afterEmail = line.slice(emailMatch.index + emailMatch[0].length).trim();
    const yearMatch = afterEmail.match(/(?:^|[\s|;,:-])('?\d{2}|20\d{2})(?=$|[\s|;,:-])/);
    const yearLayer = yearMatch?.[1] || defaultYear;
    if (!beforeEmail || normalizeHeader(beforeEmail) === "naam") return;
    records.push({
      sourceRow: index + 1,
      name: beforeEmail,
      email,
      yearLayer: String(yearLayer || "").trim(),
      roleTitle: "",
      memberStatus: "actief",
      committee: "",
      phone: "",
      address: "",
      bio: ""
    });
  });
  return records;
}

function validateRecords(records) {
  if (records.length > MAX_IMPORT_ROWS) {
    throw new Error(`Importeer maximaal ${MAX_IMPORT_ROWS} leden per bestand.`);
  }
  const seen = new Set();
  return records.map((record) => {
    const errors = [];
    if (!record.name) errors.push("Naam ontbreekt");
    if (!record.email) errors.push("E-mailadres ontbreekt");
    else if (!/^\S+@\S+\.\S+$/.test(record.email)) errors.push("E-mailadres is ongeldig");
    if (!record.yearLayer) errors.push("Lichting ontbreekt");
    if (record.email && seen.has(record.email)) errors.push("Dubbel in dit bestand");
    if (record.email) seen.add(record.email);
    return { ...record, errors };
  });
}

function parseCsvText(text, defaultYear = "") {
  const cleaned = String(text || "").replace(/^sep=[;,\t]\s*\r?\n/i, "");
  const rows = parseDelimited(cleaned, chooseDelimiter(cleaned));
  const records = recordsFromRows(rows, defaultYear);
  if (!records.length) {
    throw new Error("Geen herkenbare leden gevonden. Gebruik kolommen voor naam, e-mail en lichting.");
  }
  return validateRecords(records);
}

function pdfItemsToRows(items) {
  const lines = [];
  items.forEach((item) => {
    const value = String(item.str || "").trim();
    if (!value) return;
    const x = Number(item.transform?.[4] || 0);
    const y = Number(item.transform?.[5] || 0);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ value, x, width: Number(item.width || 0) });
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const cells = [];
      line.items.sort((a, b) => a.x - b.x).forEach((item) => {
        const previous = cells[cells.length - 1];
        if (previous && item.x - previous.endX < 12) {
          previous.value = `${previous.value} ${item.value}`.trim();
          previous.endX = Math.max(previous.endX, item.x + item.width);
        } else {
          cells.push({ value: item.value, endX: item.x + item.width });
        }
      });
      return cells.map((cell) => cell.value);
    });
}

async function parsePdfBuffer(buffer, defaultYear = "") {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true
  });
  let document;
  try {
    document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`De PDF mag maximaal ${MAX_PDF_PAGES} pagina's bevatten.`);
    }
    const rows = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      rows.push(...pdfItemsToRows(content.items));
    }
    if (!rows.length) {
      throw new Error("Deze PDF bevat geen selecteerbare tekst. Gebruik een tekst-PDF of CSV-bestand.");
    }

    const singleCellText = rows.map((row) => row.join(" ")).join("\n");
    let records = [];
    if (/[;,\t]/.test(singleCellText.split("\n")[0] || "")) {
      try {
        records = parseCsvText(singleCellText, defaultYear);
      } catch (error) {
        records = [];
      }
    }
    if (!records.length) records = recordsFromRows(rows, defaultYear);
    if (!records.length) records = recordsFromUnstructuredPdf(rows, defaultYear);
    if (!records.length) {
      throw new Error("Geen herkenbare leden gevonden. De PDF moet per lid minimaal naam, e-mail en lichting bevatten.");
    }
    return validateRecords(records);
  } catch (error) {
    if (error?.name === "PasswordException") throw new Error("Verwijder het wachtwoord van de PDF en probeer opnieuw.");
    throw error;
  } finally {
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}

async function parseMemberImport({ buffer, fileName, defaultYear = "" }) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  if (extension === ".csv") return parseCsvText(buffer.toString("utf8"), defaultYear);
  if (extension === ".pdf") {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Dit bestand is geen geldige PDF.");
    return parsePdfBuffer(buffer, defaultYear);
  }
  throw new Error("Gebruik een CSV- of PDF-bestand.");
}

module.exports = {
  MAX_IMPORT_ROWS,
  parseCsvText,
  parseMemberImport,
  validateRecords
};
