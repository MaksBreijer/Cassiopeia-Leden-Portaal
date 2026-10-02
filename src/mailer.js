const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const isProduction = process.env.NODE_ENV === "production";
const outboxDir = !isProduction ? String(process.env.MAIL_OUTBOX_DIR || "").trim() : "";
const baseUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
const fromAddress = String(process.env.MAIL_FROM || "").trim();

function createTransport() {
  if (outboxDir) return nodemailer.createTransport({ jsonTransport: true });
  const host = String(process.env.SMTP_HOST || "").trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined
  });
}

const transport = createTransport();

// Zonder vaste basis-URL sturen we geen links: de Host-header van een verzoek is niet te vertrouwen.
function isMailConfigured() {
  return Boolean(transport && fromAddress && /^https?:\/\//.test(baseUrl));
}

function formatDutchDate(isoDate) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam"
  }).format(new Date(isoDate));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function onboardingMessage({ name, email, invitePath, expiresAt }) {
  const firstName = String(name || "").trim().split(/\s+/)[0] || "lid";
  const inviteUrl = `${baseUrl}${invitePath}`;
  const validUntil = formatDutchDate(expiresAt);
  const text = [
    `Hoi ${firstName},`,
    "",
    "Welkom in het ledenportaal van Cassiopeia! Er staat een account voor je klaar.",
    "",
    "1. Open je persoonlijke link en kies zelf een wachtwoord van minimaal 12 tekens:",
    inviteUrl,
    "",
    "2. Vul daarna onder Profiel je gegevens aan, zoals je adres, verjaardag en een foto.",
    "",
    `De link werkt één keer en is geldig tot ${validUntil}. Is hij verlopen? Vraag het bestuur dan om een nieuwe.`,
    "",
    "Deel deze link met niemand: hij geeft toegang tot jouw account.",
    "",
    "Liefs,",
    "Dispuut Cassiopeia"
  ].join("\n");
  const html = `
    <p>Hoi ${escapeHtml(firstName)},</p>
    <p>Welkom in het ledenportaal van Cassiopeia! Er staat een account voor je klaar.</p>
    <ol>
      <li>Open je persoonlijke link en kies zelf een wachtwoord van minimaal 12 tekens.</li>
      <li>Vul daarna onder <strong>Profiel</strong> je gegevens aan, zoals je adres, verjaardag en een foto.</li>
    </ol>
    <p><a href="${escapeHtml(inviteUrl)}">Account activeren</a></p>
    <p>De link werkt één keer en is geldig tot ${escapeHtml(validUntil)}. Is hij verlopen? Vraag het bestuur dan om een nieuwe.</p>
    <p>Deel deze link met niemand: hij geeft toegang tot jouw account.</p>
    <p>Liefs,<br />Dispuut Cassiopeia</p>
  `;
  return { from: fromAddress, to: email, subject: "Welkom bij het ledenportaal van Cassiopeia", text, html };
}

async function sendOnboardingMail(details) {
  if (!isMailConfigured()) throw new Error("Er is geen maildienst ingesteld.");
  const info = await transport.sendMail(onboardingMessage(details));
  if (outboxDir) {
    fs.mkdirSync(outboxDir, { recursive: true });
    fs.writeFileSync(path.join(outboxDir, `${Date.now()}-${details.email}.json`), info.message);
  }
  return info;
}

module.exports = {
  isMailConfigured,
  sendOnboardingMail
};
