const state = {
  user: null,
  members: [],
  mapMembers: [],
  activities: [],
  documents: [],
  confessions: [],
  siteAssets: {},
  yearAgendaItems: [],
  yearAgendaSummaryText: "",
  yearAgendaUsesLocalData: false,
  activeYearAgendaMonthIndex: null,
  memberStatusFilter: "",
  openMemberId: null,
  activationToken: "",
  importRecords: [],
  bulkInvitations: [],
  selectedMemberIds: new Set()
};

const API_BASE = location.protocol === "file:" || location.port === "5500" ? "http://127.0.0.1:3000" : "";

const DEFAULT_YEAR_AGENDA_ITEMS = [
  ["Oktober 2025", 1, "2", "DispuBo"],
  ["Oktober 2025", 1, "3-5", "Dispuutsweekend"],
  ["Oktober 2025", 1, "15", "Rendez-vous"],
  ["Oktober 2025", 1, "18", "Inauguratie 2.0"],
  ["Oktober 2025", 1, "31", "Kaas-wijn proeverij"],
  ["November 2025", 2, "6", "DispuBo (o.a. door EscalaCie)"],
  ["November 2025", 2, "8", "Opening lustrum"],
  ["November 2025", 2, "9", "DIS ALV"],
  ["November 2025", 2, "28", "VrijMiBo"],
  ["December 2025", 3, "4", "DispuBo"],
  ["December 2025", 3, "13", "Lustrum activiteit"],
  ["December 2025", 3, "31", "Nieuwjaarsdiner i.p.v. VrijMiBo"],
  ["Januari 2026", 4, "8", "DispuBo"],
  ["Januari 2026", 4, "10", "Lustrum activiteit"],
  ["Januari 2026", 4, "16", "Rendez-vous"],
  ["Januari 2026", 4, "24", "VrijMiBo"],
  ["Februari 2026", 5, "5", "DispuBo"],
  ["Februari 2026", 5, "15", "Rendez-vous"],
  ["Februari 2026", 5, "27", "VrijMiBo"],
  ["Maart 2026", 6, "5", "DispuBo"],
  ["Maart 2026", 6, "15", "Rendez-vous"],
  ["Maart 2026", 6, "27", "VrijMiBo"],
  ["April 2026", 7, "2", "DispuBo"],
  ["April 2026", 7, "9", "Borrel met RemeX"],
  ["April 2026", 7, "4", "Lustrum activiteit"],
  ["April 2026", 7, "15", "Rendez-vous"],
  ["April 2026", 7, "26", "KoNaBo i.p.v. VrijMiBo"],
  ["Mei 2026", 8, "7", "DispuBo"],
  ["Mei 2026", 8, "13", "Kennismakingsborrel"],
  ["Mei 2026", 8, "23-24", "Lustrumactiviteit"],
  ["Mei 2026", 8, "29", "VrijMiBo"],
  ["Juni 2026", 9, "4", "DispuBo"],
  ["Juni 2026", 9, "6-7", "HOCT en cantus"],
  ["Juni 2026", 9, "26", "VrijMiBo"],
  ["Juli 2026", 10, "2", "DispuBo"],
  ["Juli 2026", 10, "11", "Zomer ALV + Kennismakingsborrel"],
  ["Juli 2026", 10, "30", "LustrumCassiopeia! (t/m 6 augustus)"],
  ["Augustus 2026", 11, "24", "Eten Kennismakingsweek"],
  ["Augustus 2026", 11, "27", "Adviesnia + pullen vullen"],
  ["Augustus 2026", 11, "31", "Start feutenperiode"],
  ["September 2026", 12, "?", "DispuBo"],
  ["September 2026", 12, "18", "Avond met RemeX"],
  ["September 2026", 12, "25", "VrijMiBo"],
  ["September 2026", 12, "?", "Elke donderdag feutenmoment"],
  ["September 2026", 12, "?", "Zandvoort"],
  ["September 2026", 12, "?", "Groningen"],
  ["Oktober 2026", 13, "2", "DispuBo"],
  ["Oktober 2026", 13, "2-4", "Dispuutsweekend"],
  ["Oktober 2026", 13, "24-25", "Lustrumgala met RemeX"]
].map(([monthLabel, monthIndex, dayLabel, title], index) => ({
  id: `default-${index + 1}`,
  monthLabel,
  monthIndex,
  dayLabel,
  title,
  sortOrder: index + 1,
  isDefault: true
}));

function localYearAgendaItems() {
  const savedItems = localStorage.getItem("cassiopeiaYearAgendaItems");
  if (!savedItems) return DEFAULT_YEAR_AGENDA_ITEMS;
  try {
    const parsedItems = JSON.parse(savedItems);
    return Array.isArray(parsedItems) && parsedItems.length ? parsedItems : DEFAULT_YEAR_AGENDA_ITEMS;
  } catch (error) {
    return DEFAULT_YEAR_AGENDA_ITEMS;
  }
}

function saveLocalYearAgendaItems(items) {
  localStorage.setItem("cassiopeiaYearAgendaItems", JSON.stringify(items));
}

function localYearAgendaSummary() {
  return localStorage.getItem("cassiopeiaYearAgendaSummary") || "";
}

function saveLocalYearAgendaSummary(summary) {
  localStorage.setItem("cassiopeiaYearAgendaSummary", summary);
}

const els = {
  siteHeader: document.querySelector(".site-header"),
  appMain: document.querySelector("main"),
  menuToggle: document.querySelector("#menuToggle"),
  logoutBtn: document.querySelector("#logoutBtn"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError"),
  activationForm: document.querySelector("#activationForm"),
  activationTitle: document.querySelector("#activationTitle"),
  activationIntro: document.querySelector("#activationIntro"),
  activationError: document.querySelector("#activationError"),
  memberSearch: document.querySelector("#memberSearch"),
  memberYearFilter: document.querySelector("#memberYearFilter"),
  clearMemberFilters: document.querySelector("#clearMemberFilters"),
  memberResultCount: document.querySelector("#memberResultCount"),
  loggedOutMembers: document.querySelector("#loggedOutMembers"),
  memberGrid: document.querySelector("#memberGrid"),
  memberDetail: document.querySelector("#memberDetail"),
  adminAccountList: document.querySelector("#adminAccountList"),
  yearAgendaSummary: document.querySelector("#yearAgendaSummary"),
  yearAgendaPrev: document.querySelector("#yearAgendaPrev"),
  yearAgendaNext: document.querySelector("#yearAgendaNext"),
  yearAgendaMonthSelect: document.querySelector("#yearAgendaMonthSelect"),
  yearAgendaGrid: document.querySelector("#yearAgendaGrid"),
  publicActivityList: document.querySelector("#publicActivityList"),
  documentList: document.querySelector("#documentList"),
  confessionList: document.querySelector("#confessionList"),
  confessionForm: document.querySelector("#confessionForm"),
  confessionBody: document.querySelector("#confessionBody"),
  documentUploadForm: document.querySelector("#documentUploadForm"),
  siteImagesForm: document.querySelector("#siteImagesForm"),
  profileForm: document.querySelector("#profileForm"),
  profileAvatar: document.querySelector("#profileAvatar"),
  headerProfileAvatar: document.querySelector("#headerProfileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileEmail: document.querySelector("#profileEmail"),
  headerUserName: document.querySelector("#headerUserName"),
  welcomeName: document.querySelector("#welcomeName"),
  overviewMemberCount: document.querySelector("#overviewMemberCount"),
  overviewActivityCount: document.querySelector("#overviewActivityCount"),
  overviewAgendaCount: document.querySelector("#overviewAgendaCount"),
  overviewNextActivity: document.querySelector("#overviewNextActivity"),
  overviewNextDate: document.querySelector("#overviewNextDate"),
  cribMap: document.querySelector("#cribMap"),
  mapMemberCount: document.querySelector("#mapMemberCount"),
  mapUnmapped: document.querySelector("#mapUnmapped"),
  newMemberBtn: document.querySelector("#newMemberBtn"),
  newYearAgendaItemBtn: document.querySelector("#newYearAgendaItemBtn"),
  newActivityBtn: document.querySelector("#newActivityBtn"),
  memberDialog: document.querySelector("#memberDialog"),
  memberForm: document.querySelector("#memberForm"),
  memberDialogTitle: document.querySelector("#memberDialogTitle"),
  yearAgendaDialog: document.querySelector("#yearAgendaDialog"),
  yearAgendaForm: document.querySelector("#yearAgendaForm"),
  yearAgendaDialogTitle: document.querySelector("#yearAgendaDialogTitle"),
  yearAgendaSummaryDialog: document.querySelector("#yearAgendaSummaryDialog"),
  yearAgendaSummaryForm: document.querySelector("#yearAgendaSummaryForm"),
  activityDialog: document.querySelector("#activityDialog"),
  activityForm: document.querySelector("#activityForm"),
  activityDialogTitle: document.querySelector("#activityDialogTitle"),
  registrationsDialog: document.querySelector("#registrationsDialog"),
  registrationsList: document.querySelector("#registrationsList"),
  invitationDialog: document.querySelector("#invitationDialog"),
  invitationDialogTitle: document.querySelector("#invitationDialogTitle"),
  invitationDialogText: document.querySelector("#invitationDialogText"),
  invitationUrl: document.querySelector("#invitationUrl"),
  copyInvitationBtn: document.querySelector("#copyInvitationBtn"),
  adminSearch: document.querySelector("#adminSearch"),
  adminActiveCount: document.querySelector("#adminActiveCount"),
  adminPendingCount: document.querySelector("#adminPendingCount"),
  adminDisabledCount: document.querySelector("#adminDisabledCount"),
  memberImportDialog: document.querySelector("#memberImportDialog"),
  memberImportForm: document.querySelector("#memberImportForm"),
  memberImportFile: document.querySelector("#memberImportFile"),
  memberImportPreview: document.querySelector("#memberImportPreview"),
  memberImportRows: document.querySelector("#memberImportRows"),
  memberImportHint: document.querySelector("#memberImportHint"),
  memberImportError: document.querySelector("#memberImportError"),
  importReadyCount: document.querySelector("#importReadyCount"),
  importDuplicateCount: document.querySelector("#importDuplicateCount"),
  importInvalidCount: document.querySelector("#importInvalidCount"),
  previewMemberImport: document.querySelector("#previewMemberImport"),
  confirmMemberImport: document.querySelector("#confirmMemberImport"),
  downloadImportTemplate: document.querySelector("#downloadImportTemplate"),
  bulkInvitationDialog: document.querySelector("#bulkInvitationDialog"),
  bulkInvitationIntro: document.querySelector("#bulkInvitationIntro"),
  bulkInvitationList: document.querySelector("#bulkInvitationList"),
  downloadBulkInvitations: document.querySelector("#downloadBulkInvitations"),
  copyBulkInvitations: document.querySelector("#copyBulkInvitations"),
  adminSelectAll: document.querySelector("#adminSelectAll"),
  adminSelectionCount: document.querySelector("#adminSelectionCount"),
  bulkDeleteMembers: document.querySelector("#bulkDeleteMembers"),
  bulkDeleteDialog: document.querySelector("#bulkDeleteDialog"),
  bulkDeleteIntro: document.querySelector("#bulkDeleteIntro"),
  bulkDeleteForm: document.querySelector("#bulkDeleteForm"),
  toast: document.querySelector("#toast")
};

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...options
    });
  } catch (error) {
    throw new Error("Login werkt alleen via de lokale server. Start npm start in de map Cassio website en open daarna http://127.0.0.1:3000.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Er ging iets mis.");
  return data;
}

