
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let links = [];
let landingPages = [];
let selectedBioImage = "";
let editingPageId = null;

/* =========================================
   HELPERS
========================================= */

function msg(id, text){
  const el = $(id);
  if(el) el.textContent = text || "";
}

function esc(s=""){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function validURL(value){
  try{
    const u = new URL(value);
    if(["https:","http:"].includes(u.protocol)) return u.href;
  }catch{}
  return "";
}

function phoneKey(phone=""){
  return window.POPER.normalizePhone(phone).replace(/\D/g,"");
}

function makeId(){
  return "p" + Date.now().toString(36) +
    Math.random().toString(36).slice(2,7);
}

function slugify(value=""){
  return value.toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g,"")
    .replace(/\s+/g,"-")
    .replace(/-+/g,"-")
    .slice(0,50);
}

function baseURL(){
  return location.href.split("?")[0].split("#")[0];
}

function pageURL(slug){
  return baseURL() + "?page=" + encodeURIComponent(slug);
}

function setTheme(theme){
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("poper-theme",theme);
}

/* =========================================
   PUBLIC PAGE MODE
========================================= */

async function openPublicPage(slug){
  $("mainApp").hidden = true;
  $("publicPageView").hidden = false;
  $("publicPageError").textContent = "";
  $("publicPageContent").innerHTML = "Memuat halaman...";

  try{
    const page = await window.POPER.getData(`publicPages/${slug}`);

    if(!page || !page.published){
      $("publicPageContent").innerHTML = "";
      $("publicPageError").textContent = "Landing Page tidak ditemukan atau belum dipublikasikan.";
      return;
    }

    renderPublicHTML(page.content || "", $("publicPageContent"));
    document.title = page.title || "POPER Landing Page";
  }catch(error){
    $("publicPageContent").innerHTML = "";
    $("publicPageError").textContent =
      error.message || "Gagal membuka halaman.";
  }
}

function renderPublicHTML(html,container){
  container.innerHTML = html;

  // Link external open in new tab
  container.querySelectorAll("a").forEach(a=>{
    const url = validURL(a.href);
    if(url){
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  });
}

$("publicBack")?.addEventListener("click",()=>{
  location.href = baseURL();
});

const publicSlug = new URLSearchParams(location.search).get("page");

if(publicSlug){
  openPublicPage(publicSlug);
}

/* =========================================
   NAVIGATION
========================================= */

function showTab(name){
  if(publicSlug) return;

  document.querySelectorAll(".section").forEach(section=>{
    section.classList.toggle("active",section.id===name);
  });

  document.querySelectorAll(".nav-btn").forEach(button=>{
    button.classList.toggle("active",button.dataset.tab===name);
  });

  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-tab]").forEach(button=>{
  button.addEventListener("click",()=>{
    showTab(button.dataset.tab);
  });
});

document.querySelectorAll("[data-open-tab]").forEach(button=>{
  button.addEventListener("click",()=>{
    showTab(button.dataset.openTab);
  });
});

/* =========================================
   AUTH
========================================= */

function loginUI(user){
  if(publicSlug) return;

  $("loginPanel").hidden = !user;
  $("dashboard").hidden = !user;
  $("bottomNav").hidden = !user;
  $("logoutBtn").hidden = !user;

  if(!user) return;

  $("welcome").textContent = "Halo, pengguna POPER!";
  $("myPhone").textContent = user.phoneNumber || "";

  loadAll();
}

$("sendOtpBtn")?.addEventListener("click",async()=>{
  const phone = $("phoneInput").value.trim();

  if(!phone){
    msg("authStatus","Masukkan nomor HP.");
    return;
  }

  try{
    msg("authStatus","Mengirim OTP...");
    confirmation = await window.POPER.sendOTP(phone);
    $("otpSection").hidden = false;
    msg("authStatus","OTP telah dikirim.");
  }catch(e){
    msg("authStatus",e.message || "OTP gagal dikirim.");
    try{window.POPER.resetRecaptcha();}catch{}
  }
});

