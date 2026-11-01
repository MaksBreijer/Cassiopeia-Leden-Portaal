// Het lustrumthema loopt tot en met de dies op 7 november 2026; vanaf 8 november 00:00 (Amsterdam) toont de app het gewone thema.
const LUSTRUM_END = Date.parse("2026-11-08T00:00:00+01:00");

function lustrumActive(now = new Date()) {
  return now.getTime() < LUSTRUM_END;
}

function applyTheme(html, now = new Date()) {
  if (lustrumActive(now)) return html;
  return html
    .replaceAll("Dameschdispuut Cassiopeia · Lustrum III", "Dameschdispuut Cassiopeia")
    .replace("activiteiten, jaarplanning, leden en lustrum.", "activiteiten, jaarplanning en leden.")
    .replace(/\s*<div class="login-word login-word-lustrum"[^>]*>[^<]*<\/div>/, "")
    .replace("Lustrum III · Ledenportaal", "Ledenportaal")
    .replace(/\s*<span class="lustrum-label">.*?<\/span>/, "")
    .replace('<p class="eyebrow">Lustrum III</p>', '<p class="eyebrow">Agenda</p>')
    .replace("<body>", '<body class="na-lustrum">');
}

module.exports = { lustrumActive, applyTheme, LUSTRUM_END };
