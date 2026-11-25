
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let links = [];
let landingPages = [];
let selectedBioImage = "";
let editingPageId = null;
let scanFile = null;
let loadingAll = false;

const defaultBioColors = {
  bg:"#f3f0ff",
  text:"#25243a",
  button:"#6d5dfc",
  buttonText:"#ffffff"
};

/* =========================
HELPERS
========================= */

function msg(id,text){
  const el=$(id);
  if(el) el.textContent=text||"";
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

function safeId(id){
  return typeof id==="string" && id.trim()!=="";
}

function validURL(value){
  try{
    const u=new URL(value);
    if(u.protocol==="https:"||u.protocol==="http:"){
      return u.href;
    }
  }catch{}
  return "";
}

function normalizePhone(phone=""){
  return window.POPER.normalizePhone(phone);
}

function phoneKey(phone=""){
  return normalizePhone(phone).replace(/\D/g,"");
}

function makeId(){
  return "p"+Date.now().toString(36)+
    Math.random().toString(36).slice(2,8);
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
  return baseURL()+"?page="+encodeURIComponent(slug);
}

function setTheme(theme){
  document.documentElement.dataset.theme=theme;
  localStorage.setItem("poper-theme",theme);
  $("themeBtn").textContent=theme==="dark"?"☀️":"🌙";
}

const savedTheme=localStorage.getItem("poper-theme");
setTheme(savedTheme||"light");

$("themeBtn").onclick=()=>{
  const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
  setTheme(next);
};

/* =========================
NAVIGATION
========================= */

function showTab(name){
  document.querySelectorAll(".section").forEach(s=>{
    s.classList.toggle("active",s.id===name);
  });

  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.classList.toggle("active",b.dataset.tab===name);
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

/* =========================
PUBLIC LANDING PAGE
========================= */

const publicSlug=new URLSearchParams(location.search).get("page");

async function openPublicPage(slug){
  $("mainApp").hidden=true;
  $("publicPageView").hidden=false;
  $("publicPageContent").innerHTML="Memuat halaman...";
  $("publicPageTitle").textContent="";
  $("publicPageError").textContent="";

  try{
    const page=await window.POPER.getData(`publicPages/${slug}`);

    if(!page||!page.published){
      $("publicPageContent").innerHTML="";
      $("publicPageError").textContent=
        "Landing Page tidak ditemukan atau belum dipublikasikan.";
      return;
    }

    $("publicPageTitle").textContent=page.title||"Landing Page";
    renderPublicHTML(page.content||"", $("publicPageContent"));
    document.title=page.title||"POPER Landing Page";
  }catch(e){
    $("publicPageContent").innerHTML="";
    $("publicPageError").textContent=e.message||"Gagal membuka halaman.";
  }
}

function renderPublicHTML(html,container){
  container.innerHTML=html;

  container.querySelectorAll("a").forEach(a=>{
    const url=validURL(a.href);
    if(url){
      a.target="_blank";
      a.rel="noopener noreferrer";
    }
  });
}

$("publicBack").onclick=()=>{
  location.href=baseURL();
};

if(publicSlug){
  openPublicPage(publicSlug);
  $("mainApp").hidden=true;
  $("publicPageView").hidden=false;
  $("loginPanel").hidden=true;
  $("bottomNav").hidden=true;
}

/* =========================
AUTH
========================= */

function loginUI(user){
  if(publicSlug)return;

  const logged=!!user;

  $("loginPanel").hidden=logged;
  $("dashboard").hidden=!logged;
  $("bottomNav").hidden=!logged;
  $("logoutBtn").hidden=!logged;
  $("loginOpenBtn").hidden=logged;

  if(!logged)return;

  $("welcome").textContent="Halo, pengguna POPER!";
  $("myPhone").textContent=user.phoneNumber||"";
  showTab("home");

  loadAll();
}

$("loginOpenBtn").onclick=()=>{
  $("loginPanel").hidden=false;
  $("loginPanel").scrollIntoView({behavior:"smooth"});
};

$("sendOtpBtn").onclick=async()=>{
  const phone=$("phoneInput").value.trim();

  if(!phone){
    msg("authStatus","Masukkan nomor HP.");
    return;
  }

  try{
    msg("authStatus","Mengirim OTP...");
    confirmation=await window.POPER.sendOTP(phone);
    $("otpSection").hidden=false;
    msg("authStatus","OTP berhasil dikirim. Periksa SMS kamu.");
  }catch(e){
    msg("authStatus",e.message||"OTP gagal.");
    try{await window.POPER.resetRecaptcha();}catch{}
  }
};

$("verifyOtpBtn").onclick=async()=>{
  const code=$("otpInput").value.trim();

  if(!confirmation||!code){
    msg("authStatus","Masukkan kode OTP.");
    return;
  }

  try{
    const result=await confirmation.confirm(code);
    confirmation=null;
    loginUI(result.user);
    msg("authStatus","Login berhasil.");
  }catch(e){
    msg("authStatus",e.message||"Kode OTP salah.");
  }
};

$("logoutBtn").onclick=async()=>{
  await window.POPER.logout();
};

window.POPER.onAuth(user=>{
  loginUI(user);
});

/* =========================
PHONE SCANNER
========================= */

$("scanImage").onchange=e=>{
  const file=e.target.files?.[0];
  if(!file)return;

  if(file.size>8*1024*1024){
    msg("scanStatus","Ukuran gambar maksimal 8MB.");
    e.target.value="";
    scanFile=null;
    return;
  }

  scanFile=file;
  $("scanImagePreview").src=URL.createObjectURL(file);
  $("scanImagePreview").hidden=false;
  msg("scanStatus","Gambar siap dipindai.");
};

function extractPhone(text){
  const candidates=String(text||"")
    .replace(/[Oo]/g,"0")
    .match(/(?:\+?62|0)\s*[\d\s().-]{7,18}/g)||[];

  const cleaned=candidates.map(raw=>{
    let digits=raw.replace(/\D/g,"");
    if(digits.startsWith("62"))digits="0"+digits.slice(2);
    return digits;
  });

  return cleaned.find(n=>/^08\d{8,13}$/.test(n))||"";
}

$("detectPhoneBtn").onclick=async()=>{
  if(!scanFile){
    msg("scanStatus","Pilih atau unggah gambar terlebih dahulu.");
    return;
  }

  if(!window.Tesseract){
    msg("scanStatus","OCR belum siap. Refresh halaman.");
    return;
  }

  try{
    msg("scanStatus","Memproses gambar...");

    const result=await Tesseract.recognize(
      scanFile,
      "eng",
      {
        logger:m=>{
          if(m.status==="recognizing text"){
            msg("scanStatus",
              "Mendeteksi teks: "+Math.round((m.progress||0)*100)+"%");
          }
        }
      }
    );

    const phone=extractPhone(result.data.text);

    if(phone){
      $("findPhone").value=phone;
      msg("scanStatus","Nomor ditemukan: "+phone);
      $("findBio").click();
    }else{
      msg("scanStatus","Nomor HP tidak ditemukan. Coba gambar lebih jelas.");
    }
  }catch(e){
    msg("scanStatus","OCR gagal: "+(e.message||""));
  }
};

/* =========================
BIO COLORS
========================= */

function getBioColors(){
  return {
    bg:$("bioBgColor").value||defaultBioColors.bg,
    text:$("bioTextColor").value||defaultBioColors.text,
    button:$("bioButtonColor").value||defaultBioColors.button,
    buttonText:$("bioButtonTextColor").value||defaultBioColors.buttonText
  };
}

function applyBioColors(colors){
  if(!colors)return;
  $("bioBgColor").value=colors.bg||defaultBioColors.bg;
  $("bioTextColor").value=colors.text||defaultBioColors.text;
  $("bioButtonColor").value=colors.button||defaultBioColors.button;
  $("bioButtonTextColor").value=colors.buttonText||defaultBioColors.buttonText;
  renderBioPreview();
}

["bioBgColor","bioTextColor","bioButtonColor","bioButtonTextColor"].forEach(id=>{
  $(id).addEventListener("input",renderBioPreview);
});

/* =========================
IMAGE
========================= */

$("bioImage").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;

  if(file.size>2*1024*1024){
    msg("bioStatus","Gambar maksimal 2MB.");
    e.target.value="";
    return;
  }

  try{
    selectedBioImage=await imageToDataURL(file);
    $("bioImagePreview").src=selectedBioImage;
    $("bioImagePreview").hidden=false;
    renderBioPreview();
  }catch{
    msg("bioStatus","Gagal membaca gambar.");
  }
};

function imageToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

$("clearBioImage").onclick=()=>{
  selectedBioImage="";
  $("bioImage").value="";
  $("bioImagePreview").hidden=true;
  $("bioImagePreview").src="";
};

/* =========================
BIO LINKS
========================= */

$("addBioLink").onclick=()=>{
  const title=$("bioTitle").value.trim();
  const url=validURL($("bioUrl").value.trim());

  if(!title||!url){
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
  renderBioPreview();
  msg("bioStatus","Tombol ditambahkan. Jangan lupa simpan Bio.");
};

function linkMarkup(link){
  const url=validURL(link.url);
  if(!url)return "";

  return `
    <a class="bio-link ${link.wiggle?"wiggle":""}"
      style="background:${esc(link.buttonColor||getBioColors().button)};
      color:${esc(link.buttonTextColor||getBioColors().buttonText)}"
      href="${esc(url)}" target="_blank" rel="noopener noreferrer">
      ${link.image?`<img src="${link.image}" alt="">`:""}
      <span>${esc(link.title)}</span>
    </a>`;
}

function renderBioLinks(){
  const container=$("bioLinks");
  if(!container)return;

  if(!links.length){
    container.innerHTML="<p class='muted'>Belum ada tombol Bio.</p>";
    renderBioPreview();
    return;
  }

  container.innerHTML=links.map((link,i)=>`
    <div class="item">
      <div class="link-preview">
        ${link.image?`<img src="${link.image}" alt="">`:""}
        <div class="link-preview-info">
          <strong>${esc(link.title)}</strong>
          <small>${esc(link.url)}</small>
          <small>${link.wiggle?"✨ Goyang":"◻ Diam"}</small>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn secondary small" data-up="${i}">↑</button>
        <button class="btn secondary small" data-down="${i}">↓</button>
        <button class="btn secondary small" data-toggle="${i}">
          ${link.wiggle?"Matikan Goyang":"Aktifkan Goyang"}
        </button>
        <button class="btn danger small" data-del="${i}">Hapus</button>
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
      links[Number(b.dataset.toggle)].wiggle=
        !links[Number(b.dataset.toggle)].wiggle;
      renderBioLinks();
    };
  });

  renderBioPreview();
}

/* =========================
BIO PREVIEW
========================= */

function renderBioPreview(){
  const colors=getBioColors();
  const preview=$("bioPreview");

  preview.style.background=colors.bg;
  preview.style.color=colors.text;
  $("bioPreviewName").textContent=$("bioName").value||"Nama Kamu";
  $("bioPreviewDesc").textContent=$("bioDesc").value||"Deskripsi Bio";

  const allLinks=links.map(link=>linkMarkup({
    ...link,
    buttonColor:colors.button,
    buttonTextColor:colors.buttonText
  })).join("");

  const pages=landingPages
    .filter(p=>p.published&&p.showInBio)
    .map(p=>`
      <a class="bio-link bio-page-link ${p.wiggle?"wiggle":""}"
        href="${esc(pageURL(p.slug))}">
        🌐 <span>${esc(p.title)}</span>
      </a>
    `).join("");

  $("bioPreviewLinks").innerHTML=allLinks+pages;
}

$("bioName").oninput=renderBioPreview;
$("bioDesc").oninput=renderBioPreview;

/* =========================
BIO PAGE DISPLAY
========================= */

function publicBioHTML(bio){
  const colors=bio.colors||defaultBioColors;

  const bioLinks=(bio.links||[]).map(link=>{
    const url=validURL(link.url);
    if(!url)return "";
    return `
      <a class="bio-link ${link.wiggle?"wiggle":""}"
        style="background:${esc(colors.button)};
        color:${esc(colors.buttonText)}"
        href="${esc(url)}" target="_blank" rel="noopener noreferrer">
        ${link.image?`<img src="${link.image}" alt="">`:""}
        <span>${esc(link.title)}</span>
      </a>
    `;
  }).join("");

  const pages=(bio.landingPages||[]).map(page=>`
    <a class="bio-link bio-page-link ${page.wiggle?"wiggle":""}"
      href="${esc(pageURL(page.slug))}">
      🌐 <span>${esc(page.title)}</span>
    </a>
  `).join("");

  return `
    <div style="max-width:600px;margin:auto;padding:20px;
      background:${esc(colors.bg)};color:${esc(colors.text)};
      border-radius:24px;text-align:center">
      <h1>${esc(bio.name||"POPER User")}</h1>
      <p>${esc(bio.description||"")}</p>
      ${bioLinks}
      ${pages}
    </div>
    <style>
      .bio-link{
        display:flex;align-items:center;justify-content:center;
        gap:10px;width:100%;padding:15px;margin:11px 0;
        border-radius:15px;text-decoration:none;font-weight:800;
        box-sizing:border-box;overflow-wrap:anywhere;
      }
      .bio-link img{max-width:55px;max-height:55px;object-fit:contain;border-radius:10px}
      .wiggle{animation:wiggle .7s ease-in-out infinite}
      @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-2deg)}75%{transform:rotate(2deg)}}
    </style>
  `;
}

/* =========================
SAVE BIO
========================= */

$("saveBio").onclick=async()=>{
  const user=auth.currentUser;
  if(!user||!safeId(user.uid)){
    msg("bioStatus","Login ulang terlebih dahulu.");
    return;
  }

  try{
    const bio={
      name:$("bioName").value.trim(),
      description:$("bioDesc").value.trim(),
      phone:user.phoneNumber||"",
      colors:getBioColors(),
      links,
      landingPages:landingPages
        .filter(p=>p.published&&p.showInBio)
        .map(p=>({
          id:p.id,
          title:p.title,
          slug:p.slug,
          wiggle:!!p.wiggle
        })),
      updatedAt:Date.now()
    };

    await window.POPER.saveData(`users/${user.uid}/publicBio`,bio);

    if(user.phoneNumber){
      await window.POPER.saveData(
        `phoneLookup/${phoneKey(user.phoneNumber)}`,
        {uid:user.uid,phone:user.phoneNumber}
      );
    }

    msg("bioStatus","Bio berhasil disimpan!");
  }catch(e){
    console.error(e);
    msg("bioStatus",e.message||"Gagal menyimpan Bio.");
  }
};

/* =========================
LOAD BIO
========================= */

async function loadBio(){
  const user=auth.currentUser;
  if(!user)return;

  const data=await window.POPER.getData(
    `users/${user.uid}/publicBio`
  );

  if(!data){
    links=[];
    renderBioLinks();
    return;
  }

  $("bioName").value=data.name||"";
  $("bioDesc").value=data.description||"";

  links=Array.isArray(data.links)?data.links:[[];
  links=links.map(link=>({
    id:link.id||makeId(),
    title:link.title||"",
    url:link.url||"",
    image:link.image||"",
    wiggle:!!link.wiggle
  }));

  applyBioColors(data.colors||defaultBioColors);
  renderBioLinks();
}

/* =========================
LANDING PAGE EDITOR
========================= */

$("pageTitle").oninput=()=>{
  if(!$("pageSlug").dataset.manual){
    $("pageSlug").value=slugify($("pageTitle").value);
  }
};

$("pageSlug").oninput=()=>{
  $("pageSlug").dataset.manual="1";
};

$("pageMode").onchange=()=>{
  const visual=$("pageMode").value==="visual";
  $("visualEditorArea").hidden=!visual;
  $("htmlEditorArea").hidden=visual;
};

document.querySelectorAll("[data-format]").forEach(b=>{
  b.onclick=()=>{
    $("visualEditor").focus();
    document.execCommand(b.dataset.format,false,null);
  };
});

$("insertLink").onclick=()=>{
  const url=prompt("Masukkan URL:");
  if(url&&validURL(url)){
    $("visualEditor").focus();
    document.execCommand("createLink",false,url);
  }
};

function getEditorContent(){
  return $("pageMode").value==="html"
    ?$("htmlEditor").value
    :$("visualEditor").innerHTML;
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
        *{box-sizing:border-box}
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  doc.close();
}

$("previewPage").onclick=()=>{
  previewHTML(getEditorContent());
};

$("resetPageEditor").onclick=resetPageEditor;

/* =========================
SAVE LANDING PAGE
========================= */

$("savePage").onclick=async()=>{
  const user=auth.currentUser;
  if(!user)return;

  const title=$("pageTitle").value.trim();
  const slug=slugify($("pageSlug").value.trim()||title);
  const content=getEditorContent();

  if(!title||!slug||!content.trim()){
    msg("pageStatus","Isi judul, slug, dan konten.");
    return;
  }

  if(landingPages.some(p=>p.slug===slug&&p.id!==editingPageId)){
    msg("pageStatus","Slug sudah digunakan. Ubah slug.");
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
    const index=landingPages.findIndex(p=>p.id===page.id);
    if(index>=0)landingPages[index]=page;
    else landingPages.push(page);

    await window.POPER.saveData(
      `users/${user.uid}/landingPages/${page.id}`,
      page
    );

    await window.POPER.saveData(
      `publicPages/${page.slug}`,
      {
        title:page.title,
        content:page.content,
        owner:user.uid,
        published:true,
        updatedAt:page.updatedAt
      }
    );

    renderPages();
    renderBioLandingList();
    renderBioPreview();

    msg("pageStatus","Landing Page berhasil dipublikasikan!");
    resetPageEditor();
  }catch(e){
    msg("pageStatus","Gagal menyimpan: "+(e.message||""));
  }
};

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

/* =========================
LANDING PAGE LIST
========================= */

function renderPages(){
  const container=$("pagesList");
  if(!container)return;

  if(!landingPages.length){
    container.innerHTML="<p class='muted'>Belum ada Landing Page.</p>";
    return;
  }

  container.innerHTML=landingPages.map(page=>`
    <div class="item page-card">
      <h3>${esc(page.title)}</h3>
      <small>Slug: ${esc(page.slug)}</small>
      <small>Status: ${page.published?"Published":"Draft"}</small>
      <small>Bio: ${page.showInBio?"Ditampilkan":"Disembunyikan"}</small>
      <div class="item-actions">
        <button class="btn secondary small" data-copy="${esc(page.slug)}">Copy Link</button>
        <button class="btn secondary small" data-open="${esc(page.slug)}">Buka</button>
        <button class="btn secondary small" data-edit="${esc(page.id)}">Edit</button>
        <button class="btn danger small" data-delete="${esc(page.id)}">Hapus</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-copy]").forEach(b=>{
    b.onclick=()=>{
      const link=pageURL(b.dataset.copy);
      navigator.clipboard.writeText(link)
        .then(()=>alert("Link disalin:\n"+link))
        .catch(()=>prompt("Salin link:",link));
    };
  });

  container.querySelectorAll("[data-open]").forEach(b=>{
    b.onclick=()=>{
      window.open(pageURL(b.dataset.open),"_blank");
    };
  });

  container.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick=()=>{
      const p=landingPages.find(x=>x.id===b.dataset.edit);
      if(!p)return;

      editingPageId=p.id;
      $("pageTitle").value=p.title;
      $("pageSlug").value=p.slug;
      delete $("pageSlug").dataset.manual;
      $("pageShowInBio").checked=!!p.showInBio;
      setEditorContent(p.mode||"visual",p.content||"");
      showTab("pages");
      previewHTML(p.content||"");
    };
  });

  container.querySelectorAll("[data-delete]").forEach(b=>{
    b.onclick=async()=>{
      if(!confirm("Hapus Landing Page ini?"))return;

      const user=auth.currentUser;
      const p=landingPages.find(x=>x.id===b.dataset.delete);
      if(!p||!user)return;

      try{
        await window.POPER.deleteData(
          `users/${user.uid}/landingPages/${p.id}`
        );
        await window.POPER.deleteData(`publicPages/${p.slug}`);

        landingPages=landingPages.filter(x=>x.id!==p.id);
        renderPages();
        renderBioLandingList();
        renderBioPreview();
      }catch(e){
        alert("Gagal menghapus: "+e.message);
      }
    };
  });
}