$("verifyOtpBtn")?.addEventListener("click",async()=>{
  const code = $("otpInput").value.trim();

  if(!confirmation || !code){
    msg("authStatus","Masukkan kode OTP.");
    return;
  }

  try{
    const result = await confirmation.confirm(code);
    loginUI(result.user);
    msg("authStatus","Login berhasil.");
  }catch(e){
    msg("authStatus",e.message || "OTP salah.");
  }
});

$("logoutBtn")?.addEventListener("click",async()=>{
  await window.POPER.logout();
});

window.POPER.onAuth(user=>{
  loginUI(user);
});

/* =========================================
   BIO LINKS - MULTI
========================================= */

$("bioImage")?.addEventListener("change",async e=>{
  const file = e.target.files?.[0];
  if(!file) return;

  if(file.size > 1024*1024*2){
    msg("bioStatus","Gambar maksimal 2MB.");
    e.target.value="";
    return;
  }

  selectedBioImage = await imageToDataURL(file);

  $("bioImagePreview").src = selectedBioImage;
  $("bioImagePreview").hidden = false;
});

$("clearBioImage")?.addEventListener("click",()=>{
  selectedBioImage = "";
  $("bioImage").value = "";
  $("bioImagePreview").hidden = true;
  $("bioImagePreview").src = "";
});

function imageToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$("addBioLink")?.addEventListener("click",()=>{
  const title = $("bioTitle").value.trim();
  const url = validURL($("bioUrl").value.trim());

  if(!title || !url){
    msg("bioStatus","Isi nama tombol dan URL valid.");
    return;
  }

  links.push({
    id:makeId(),
    title,
    url,
    image:selectedBioImage,
    wiggle:$("bioWiggle").checked
  });

  $("bioTitle").value="";
  $("bioUrl").value="";
  $("bioWiggle").checked=false;
  selectedBioImage="";
  $("bioImage").value="";
  $("bioImagePreview").hidden=true;

  renderBioLinks();
});

