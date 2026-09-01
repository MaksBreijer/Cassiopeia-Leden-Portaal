const crypto = require("crypto");

const DUTCH_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december"
];

function escapeIcsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function unescapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\[nN]/g, "\n")
    .replace(/\\([\\;,])/g, "$1");
}

function foldIcsLine(line) {
  const chunks = [];
  let chunk = "";
  let limit = 75;
  for (const character of String(line)) {
    if (Buffer.byteLength(chunk + character, "utf8") > limit && chunk) {
      chunks.push(chunk);
      chunk = character;
      limit = 74;
    } else {
      chunk += character;
    }
  }
  chunks.push(chunk);
  return chunks.join("\r\n ");
}

function formatDate(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("");
}

function formatTimestamp(value) {
  const normalized = String(value || "").includes("T")
    ? String(value)
    : `${String(value || "").replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "19700101T000000Z";
  return `${formatDate(date)}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

function parseLocalYearAgendaDate(item) {
  const monthMatch = String(item.month_label || item.monthLabel || "").toLocaleLowerCase("nl").match(
    new RegExp(`(${DUTCH_MONTHS.join("|")})\\s+(\\d{4})`)
  );
  const dayMatch = String(item.day_label || item.dayLabel || "").trim().match(/^(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?$/);
  if (!monthMatch || !dayMatch) return null;

  const month = DUTCH_MONTHS.indexOf(monthMatch[1]);
  const year = Number(monthMatch[2]);
  const startDay = Number(dayMatch[1]);
  const endDay = Number(dayMatch[2] || dayMatch[1]);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (startDay < 1 || endDay < startDay || endDay > lastDay) return null;

  return {
    start: new Date(Date.UTC(year, month, startDay)),
    end: new Date(Date.UTC(year, month, endDay + 1))
  };
}

function createCalendarFeed(items, { calendarName = "Cassiopeia Jaarplanning", sourceUrl = "https://www.dispuutcassiopeia.nl/#home" } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dameschdispuut Cassiopeia//Jaarplanning//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H"
  ];

  for (const item of items) {
    const dates = parseLocalYearAgendaDate(item);
    if (!dates) continue;
    const updatedAt = item.updated_at || item.updatedAt || item.created_at || item.createdAt;
    lines.push(
      "BEGIN:VEVENT",
      `UID:year-agenda-${item.id}@dispuutcassiopeia.nl`,
      `DTSTAMP:${formatTimestamp(updatedAt)}`,
      `LAST-MODIFIED:${formatTimestamp(updatedAt)}`,
      `DTSTART;VALUE=DATE:${formatDate(dates.start)}`,
      `DTEND;VALUE=DATE:${formatDate(dates.end)}`,
      `SUMMARY:${escapeIcsText(item.title)}`,
      `DESCRIPTION:${escapeIcsText("Uit de jaarplanning van Dameschdispuut Cassiopeia.")}`,
      `URL:${sourceUrl}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function parseIcsDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)));
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseGoogleCalendarFeed(feed) {
  const unfolded = String(feed || "").replace(/\r?\n[ \t]/g, "");
  const events = [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)].map((match) => {
    const fields = {};
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const key = line.slice(0, separator).split(";", 1)[0].toUpperCase();
      if (!fields[key]) fields[key] = line.slice(separator + 1);
    }
    const start = parseIcsDate(fields.DTSTART);
    if (!start || !fields.SUMMARY) return null;
    const end = parseIcsDate(fields.DTEND);
    const isAllDay = /^\d{8}$/.test(fields.DTSTART || "");
    let dayLabel = String(start.getUTCDate());
    if (isAllDay && end) {
      const inclusiveEnd = new Date(end.getTime() - 86400000);
      if (inclusiveEnd > start && inclusiveEnd.getUTCMonth() === start.getUTCMonth()) {
        dayLabel += `-${inclusiveEnd.getUTCDate()}`;
      }
    }
    const monthName = DUTCH_MONTHS[start.getUTCMonth()];
    return {
      id: `google-${crypto.createHash("sha256").update(`${fields.UID || ""}:${fields.DTSTART}`).digest("hex").slice(0, 20)}`,
      monthLabel: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${start.getUTCFullYear()}`,
      monthIndex: start.getUTCFullYear() * 12 + start.getUTCMonth(),
      dayLabel,
      title: unescapeIcsText(fields.SUMMARY),
      sortOrder: start.getUTCDate() * 1440 + start.getUTCHours() * 60 + start.getUTCMinutes(),
      startsAt: start.toISOString()
    };
  }).filter(Boolean);
  return events.sort((a, b) => a.monthIndex - b.monthIndex || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "nl"));
}

function googleCalendarLinkFromIcsUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/calendar\/ical\/([^/]+)\//);
    if (!match) return "https://calendar.google.com/calendar/";
    return `https://calendar.google.com/calendar/u/0?cid=${encodeURIComponent(decodeURIComponent(match[1]))}`;
  } catch (error) {
    return "https://calendar.google.com/calendar/";
  }
}

function visibleCalendarItems(items, now = new Date()) {
  const reference = Number.isFinite(now?.getTime?.()) ? now : new Date();
  const start = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1);
  const end = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 13, 1);
  return (items || []).filter((item) => {
    const timestamp = new Date(item.startsAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
  });
}

module.exports = {
  createCalendarFeed,
  escapeIcsText,
  googleCalendarLinkFromIcsUrl,
  parseGoogleCalendarFeed,
  parseLocalYearAgendaDate,
  visibleCalendarItems
};