/* =========================
BIO LANDING PAGE SETTINGS
========================= */

function renderBioLandingList(){
  const container=$("bioLandingList");
  if(!container)return;

  const pages=landingPages.filter(p=>p.published);

  if(!pages.length){
    container.innerHTML="<p class='muted'>Belum ada Landing Page.</p>";
    return;
  }

  container.innerHTML=pages.map(p=>`
    <label class="check-row">
      <input type="checkbox" data-page-bio="${esc(p.id)}"
        ${p.showInBio?"checked":""}>
      ${esc(p.title)}
    </label>
  `).join("");

  container.querySelectorAll("[data-page-bio]").forEach(c=>{
    c.onchange=()=>{
      const page=landingPages.find(p=>p.id===c.dataset.pageBio);
      if(page){
        page.showInBio=c.checked;
        renderBioPreview();
      }
    };
  });
}

/* =========================
PREVIEW BIO WINDOW
========================= */

$("openMyPublicBio").onclick=async()=>{
  const user=auth.currentUser;
  if(!user)return;

  try{
    const bio=await window.POPER.getData(
      `users/${user.uid}/publicBio`
    );

    if(!bio){
      alert("Simpan Bio terlebih dahulu.");
      return;
    }

    const win=window.open("","_blank");
    if(!win){
      alert("Popup diblokir browser.");
      return;
    }

    win.document.open();
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${esc(bio.name||"POPER Bio")}</title>
      <style>
        body{margin:0;padding:18px;font-family:Arial;background:#f4f5f9}
        *{box-sizing:border-box}
        .bio-link{display:flex;align-items:center;justify-content:center;
          gap:10px;text-decoration:none;padding:15px;margin:10px 0;
          border-radius:15px;font-weight:bold;word-break:break-word}
        .bio-link img{max-width:60px;max-height:50px;object-fit:contain}
        .wiggle{animation:w .8s infinite}
        @keyframes w{0%,100%{transform:rotate(0)}25%{transform:rotate(-2deg)}75%{transform:rotate(2deg)}}
      </style>
      </head>
      <body>${publicBioHTML(bio)}</body>
      </html>
    `);
    win.document.close();
  }catch(e){
    alert(e.message||"Gagal membuka Bio.");
  }
};

/* =========================
FIND BIO
========================= */

$("findBio").onclick=async()=>{
  const phone=$("findPhone").value.trim();
  const container=$("findResult");
  container.innerHTML="Mencari...";

  if(!phone){
    container.textContent="Masukkan nomor HP.";
    return;
  }

  try{
    const key=phoneKey(phone);
    if(!key){
      container.textContent="Nomor HP tidak valid.";
      return;
    }

    const lookup=await window.POPER.getData(`phoneLookup/${key}`);

    if(!lookup||!safeId(lookup.uid)){
      container.innerHTML="<div class='item'>Bio tidak ditemukan.</div>";
      return;
    }

    const bio=await window.POPER.getData(
      `users/${lookup.uid}/publicBio`
    );

    if(!bio){
      container.textContent="Bio belum tersedia.";
      return;
    }

    container.innerHTML=publicBioHTML(bio);
  }catch(e){
    console.error(e);
    container.textContent=e.message||"Gagal mencari Bio.";
  }
};

/* =========================
QR VAULT
========================= */

$("saveQR").onclick=async()=>{
  const user=auth.currentUser;
  if(!user)return;

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
    msg("qrScanStatus","Link berhasil disimpan.");
    loadQR();
  }catch(e){
    msg("qrScanStatus",e.message||"Gagal.");
  }
};

async function loadQR(){
  const user=auth.currentUser;
  if(!user)return;

  const data=await window.POPER.getData(`qrVault/${user.uid}`);
  const container=$("qrList");

  if(!data){
    container.innerHTML="<p class='muted'>Vault kosong.</p>";
    return;
  }

  container.innerHTML=Object.entries(data).map(([key,item])=>`
    <div class="item">
      <strong>${esc(item.name)}</strong>
      <p>${esc(item.url)}</p>
      <div class="item-actions">
        <a class="btn secondary small" href="${esc(validURL(item.url))}" target="_blank" rel="noopener">Buka</a>
        <button class="btn danger small" data-qr-del="${esc(key)}">Hapus</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-qr-del]").forEach(b=>{
    b.onclick=async()=>{
      await window.POPER.deleteData(
        `qrVault/${user.uid}/${b.dataset.qrDel}`
      );
      loadQR();
    };
  });
}

