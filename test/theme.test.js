const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { applyTheme } = require("../src/theme");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("lustrumthema blijft staan tot en met 6 november", () => {
  assert.equal(applyTheme(html, new Date("2026-11-06T22:59:00Z")), html); // 23:59 in Amsterdam
});

test("vanaf 7 november verdwijnt het lustrumthema en wordt het patroon lila", () => {
  const themed = applyTheme(html, new Date("2026-11-06T23:00:00Z")); // 00:00 in Amsterdam
  assert.doesNotMatch(themed, /Lustrum III|LUSTRUM|lustrum-label|lustrum\./);
  assert.match(themed, /<body class="na-lustrum">/);
  assert.match(themed, /<p class="eyebrow">Agenda<\/p>/);
});
