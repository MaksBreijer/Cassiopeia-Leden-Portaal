const state = {
  user: null,
  members: [],
  activities: []
};

const API_BASE = location.protocol === "file:" || location.port === "5500" ? "http://127.0.0.1:3000" : "";

const els = {
  siteHeader: document.querySelector(".site-header"),
  appMain: document.querySelector("main"),
  menuToggle: document.querySelector("#menuToggle"),
  logoutBtn: document.querySelector("#logoutBtn"),
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  loginError: document.querySelector("#loginError"),
  memberSearch: document.querySelector("#memberSearch"),
  loggedOutMembers: document.querySelector("#loggedOutMembers"),
  memberGrid: document.querySelector("#memberGrid"),
  memberDetail: document.querySelector("#memberDetail"),
  publicActivityList: document.querySelector("#publicActivityList"),
  profileForm: document.querySelector("#profileForm"),
  profileAvatar: document.querySelector("#profileAvatar"),
  headerProfileAvatar: document.querySelector("#headerProfileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileEmail: document.querySelector("#profileEmail"),
  newMemberBtn: document.querySelector("#newMemberBtn"),
  newActivityBtn: document.querySelector("#newActivityBtn"),
  memberDialog: document.querySelector("#memberDialog"),
  memberForm: document.querySelector("#memberForm"),
  memberDialogTitle: document.querySelector("#memberDialogTitle"),
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

function sharedActivityId() {
  const id = new URLSearchParams(window.location.search).get("activity");
  return id && /^\d+$/.test(id) ? id : "";
}

function activityShareUrl(activityId) {
  const url = new URL(window.location.href);
  url.searchParams.set("activity", activityId);
  url.hash = "activiteiten";
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
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !user.isAdmin));
}

function setLoggedOut() {
  state.user = null;
  document.body.classList.remove("is-authenticated");
  state.members = [];
  state.activities = [];
  els.loginScreen.classList.remove("hidden");
  els.siteHeader.classList.add("hidden");
  els.appMain.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  els.loggedOutMembers.classList.add("hidden");
  els.memberGrid.classList.remove("hidden");
  els.memberDetail.classList.add("hidden");
  closeMobileMenu();
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.add("hidden"));
  renderPublicActivities();
  renderMembers();
}

async function refreshPortal() {
  await Promise.all([loadMembers(), loadActivities()]);
  focusSharedActivity();
}

async function loadMembers() {
  const query = encodeURIComponent(els.memberSearch.value || "");
  const data = await api(`/api/members?q=${query}`);
  state.members = data.members;
  renderMembers();
}

function renderMembers() {
  els.memberGrid.innerHTML = state.members
    .map(
      (member) => `
        <article class="member-card">
          <button class="member-card-main" data-member-id="${member.id}">
            <div class="avatar">${avatarHtml(member)}</div>
            <div>
              <h3>${escapeHtml(member.name)}</h3>
              <p class="meta">${escapeHtml(member.yearLayer)} · ${escapeHtml(member.roleTitle || "Lid")}</p>
            </div>
            ${member.isAdmin ? '<span class="badge">Admin</span>' : ""}
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
  const { member } = await api(`/api/members/${id}`);
  els.memberDetail.innerHTML = `
    <div class="detail-hero">
      <div class="avatar">${avatarHtml(member)}</div>
      <div>
        <p class="eyebrow">${member.isAdmin ? "Admin" : "Lidprofiel"}</p>
        <h2>${escapeHtml(member.name)}</h2>
        <p class="meta">${escapeHtml(member.yearLayer)} · ${escapeHtml(member.roleTitle || "Lid")}</p>
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

async function loadActivities() {
  const data = await api("/api/activities");
  state.activities = data.activities;
  renderPublicActivities();
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
          </div>
          <div class="activity-actions">
            <button class="secondary" data-register="${activity.id}" ${full && !activity.isRegistered ? "disabled" : ""}>
              ${!state.user ? "Inloggen om in te schrijven" : activity.isRegistered ? "Uitschrijven" : full ? "Vol" : "Inschrijven"}
            </button>
            ${
              state.user?.isAdmin
                ? `<button class="secondary" data-registrations="${activity.id}">Inschrijvingen</button>
                  <button class="secondary" data-share-activity="${activity.id}">Deel link</button>
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
}

function openMemberDialog(member = null) {
  els.memberForm.reset();
  els.memberDialogTitle.textContent = member ? "Lid wijzigen" : "Nieuw lid";
  const fields = els.memberForm.elements;
  fields.id.value = member?.id || "";
  fields.name.value = member?.name || "";
  fields.email.value = member?.email || "";
  fields.yearLayer.value = member?.yearLayer || "";
  fields.roleTitle.value = member?.roleTitle || "";
  fields.phone.value = member?.phone || "";
  fields.address.value = member?.address || "";
  fields.avatar.value = member?.avatar || "";
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

async function showRegistrations(activityId) {
  const { registrations } = await api(`/api/activities/${activityId}/registrations`);
  els.registrationsList.innerHTML = registrations.length
    ? registrations
        .map(
          (member) => `
            <div class="table-row">
              <div>
                <strong>${escapeHtml(member.name)}</strong>
                <p class="meta">${escapeHtml(member.email)} · ${escapeHtml(member.yearLayer)} · ${escapeHtml(member.roleTitle || "Lid")}</p>
              </div>
            </div>
          `
        )
        .join("")
    : '<p class="meta">Nog niemand heeft zich ingeschreven.</p>';
  els.registrationsDialog.showModal();
}

function openLogin() {
  els.loginError.textContent = "";
  els.loginScreen.classList.remove("hidden");
}

function readProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!file.type.startsWith("image/")) return reject(new Error("Kies een afbeelding."));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Kies een afbeelding van maximaal 5 MB."));
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("De afbeelding kon niet gelezen worden.")));
    reader.readAsDataURL(file);
  });
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
els.newMemberBtn.addEventListener("click", () => openMemberDialog());
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
    if (!focusSharedActivity()) document.querySelector("#activiteiten").scrollIntoView({ behavior: "smooth" });
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
  if (navLink) closeMobileMenu();

  const loginBtn = event.target.closest("[data-open-login]");
  if (loginBtn) return openLogin();

  const closeBtn = event.target.closest("[data-close]");
  if (closeBtn) return closeBtn.closest("dialog").close();

  const memberCard = event.target.closest("[data-member-id]");
  if (memberCard) return showMemberDetail(memberCard.dataset.memberId).catch((error) => showToast(error.message));

  const registerBtn = event.target.closest("[data-register]");
  if (registerBtn) {
    if (!state.user) return openLogin();
    const activity = state.activities.find((item) => item.id === Number(registerBtn.dataset.register));
    await api(`/api/activities/${activity.id}/register`, { method: activity.isRegistered ? "DELETE" : "POST" });
    await loadActivities();
    renderAdmin();
    return showToast(activity.isRegistered ? "Je bent uitgeschreven." : "Je bent ingeschreven.");
  }

  const registrationsBtn = event.target.closest("[data-registrations]");
  if (registrationsBtn) return showRegistrations(registrationsBtn.dataset.registrations);

  const shareActivityBtn = event.target.closest("[data-share-activity]");
  if (shareActivityBtn) {
    const url = activityShareUrl(shareActivityBtn.dataset.shareActivity);
    try {
      await navigator.clipboard.writeText(url);
      return showToast("Activiteitlink gekopieerd.");
    } catch (error) {
      window.prompt("Kopieer deze link:", url);
      return;
    }
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