function renderBioLinks(){
  const container = $("bioLinks");
  if(!container) return;

  container.innerHTML = links.map((link,i)=>`
    <div class="item">
      <div class="link-preview">
        ${link.image ? `<img src="${link.image}" alt="">` : ""}
        <div class="link-preview-info">
          <strong>${esc(link.title)}</strong>
          <small>${esc(link.url)}</small>
          <small>${link.wiggle?"✨ Goyang":"◻ Diam"}</small>
        </div>
      </div>
      <div class="item-actions" style="margin-top:10px">
        <button class="secondary" data-up="${i}">↑</button>
        <button class="secondary" data-down="${i}">↓</button>
        <button class="secondary" data-toggle="${i}">
          ${link.wiggle?"Matikan Goyang":"Aktifkan Goyang"}
        </button>
        <button class="secondary danger" data-del="${i}">Hapus</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick=()=>{
      links.splice(Number(b.dataset.del),1);
      renderBioLinks();
    };
  });

  container.querySelectorAll("[data-up]").forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.up);
      if(i>0){
        [links[i-1],links[i]]=[links[i],links[i-1]];
        renderBioLinks();
      }
    };
  });

  container.querySelectorAll("[data-down]").forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.down);
      if(i<links.length-1){
        [links[i+1],links[i]]=[links[i],links[i+1]];
        renderBioLinks();
      }
    };
  });

  container.querySelectorAll("[data-toggle]").forEach(b=>{
    b.onclick=()=>{
      links[Number(b.dataset.toggle)].wiggle =
        !links[Number(b.dataset.toggle)].wiggle;
      renderBioLinks();
    };
  });
}

/* =========================================
   LANDING PAGE BIO DISPLAY SETTINGS
========================================= */

function renderBioLandingList(){
  const container = $("bioLandingList");
  if(!container) return;

  const visiblePages = landingPages.filter(p=>p.published);

  if(!visiblePages.length){
    container.innerHTML="<p>Belum ada Landing Page yang dipublikasikan.</p>";
    return;
  }

  container.innerHTML = visiblePages.map(p=>`
    <label class="check-row">
      <input type="checkbox"
        data-page-bio="${esc(p.id)}"
        ${p.showInBio?"checked":""}>
      ${esc(p.title)}
    </label>
  `).join("");

  container.querySelectorAll("[data-page-bio]").forEach(c=>{
    c.onchange=()=>{
      const page=landingPages.find(p=>p.id===c.dataset.pageBio);
      if(page) page.showInBio=c.checked;
    };
  });
}

/* =========================================
   SAVE BIO
========================================= */

$("saveBio")?.addEventListener("click",async()=>{
  const user=auth.currentUser;
  if(!user) return;

  try{
    const bio={
      name:$("bioName").value.trim(),
      description:$("bioDesc").value.trim(),
      phone:user.phoneNumber||"",
      links,
      landingPages:landingPages
        .filter(p=>p.published && p.showInBio)
        .map(p=>({
          id:p.id,
          title:p.title,
          slug:p.slug,
          wiggle:p.wiggle||false
        })),
      updatedAt:Date.now()
    };

    await window.POPER.saveData(`users/${user.uid}/publicBio`,bio);
    await window.POPER.saveData(
      `phoneLookup/${phoneKey(user.phoneNumber)}`,
      {uid:user.uid,phone:user.phoneNumber}
    );

    msg("bioStatus","Bio berhasil disimpan!");
  }catch(e){
    msg("bioStatus",e.message||"Gagal menyimpan Bio.");
  }
});

async function loadBio(){
  const user=auth.currentUser;
  if(!user) return;

  const data=await window.POPER.getData(`users/${user.uid}/publicBio`);
  if(!data) return;

  $("bioName").value=data.name||"";
  $("bioDesc").value=data.description||"";
  links=Array.isArray(data.links)?data.links:[[];

  // Backward compatibility with old data format
  links=links.map(link=>({
    id:link.id||makeId(),
    title:link.title||"",
    url:link.url||"",
    image:link.image||"",
    wiggle:!!link.wiggle
  }));

  renderBioLinks();
}

/* =========================================
   LANDING PAGE EDITOR
========================================= */

$("pageTitle")?.addEventListener("input",()=>{
  if(!$("pageSlug").dataset.manual){
    $("pageSlug").value=slugify($("pageTitle").value);
  }
});

$("pageSlug")?.addEventListener("input",()=>{
  $("pageSlug").dataset.manual="1";
});

$("pageMode")?.addEventListener("change",()=>{
  const visual=$("pageMode").value==="visual";
  $("visualEditorArea").hidden=!visual;
  $("htmlEditorArea").hidden=visual;
});

document.querySelectorAll("[data-format]").forEach(button=>{
  button.addEventListener("click",()=>{
    $("visualEditor").focus();
    document.execCommand(button.dataset.format,false,null);
  });
});

$("insertLink")?.addEventListener("click",()=>{
  const url=prompt("Masukkan URL link:");
  if(url && validURL(url)){
    $("visualEditor").focus();
    document.execCommand("createLink",false,url);
  }
});

function getEditorContent(){
  if($("pageMode").value==="html"){
    return $("htmlEditor").value;
  }
  return $("visualEditor").innerHTML;
}

function setEditorContent(mode,content){
  $("pageMode").value=mode;
  $("visualEditorArea").hidden=mode!=="visual";
  $("htmlEditorArea").hidden=mode!=="html";

  if(mode==="html"){
    $("htmlEditor").value=content||"";
  }else{
    $("visualEditor").innerHTML=content||"";
  }
}

function previewHTML(html){
  const frame=$("pagePreview");
  const doc=frame.contentDocument;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body{font-family:Arial,sans-serif;padding:16px;margin:0;color:#222}
        img{max-width:100%;height:auto}
        a{color:#6655dd}
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  doc.close();
}

$("previewPage")?.addEventListener("click",()=>{
  previewHTML(getEditorContent());
});

/* =========================================
   SAVE LANDING PAGE
========================================= */

$("savePage")?.addEventListener("click",async()=>{
  const user=auth.currentUser;
  if(!user) return;

  const title=$("pageTitle").value.trim();
  const slug=slugify($("pageSlug").value.trim()||title);
  const content=getEditorContent();

  if(!title || !slug || !content.trim()){
    msg("pageStatus","Isi judul, slug, dan konten halaman.");
    return;
  }

  if(landingPages.some(p=>p.slug===slug && p.id!==editingPageId)){
    msg("pageStatus","Slug sudah digunakan. Buat nama link yang berbeda.");
    return;
  }

  const page={
    id:editingPageId||makeId(),
    title,
    slug,
    mode:$("pageMode").value,
    content,
    showInBio:$("pageShowInBio").checked,
    wiggle:false,
    published:true,
    updatedAt:Date.now()
  };

  try{
    // Save private owner's page collection
    const index=landingPages.findIndex(p=>p.id===page.id);
    if(index>=0) landingPages[index]=page;
    else landingPages.push(page);

    await window.POPER.saveData(
      `users/${user.uid}/landingPages/${page.id}`,
      page
    );

    // Public page entry
    await window.POPER.saveData(
      `publicPages/${page.slug}`,
      {
        title:page.title,
        content:page.content,
        owner: user.uid,
        published:true,
        updatedAt:page.updatedAt
      }
    );

    renderPages();
    renderBioLandingList();
    msg("pageStatus","Landing Page berhasil disimpan!");

    resetPageEditor();
  }catch(error){
    msg("pageStatus",
      "Gagal menyimpan. Periksa Firebase Rules: "+(error.message||""));
  }
});

function resetPageEditor(){
  editingPageId=null;
  $("pageTitle").value="";
  $("pageSlug").value="";
  delete $("pageSlug").dataset.manual;
  $("pageMode").value="visual";
  $("visualEditor").innerHTML="";
  $("htmlEditor").value="";
  $("pageShowInBio").checked=true;
  $("visualEditorArea").hidden=false;
  $("htmlEditorArea").hidden=true;
}

/* =========================================
   PAGE COLLECTION
========================================= */

function renderPages(){
  const container=$("pagesList");
  if(!container) return;

  if(!landingPages.length){
    container.innerHTML="<p>Belum ada Landing Page.</p>";
    return;
  }

  container.innerHTML=landingPages.map(page=>`
    <div class="page-card">
      <h3>${esc(page.title)}</h3>
      <small>Link: ${esc(page.slug)}</small>
      <small>Status: ${page.published?"Publik":"Draft"}</small>
      <small>Bio: ${page.showInBio?"Ditampilkan":"Disembunyikan"}</small>

      <div class="page-actions">
        <button class="secondary" data-copy="${esc(page.slug)}">Copy Link</button>
        <button class="secondary" data-open="${esc(page.slug)}">Buka</button>
        <button class="secondary" data-edit="${esc(page.id)}">Edit</button>
        <button class="secondary danger" data-delete="${esc(page.id)}">Hapus</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-copy]").forEach(b=>{
    b.onclick=()=>{
      const link=pageURL(b.dataset.copy);
      navigator.clipboard.writeText(link)
        .then(()=>alert("Link disalin:\n"+link))
        .catch(()=>prompt("Salin link ini:",link));
    };
  });

  container.querySelectorAll("[data-open]").forEach(b=>{
    b.onclick=()=>window.open(pageURL(b.dataset.open),"_blank");
  });

  container.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick=()=>{
      const p=landingPages.find(x=>x.id===b.dataset.edit);
      if(!p) return;

      editingPageId=p.id;
      $("pageTitle").value=p.title;
      $("pageSlug").value=p.slug;
      delete $("pageSlug").dataset.manual;
      $("pageMode").value=p.mode||"visual";
      $("pageShowInBio").checked=!!p.showInBio;

      setEditorContent(p.mode||"visual",p.content||"");
      showTab("pages");
      previewHTML(p.content||"");
    };
  });

  container.querySelectorAll("[data-delete]").forEach(b=>{
    b.onclick=async()=>{
      if(!confirm("Hapus Landing Page ini?")) return;

      const user=auth.currentUser;
      const p=landingPages.find(x=>x.id===b.dataset.delete);
      if(!p) return;

      try{
        await window.POPER.deleteData(`users/${user.uid}/landingPages/${p.id}`);
        await window.POPER.deleteData(`publicPages/${p.slug}`);

        landingPages=landingPages.filter(x=>x.id!==p.id);
        renderPages();
        renderBioLandingList();
      }catch(e){
        alert("Gagal menghapus: "+e.message);
      }
    };
  });
}