/* =========================
NOTES
========================= */

$("saveNote").onclick=async()=>{
  const user=auth.currentUser;
  if(!user)return;

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
    await loadNotes();
  }catch(e){
    alert(e.message||"Gagal menyimpan.");
  }
};

async function loadNotes(){
  const user=auth.currentUser;
  if(!user)return;

  const data=await window.POPER.getData(`notes/${user.uid}`);
  const container=$("notesList");

  if(!data){
    container.innerHTML="<p class='muted'>Belum ada catatan.</p>";
    return;
  }

  container.innerHTML=Object.entries(data).map(([key,note])=>`
    <div class="item">
      <strong>${esc(note.title)}</strong>
      <p>${esc(note.content)}</p>
      <button class="btn danger small" data-note-del="${esc(key)}">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-note-del]").forEach(b=>{
    b.onclick=async()=>{
      await window.POPER.deleteData(
        `notes/${user.uid}/${b.dataset.noteDel}`
      );
      loadNotes();
    };
  });
}

/* =========================
LOAD PAGES
========================= */

async function loadPages(){
  const user=auth.currentUser;
  if(!user)return;

  const data=await window.POPER.getData(
    `users/${user.uid}/landingPages`
  );

  landingPages=data?Object.values(data):[];

  renderPages();
  renderBioLandingList();
  renderBioPreview();
}

/* =========================
LOAD ALL
========================= */

async function loadAll(){
  if(loadingAll)return;
  loadingAll=true;

  try{
    await Promise.allSettled([
      loadBio(),
      loadQR(),
      loadNotes(),
      loadPages()
    ]);
  }catch(e){
    console.error("Load error:",e);
  }finally{
    loadingAll=false;
  }
}

console.log("POPER Final initialized.");