function formJson(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll("input[type='checkbox']").forEach((input) => {
    data[input.name] = input.checked;
  });
  return data;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatLichting(value) {
  const year = String(value || "").trim();
  if (!year) return "Lichting onbekend";

  const match = year.match(/\d+/);
  if (!match) return `Lichting '${year}`;

  return `Lichting '${match[0].slice(-2)}`;
}

function sharedActivityId() {
  const id = new URLSearchParams(window.location.search).get("activity");
  return id && /^\d+$/.test(id) ? id : "";
}

function activityShareUrl(activityId) {
  const url = new URL(window.location.href);
  url.searchParams.set("activity", activityId);
  url.hash = "home";
  return url.toString();
}

function focusSharedActivity() {
  const id = sharedActivityId();
  if (!id) return false;
  const card = document.querySelector(`[data-activity-card="${id}"]`);
  if (!card) return false;
  card.classList.add("activity-card-highlight");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.classList.remove("activity-card-highlight"), 2600);
  return true;
}

function avatarHtml(user) {
  const avatar = user.avatar || user.name?.charAt(0).toUpperCase() || "C";
  if (/^(data:image\/|https?:\/\/)/i.test(avatar)) {
    return `<img src="${escapeHtml(avatar)}" alt="" />`;
  }
  return escapeHtml(avatar);
}

