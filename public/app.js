const state = {
  user: null,
  members: [],
  activities: [],
  yearAgendaItems: [],
  yearAgendaUsesLocalData: false,
  memberStatusFilter: "",
  openMemberId: null
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

const els = {
  siteHeader: document.querySelector(".site-header"),
  appMain: document.querySelector("main"),
  menuToggle: document.querySelector("#menuToggle"),
  logoutBtn: document.querySelector("#logoutBtn"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError"),
  memberSearch: document.querySelector("#memberSearch"),
  memberYearFilter: document.querySelector("#memberYearFilter"),
  clearMemberFilters: document.querySelector("#clearMemberFilters"),
  memberResultCount: document.querySelector("#memberResultCount"),
  loggedOutMembers: document.querySelector("#loggedOutMembers"),
  memberGrid: document.querySelector("#memberGrid"),
  memberDetail: document.querySelector("#memberDetail"),
  yearAgendaSummary: document.querySelector("#yearAgendaSummary"),
  yearAgendaGrid: document.querySelector("#yearAgendaGrid"),
  publicActivityList: document.querySelector("#publicActivityList"),
  profileForm: document.querySelector("#profileForm"),
  profileAvatar: document.querySelector("#profileAvatar"),
  headerProfileAvatar: document.querySelector("#headerProfileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileEmail: document.querySelector("#profileEmail"),
  newMemberBtn: document.querySelector("#newMemberBtn"),
  newYearAgendaItemBtn: document.querySelector("#newYearAgendaItemBtn"),
  newActivityBtn: document.querySelector("#newActivityBtn"),
  memberDialog: document.querySelector("#memberDialog"),
  memberForm: document.querySelector("#memberForm"),
  memberDialogTitle: document.querySelector("#memberDialogTitle"),
  yearAgendaDialog: document.querySelector("#yearAgendaDialog"),
  yearAgendaForm: document.querySelector("#yearAgendaForm"),
  yearAgendaDialogTitle: document.querySelector("#yearAgendaDialogTitle"),
  activityDialog: document.querySelector("#activityDialog"),
  activityForm: document.querySelector("#activityForm"),
  activityDialogTitle: document.querySelector("#activityDialogTitle"),
  registrationsDialog: document.querySelector("#registrationsDialog"),
  registrationsList: document.querySelector("#registrationsList"),
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

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderProfile() {
  if (!state.user) return;
  els.profileAvatar.innerHTML = avatarHtml(state.user);
  els.headerProfileAvatar.innerHTML = avatarHtml(state.user);
  els.profileName.textContent = state.user.name;
  els.profileEmail.textContent = state.user.email;
  els.profileForm.elements.address.value = state.user.address || "";
}

function closeMobileMenu() {
  els.siteHeader.classList.remove("menu-open");
  els.menuToggle.setAttribute("aria-expanded", "false");
}

function showPage(page = location.hash.slice(1) || "home") {
  const allowedPages = ["home", "leden", "profiel"];
  const activePage = allowedPages.includes(page) ? page : "home";
  document.querySelectorAll(".page-view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== activePage);
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
  state.activities = [];
  state.yearAgendaItems = [];
  state.openMemberId = null;
  els.loginScreen.classList.remove("hidden");
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
}

async function refreshPortal() {
  await Promise.all([loadMembers(), loadActivities(), loadYearAgenda()]);
  focusSharedActivity();
}

async function loadMembers() {
  const query = encodeURIComponent(els.memberSearch.value || "");
  const data = await api(`/api/members?q=${query}`);
  state.members = data.members;
  renderMemberFilters();
  renderMembers();
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
  setFilterOptions(els.memberYearFilter, uniqueSorted(state.members.map((member) => member.yearLayer)).reverse(), "Alle lichtingen");
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.statusFilter === state.memberStatusFilter);
  });
}

function filteredMembers() {
  const status = state.memberStatusFilter;
  const year = els.memberYearFilter.value;
  return state.members.filter((member) => {
    if (status && member.memberStatus !== status) return false;
    if (year && member.yearLayer !== year) return false;
    return true;
  });
}

function renderMembers() {
  const members = filteredMembers();
  els.memberResultCount.textContent = `${members.length} ${members.length === 1 ? "Actief" : "leden"}`;
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
                <span class="badge">${member.memberStatus === "oud" ? "Reunist" : "Actief"}</span>
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
        <p class="meta">${member.memberStatus === "oud" ? "Reunist" : "Actief"}${member.committee ? ` · Commissie: ${escapeHtml(member.committee)}` : ""}</p>
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
}

async function loadYearAgenda() {
  try {
    const data = await api("/api/year-agenda");
    state.yearAgendaUsesLocalData = !data.items?.length;
    state.yearAgendaItems = data.items?.length ? data.items : localYearAgendaItems();
  } catch (error) {
    state.yearAgendaUsesLocalData = true;
    state.yearAgendaItems = localYearAgendaItems();
    showToast("Jaarplanning lokaal geladen.");
  }
  renderYearAgenda();
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
  return [...months.values()].sort((a, b) => a.monthIndex - b.monthIndex);
}

function renderYearAgenda() {
  if (!els.yearAgendaGrid) return;
  const months = groupedYearAgendaItems();
  if (!months.length) {
    if (els.yearAgendaSummary) els.yearAgendaSummary.textContent = "Nog geen agendapunten toegevoegd.";
    els.yearAgendaGrid.innerHTML = `
      <article class="year-month">
        <h3>Geen jaarplanning</h3>
        <p class="meta">Er zijn nog geen agendapunten toegevoegd.</p>
      </article>
    `;
    return;
  }

  if (els.yearAgendaSummary) {
    const firstMonth = months[0].monthLabel;
    const lastMonth = months[months.length - 1].monthLabel;
    els.yearAgendaSummary.textContent = `${state.yearAgendaItems.length} agendapunten · ${months.length} maanden · ${firstMonth} t/m ${lastMonth}`;
  }

  els.yearAgendaGrid.innerHTML = months
    .map(
      (month) => `
        <article class="year-month">
          <h3>${escapeHtml(month.monthLabel)}</h3>
          <div class="year-month-items">
            ${month.items
              .map(
                (item) => `
                  <div class="year-agenda-item">
                    <span class="year-agenda-date">${escapeHtml(item.dayLabel)}</span>
                    <span class="year-agenda-title">${escapeHtml(item.title)}</span>
                    ${
                      state.user?.isAdmin
                        ? `<span class="year-agenda-actions">
                            <button type="button" class="icon-action" data-edit-year-agenda="${item.id}" aria-label="Agendapunt bewerken">Bewerk</button>
                            <button type="button" class="icon-action danger-action" data-delete-year-agenda="${item.id}" aria-label="Agendapunt verwijderen">Verwijder</button>
                          </span>`
                        : ""
                    }
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
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
            ${renderActivityParticipants(activity)}
          </div>
          <div class="activity-actions">
            <button class="secondary" data-register="${activity.id}" ${full && !activity.isRegistered ? "disabled" : ""}>
              ${!state.user ? "Inloggen om in te schrijven" : activity.isRegistered ? "Uitschrijven" : full ? "Vol" : "Inschrijven"}
            </button>
            ${
              state.user?.isAdmin
                ? `<button class="secondary" data-registrations="${activity.id}">Inschrijvingen</button>
                  <button class="secondary" data-export-activity="${activity.id}">Export</button>
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

function renderAdmin() {
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !state.user?.isAdmin));
  renderYearAgenda();
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
  fields.password.required = !member;
  els.memberDialog.showModal();
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
  els.activityDialog.showModal();
}

function openYearAgendaDialog(item = null) {
  els.yearAgendaForm.reset();
  els.yearAgendaDialogTitle.textContent = item ? "Agendapunt wijzigen" : "Nieuw agendapunt";
  const fields = els.yearAgendaForm.elements;
  const nextSortOrder = state.yearAgendaItems.length ? Math.max(...state.yearAgendaItems.map((agendaItem) => agendaItem.sortOrder || 0)) + 1 : 1;
  fields.id.value = item?.id || "";
  fields.monthLabel.value = item?.monthLabel || "";
  fields.monthIndex.value = item?.monthIndex || "";
  fields.dayLabel.value = item?.dayLabel || "";
  fields.sortOrder.value = item?.sortOrder ?? nextSortOrder;
  fields.title.value = item?.title || "";
  els.yearAgendaDialog.showModal();
}

async function showRegistrations(activityId) {
  const { registrations } = await api(`/api/activities/${activityId}/registrations`);
  els.registrationsList.innerHTML = registrations.length
    ? registrations
        .map(
          (member) => `
            <div class="table-row">
              <div>
                <strong>${escapeHtml(member.name)}</strong>
                <p class="meta">${escapeHtml(member.email)} · ${escapeHtml(member.yearLayer)} · ${escapeHtml(member.roleTitle || "Actief")}</p>
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
    ["Naam", "E-mail", "Lichting", "Functie", "Ingeschreven op"],
    ...registrations.map((member) => [
      member.name,
      member.email,
      formatLichting(member.yearLayer),
      member.roleTitle || "Actief",
      member.registeredAt ? formatDate(member.registeredAt) : ""
    ])
  ];
  const safeTitle = String(activity?.title || "activiteit")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  downloadCsv(`inschrijvingen-${safeTitle || "activiteit"}.csv`, rows);
  showToast("Inschrijvingen geexporteerd.");
}

function openLogin() {
  els.loginError.textContent = "";
  els.loginScreen.classList.remove("hidden");
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

els.memberSearch.addEventListener("input", () => loadMembers().catch((error) => showToast(error.message)));
els.memberYearFilter.addEventListener("change", renderMembers);
els.clearMemberFilters.addEventListener("click", () => {
  state.memberStatusFilter = "";
  els.memberYearFilter.value = "";
  renderMemberFilters();
  renderMembers();
});
els.newMemberBtn.addEventListener("click", () => openMemberDialog());
els.newYearAgendaItemBtn.addEventListener("click", () => openYearAgendaDialog());
els.newActivityBtn.addEventListener("click", () => openActivityDialog());

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
    showToast("Profiel opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

document.body.addEventListener("click", async (event) => {
  const navLink = event.target.closest(".site-nav a");
  if (navLink) {
    showPage(navLink.getAttribute("href").replace("#", ""));
  }

  const loginBtn = event.target.closest("[data-open-login]");
  if (loginBtn) return openLogin();

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
    await api(`/api/activities/${activity.id}/register`, { method: activity.isRegistered ? "DELETE" : "POST" });
    await loadActivities();
    renderAdmin();
    return showToast(activity.isRegistered ? `Je bent uitgeschreven voor ${activity.title}.` : `Je bent ingeschreven voor ${activity.title}.`);
  }

  const registrationsBtn = event.target.closest("[data-registrations]");
  if (registrationsBtn) return showRegistrations(registrationsBtn.dataset.registrations);

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
  const data = formJson(els.memberForm);
  const id = data.id;
  if (!data.password) delete data.password;
  await api(id ? `/api/members/${id}` : "/api/members", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(data)
  });
  els.memberDialog.close();
  await refreshPortal();
  showToast("Lid opgeslagen.");
});

els.yearAgendaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formJson(els.yearAgendaForm);
    const id = data.id;
    if (state.yearAgendaUsesLocalData || String(id).startsWith("default-") || String(id).startsWith("local-")) {
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
      state.yearAgendaUsesLocalData = true;
      saveLocalYearAgendaItems(nextItems);
      els.yearAgendaDialog.close();
      renderYearAgenda();
      return showToast("Agendapunt opgeslagen.");
    }
    await api(id ? `/api/year-agenda/${id}` : "/api/year-agenda", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data)
    });
    els.yearAgendaDialog.close();
    await loadYearAgenda();
    showToast("Agendapunt opgeslagen.");
  } catch (error) {
    showToast(error.message);
  }
});

els.activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formJson(els.activityForm);
  const id = data.id;
  await api(id ? `/api/activities/${id}` : "/api/activities", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(data)
  });
  els.activityDialog.close();
  await refreshPortal();
  showToast("Activiteit opgeslagen.");
});

api("/api/session")
  .then(async ({ user }) => {
    if (!user) return setLoggedOut();
    setLoggedIn(user);
    await refreshPortal();
  })
  .catch(async () => {
    setLoggedOut();
  });

window.addEventListener("hashchange", () => {
  if (state.user) showPage();
});