/* =========================================
   PUBLIC BIO VIEW
========================================= */

function publicBioHTML(bio){
  const bioLinks=(bio.links||[]).map(link=>{
    const url=validURL(link.url);
    if(!url) return "";
    return `
      <a class="bio-button ${link.wiggle?"wiggle":""}"
         href="${esc(url)}" target="_blank" rel="noopener">
         ${link.image?`<img src="${link.image}" alt="">`:""}
         ${esc(link.title)}
      </a>
    `;
  }).join("");

  const pages=(bio.landingPages||[]).map(page=>`
    <a class="bio-button ${page.wiggle?"wiggle":""}"
       href="${pageURL(page.slug)}">
       🌐 ${esc(page.title)}
    </a>
  `).join("");

  return `
    <div style="max-width:550px;margin:20px auto;padding:18px">
      <div style="text-align:center">
        <h1>${esc(bio.name||"POPER User")}</h1>
        <p>${esc(bio.description||"")}</p>
      </div>
      ${bioLinks}
      ${pages}
    </div>
  `;
}

$("openMyPublicBio")?.addEventListener("click",async()=>{
  const user=auth.currentUser;
  if(!user) return;

  try{
    const bio=await window.POPER.getData(`users/${user.uid}/publicBio`);
    if(!bio){
      alert("Simpan Bio terlebih dahulu.");
      return;
    }

    const win=window.open("","_blank");
    if(!win){
      alert("Browser memblokir popup. Izinkan popup untuk preview.");
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${esc(bio.name)}</title>
      <style>
      body{margin:0;font-family:Arial;background:#f3f4f8;color:#222}
      .bio-button{display:flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;padding:15px;margin:10px 0;background:#7357ef;color:#fff;border-radius:15px;font-weight:bold}
      .bio-button img{max-width:60px;max-height:40px;object-fit:contain}
      .wiggle{animation:w .8s infinite}
      @keyframes w{0%,100%{transform:rotate(0)}25%{transform:rotate(-2deg)}75%{transform:rotate(2deg)}}
      </style></head><body>${publicBioHTML(bio)}</body></html>
    `);
    win.document.close();
  }catch(e){
    alert(e.message||"Gagal membuka bio.");
  }
});

/* =========================================
   FIND BIO BY PHONE
========================================= */

$("findBio")?.addEventListener("click",async()=>{
  const phone=$("findPhone").value.trim();
  const container=$("findResult");
  container.innerHTML="Mencari...";

  if(!phone){
    container.textContent="Masukkan nomor HP.";
    return;
  }

  try{
    const lookup=await window.POPER.getData(`phoneLookup/${phoneKey(phone)}`);
    if(!lookup?.uid){
      container.innerHTML="<div class='item'>Bio tidak ditemukan.</div>";
      return;
    }

    const bio=await window.POPER.getData(`users/${lookup.uid}/publicBio`);
    if(!bio){
      container.textContent="Bio belum tersedia.";
      return;
    }

    container.innerHTML=publicBioHTML(bio);
  }catch(e){
    container.textContent=e.message||"Gagal mencari Bio.";
  }
});

/* =========================================
   QR VAULT
========================================= */

$("saveQR")?.addEventListener("click",async()=>{
  const user=auth.currentUser;
  if(!user) return;

  const name=$("qrName").value.trim()||"QR Link";
  const url=validURL($("qrUrl").value.trim());

  if(!url){
    msg("qrScanStatus","Masukkan URL valid.");
    return;
  }

  try{
    await window.POPER.pushData(`qrVault/${user.uid}`,{
      name,url,createdAt:Date.now()
    });
    $("qrName").value="";
    $("qrUrl").value="";
    msg("qrScanStatus","QR Link berhasil disimpan.");
    loadQR();
  }catch(e){
    msg("qrScanStatus",e.message||"Gagal.");
  }
});

async function loadQR(){
  const user=auth.currentUser;
  if(!user) return;

  const data=await window.POPER.getData(`qrVault/${user.uid}`);
  const container=$("qrList");
  if(!container) return;

  if(!data){
    container.innerHTML="<p>Vault kosong.</p>";
    return;
  }

  container.innerHTML=Object.entries(data).map(([key,item])=>`
    <div class="item">
      <strong>${esc(item.name)}</strong>
      <p>${esc(item.url)}</p>
      <a href="${esc(validURL(item.url))}" target="_blank">Buka</a>
      <button class="secondary danger" data-qr-del="${esc(key)}">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-qr-del]").forEach(b=>{
    b.onclick=async()=>{
      await window.POPER.deleteData(`qrVault/${user.uid}/${b.dataset.qrDel}`);
      loadQR();
    };
  });
}

/* =========================================
   NOTES
========================================= */

$("saveNote")?.addEventListener("click",async()=>{
  const user=auth.currentUser;
  if(!user) return;

  const title=$("noteTitle").value.trim();
  const content=$("noteContent").value.trim();

  if(!title||!content){
    alert("Isi judul dan catatan.");
    return;
  }

  try{
    await window.POPER.pushData(`notes/${user.uid}`,{
      title,content,createdAt:Date.now()
    });
    $("noteTitle").value="";
    $("noteContent").value="";
    loadNotes();
  }catch(e){
    alert(e.message||"Gagal menyimpan.");
  }
});

async function loadNotes(){
  const user=auth.currentUser;
  if(!user) return;

  const data=await window.POPER.getData(`notes/${user.uid}`);
  const container=$("notesList");

  if(!data){
    container.innerHTML="<p>Belum ada catatan.</p>";
    return;
  }

  container.innerHTML=Object.entries(data).map(([key,note])=>`
    <div class="item">
      <strong>${esc(note.title)}</strong>
      <p>${esc(note.content)}</p>
      <button class="secondary danger" data-note-del="${esc(key)}">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-note-del]").forEach(b=>{
    b.onclick=async()=>{
      await window.POPER.deleteData(`notes/${user.uid}/${b.dataset.noteDel}`);
      loadNotes();
    };
  });
}

/* =========================================
   LOAD ALL
========================================= */

async function loadPages(){
  const user=auth.currentUser;
  if(!user) return;

  const data=await window.POPER.getData(`users/${user.uid}/landingPages`);
  landingPages=data?Object.values(data):[];

  renderPages();
  renderBioLandingList();
}

async function loadAll(){
  const user=auth.currentUser;
  if(!user) return;

  try{
    await Promise.allSettled([
      loadBio(),
      loadQR(),
      loadNotes(),
      loadPages()
    ]);
  }catch(e){
    console.error(e);
  }
}

console.log("POPER Bio Link & Landing Page Studio siap.");