function renderActivityParticipants(activity) {
  const participants = activity.participants || [];
  if (!participants.length) {
    return '<div class="activity-participants empty">Nog niemand ingeschreven</div>';
  }
  const preview = participants.slice(0, 8);
  const extra = participants.length - preview.length;
  return `
    <div class="activity-participants" aria-label="Wie gaan er mee">
      <span class="participants-label">Gaan mee</span>
      <div class="participant-avatars">
        ${preview
          .map(
            (member) => `
              <span class="participant-avatar avatar" title="${escapeHtml(member.name)}">
                ${avatarHtml(member)}
              </span>
            `
          )
          .join("")}
        ${extra > 0 ? `<span class="participant-more">+${extra}</span>` : ""}
      </div>
    </div>
  `;
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows, delimiter = ",") {
  const csv = rows.map((row) => row.map(csvValue).join(delimiter)).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(filename, headers, rows) {
  const tableRows = rows.map((row) => `<tr>${row.map((value) => `<td class="${String(value) === "TE LAAT" ? "late" : ""}">${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  const html = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}.late{color:#a93544;font-weight:700}</style></head><body><table><thead><tr>${headers.map((value) => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "").split(",")[1] || ""));
    reader.addEventListener("error", () => reject(new Error("Het bestand kon niet worden gelezen.")));
    reader.readAsDataURL(file);
  });
}

function resetMemberImportPreview() {
  state.importRecords = [];
  els.memberImportPreview.classList.add("hidden");
  els.confirmMemberImport.classList.add("hidden");
  els.memberImportRows.innerHTML = "";
  els.memberImportError.textContent = "";
}

function openMemberImportDialog() {
  els.memberImportForm.reset();
  resetMemberImportPreview();
  els.previewMemberImport.disabled = false;
  els.previewMemberImport.textContent = "Bestand controleren";
  els.memberImportDialog.showModal();
}

function importRecordStatus(record) {
  if (record.errors?.length) return { label: record.errors.join(", "), className: "row-invalid" };
  if (record.duplicate) return { label: "Bestaat al", className: "row-duplicate" };
  return { label: "Gereed", className: "" };
}

function renderMemberImportPreview(data) {
  state.importRecords = data.records;
  els.importReadyCount.textContent = String(data.summary.ready);
  els.importDuplicateCount.textContent = String(data.summary.duplicates);
  els.importInvalidCount.textContent = String(data.summary.invalid);
  els.memberImportRows.innerHTML = data.records
    .map((record) => {
      const status = importRecordStatus(record);
      return `
        <tr class="${status.className}">
          <td>${record.sourceRow || "—"}</td>
          <td>${escapeHtml(record.name || "—")}</td>
          <td>${escapeHtml(record.email || "—")}</td>
          <td>${escapeHtml(record.yearLayer || "—")}</td>
          <td><span class="import-row-status" title="${escapeHtml(status.label)}">${escapeHtml(status.label)}</span></td>
        </tr>
      `;
    })
    .join("");
  const skipped = data.summary.duplicates + data.summary.invalid;
  const readyLabel = `${data.summary.ready} ${data.summary.ready === 1 ? "lid staat" : "leden staan"}`;
  els.memberImportHint.textContent = skipped
    ? `${readyLabel} klaar. ${skipped} ${skipped === 1 ? "rij wordt" : "rijen worden"} overgeslagen.`
    : `${readyLabel} klaar om te importeren.`;
  els.memberImportPreview.classList.remove("hidden");
  els.confirmMemberImport.textContent = `${data.summary.ready} ${data.summary.ready === 1 ? "lid" : "leden"} importeren`;
  els.confirmMemberImport.disabled = data.summary.ready === 0;
  els.confirmMemberImport.classList.remove("hidden");
}

function bulkInvitationRows() {
  return state.bulkInvitations.map(({ member, invitation }) => [
    member.name,
    member.email,
    new URL(invitation.invitePath, window.location.origin).toString(),
    invitation.expiresAt
  ]);
}

function openBulkInvitationDialog(created) {
  state.bulkInvitations = created;
  els.bulkInvitationIntro.textContent = `${created.length} ${created.length === 1 ? "lid is" : "leden zijn"} toegevoegd met een openstaande uitnodiging.`;
  els.bulkInvitationList.innerHTML = created
    .map(({ member, invitation }) => {
      const invitationUrl = new URL(invitation.invitePath, window.location.origin).toString();
      return `
        <div class="bulk-invitation-row">
          <div><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.email)}</span></div>
          <code title="${escapeHtml(invitationUrl)}">${escapeHtml(invitationUrl)}</code>
        </div>
      `;
    })
    .join("");
  els.bulkInvitationDialog.showModal();
}

function renderProfile() {
  if (!state.user) return;
  els.profileAvatar.innerHTML = avatarHtml(state.user);
  els.headerProfileAvatar.innerHTML = avatarHtml(state.user);
  els.profileName.textContent = state.user.name;
  els.profileEmail.textContent = state.user.email;
  if (els.headerUserName) els.headerUserName.textContent = state.user.name.split(/\s+/)[0] || "Profiel";
  if (els.welcomeName) els.welcomeName.textContent = state.user.name.split(/\s+/)[0] || "Cassiopeia";
  els.profileForm.elements.address.value = state.user.address || "";
}

function renderPortalOverview() {
  const activeMembers = state.members.filter((member) => member.accountStatus === "active");
  const now = Date.now();
  const upcomingActivities = state.activities
    .filter((activity) => new Date(activity.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const nextActivity = upcomingActivities[0];

  if (els.overviewMemberCount) {
    els.overviewMemberCount.textContent = `${activeMembers.length} ${activeMembers.length === 1 ? "lid" : "leden"}`;
  }
  if (els.overviewActivityCount) els.overviewActivityCount.textContent = String(upcomingActivities.length || state.activities.length);
  if (els.overviewAgendaCount) els.overviewAgendaCount.textContent = String(state.yearAgendaItems.length);
  if (els.overviewNextActivity) els.overviewNextActivity.textContent = nextActivity?.title || "Nog niets gepland";
  if (els.overviewNextDate) els.overviewNextDate.textContent = nextActivity ? formatDate(nextActivity.startsAt) : "De agenda is nog leeg";
}

function closeMobileMenu() {
  els.siteHeader.classList.remove("menu-open");
  els.menuToggle.setAttribute("aria-expanded", "false");
}

function showPage(page = location.hash.slice(1) || "home") {
  const allowedPages = ["home", "leden", "plattegrond", "profiel", "documenten", "biechten", ...(state.user?.isAdmin ? ["beheer"] : [])];
  const activePage = allowedPages.includes(page) ? page : "home";
  document.querySelectorAll(".page-view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== activePage);
  });
  document.querySelectorAll(".site-nav a[href^='#']").forEach((link) => {
    if (link.getAttribute("href") === `#${activePage}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMobileMenu();
  if (activePage !== "leden") closeMemberDetail();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setLoggedIn(user) {
  state.user = user;
  document.body.classList.add("is-authenticated");
  els.loginScreen.classList.add("hidden");
  els.siteHeader.classList.remove("hidden");
  els.appMain.classList.remove("hidden");
  els.logoutBtn.classList.remove("hidden");
  els.loggedOutMembers.classList.add("hidden");
  els.memberGrid.classList.remove("hidden");
  renderProfile();
  showPage();
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !user.isAdmin));
}

function setLoggedOut() {
  state.user = null;
  document.body.classList.remove("is-authenticated");
  state.members = [];
  state.mapMembers = [];
  state.activities = [];
  state.documents = [];
  state.confessions = [];
  state.siteAssets = {};
  state.yearAgendaItems = [];
  state.openMemberId = null;
  state.selectedMemberIds.clear();
  els.loginScreen.classList.remove("hidden");
  els.loginForm.classList.toggle("hidden", Boolean(state.activationToken));
  els.activationForm.classList.toggle("hidden", !state.activationToken);
  els.siteHeader.classList.add("hidden");
  els.appMain.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  els.loggedOutMembers.classList.add("hidden");
  els.memberGrid.classList.remove("hidden");
  els.memberDetail.classList.add("hidden");
  closeMobileMenu();
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.add("hidden"));
  renderYearAgenda();
  renderPublicActivities();
  renderMembers();
  renderCribMap();
  renderAdminAccounts();
}

async function refreshPortal() {
  await Promise.all([loadMembers(), loadMapMembers(), loadActivities(), loadYearAgenda(), loadDocuments(), loadConfessions(), loadSiteAssets()]);
  focusSharedActivity();
}

async function loadMembers() {
  const query = encodeURIComponent(els.memberSearch.value || "");
  const data = await api(`/api/members?q=${query}`);
  state.members = data.members;
  renderMemberFilters();
  renderMembers();
  renderCribMap();
  renderAdminAccounts();
  renderPortalOverview();
}

async function loadMapMembers() {
  try {
    const data = await api("/api/map-members");
    state.mapMembers = data.members || [];
  } catch (error) {
    // Keep the rest of the portal usable while an older server is being deployed.
    state.mapMembers = [];
  }
  renderCribMap();
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
}

function setFilterOptions(select, values, emptyLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${emptyLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatLichting(value))}</option>`).join("")}`;
  select.value = values.includes(current) ? current : "";
}

function renderMemberFilters() {
  setFilterOptions(els.memberYearFilter, uniqueSorted(state.members.filter((member) => member.accountStatus === "active").map((member) => member.yearLayer)).reverse(), "Alle lichtingen");
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.statusFilter === state.memberStatusFilter);
  });
}

function filteredMembers() {
  const status = state.memberStatusFilter;
  const year = els.memberYearFilter.value;
  return state.members.filter((member) => {
    if (member.accountStatus !== "active") return false;
    if (status && member.memberStatus !== status) return false;
    if (year && member.yearLayer !== year) return false;
    return true;
  });
}

function renderMembers() {
  const members = filteredMembers();
  els.memberResultCount.textContent = `${members.length} ${members.length === 1 ? "lid" : "leden"}`;
  if (state.openMemberId && !members.some((member) => String(member.id) === state.openMemberId)) {
    closeMemberDetail();
  }
  if (!members.length) {
    els.memberGrid.innerHTML = `<article class="locked-panel"><h3>Geen leden gevonden</h3><p>Pas je filters aan om meer leden te zien.</p></article>`;
    return;
  }
  els.memberGrid.innerHTML = members
    .map(
      (member) => `
        <article class="member-card">
          <button class="member-card-main" data-member-id="${member.id}">
            <div class="avatar">${avatarHtml(member)}</div>
            <div class="member-card-copy">
              <h3>${escapeHtml(member.name)}</h3>
              <p class="meta">${escapeHtml(formatLichting(member.yearLayer))} · ${escapeHtml(member.roleTitle || "Actief")}</p>
              ${member.committee ? `<p class="meta">Commissie: ${escapeHtml(member.committee)}</p>` : ""}
              <div class="member-card-badges">
                <span class="badge">${member.memberStatus === "oud" ? "Reünist" : "Actief"}</span>
                ${member.isAdmin ? '<span class="badge">Admin</span>' : ""}
              </div>
            </div>
          </button>
          ${
            state.user?.isAdmin
              ? `<div class="row-actions member-admin-actions">
                  <button class="secondary" data-edit-member="${member.id}">Info aanpassen</button>
                  ${
                    member.id !== state.user.id
                      ? `<button class="danger" data-delete-member="${member.id}">Verwijderen</button>`
                      : ""
                  }
                </div>`
              : ""
          }
        </article>
      `
    )
    .join("");
}

function projectMapPoint(latitude, longitude, zoom) {
  const scale = 256 * 2 ** zoom;
  const safeLatitude = Math.max(-85.0511, Math.min(85.0511, latitude));
  const radians = (safeLatitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * scale
  };
}

function mapZoomForMembers(members) {
  if (members.length < 2) return 14;
  const lats = members.map((member) => Number(member.latitude));
  const lons = members.map((member) => Number(member.longitude));
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
  if (span > 0.5) return 10;
  if (span > 0.2) return 11;
  if (span > 0.08) return 12;
  if (span > 0.03) return 13;
  return 14;
}

function renderCribMap() {
  if (!els.cribMap) return;
  const sourceMembers = state.mapMembers.length ? state.mapMembers : state.members;
  const mappedMembers = sourceMembers.filter((member) => Number.isFinite(Number(member.latitude)) && Number.isFinite(Number(member.longitude)) && member.accountStatus === "active");
  const unmappedMembers = sourceMembers.filter((member) => member.accountStatus === "active" && (!Number.isFinite(Number(member.latitude)) || !Number.isFinite(Number(member.longitude))));
  if (els.mapMemberCount) els.mapMemberCount.textContent = `${mappedMembers.length} van ${mappedMembers.length + unmappedMembers.length} op de kaart`;
  if (els.mapUnmapped) {
    els.mapUnmapped.innerHTML = unmappedMembers.length
      ? `<p class="map-unmapped-title">Nog niet op de kaart</p><p>${unmappedMembers.map((member) => escapeHtml(member.name)).join(", ")}</p>`
      : `<p class="map-ready">Alle actieve leden staan op de kaart.</p>`;
  }
  if (!mappedMembers.length) {
    els.cribMap.innerHTML = `<div class="map-empty"><span class="map-empty-icon">⌖</span><strong>Nog geen adressen op de kaart</strong><p>Vul je adres in via je profiel. Daarna verschijnt je Cassio Crib hier automatisch.</p><a class="secondary" href="#profiel">Naar mijn profiel</a></div>`;
    return;
  }

  const zoom = mapZoomForMembers(mappedMembers);
  const projected = mappedMembers.map((member) => ({ member, point: projectMapPoint(Number(member.latitude), Number(member.longitude), zoom) }));
  const centerX = projected.reduce((sum, item) => sum + item.point.x, 0) / projected.length;
  const centerY = projected.reduce((sum, item) => sum + item.point.y, 0) / projected.length;
  const left = centerX - 450;
  const top = centerY - 250;
  const tileXStart = Math.floor(left / 256) - 1;
  const tileXEnd = Math.ceil((left + 900) / 256) + 1;
  const tileYStart = Math.floor(top / 256) - 1;
  const tileYEnd = Math.ceil((top + 500) / 256) + 1;
  const worldTiles = 2 ** zoom;
  const tiles = [];
  for (let tileX = tileXStart; tileX <= tileXEnd; tileX += 1) {
    for (let tileY = tileYStart; tileY <= tileYEnd; tileY += 1) {
      if (tileY < 0 || tileY >= worldTiles) continue;
      const wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles;
      tiles.push(`<image class="map-tile" x="${tileX * 256 - left}" y="${tileY * 256 - top}" width="256" height="256" href="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png" />`);
    }
  }
  const markers = projected.map(({ member, point }) => {
    const x = point.x - left;
    const y = point.y - top;
    const initials = escapeHtml((member.name || "C").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase());
    return `<g class="crib-marker" tabindex="0" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><title>${escapeHtml(member.name)} · Cassio Crib</title><circle r="16"></circle><circle class="crib-marker-core" r="11"></circle><text y="4" text-anchor="middle">${initials}</text></g>`;
  }).join("");
  els.cribMap.innerHTML = `<svg class="crib-map-svg" viewBox="0 0 900 500" preserveAspectRatio="xMidYMid slice" aria-label="Cassio Cribs kaart">${tiles.join("")}${markers}</svg>`;
}

function accountStatusLabel(status) {
  return { pending: "Uitnodiging open", active: "Actief", disabled: "Uitgeschakeld" }[status] || "Onbekend";
}

function renderAdminAccounts() {
  if (!els.adminAccountList) return;
  if (!state.user?.isAdmin) {
    els.adminAccountList.innerHTML = "";
    syncMemberSelection([]);
    return;
  }
  const query = String(els.adminSearch?.value || "").trim().toLocaleLowerCase("nl");
  const members = state.members.filter((member) => {
    if (!query) return true;
    return [member.name, member.email, member.yearLayer, member.roleTitle]
      .some((value) => String(value || "").toLocaleLowerCase("nl").includes(query));
  });
  if (els.adminActiveCount) els.adminActiveCount.textContent = String(state.members.filter((member) => member.accountStatus === "active").length);
  if (els.adminPendingCount) els.adminPendingCount.textContent = String(state.members.filter((member) => member.accountStatus === "pending").length);
  if (els.adminDisabledCount) els.adminDisabledCount.textContent = String(state.members.filter((member) => member.accountStatus === "disabled").length);
  if (!members.length) {
    els.adminAccountList.innerHTML = '<article class="locked-panel"><h3>Geen accounts gevonden</h3><p>Probeer een andere naam of e-mailadres.</p></article>';
    syncMemberSelection(members);
    return;
  }
  els.adminAccountList.innerHTML = members
    .map(
      (member) => `
        <article class="admin-account-row has-select" data-selected="${state.selectedMemberIds.has(Number(member.id))}">
          <label class="admin-account-select-wrap${member.isAdmin ? " is-locked" : ""}" title="${member.isAdmin ? "Adminaccounts kunnen niet bulk worden verwijderd" : "Selecteer lid"}">
            <input class="admin-account-select" type="checkbox" data-member-select="${member.id}" ${member.isAdmin ? "disabled" : ""} ${state.selectedMemberIds.has(Number(member.id)) ? "checked" : ""} aria-label="Selecteer ${escapeHtml(member.name)}" />
          </label>
          <div class="admin-account-copy">
            <strong>${escapeHtml(member.name)}</strong>
            <p class="meta">${escapeHtml(member.email)} · ${escapeHtml(formatLichting(member.yearLayer))}</p>
            <div class="member-card-badges">
              <span class="badge account-status-${escapeHtml(member.accountStatus)}">${escapeHtml(accountStatusLabel(member.accountStatus))}</span>
              ${member.isAdmin ? '<span class="badge">Admin</span>' : ""}
            </div>
          </div>
          <div class="row-actions">
            <button class="secondary" data-invite-member="${member.id}">
              ${member.accountStatus === "pending" ? "Uitnodigingslink" : "Wachtwoordlink"}
            </button>
            <button class="secondary" data-edit-member="${member.id}">Bewerken</button>
            ${member.id !== state.user.id ? `<button class="danger" data-delete-member="${member.id}">Verwijderen</button>` : ""}
          </div>
        </article>
      `
    )
    .join("");
  syncMemberSelection(members);
}

function syncMemberSelection(visibleMembers = []) {
  const validIds = new Set(state.members.filter((member) => !member.isAdmin).map((member) => Number(member.id)));
  state.selectedMemberIds = new Set([...state.selectedMemberIds].filter((id) => validIds.has(id)));
  const selectableVisible = visibleMembers.filter((member) => !member.isAdmin);
  const selectedVisible = selectableVisible.filter((member) => state.selectedMemberIds.has(Number(member.id)));
  if (els.adminSelectionCount) {
    const count = state.selectedMemberIds.size;
    els.adminSelectionCount.textContent = `${count} ${count === 1 ? "lid" : "leden"} geselecteerd`;
  }
  if (els.bulkDeleteMembers) els.bulkDeleteMembers.disabled = state.selectedMemberIds.size === 0;
  if (els.adminSelectAll) {
    els.adminSelectAll.checked = selectableVisible.length > 0 && selectedVisible.length === selectableVisible.length;
    els.adminSelectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < selectableVisible.length;
    els.adminSelectAll.disabled = selectableVisible.length === 0;
  }
}

function openBulkDeleteDialog() {
  const count = state.selectedMemberIds.size;
  if (!count) return;
  els.bulkDeleteIntro.textContent = `Je staat op het punt ${count} ${count === 1 ? "lid" : "leden"} definitief te verwijderen. Profielen, uitnodigingen en inschrijvingen verdwijnen mee.`;
  els.bulkDeleteDialog.showModal();
}

async function showMemberDetail(id) {
  if (state.openMemberId === String(id)) {
    closeMemberDetail();
    return;
  }
  const { member } = await api(`/api/members/${id}`);
  state.openMemberId = String(id);
  els.memberDetail.innerHTML = `
    <button class="detail-close" type="button" data-close-member-detail aria-label="Profiel sluiten">x</button>
    <div class="detail-hero">
      <div class="avatar">${avatarHtml(member)}</div>
      <div>
        <p class="eyebrow">${member.isAdmin ? "Admin" : "Lidprofiel"}</p>
        <h2>${escapeHtml(member.name)}</h2>
        <p class="meta">${escapeHtml(formatLichting(member.yearLayer))} · ${escapeHtml(member.roleTitle || "Actief")}</p>
        <p class="meta">${member.memberStatus === "oud" ? "Reünist" : "Actief"}${member.committee ? ` · Commissie: ${escapeHtml(member.committee)}` : ""}</p>
      </div>
    </div>
    <p>${escapeHtml(member.bio || "Nog geen profieltekst ingevuld.")}</p>
    <p class="meta">E-mail: ${escapeHtml(member.email)}</p>
    <p class="meta">Telefoon: ${escapeHtml(member.phone || "Niet ingevuld")}</p>
    <p class="meta">Adres: ${escapeHtml(member.address || "Niet ingevuld")}</p>
    ${
      state.user?.isAdmin
        ? `<div class="row-actions admin-controls">
            <button class="secondary" data-edit-member="${member.id}">Bewerken</button>
            ${
              member.id !== state.user.id
                ? `<button class="danger" data-delete-member="${member.id}">Verwijderen</button>`
                : ""
            }
          </div>`
        : ""
    }
  `;
  els.memberDetail.classList.remove("hidden");
  els.memberDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeMemberDetail() {
  state.openMemberId = null;
  els.memberDetail.classList.add("hidden");
  els.memberDetail.innerHTML = "";
}

async function loadActivities() {
  const data = await api("/api/activities");
  state.activities = data.activities;
  renderPublicActivities();
  renderPortalOverview();
}

async function loadDocuments() {
  const data = await api("/api/documents");
  state.documents = data.documents || [];
  renderDocuments();
}

async function loadConfessions() {
  const data = await api("/api/confessions");
  state.confessions = data.confessions || [];
  renderConfessions();
}

async function loadSiteAssets() {
  const data = await api("/api/site-assets");
  state.siteAssets = data.assets || {};
  applySiteAssets();
}

async function loadYearAgenda() {
  try {
    const data = await api("/api/year-agenda");
    state.yearAgendaUsesLocalData = !data.items?.length;
    state.yearAgendaItems = data.items?.length ? data.items : localYearAgendaItems();
    state.yearAgendaSummaryText = data.summary || localYearAgendaSummary();
  } catch (error) {
    state.yearAgendaUsesLocalData = true;
    state.yearAgendaItems = localYearAgendaItems();
    state.yearAgendaSummaryText = localYearAgendaSummary();
    showToast("Jaarplanning lokaal geladen.");
  }
  renderYearAgenda();
  renderPortalOverview();
}

function groupedYearAgendaItems() {
  const months = new Map();
  state.yearAgendaItems.forEach((item) => {
    const key = `${item.monthIndex}-${item.monthLabel}`;
    if (!months.has(key)) {
      months.set(key, {
        monthLabel: item.monthLabel,
        monthIndex: item.monthIndex,
        items: []
      });
    }
    months.get(key).items.push(item);
  });
  months.forEach((month) => {
    month.items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  });
  return [...months.values()].sort((a, b) => a.monthIndex - b.monthIndex);
}

function activeYearAgendaMonth(months) {
  if (!months.length) return null;
  const activeMonth = months.find((month) => month.monthIndex === state.activeYearAgendaMonthIndex);
  if (activeMonth) return activeMonth;
  const currentMonthLabel = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date());
  const currentMonth = months.find((month) => month.monthLabel.toLocaleLowerCase("nl") === currentMonthLabel.toLocaleLowerCase("nl"));
  const initialMonth = currentMonth || months[0];
  state.activeYearAgendaMonthIndex = initialMonth.monthIndex;
  return initialMonth;
}

function renderYearAgendaToolbar(months, activeMonth) {
  if (!els.yearAgendaMonthSelect) return;
  els.yearAgendaMonthSelect.innerHTML = months
    .map((month) => `<option value="${month.monthIndex}">${escapeHtml(month.monthLabel)}</option>`)
    .join("");
  els.yearAgendaMonthSelect.value = String(activeMonth?.monthIndex || "");

  const activeIndex = months.findIndex((month) => month.monthIndex === activeMonth?.monthIndex);
  if (els.yearAgendaPrev) els.yearAgendaPrev.disabled = activeIndex <= 0;
  if (els.yearAgendaNext) els.yearAgendaNext.disabled = activeIndex === -1 || activeIndex >= months.length - 1;
}

function renderYearAgenda() {
  if (!els.yearAgendaGrid) return;
  const months = groupedYearAgendaItems();
  if (!months.length) {
    renderYearAgendaToolbar([], null);
    if (els.yearAgendaSummary) els.yearAgendaSummary.textContent = state.yearAgendaSummaryText || "Nog geen agendapunten toegevoegd.";
    els.yearAgendaGrid.innerHTML = `
      <article class="year-month">
        <h3>Geen jaarplanning</h3>
        <p class="meta">Er zijn nog geen agendapunten toegevoegd.</p>
      </article>
    `;
    return;
  }
  const activeMonth = activeYearAgendaMonth(months);
  renderYearAgendaToolbar(months, activeMonth);

  if (els.yearAgendaSummary) {
    const firstMonth = months[0].monthLabel;
    const lastMonth = months[months.length - 1].monthLabel;
    const summary = state.yearAgendaSummaryText || `${state.yearAgendaItems.length} agendapunten · ${months.length} maanden · ${firstMonth} t/m ${lastMonth}`;
    els.yearAgendaSummary.innerHTML = `
      <span>${escapeHtml(summary)}</span>
      ${state.user?.isAdmin ? '<button type="button" class="summary-edit-action" data-edit-year-agenda-summary>Bewerk</button>' : ""}
    `;
  }

  els.yearAgendaGrid.innerHTML = `
    <article class="year-month year-month-active">
      <h3>${escapeHtml(activeMonth.monthLabel)}</h3>
      <div class="year-month-items">
        ${activeMonth.items
          .map(
            (item) => `
              <div class="year-agenda-item">
                <span class="year-agenda-date">${escapeHtml(item.dayLabel)}</span>
                <span class="year-agenda-title">${escapeHtml(item.title)}</span>
                ${
                  state.user?.isAdmin
                    ? `<span class="year-agenda-actions">
                        <button type="button" class="icon-action" data-edit-year-agenda="${item.id}" aria-label="Agendapunt bewerken" title="Bewerk">B</button>
                        <button type="button" class="icon-action danger-action" data-delete-year-agenda="${item.id}" aria-label="Agendapunt verwijderen" title="Verwijder">x</button>
                      </span>`
                    : ""
                }
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderPublicActivities() {
  if (!state.activities.length) {
    els.publicActivityList.innerHTML = `
      <article class="activity-card">
        <div>
          <p class="eyebrow">Agenda</p>
          <h3>Geen activiteiten</h3>
          <p>Er staan nog geen activiteiten gepland.</p>
        </div>
      </article>
    `;
    return;
  }

  els.publicActivityList.innerHTML = state.activities
    .map((activity) => {
      const full = activity.capacity && activity.registrationCount >= activity.capacity;
      return `
        <article id="activiteit-${activity.id}" class="activity-card" data-activity-card="${activity.id}">
          <div>
            <p class="eyebrow">${formatDate(activity.startsAt)}</p>
            <h3>${escapeHtml(activity.title)}</h3>
            <p>${escapeHtml(activity.description || "Geen beschrijving ingevuld.")}</p>
            <p class="meta">${escapeHtml(activity.location || "Locatie volgt")} · ${activity.registrationCount}${activity.capacity ? `/${activity.capacity}` : ""} ingeschreven</p>
            ${activity.wasCancelled ? `<p class="late-cancelled-note">${activity.lateCancelled ? "Afmelding te laat geregistreerd." : "Je bent afgemeld."}</p>` : ""}
            ${activity.files?.length ? `<div class="activity-files"><span class="module-label">Bestanden</span>${activity.files.map((file) => `<button class="file-link" type="button" data-download-activity-file="${file.id}" data-activity-id="${activity.id}" data-file-name="${escapeHtml(file.fileName)}" data-file-type="${escapeHtml(file.mimeType)}">${escapeHtml(file.fileName)}</button>${state.user?.isAdmin ? `<button class="file-delete" type="button" data-delete-activity-file="${file.id}" data-activity-id="${activity.id}" aria-label="Verwijder ${escapeHtml(file.fileName)}">×</button>` : ""}`).join("")}</div>` : ""}
            ${renderActivityParticipants(activity)}
          </div>
          <div class="activity-actions">
            <button class="secondary" data-register="${activity.id}" ${full && !activity.isRegistered ? "disabled" : ""}>
              ${!state.user ? "Inloggen om in te schrijven" : activity.isRegistered ? "Afmelden" : full ? "Vol" : "Inschrijven"}
            </button>
            ${
              state.user?.isAdmin
                ? `<button class="secondary" data-registrations="${activity.id}">Inschrijvingen</button>
                  <button class="secondary" data-export-activity="${activity.id}">Export</button>
                  <button class="secondary" data-google-calendar="${activity.id}">Google Agenda</button>
                  <button class="secondary" data-whatsapp-activity="${activity.id}">WhatsApp</button>
                  <button class="secondary" data-edit-activity="${activity.id}">Bewerk</button>
                  <button class="danger" data-delete-activity="${activity.id}">Verwijder</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function applySiteAssets() {
  Object.entries(state.siteAssets).forEach(([key, src]) => {
    document.querySelectorAll(`[data-site-asset="${key}"]`).forEach((image) => {
      image.src = src;
    });
  });
}

function renderDocuments() {
  if (!els.documentList) return;
  if (!state.documents.length) {
    els.documentList.innerHTML = '<p class="meta">Er zijn nog geen documenten gedeeld.</p>';
    return;
  }
  els.documentList.innerHTML = state.documents.map((document) => `
    <article class="document-row">
      <div><span class="document-category">${escapeHtml(document.category.toUpperCase())}</span><strong>${escapeHtml(document.title)}</strong><p class="meta">${escapeHtml(document.fileName)} · ${formatDate(document.createdAt)}</p></div>
      <div class="row-actions"><button class="secondary" data-download-document="${document.id}">Openen</button>${state.user?.isAdmin ? `<button class="danger" data-delete-document="${document.id}">Verwijderen</button>` : ""}</div>
    </article>
  `).join("");
}

function renderConfessions() {
  if (!els.confessionList) return;
  if (!state.confessions.length) {
    els.confessionList.innerHTML = '<p class="meta">Nog geen biechten geplaatst.</p>';
    return;
  }
  els.confessionList.innerHTML = state.confessions.map((confession) => `
    <article class="confession-card">
      <p>${escapeHtml(confession.body)}</p>
      <div class="confession-meta"><span>${formatDate(confession.createdAt)}</span>${state.user?.isAdmin ? `<button class="text-button danger-text" data-delete-confession="${confession.id}">Verwijderen</button>` : ""}</div>
    </article>
  `).join("");
}

async function downloadProtectedFile(path, fileName, mimeType) {
  const response = await api(path);
  const link = document.createElement("a");
  link.href = `data:${mimeType};base64,${response.data}`;
  link.download = fileName;
  link.click();
}

function googleCalendarUrl(activity) {
  const start = new Date(activity.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({ action: "TEMPLATE", text: activity.title, dates: `${stamp(start)}/${stamp(end)}`, details: activity.description || "", location: activity.location || "" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderAdmin() {
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !state.user?.isAdmin));
  renderYearAgenda();
  renderAdminAccounts();
}

function openMemberDialog(member = null) {
  els.memberForm.reset();
  els.memberDialogTitle.textContent = member ? "Lid wijzigen" : "Nieuw lid";
  const fields = els.memberForm.elements;
  const memberAvatar = member?.avatar || "";
  const editableInitials = memberAvatar && !/^(data:image\/|https?:\/\/)/i.test(memberAvatar) ? memberAvatar : "";
  fields.id.value = member?.id || "";
  fields.name.value = member?.name || "";
  fields.email.value = member?.email || "";
  fields.yearLayer.value = member?.yearLayer || "";
  fields.roleTitle.value = member?.roleTitle || "";
  fields.memberStatus.value = member?.memberStatus || "actief";
  fields.committee.value = member?.committee || "";
  fields.phone.value = member?.phone || "";
  fields.address.value = member?.address || "";
  fields.avatar.value = editableInitials;
  fields.bio.value = member?.bio || "";
  fields.isAdmin.checked = Boolean(member?.isAdmin);
  fields.accountStatus.value = member?.accountStatus || "pending";
  fields.accountStatus.disabled = !member;
  els.memberDialog.showModal();
}

function openInvitationDialog(member, invitation) {
  const invitationUrl = new URL(invitation.invitePath, window.location.origin).toString();
  els.invitationDialogTitle.textContent = invitation.purpose === "invite" ? "Uitnodiging delen" : "Wachtwoordlink delen";
  els.invitationDialogText.textContent = `Voor ${member.name}. Geldig tot ${formatDate(invitation.expiresAt)}.`;
  els.invitationUrl.value = invitationUrl;
  els.invitationDialog.showModal();
}

function openActivityDialog(activity = null) {
  els.activityForm.reset();
  els.activityDialogTitle.textContent = activity ? "Activiteit wijzigen" : "Nieuwe activiteit";
  const fields = els.activityForm.elements;
  fields.id.value = activity?.id || "";
  fields.title.value = activity?.title || "";
  fields.startsAt.value = activity?.startsAt || "";
  fields.capacity.value = activity?.capacity || "";
  fields.location.value = activity?.location || "";
  fields.description.value = activity?.description || "";
  if (fields.activityFiles) fields.activityFiles.value = "";
  els.activityDialog.showModal();
}

function openYearAgendaDialog(item = null) {
  els.yearAgendaForm.reset();
  els.yearAgendaDialogTitle.textContent = item ? "Agendapunt wijzigen" : "Nieuw agendapunt";
  const fields = els.yearAgendaForm.elements;
  const bulkFields = els.yearAgendaForm.querySelectorAll("[data-bulk-year-agenda]");
  const activeMonth = item ? null : activeYearAgendaMonth(groupedYearAgendaItems());
  const nextSortOrder = state.yearAgendaItems.length ? Math.max(...state.yearAgendaItems.map((agendaItem) => agendaItem.sortOrder || 0)) + 1 : 1;
  fields.id.value = item?.id || "";
  fields.monthLabel.value = item?.monthLabel || activeMonth?.monthLabel || "";
  fields.monthIndex.value = item?.monthIndex || activeMonth?.monthIndex || "";
  fields.dayLabel.value = item?.dayLabel || "";
  fields.sortOrder.value = item?.sortOrder ?? nextSortOrder;
  fields.title.value = item?.title || "";
  fields.bulkItems.value = "";
  fields.dayLabel.required = Boolean(item);
  fields.title.required = Boolean(item);
  bulkFields.forEach((field) => field.classList.toggle("hidden", Boolean(item)));
  els.yearAgendaDialog.showModal();
}

function parseBulkYearAgendaItems(data) {
  const bulkItems = String(data.bulkItems || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!bulkItems.length) return [];

  return bulkItems.map((line, index) => {
    const separatorIndex = line.indexOf(";");
    if (separatorIndex === -1) {
      throw new Error(`Gebruik per regel: datum; activiteit. Controleer regel ${index + 1}.`);
    }
    const dayLabel = line.slice(0, separatorIndex).trim();
    const title = line.slice(separatorIndex + 1).trim();
    if (!dayLabel || !title) {
      throw new Error(`Datum en activiteit zijn verplicht op regel ${index + 1}.`);
    }
    return {
      monthLabel: String(data.monthLabel || "").trim(),
      monthIndex: Number(data.monthIndex) || 1,
      dayLabel,
      title,
      sortOrder: (Number(data.sortOrder) || state.yearAgendaItems.length + 1) + index
    };
  });
}

function currentYearAgendaSummary() {
  if (state.yearAgendaSummaryText) return state.yearAgendaSummaryText;
  const months = groupedYearAgendaItems();
  if (!months.length) return "";
  return `${state.yearAgendaItems.length} agendapunten · ${months.length} maanden · ${months[0].monthLabel} t/m ${months[months.length - 1].monthLabel}`;
}

function openYearAgendaSummaryDialog() {
  els.yearAgendaSummaryForm.reset();
  els.yearAgendaSummaryForm.elements.summaryText.value = currentYearAgendaSummary();
  els.yearAgendaSummaryDialog.showModal();
}

async function saveYearAgendaSummary(summary) {
  if (state.yearAgendaUsesLocalData) {
    state.yearAgendaSummaryText = summary;
    saveLocalYearAgendaSummary(summary);
    renderYearAgenda();
    return;
  }
  const data = await api("/api/year-agenda-summary", {
    method: "PUT",
    body: JSON.stringify({ summary })
  });
  state.yearAgendaSummaryText = data.summary;
  renderYearAgenda();
}

async function showRegistrations(activityId) {
  const { registrations } = await api(`/api/activities/${activityId}/registrations`);
  els.registrationsList.innerHTML = registrations.length
    ? registrations
        .map(
          (member) => `
            <div class="table-row ${member.lateCancelled ? "late-registration-row" : ""}">
              <div>
                <strong>${escapeHtml(member.name)}</strong>
                <p class="meta">${escapeHtml(member.email)} · ${escapeHtml(member.yearLayer)} · ${escapeHtml(member.roleTitle || "Actief")}</p>
                ${member.cancelledAt ? `<span class="late-registration-label">${member.lateCancelled ? "Te laat afgemeld" : "Afgemeld"}</span>` : ""}
              </div>
            </div>
          `
        )
        .join("")
    : '<p class="meta">Nog niemand heeft zich ingeschreven.</p>';
  els.registrationsDialog.showModal();
}

async function exportRegistrations(activityId) {
  const activity = state.activities.find((item) => item.id === Number(activityId));
  const { registrations } = await api(`/api/activities/${activityId}/registrations`);
  const rows = [
    ["Naam", "E-mail", "Lichting", "Functie", "Ingeschreven op", "Afmelding", "Status"],
    ...registrations.map((member) => [
      member.name,
      member.email,
      formatLichting(member.yearLayer),
      member.roleTitle || "Actief",
      member.registeredAt ? formatDate(member.registeredAt) : "",
      member.cancelledAt ? formatDate(member.cancelledAt) : "",
      member.lateCancelled ? "TE LAAT" : member.cancelledAt ? "Afgemeld" : "Ingeschreven"
    ])
  ];
  const safeTitle = String(activity?.title || "activiteit")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  downloadExcel(`inschrijvingen-${safeTitle || "activiteit"}.xls`, rows[0], rows.slice(1));
  showToast("Inschrijvingen geëxporteerd naar Excel.");
}

function openLogin() {
  els.loginError.textContent = "";
  els.loginScreen.classList.remove("hidden");
}

function activationTokenFromHash() {
  if (!location.hash.startsWith("#activate=")) return "";
  try {
    const token = decodeURIComponent(location.hash.slice("#activate=".length));
    return /^[A-Za-z0-9_-]{32,200}$/.test(token) ? token : "";
  } catch (error) {
    return "";
  }
}

function closeActivation() {
  state.activationToken = "";
  els.activationForm.reset();
  els.activationForm.classList.add("hidden");
  els.loginForm.classList.remove("hidden");
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

async function openActivation(token) {
  state.activationToken = token;
  els.loginForm.classList.add("hidden");
  els.activationForm.classList.remove("hidden");
  els.loginScreen.classList.remove("hidden");
  els.activationError.textContent = "";
  els.activationIntro.textContent = "Uitnodiging controleren...";
  els.activationForm.querySelector("button[type='submit']").disabled = false;
  try {
    const invitation = await api("/api/account-token/inspect", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    els.activationTitle.textContent = invitation.purpose === "invite" ? `Welkom ${invitation.name}` : "Nieuw wachtwoord instellen";
    els.activationIntro.textContent = `${invitation.email} · link geldig tot ${formatDate(invitation.expiresAt)}`;
  } catch (error) {
    els.activationIntro.textContent = "We konden deze uitnodiging niet openen.";
    els.activationError.textContent = error.message;
    els.activationForm.querySelector("button[type='submit']").disabled = true;
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.addEventListener("load", () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("De afbeelding kon niet gelezen worden."));
    });
    image.src = objectUrl;
  });
}

function dataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

async function readProfilePhoto(file) {
  if (!file) return "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Kies een JPG, PNG of WebP afbeelding.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Kies een afbeelding van maximaal 5 MB.");
  }

  const image = await loadImageFromFile(file);
  const maxSide = 800;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrlSize(dataUrl) > 450 * 1024 && quality > 0.42) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

els.profileForm.elements.profilePhoto.addEventListener("change", async () => {
  try {
    const avatar = await readProfilePhoto(els.profileForm.elements.profilePhoto.files[0]);
    if (avatar) els.profileAvatar.innerHTML = avatarHtml({ avatar, name: state.user?.name || "Cassiopeia" });
  } catch (error) {
    els.profileForm.elements.profilePhoto.value = "";
    renderProfile();
    showToast(error.message);
  }
});

els.memberImportFile.addEventListener("change", resetMemberImportPreview);
els.memberImportForm.elements.defaultYear.addEventListener("input", resetMemberImportPreview);

els.memberImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resetMemberImportPreview();
  const file = els.memberImportFile.files[0];
  if (!file) {
    els.memberImportError.textContent = "Kies eerst een CSV- of PDF-bestand.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    els.memberImportError.textContent = "Het importbestand mag maximaal 5 MB zijn.";
    return;
  }
  if (!/\.(csv|pdf)$/i.test(file.name)) {
    els.memberImportError.textContent = "Gebruik een CSV- of PDF-bestand.";
    return;
  }

  els.previewMemberImport.disabled = true;
  els.previewMemberImport.textContent = "Controleren…";
  try {
    const data = await api("/api/members/import/preview", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        data: await fileAsBase64(file),
        defaultYear: els.memberImportForm.elements.defaultYear.value
      })
    });
    renderMemberImportPreview(data);
  } catch (error) {
    els.memberImportError.textContent = error.message;
  } finally {
    els.previewMemberImport.disabled = false;
    els.previewMemberImport.textContent = "Opnieuw controleren";
  }
});

els.confirmMemberImport.addEventListener("click", async () => {
  const readyRecords = state.importRecords.filter((record) => record.ready);
  if (!readyRecords.length) return;
  els.confirmMemberImport.disabled = true;
  els.confirmMemberImport.textContent = "Importeren…";
  els.memberImportError.textContent = "";
  try {
    const { created } = await api("/api/members/import", {
      method: "POST",
      body: JSON.stringify({ records: readyRecords })
    });
    els.memberImportDialog.close();
    openBulkInvitationDialog(created);
    refreshPortal().catch((error) => showToast(error.message));
  } catch (error) {
    els.memberImportError.textContent = error.message;
    els.confirmMemberImport.disabled = false;
    els.confirmMemberImport.textContent = `${readyRecords.length} ${readyRecords.length === 1 ? "lid" : "leden"} importeren`;
  }
});

els.downloadImportTemplate.addEventListener("click", () => {
  downloadCsv(
    "cassiopeia-leden-import-sjabloon.csv",
    [["naam", "e-mail", "lichting", "functie", "status", "commissie", "telefoon", "adres", "bio"]],
    ";"
  );
});

els.downloadBulkInvitations.addEventListener("click", () => {
  downloadCsv(
    "cassiopeia-uitnodigingslinks.csv",
    [["naam", "e-mail", "uitnodigingslink", "verloopt-op"], ...bulkInvitationRows()],
    ";"
  );
});

els.copyBulkInvitations.addEventListener("click", async () => {
  const text = bulkInvitationRows()
    .map(([name, email, url]) => `${name} (${email})\n${url}`)
    .join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("Alle uitnodigingslinks zijn gekopieerd.");
});

els.memberSearch.addEventListener("input", () => loadMembers().catch((error) => showToast(error.message)));
els.memberYearFilter.addEventListener("change", renderMembers);
els.adminSearch?.addEventListener("input", renderAdminAccounts);
els.adminSelectAll?.addEventListener("change", () => {
  const query = String(els.adminSearch?.value || "").trim().toLocaleLowerCase("nl");
  const visibleMembers = state.members.filter((member) => {
    if (!query) return true;
    return [member.name, member.email, member.yearLayer, member.roleTitle]
      .some((value) => String(value || "").toLocaleLowerCase("nl").includes(query));
  });
  visibleMembers.filter((member) => !member.isAdmin).forEach((member) => {
    const id = Number(member.id);
    if (els.adminSelectAll.checked) state.selectedMemberIds.add(id);
    else state.selectedMemberIds.delete(id);
  });
  renderAdminAccounts();
});
els.adminAccountList?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-member-select]");
  if (!checkbox || checkbox.disabled) return;
  const id = Number(checkbox.dataset.memberSelect);
  if (checkbox.checked) state.selectedMemberIds.add(id);
  else state.selectedMemberIds.delete(id);
  const row = checkbox.closest(".admin-account-row");
  if (row) row.dataset.selected = String(checkbox.checked);
  syncMemberSelection(state.members.filter((member) => {
    const query = String(els.adminSearch?.value || "").trim().toLocaleLowerCase("nl");
    return !query || [member.name, member.email, member.yearLayer, member.roleTitle]
      .some((value) => String(value || "").toLocaleLowerCase("nl").includes(query));
  }));
});
els.bulkDeleteMembers?.addEventListener("click", openBulkDeleteDialog);
els.clearMemberFilters.addEventListener("click", () => {
  state.memberStatusFilter = "";
  els.memberYearFilter.value = "";
  renderMemberFilters();
  renderMembers();
});
els.newMemberBtn.addEventListener("click", () => openMemberDialog());
els.newYearAgendaItemBtn.addEventListener("click", () => openYearAgendaDialog());
els.newActivityBtn.addEventListener("click", () => openActivityDialog());

els.yearAgendaMonthSelect.addEventListener("change", () => {
  state.activeYearAgendaMonthIndex = Number(els.yearAgendaMonthSelect.value);
  renderYearAgenda();
});

els.yearAgendaPrev.addEventListener("click", () => {
  const months = groupedYearAgendaItems();
  const index = months.findIndex((month) => month.monthIndex === state.activeYearAgendaMonthIndex);
  if (index > 0) {
    state.activeYearAgendaMonthIndex = months[index - 1].monthIndex;
    renderYearAgenda();
  }
});

els.yearAgendaNext.addEventListener("click", () => {
  const months = groupedYearAgendaItems();
  const index = months.findIndex((month) => month.monthIndex === state.activeYearAgendaMonthIndex);
  if (index >= 0 && index < months.length - 1) {
    state.activeYearAgendaMonthIndex = months[index + 1].monthIndex;
    renderYearAgenda();
  }
});

els.menuToggle.addEventListener("click", () => {
  const isOpen = els.siteHeader.classList.toggle("menu-open");
  els.menuToggle.setAttribute("aria-expanded", String(isOpen));
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  try {
    const { user } = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(formJson(els.loginForm))
    });
    els.loginForm.reset();
    setLoggedIn(user);
    await refreshPortal();
    if (!focusSharedActivity()) {
      location.hash = "#home";
      showPage("home");
    }
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.activationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.activationError.textContent = "";
  const password = String(els.activationForm.elements.password.value || "");
  const passwordConfirm = String(els.activationForm.elements.passwordConfirm.value || "");
  if (password !== passwordConfirm) {
    els.activationError.textContent = "De wachtwoorden zijn niet hetzelfde.";
    return;
  }
  try {
    const { user } = await api("/api/account/activate", {
      method: "POST",
      body: JSON.stringify({ token: state.activationToken, password })
    });
    closeActivation();
    setLoggedIn(user);
    await refreshPortal();
    location.hash = "#home";
    showPage("home");
    showToast("Je account is veilig geactiveerd.");
  } catch (error) {
    els.activationError.textContent = error.message;
  }
});

els.copyInvitationBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.invitationUrl.value);
  } catch (error) {
    els.invitationUrl.select();
    document.execCommand("copy");
  }
  showToast("Persoonlijke link gekopieerd.");
});

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  setLoggedOut();
  showToast("Je bent uitgelogd.");
});

els.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formJson(els.profileForm);
    data.avatar = await readProfilePhoto(els.profileForm.elements.profilePhoto.files[0]);
    const { user } = await api("/api/me", {
      method: "PUT",
      body: JSON.stringify(data)
    });
    state.user = user;
    els.profileForm.reset();
    renderProfile();
    await loadMembers();
    await loadMapMembers();
    showToast("Profiel opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

els.documentUploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = els.documentUploadForm.elements.documentFile.files[0];
  if (!file) return showToast("Kies eerst een PDF.");
  try {
    await api("/api/documents", { method: "POST", body: JSON.stringify({ title: els.documentUploadForm.elements.title.value, category: els.documentUploadForm.elements.category.value, fileName: file.name, mimeType: file.type || "application/pdf", data: await fileAsBase64(file) }) });
    els.documentUploadForm.reset();
    await loadDocuments();
    showToast("Document opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

els.siteImagesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const uploads = ["logo", "hero"].map((key) => ({ key, file: els.siteImagesForm.elements[key].files[0] })).filter((item) => item.file);
    if (!uploads.length) return showToast("Kies minimaal één afbeelding.");
    for (const { key, file } of uploads) {
      await api(`/api/site-assets/${key}`, { method: "PUT", body: JSON.stringify({ fileName: file.name, mimeType: file.type, data: await fileAsBase64(file) }) });
    }
    els.siteImagesForm.reset();
    await loadSiteAssets();
    showToast("Afbeeldingen opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

["logo", "hero"].forEach((key) => {
  const input = els.siteImagesForm?.elements[key];
  input?.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const preview = document.querySelector(`[data-admin-image-preview="${key}"]`);
    if (!preview) return;
    const objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    preview.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
  });
});

els.confessionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/confessions", { method: "POST", body: JSON.stringify({ body: els.confessionBody.value }) });
    els.confessionForm.reset();
    await loadConfessions();
    showToast("Je biecht is anoniem geplaatst.");
  } catch (error) {
    showToast(error.message);
  }
});

els.bulkDeleteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ids = [...state.selectedMemberIds];
  if (!ids.length) return els.bulkDeleteDialog.close();
  const submitButton = els.bulkDeleteForm.querySelector("[type='submit']");
  submitButton.disabled = true;
  try {
    const { deleted } = await api("/api/members/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids })
    });
    els.bulkDeleteDialog.close();
    state.selectedMemberIds.clear();
    await refreshPortal();
    showToast(`${deleted} ${deleted === 1 ? "lid is" : "leden zijn"} verwijderd.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.body.addEventListener("click", async (event) => {
  const navLink = event.target.closest(".site-nav a");
  if (navLink) {
    showPage(navLink.getAttribute("href").replace("#", ""));
  }

  const scrollTargetButton = event.target.closest("[data-scroll-target]");
  if (scrollTargetButton) {
    const target = document.getElementById(scrollTargetButton.dataset.scrollTarget);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const loginBtn = event.target.closest("[data-open-login]");
  if (loginBtn) return openLogin();

  const cancelActivationBtn = event.target.closest("[data-cancel-activation]");
  if (cancelActivationBtn) return closeActivation();

  const newMemberButton = event.target.closest("[data-new-member]");
  if (newMemberButton) return openMemberDialog();

  const importMembersButton = event.target.closest("[data-import-members]");
  if (importMembersButton) return openMemberImportDialog();

  const closeBtn = event.target.closest("[data-close]");
  if (closeBtn) return closeBtn.closest("dialog").close();

  const closeMemberDetailBtn = event.target.closest("[data-close-member-detail]");
  if (closeMemberDetailBtn) return closeMemberDetail();

  const statusFilterBtn = event.target.closest("[data-status-filter]");
  if (statusFilterBtn) {
    state.memberStatusFilter = statusFilterBtn.dataset.statusFilter;
    renderMemberFilters();
    return renderMembers();
  }

  const memberCard = event.target.closest("[data-member-id]");
  if (memberCard) return showMemberDetail(memberCard.dataset.memberId).catch((error) => showToast(error.message));

  const registerBtn = event.target.closest("[data-register]");
  if (registerBtn) {
    if (!state.user) return openLogin();
    const activity = state.activities.find((item) => item.id === Number(registerBtn.dataset.register));
    const wasRegistered = activity.isRegistered;
    const result = await api(`/api/activities/${activity.id}/register`, { method: wasRegistered ? "DELETE" : "POST" });
    await loadActivities();
    renderAdmin();
    return showToast(wasRegistered ? (result.lateCancelled ? `Je bent afgemeld voor ${activity.title}; dit is na de deadline.` : `Je bent afgemeld voor ${activity.title}.`) : `Je bent ingeschreven voor ${activity.title}.`);
  }

  const registrationsBtn = event.target.closest("[data-registrations]");
  if (registrationsBtn) return showRegistrations(registrationsBtn.dataset.registrations);

  const googleCalendarBtn = event.target.closest("[data-google-calendar]");
  if (googleCalendarBtn) {
    const activity = state.activities.find((item) => item.id === Number(googleCalendarBtn.dataset.googleCalendar));
    if (activity) window.open(googleCalendarUrl(activity), "_blank", "noopener");
    return;
  }

  const downloadDocumentBtn = event.target.closest("[data-download-document]");
  if (downloadDocumentBtn) {
    const document = state.documents.find((item) => item.id === Number(downloadDocumentBtn.dataset.downloadDocument));
    if (document) downloadProtectedFile(`/api/documents/${document.id}/download`, document.fileName, document.mimeType).catch((error) => showToast(error.message));
    return;
  }

  const deleteDocumentBtn = event.target.closest("[data-delete-document]");
  if (deleteDocumentBtn && confirm("Weet je zeker dat je dit document wilt verwijderen?")) {
    await api(`/api/documents/${deleteDocumentBtn.dataset.deleteDocument}`, { method: "DELETE" });
    await loadDocuments();
    return showToast("Document verwijderd.");
  }

  const downloadActivityFileBtn = event.target.closest("[data-download-activity-file]");
  if (downloadActivityFileBtn) {
    downloadProtectedFile(`/api/activities/${downloadActivityFileBtn.dataset.activityId}/files/${downloadActivityFileBtn.dataset.downloadActivityFile}/download`, downloadActivityFileBtn.dataset.fileName, downloadActivityFileBtn.dataset.fileType).catch((error) => showToast(error.message));
    return;
  }

  const deleteActivityFileBtn = event.target.closest("[data-delete-activity-file]");
  if (deleteActivityFileBtn && confirm("Weet je zeker dat je dit bestand wilt verwijderen?")) {
    await api(`/api/activities/${deleteActivityFileBtn.dataset.activityId}/files/${deleteActivityFileBtn.dataset.deleteActivityFile}`, { method: "DELETE" });
    await refreshPortal();
    return showToast("Bestand verwijderd.");
  }

  const deleteConfessionBtn = event.target.closest("[data-delete-confession]");
  if (deleteConfessionBtn && confirm("Weet je zeker dat je deze biecht wilt verwijderen?")) {
    await api(`/api/confessions/${deleteConfessionBtn.dataset.deleteConfession}`, { method: "DELETE" });
    await loadConfessions();
    return showToast("Biecht verwijderd.");
  }

  const editYearAgendaSummaryBtn = event.target.closest("[data-edit-year-agenda-summary]");
  if (editYearAgendaSummaryBtn) return openYearAgendaSummaryDialog();

  const editYearAgendaBtn = event.target.closest("[data-edit-year-agenda]");
  if (editYearAgendaBtn) {
    return openYearAgendaDialog(state.yearAgendaItems.find((item) => String(item.id) === editYearAgendaBtn.dataset.editYearAgenda));
  }

  const deleteYearAgendaBtn = event.target.closest("[data-delete-year-agenda]");
  if (deleteYearAgendaBtn && confirm("Weet je zeker dat je dit agendapunt wilt verwijderen?")) {
    if (state.yearAgendaUsesLocalData) {
      state.yearAgendaItems = state.yearAgendaItems.filter((item) => String(item.id) !== deleteYearAgendaBtn.dataset.deleteYearAgenda);
      saveLocalYearAgendaItems(state.yearAgendaItems);
      renderYearAgenda();
      return showToast("Agendapunt verwijderd.");
    }
    await api(`/api/year-agenda/${deleteYearAgendaBtn.dataset.deleteYearAgenda}`, { method: "DELETE" });
    await loadYearAgenda();
    return showToast("Agendapunt verwijderd.");
  }

  const exportActivityBtn = event.target.closest("[data-export-activity]");
  if (exportActivityBtn) return exportRegistrations(exportActivityBtn.dataset.exportActivity).catch((error) => showToast(error.message));

  const whatsappActivityBtn = event.target.closest("[data-whatsapp-activity]");
  if (whatsappActivityBtn) {
    const activity = state.activities.find((item) => item.id === Number(whatsappActivityBtn.dataset.whatsappActivity));
    const text = `Schrijf je in voor ${activity.title}: ${activityShareUrl(activity.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return;
  }

  const editMemberBtn = event.target.closest("[data-edit-member]");
  if (editMemberBtn) return openMemberDialog(state.members.find((member) => member.id === Number(editMemberBtn.dataset.editMember)));

  const inviteMemberBtn = event.target.closest("[data-invite-member]");
  if (inviteMemberBtn) {
    try {
      const data = await api(`/api/members/${inviteMemberBtn.dataset.inviteMember}/invitations`, { method: "POST" });
      openInvitationDialog(data.member, data.invitation);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const deleteMemberBtn = event.target.closest("[data-delete-member]");
  if (deleteMemberBtn && confirm("Weet je zeker dat je dit lid wilt verwijderen?")) {
    await api(`/api/members/${deleteMemberBtn.dataset.deleteMember}`, { method: "DELETE" });
    await refreshPortal();
    return showToast("Lid verwijderd.");
  }

  const editActivityBtn = event.target.closest("[data-edit-activity]");
  if (editActivityBtn) return openActivityDialog(state.activities.find((activity) => activity.id === Number(editActivityBtn.dataset.editActivity)));

  const deleteActivityBtn = event.target.closest("[data-delete-activity]");
  if (deleteActivityBtn && confirm("Weet je zeker dat je deze activiteit wilt verwijderen?")) {
    await api(`/api/activities/${deleteActivityBtn.dataset.deleteActivity}`, { method: "DELETE" });
    await refreshPortal();
    return showToast("Activiteit verwijderd.");
  }
});

els.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formJson(els.memberForm);
    const id = data.id;
    if (!id) delete data.accountStatus;
    const response = await api(id ? `/api/members/${id}` : "/api/members", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data)
    });
    els.memberDialog.close();
    await refreshPortal();
    if (response.invitation) {
      openInvitationDialog(response.member, response.invitation);
    } else {
      showToast("Lid opgeslagen.");
    }
  } catch (error) {
    showToast(error.message);
  }
});

els.yearAgendaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formJson(els.yearAgendaForm);
    const id = data.id;
    const bulkItems = id ? [] : parseBulkYearAgendaItems(data);
    if (bulkItems.length && !String(data.monthLabel || "").trim()) throw new Error("Maand is verplicht.");

    if (state.yearAgendaUsesLocalData || String(id).startsWith("default-") || String(id).startsWith("local-")) {
      if (bulkItems.length) {
        state.activeYearAgendaMonthIndex = bulkItems[0].monthIndex;
        const nextItems = [
          ...state.yearAgendaItems,
          ...bulkItems.map((item, index) => ({
            ...item,
            id: `local-${Date.now()}-${index}`
          }))
        ];
        state.yearAgendaItems = nextItems;
        state.yearAgendaUsesLocalData = true;
        saveLocalYearAgendaItems(nextItems);
        els.yearAgendaDialog.close();
        renderYearAgenda();
        return showToast(`${bulkItems.length} agendapunten opgeslagen.`);
      }

      const item = {
        id: id || `local-${Date.now()}`,
        monthLabel: String(data.monthLabel || "").trim(),
        monthIndex: Number(data.monthIndex) || 1,
        dayLabel: String(data.dayLabel || "").trim(),
        title: String(data.title || "").trim(),
        sortOrder: Number(data.sortOrder) || state.yearAgendaItems.length + 1,
        isDefault: String(id).startsWith("default-")
      };
      if (!item.monthLabel || !item.dayLabel || !item.title) throw new Error("Maand, datum en titel zijn verplicht.");
      const nextItems = id
        ? state.yearAgendaItems.map((agendaItem) => (String(agendaItem.id) === String(id) ? item : agendaItem))
        : [...state.yearAgendaItems, item];
      state.yearAgendaItems = nextItems;
      state.activeYearAgendaMonthIndex = item.monthIndex;
      state.yearAgendaUsesLocalData = true;
      saveLocalYearAgendaItems(nextItems);
      els.yearAgendaDialog.close();
      renderYearAgenda();
      return showToast("Agendapunt opgeslagen.");
    }

    if (bulkItems.length) {
      state.activeYearAgendaMonthIndex = bulkItems[0].monthIndex;
      await Promise.all(
        bulkItems.map((item) =>
          api("/api/year-agenda", {
            method: "POST",
            body: JSON.stringify(item)
          })
        )
      );
      els.yearAgendaDialog.close();
      await loadYearAgenda();
      return showToast(`${bulkItems.length} agendapunten opgeslagen.`);
    }

    await api(id ? `/api/year-agenda/${id}` : "/api/year-agenda", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data)
    });
    els.yearAgendaDialog.close();
    state.activeYearAgendaMonthIndex = Number(data.monthIndex) || state.activeYearAgendaMonthIndex;
    await loadYearAgenda();
    showToast("Agendapunt opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

els.yearAgendaSummaryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const summary = String(els.yearAgendaSummaryForm.elements.summaryText.value || "").trim();
    if (!summary) throw new Error("Overzichtstekst is verplicht.");
    await saveYearAgendaSummary(summary);
    els.yearAgendaSummaryDialog.close();
    showToast("Overzichtstekst opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

els.activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formJson(els.activityForm);
  const id = data.id;
  const files = [...(els.activityForm.elements.activityFiles?.files || [])];
  delete data.activityFiles;
  const response = await api(id ? `/api/activities/${id}` : "/api/activities", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(data)
  });
  const activityId = id || response.activity.id;
  for (const file of files) {
    await api(`/api/activities/${activityId}/files`, { method: "POST", body: JSON.stringify({ fileName: file.name, mimeType: file.type, data: await fileAsBase64(file) }) });
  }
  els.activityDialog.close();
  await refreshPortal();
  showToast("Activiteit opgeslagen.");
});

const initialActivationToken = activationTokenFromHash();
loadSiteAssets().catch(() => {});
if (initialActivationToken) {
  openActivation(initialActivationToken);
} else {
  api("/api/session")
    .then(async ({ user }) => {
      if (!user) return setLoggedOut();
      setLoggedIn(user);
      await refreshPortal();
    })
    .catch(async () => {
      setLoggedOut();
    });
}

window.addEventListener("hashchange", () => {
  const token = activationTokenFromHash();
  if (token) return openActivation(token);
  if (state.user) showPage();
});
