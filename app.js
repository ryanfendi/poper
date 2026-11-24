
/* =================================
   POPER APP — CORE V1
================================= */

const STORAGE_KEY = "poper_v1";

let data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
  profile: {
    name: "",
    username: "",
    bio: "",
    phone: ""
  },
  links: [],
  pages: [],
  notes: []
};

/* SAVE DATA */

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* NAVIGATION */

function navigate(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const target = document.getElementById(pageId);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.remove("active");
  });

  const nav = document.querySelector(
    `.nav-item[onclick="navigate('${pageId}')"]`
  );

  if (nav) nav.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* PROFILE */

function saveProfile() {
  data.profile.name =
    document.getElementById("nameInput").value.trim();

  data.profile.username =
    document.getElementById("usernameInput").value
      .trim()
      .replace(/^@/, "");

  data.profile.bio =
    document.getElementById("bioInput").value.trim();

  saveData();
  renderProfile();

  alert("Profil berhasil disimpan!");
}

function renderProfile() {
  const profile = data.profile;

  document.getElementById("nameInput").value = profile.name || "";
  document.getElementById("usernameInput").value = profile.username || "";
  document.getElementById("bioInput").value = profile.bio || "";

  const display = document.getElementById("displayNumber");

  if (profile.phone) {
    display.textContent = profile.phone;
  } else if (profile.username) {
    display.textContent = "@" + profile.username;
  } else if (profile.name) {
    display.textContent = profile.name;
  } else {
    display.textContent = "Belum terdaftar";
  }
}

/* BIOLINK */

function addLink() {
  const title = document.getElementById("linkTitle").value.trim();
  let url = document.getElementById("linkUrl").value.trim();

  if (!title || !url) {
    alert("Isi nama link dan URL terlebih dahulu.");
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      alert("URL tidak valid.");
      return;
    }
  } catch {
    alert("URL tidak valid.");
    return;
  }

  data.links.push({
    id: Date.now(),
    title,
    url
  });

  saveData();

  document.getElementById("linkTitle").value = "";
  document.getElementById("linkUrl").value = "";

  renderLinks();
}

function deleteLink(id) {
  data.links = data.links.filter(link => link.id !== id);
  saveData();
  renderLinks();
}

function renderLinks() {
  const container = document.getElementById("linksList");
  container.innerHTML = "";

  data.links.forEach(link => {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("h4");
    title.textContent = link.title;

    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.url;

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Hapus link";
    remove.onclick = () => deleteLink(link.id);

    item.append(title, anchor, remove);
    container.appendChild(item);
  });
}

/* PAGES */

function addPage() {
  const title = document.getElementById("pageTitle").value.trim();
  const description =
    document.getElementById("pageDescription").value.trim();

  if (!title || !description) {
    alert("Isi judul dan konten halaman.");
    return;
  }

  data.pages.push({
    id: Date.now(),
    title,
    description
  });

  saveData();

  document.getElementById("pageTitle").value = "";
  document.getElementById("pageDescription").value = "";

  renderPages();
}

function deletePage(id) {
  data.pages = data.pages.filter(page => page.id !== id);
  saveData();
  renderPages();
}

function renderPages() {
  const container = document.getElementById("pagesList");
  container.innerHTML = "";

  data.pages.forEach(page => {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("h4");
    title.textContent = page.title;

    const description = document.createElement("p");
    description.textContent = page.description;

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Hapus halaman";
    remove.onclick = () => deletePage(page.id);

    item.append(title, description, remove);
    container.appendChild(item);
  });
}

/* NOTES */

function addNote() {
  const title = document.getElementById("noteTitle").value.trim();
  const content = document.getElementById("noteContent").value.trim();

  if (!title || !content) {
    alert("Isi judul dan catatan terlebih dahulu.");
    return;
  }

  data.notes.push({
    id: Date.now(),
    title,
    content,
    date: new Date().toLocaleDateString("id-ID")
  });

  saveData();

  document.getElementById("noteTitle").value = "";
  document.getElementById("noteContent").value = "";

  renderNotes();
}

function deleteNote(id) {
  data.notes = data.notes.filter(note => note.id !== id);
  saveData();
  renderNotes();
}

function renderNotes() {
  const container = document.getElementById("notesList");
  container.innerHTML = "";

  data.notes.forEach(note => {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("h4");
    title.textContent = note.title;

    const date = document.createElement("p");
    date.textContent = note.date;

    const content = document.createElement("p");
    content.textContent = note.content;

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Hapus catatan";
    remove.onclick = () => deleteNote(note.id);

    item.append(title, date, content, remove);
    container.appendChild(item);
  });
}

/* PROFILE BUTTON */

document.getElementById("profileBtn").onclick = () => {
  navigate("profile");
};

/* INITIALIZATION */

function initApp() {
  renderProfile();
  renderLinks();
  renderPages();
  renderNotes();
}

initApp();
