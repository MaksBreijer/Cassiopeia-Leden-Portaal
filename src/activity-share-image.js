const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const jpeg = require("jpeg-js");

const WIDTH = 1200;
const HEIGHT = 630;
const TEXT_CENTER_X = 812;
const TEXT_MAX_WIDTH = 540;
const TITLE_MAX_LINES = 3;
const TITLE_FONT_SIZES = [86, 76, 68, 60, 54, 48, 42, 38];
const FONT_FILES = [
  path.join(__dirname, "fonts", "PlayfairDisplay.ttf"),
  path.join(__dirname, "fonts", "Lato-Regular.ttf")
];
const BACKGROUND_PATH = path.join(__dirname, "..", "public", "assets", "cassiopeia-activity-share-blank.jpg");
const CACHE_LIMIT = 100;

let backgroundDataUri = "";
const imageCache = new Map();

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderSvg(svg, options = {}) {
  return new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Lato" },
    ...options
  });
}

function measureTitleWidth(text, fontSize) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400"><text x="10" y="300" font-family="Playfair Display" font-size="${fontSize}">${escapeXml(text)}</text></svg>`;
  const box = renderSvg(svg).getBBox();
  return box ? box.width : 0;
}

function breakLongWord(word, fontSize) {
  const parts = [];
  let current = "";
  for (const char of Array.from(word)) {
    if (current && measureTitleWidth(current + char, fontSize) > TEXT_MAX_WIDTH) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapTitle(title, fontSize) {
  const words = title.split(/\s+/).filter(Boolean)
    .flatMap((word) => (measureTitleWidth(word, fontSize) > TEXT_MAX_WIDTH ? breakLongWord(word, fontSize) : [word]));
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measureTitleWidth(candidate, fontSize) > TEXT_MAX_WIDTH) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function layoutTitle(title) {
  for (const fontSize of TITLE_FONT_SIZES) {
    const lines = wrapTitle(title, fontSize);
    if (lines.length <= TITLE_MAX_LINES) return { fontSize, lines };
  }
  const fontSize = TITLE_FONT_SIZES[TITLE_FONT_SIZES.length - 1];
  const lines = wrapTitle(title, fontSize).slice(0, TITLE_MAX_LINES);
  let last = lines[TITLE_MAX_LINES - 1];
  while (last.length > 1 && measureTitleWidth(`${last}…`, fontSize) > TEXT_MAX_WIDTH) last = last.slice(0, -1).trimEnd();
  lines[TITLE_MAX_LINES - 1] = `${last}…`;
  return { fontSize, lines };
}

function activityShareSvg(title) {
  if (!backgroundDataUri) backgroundDataUri = `data:image/jpeg;base64,${fs.readFileSync(BACKGROUND_PATH).toString("base64")}`;
  const cleanTitle = String(title || "").replace(/\s+/g, " ").trim() || "Activiteit";
  const { fontSize, lines } = layoutTitle(cleanTitle);
  const lineHeight = Math.round(fontSize * 1.14);
  const kickerHeight = 30;
  const gapAfterKicker = 34;
  const titleBlockHeight = lineHeight * (lines.length - 1) + fontSize * 0.78;
  const gapAfterTitle = 44;
  const footerHeight = 30;
  const totalHeight = kickerHeight + gapAfterKicker + titleBlockHeight + gapAfterTitle + 40 + footerHeight;
  const top = Math.round((HEIGHT - totalHeight) / 2);
  const kickerY = top + 22;
  const firstBaseline = top + kickerHeight + gapAfterKicker + fontSize * 0.78;
  const dividerY = Math.round(firstBaseline + lineHeight * (lines.length - 1) + gapAfterTitle);
  const footerY = dividerY + 64;
  const titleLines = lines
    .map((line, index) => `<text x="${TEXT_CENTER_X}" y="${Math.round(firstBaseline + index * lineHeight)}" text-anchor="middle" font-family="Playfair Display" font-size="${fontSize}" fill="#3a2a5e">${escapeXml(line)}</text>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <image x="0" y="0" width="${WIDTH}" height="${HEIGHT}" xlink:href="${backgroundDataUri}"/>
  <text x="${TEXT_CENTER_X}" y="${kickerY}" text-anchor="middle" font-family="Lato" font-size="22" letter-spacing="5" fill="#4b3a72">DAMESCHDISPUUT CASSIOPEIA</text>
  ${titleLines}
  <line x1="${TEXT_CENTER_X - 170}" y1="${dividerY}" x2="${TEXT_CENTER_X - 18}" y2="${dividerY}" stroke="#e2b766" stroke-width="1.5"/>
  <line x1="${TEXT_CENTER_X + 18}" y1="${dividerY}" x2="${TEXT_CENTER_X + 170}" y2="${dividerY}" stroke="#e2b766" stroke-width="1.5"/>
  <path d="M ${TEXT_CENTER_X} ${dividerY - 10} Q ${TEXT_CENTER_X + 1.5} ${dividerY - 1.5} ${TEXT_CENTER_X + 10} ${dividerY} Q ${TEXT_CENTER_X + 1.5} ${dividerY + 1.5} ${TEXT_CENTER_X} ${dividerY + 10} Q ${TEXT_CENTER_X - 1.5} ${dividerY + 1.5} ${TEXT_CENTER_X - 10} ${dividerY} Q ${TEXT_CENTER_X - 1.5} ${dividerY - 1.5} ${TEXT_CENTER_X} ${dividerY - 10} Z" fill="#e2b766"/>
  <text x="${TEXT_CENTER_X}" y="${footerY}" text-anchor="middle" font-family="Lato" font-size="30" fill="#3a2a5e">Schrijf je nu in!</text>
</svg>`;
}

function renderActivityShareImage(title, cacheKey = title) {
  const key = String(cacheKey);
  if (imageCache.has(key)) return imageCache.get(key);
  const rendered = renderSvg(activityShareSvg(title)).render();
  // WhatsApp slaat te grote previewafbeeldingen over, daarom JPEG in plaats van PNG.
  const image = jpeg.encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, 85).data;
  if (imageCache.size >= CACHE_LIMIT) imageCache.delete(imageCache.keys().next().value);
  imageCache.set(key, image);
  return image;
}

module.exports = { activityShareSvg, renderActivityShareImage };
