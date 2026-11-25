
import "./firebase.js";

const $ = id => document.getElementById(id);
const DB = window.POPER;

let currentUser = null;
let confirmation = null;
let links = [];
let pages = [];
let notes = [];
let qrItems = [];
let imageData = "";
let cameraStream = null;
let ocrBusy = false;
let loadedUID = "";
let darkMode = localStorage.getItem("poper_theme") === "dark";

const defaultStyle = {
  bg: "#f3f0ff",
  bg2: "#d9ceff",
  bgType: "solid",
  text: "#25233a",
  button: "#7158e8",
  buttonText: "#ffffff",
  shape: "rounded"
};

let bioStyle = {...defaultStyle};

/* ==========================================
   UTILITIES
========================================== */

function uid(){
  const u = currentUser?.uid;
  return typeof u === "string" ? u : u?.uid || null;
}

function phone(){
  return currentUser?.phoneNumber || "";
}

function phoneKey(value){
  let n = String(value || "").replace(/\D/g,"");
  if(n.startsWith("62")) n = "0" + n.slice(2);
  if(n.startsWith("8")) n = "0" + n;
  return n;
}

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#39;"
  }[c]));
}

function pathSafe(value){
  const s = String(value || "");
  if(!s || /[.#$\[\]]/.test(s)){
    throw new Error("Path Firebase tidak valid.");
  }
  return s;
}

function userPath(sub=""){
  const userID = uid();
  if(!userID || typeof userID !== "string"){
    throw new Error("UID pengguna tidak valid. Silakan login ulang.");
  }
  return `users/${pathSafe(userID)}/${sub}`;
}

function slugify(s){
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"");
}

function msg(id,text,color){
  const el=$(id);
  if(!el)return;
  el.textContent=text||"";
  if(color)el.style.color=color;
}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

function copyText(text){
  if(DB.copy){
    DB.copy(text);
  }else{
    navigator.clipboard?.writeText(text);
  }
}

function safeURL(url){
  const raw=String(url||"").trim();
  if(/^https?:\/\//i.test(raw))return raw;
  if(/^mailto:/i.test(raw))return raw;
  if(/^tel:/i.test(raw))return raw;
  if(/^https?:\/\//i.test(raw))return raw;
  if(/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(raw))return "mailto:"+raw;
  if(/^[+]?[\d\s()-]{7,20}$/.test(raw))return "tel:"+raw.replace(/[^\d+]/g,"");
  return "https://"+raw;
}

function setDark(enabled){
  darkMode=!!enabled;
  document.body.classList.toggle("dark",darkMode);
  $("themeToggle").textContent=darkMode?"🌙":"☀️";
  localStorage.setItem("poper_theme",darkMode?"dark":"light");
}

$("themeToggle").onclick=()=>setDark(!darkMode);
setDark(darkMode);

/* ==========================================
   AUTH / OTP
========================================== */

function loginUI(user){
  const logged=!!user;
  $("loginPanel").classList.toggle("hidden",logged);
  $("dashboard").classList.toggle("hidden",!logged);
  $("bottomNav").classList.toggle("hidden",!logged);
  $("logoutBtn").classList.toggle("hidden",!logged);

  if(user){
    $("welcome").textContent="Halo, selamat datang! 👋";
    $("myPhone").textContent=user.phoneNumber||"";
  }
}

$("sendOtpBtn").onclick=async()=>{
  const p=$("phoneInput").value.trim();
  if(!p){
    msg("authStatus","Masukkan nomor HP terlebih dahulu.");
    return;
  }

  $("sendOtpBtn").disabled=true;
  msg("authStatus","Mengirim kode OTP...");

  try{
    DB.resetRecaptcha();
    confirmation=await DB.sendOTP(p);
    $("otpSection").classList.remove("hidden");
    msg("authStatus","OTP dikirim. Periksa SMS kamu.");
  }catch(e){
    console.error(e);
    msg("authStatus","Gagal mengirim OTP: "+(e.message||e.code));
    DB.resetRecaptcha();
  }

  $("sendOtpBtn").disabled=false;
};

$("verifyOtpBtn").onclick=async()=>{
  const code=$("otpInput").value.trim();

  if(!confirmation){
    msg("authStatus","Kirim OTP terlebih dahulu.");
    return;
  }
  if(!code){
    msg("authStatus","Masukkan kode OTP.");
    return;
  }

  $("verifyOtpBtn").disabled=true;
  msg("authStatus","Memeriksa OTP...");

  try{
    const result=await confirmation.confirm(code);

    // Fallback pindah dashboard segera
    currentUser=result.user;
    loginUI(result.user);
    msg("authStatus","Login berhasil.");

    await loadAll();
    loadedUID=result.user.uid;
  }catch(e){
    console.error(e);
    msg("authStatus","OTP gagal: "+(e.message||e.code));
  }

  $("verifyOtpBtn").disabled=false;
};

$("logoutBtn").onclick=async()=>{
  stopCamera();
  try{
    await DB.logout();
    currentUser=null;
    loadedUID="";
    loginUI(null);
  }catch(e){
    alert(e.message);
  }
};

DB.onAuth(async user=>{
  currentUser=user;
  loginUI(user);

  if(user && user.uid!==loadedUID){
    try{
      await loadAll();
      loadedUID=user.uid;
    }catch(e){
      console.error(e);
    }
  }
});

/* ==========================================
   NAVIGATION
========================================== */

function openTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.remove("active"));

  $(name)?.classList.add("active");
  document.querySelectorAll(`[data-tab="${name}"]`).forEach(b=>b.classList.add("active"));
}

document.querySelectorAll("[data-tab]").forEach(b=>{
  b.onclick=()=>openTab(b.dataset.tab);
});

/* ==========================================
   DATA LOADING
========================================== */

async function loadAll(){
  if(!uid())return;

  await Promise.allSettled([
    loadBio(),
    loadPages(),
    loadNotes(),
    loadQR()
  ]);

  renderBioLinks();
  renderPages();
  renderNotes();
  renderQR();
  renderBioLandingList();
  updateBioPreview();
}

async function loadBio(){
  const data=await DB.getData(userPath("publicBio"));

  if(!data){
    links=[];
    bioStyle={...defaultStyle};
    $("bioTitle").value="";
    $("bioDesc").value="";
    applyBioStyleInputs();
    renderBioLinks();
    return;
  }

  $("bioTitle").value=data.title||"";
  $("bioDesc").value=data.description||"";
  links=Array.isArray(data.links)?data.links:[];

  bioStyle={...defaultStyle,...(data.style||{})};
  applyBioStyleInputs();
  renderBioLinks();
}

async function loadPages(){
  const data=await DB.getData(userPath("landingPages"));
  pages=data?Object.values(data):[];
  renderPages();
  renderBioLandingList();
}

async function loadNotes(){
  const data=await DB.getData(userPath("notes"));
  notes=data?Object.values(data):[];
  renderNotes();
}

async function loadQR(){
  const data=await DB.getData(userPath("qrVault"));
  qrItems=data?Object.entries(data).map(([id,q])=>({...q,id})):[];
  renderQR();
}

/* ==========================================
   BIO STYLE
========================================== */

function applyBioStyleInputs(){
  $("bioBgColor").value=bioStyle.bg;
  $("bioBgColor2").value=bioStyle.bg2;
  $("bioBgType").value=bioStyle.bgType;
  $("bioTextColor").value=bioStyle.text;
  $("bioButtonColor").value=bioStyle.button;
  $("bioButtonTextColor").value=bioStyle.buttonText;
  $("bioButtonShape").value=bioStyle.shape;
  updateBioPreview();
}

function readBioStyleInputs(){
  bioStyle={
    bg:$("bioBgColor").value,
    bg2:$("bioBgColor2").value,
    bgType:$("bioBgType").value,
    text:$("bioTextColor").value,
    button:$("bioButtonColor").value,
    buttonText:$("bioButtonTextColor").value,
    shape:$("bioButtonShape").value
  };
}

[
  "bioBgColor","bioBgColor2","bioBgType",
  "bioTextColor","bioButtonColor","bioButtonTextColor",
  "bioButtonShape"
].forEach(id=>{
  $(id).oninput=()=>{
    readBioStyleInputs();
    updateBioPreview();
  };
});

function getShape(shape){
  if(shape==="pill")return "50px";
  if(shape==="square")return "5px";
  return "15px";
}

function getBioBackground(style){
  return style.bgType==="gradient"
    ? `linear-gradient(135deg,${style.bg},${style.bg2})`
    : style.bg;
}

function updateBioPreview(){
  readBioStyleInputs();

  const box=$("bioPreview");
  box.style.background=getBioBackground(bioStyle);
  box.style.color=bioStyle.text;

  let html=`<h2>${esc($("bioTitle").value||"Nama Bio Link")}</h2>
    <p>${esc($("bioDesc").value||"Deskripsi profil")}</p>`;

  links.forEach(l=>{
    const color=l.color||bioStyle.button;
    const textColor=l.textColor||bioStyle.buttonText;
    const radius=getShape(bioStyle.shape);
    html+=`<a class="bioPreviewLink ${l.wiggle?"wiggle":""}"
      style="background:${color};color:${textColor};border-radius:${radius}"
      href="javascript:void(0)">
      ${l.image?`<img src="${l.image}" style="max-height:130px;object-fit:cover">`:""}
      ${esc(l.name)}</a>`;
  });

  pages.filter(p=>p.showInBio).forEach(p=>{
    html+=`<div class="bioPreviewLink"
      style="background:${bioStyle.button};color:${bioStyle.buttonText};border-radius:${getShape(bioStyle.shape)}">
      📄 ${esc(p.title)}</div>`;
  });

  box.innerHTML=html;
  $("bioStylePreview").style.background=getBioBackground(bioStyle);
}

/* ==========================================
   BIO LINKS
========================================== */

$("bioImage").onchange=async()=>{
  const file=$("bioImage").files?.[0];
  if(!file)return;

  if(file.size>800*1024){
    alert("Gambar maksimal 800 KB agar penyimpanan Firebase aman.");
    $("bioImage").value="";
    return;
  }

  try{
    imageData=await fileToDataURL(file);
    $("bioImagePreview").src=imageData;
    $("bioImagePreview").classList.remove("hidden");
  }catch(e){
    alert(e.message);
  }
};

$("clearBioImage").onclick=()=>{
  imageData="";
  $("bioImage").value="";
  $("bioImagePreview").src="";
  $("bioImagePreview").classList.add("hidden");
};

$("addBioLink").onclick=()=>{
  const name=$("bioName").value.trim();
  const url=$("bioUrl").value.trim();

  if(!name||!url){
    alert("Isi nama tombol dan link terlebih dahulu.");
    return;
  }

  links.push({
    id:Date.now().toString(),
    name,
    url:safeURL(url),
    image:imageData,
    color:$("linkColor").value,
    textColor:$("linkTextColor").value,
    wiggle:$("bioWiggle").value==="true"
  });

  $("bioName").value="";
  $("bioUrl").value="";
  imageData="";
  $("bioImage").value="";
  $("bioImagePreview").src="";
  $("bioImagePreview").classList.add("hidden");

  renderBioLinks();
  updateBioPreview();
};

function renderBioLinks(){
  const box=$("bioLinks");
  box.innerHTML="";

  links.forEach((l,i)=>{
    const div=document.createElement("div");
    div.className="listItem";

    if(l.image){
      const img=document.createElement("img");
      img.src=l.image;
      img.style.width="45px";
      img.style.height="45px";
      img.style.objectFit="cover";
      img.style.borderRadius="10px";
      div.appendChild(img);
    }

    const info=document.createElement("div");
    info.className="info";
    info.innerHTML=`<strong>${esc(l.name)}</strong><p>${esc(l.url)}</p>`;
    div.appendChild(info);

    const actions=document.createElement("div");
    actions.className="actions";

    const edit=document.createElement("button");
    edit.textContent="✏️";
    edit.onclick=()=>{
      $("bioName").value=l.name;
      $("bioUrl").value=l.url;
      $("linkColor").value=l.color||bioStyle.button;
      $("linkTextColor").value=l.textColor||bioStyle.buttonText;
      $("bioWiggle").value=String(!!l.wiggle);
      imageData=l.image||"";
      if(imageData){
        $("bioImagePreview").src=imageData;
        $("bioImagePreview").classList.remove("hidden");
      }
      links.splice(i,1);
      renderBioLinks();
      updateBioPreview();
    };

    const del=document.createElement("button");
    del.textContent="🗑";
    del.onclick=()=>{
      links.splice(i,1);
      renderBioLinks();
      updateBioPreview();
    };

    actions.append(edit,del);
    div.appendChild(actions);
    box.appendChild(div);
  });
}

$("saveBio").onclick=async()=>{
  if(!uid())return;

  readBioStyleInputs();

  const data={
    title:$("bioTitle").value.trim(),
    description:$("bioDesc").value.trim(),
    links,
    style:bioStyle,
    phone:phone(),
    uid:uid(),
    updatedAt:Date.now()
  };

  $("saveBio").disabled=true;

  try{
    await DB.saveData(userPath("publicBio"),data);

    // FIX: phone lookup selalu menyimpan UID string, bukan object user.
    const key=phoneKey(phone());
    if(key){
      await DB.saveData(`phoneLookup/${key}`,uid());
    }

    msg("bioStatus","Bio Link dan desain berhasil disimpan.");
  }catch(e){
    console.error(e);
    msg("bioStatus","Gagal menyimpan Bio: "+e.message);
  }

  $("saveBio").disabled=false;
};

$("openMyPublicBio").onclick=()=>{
  const id=uid();
  if(!id)return;
  window.open(location.origin+location.pathname+"?bio="+encodeURIComponent(id),"_blank");
};

/* ==========================================
   LANDING PAGE EDITOR
========================================== */

$("pageMode").onchange=()=>{
  const html=$("pageMode").value==="html";
  $("htmlEditorArea").classList.toggle("hidden",!html);
  $("visualEditorArea").classList.toggle("hidden",html);
};

document.querySelectorAll("[data-format]").forEach(btn=>{
  btn.onclick=()=>{
    $("visualEditor").focus();
    document.execCommand(btn.dataset.format,false,null);
  };
});

function getPageContent(){
  return $("pageMode").value==="html"
    ?$("htmlEditor").value
    :$("visualEditor").innerHTML;
}

$("previewPage").onclick=()=>{
  $("pagePreviewFrame").srcdoc=getPageContent();
};

$("savePage").onclick=async()=>{
  const title=$("pageTitle").value.trim();
  const slug=slugify($("pageSlug").value||title);
  const content=getPageContent();

  if(!title||!slug||!content.trim()){
    msg("pageStatus","Lengkapi judul dan konten.");
    return;
  }

  const page={
    id:slug,
    title,
    slug,
    content,
    mode:$("pageMode").value,
    showInBio:$("pageShowInBio").checked,
    owner:uid(),
    updatedAt:Date.now()
  };

  $("savePage").disabled=true;

  try{
    await DB.saveData(userPath("landingPages/"+slug),page);

    // Publik: salinan untuk akses halaman mandiri
    await DB.saveData("publicPages/"+slug,{
      title,
      content,
      owner:uid(),
      published:true,
      updatedAt:Date.now()
    });

    msg("pageStatus","Landing page berhasil disimpan.");
    await loadPages();
    updateBioPreview();
  }catch(e){
    console.error(e);
    msg("pageStatus","Gagal menyimpan: "+e.message);
  }

  $("savePage").disabled=false;
};

function renderPages(){
  const box=$("pagesList");
  box.innerHTML="";

  pages.forEach((p,i)=>{
    const div=document.createElement("div");
    div.className="listItem";
    div.innerHTML=`<div class="info">
      <strong>${esc(p.title)}</strong>
      <p>/${esc(p.slug)}</p>
      <small>${p.showInBio?"Tampil di Bio":"Halaman mandiri"}</small>
      </div>
      <div class="actions">
      <button data-edit>✏️</button>
      <button data-copy>🔗</button>
      <button data-delete>🗑</button>
      </div>`;

    div.querySelector("[data-edit]").onclick=()=>{
      $("pageTitle").value=p.title||"";
      $("pageSlug").value=p.slug||"";
      $("pageMode").value=p.mode||"visual";
      $("pageShowInBio").checked=!!p.showInBio;

      if(p.mode==="html")$("htmlEditor").value=p.content||"";
      else $("visualEditor").innerHTML=p.content||"";

      $("pageMode").dispatchEvent(new Event("change"));
      openTab("pages");
      window.scrollTo({top:0,behavior:"smooth"});
    };

    div.querySelector("[data-copy]").onclick=()=>{
      copyText(location.origin+location.pathname+"?page="+encodeURIComponent(p.slug));
      alert("Link landing page disalin.");
    };

    div.querySelector("[data-delete]").onclick=async()=>{
      if(!confirm("Hapus landing page ini?"))return;
      try{
        await DB.deleteData(userPath("landingPages/"+p.id));
        await DB.deleteData("publicPages/"+p.slug);
        await loadPages();
        updateBioPreview();
      }catch(e){
        alert(e.message);
      }
    };

    box.appendChild(div);
  });
}

function renderBioLandingList(){
  const box=$("bioLandingList");
  box.innerHTML="";

  pages.filter(p=>p.showInBio).forEach(p=>{
    const a=document.createElement("div");
    a.className="listItem info";
    a.textContent="📄 "+p.title+" — ditampilkan di Bio";
    box.appendChild(a);
  });
}

/* ==========================================
   FIND BIO — FIX UID OBJECT
========================================== */

function resolveOwnerUID(data){
  // Firebase phoneLookup dapat berisi UID string atau data object lama.
  if(typeof data==="string")return data;
  if(typeof data==="number")return String(data);

  if(data && typeof data==="object"){
    const possible=data.uid||data.ownerUID||data.owner||data.userId;
    if(typeof possible==="string")return possible;
    if(possible && typeof possible==="object" && typeof possible.uid==="string"){
      return possible.uid;
    }
  }
  return null;
}

$("findBio").onclick=async()=>{
  const p=$("findPhone").value.trim();
  if(!p){
    msg("findResult","Masukkan nomor HP.");
    return;
  }

  msg("findResult","Mencari Bio Link...");
  $("findBio").disabled=true;

  try{
    const key=phoneKey(p);
    const ownerData=await DB.getData("phoneLookup/"+key);
    const ownerUID=resolveOwnerUID(ownerData);

    if(!ownerUID){
      msg("findResult","Bio Link tidak ditemukan.");
      return;
    }

    // Validasi UID sebelum membuat path database
    if(/[\.\#\$\[\]]/.test(ownerUID)){
      msg("findResult","Data pemilik tidak valid.");
      return;
    }

    const data=await DB.getData(`users/${ownerUID}/publicBio`);

    if(!data){
      msg("findResult","Bio Link belum tersedia atau tidak dapat diakses.");
      return;
    }

    renderFoundBio(data);

  }catch(e){
    console.error("Find Bio:",e);
    msg("findResult","Error: "+(e.message||e));
  }

  $("findBio").disabled=false;
};

function renderFoundBio(data){
  const box=$("findResult");
  box.innerHTML="";

  const style={...defaultStyle,...(data.style||{})};

  const card=document.createElement("div");
  card.className="card";

  const bio=document.createElement("div");
  bio.className="bioPreview";
  bio.style.background=getBioBackground(style);
  bio.style.color=style.text;

  bio.innerHTML=`<h2>${esc(data.title||"Bio Link")}</h2>
    <p>${esc(data.description||"")}</p>`;

  (data.links||[]).forEach(l=>{
    const a=document.createElement("a");
    a.className="bioPreviewLink"+(l.wiggle?" wiggle":"");
    a.href=safeURL(l.url);
    a.target="_blank";
    a.rel="noopener noreferrer";
    a.style.background=l.color||style.button;
    a.style.color=l.textColor||style.buttonText;
    a.style.borderRadius=getShape(style.shape);

    if(l.image){
      const img=document.createElement("img");
      img.src=l.image;
      img.alt="";
      img.style.maxHeight="180px";
      img.style.objectFit="cover";
      a.appendChild(img);
    }
    a.appendChild(document.createTextNode(l.name||l.url));
    bio.appendChild(a);
  });

  card.appendChild(bio);
  box.appendChild(card);
}

/* ==========================================
   SCANNED NUMBER SEARCH
========================================== */

$("searchScannedPhone").onclick=()=>{
  const p=$("scanPhoneResult").value.trim();
  if(!p){
    msg("scanStatus","Belum ada nomor yang dipilih.");
    return;
  }

  $("findPhone").value=p;
  openTab("find");
  $("findBio").click();
};

/* ==========================================
   PUBLIC BIO
========================================== */

async function loadPublicBio(){
  const params=new URLSearchParams(location.search);
  const publicUID=params.get("bio");
  if(!publicUID)return false;

  $("mainApp").classList.add("hidden");
  $("bottomNav").classList.add("hidden");
  $("publicPageView").classList.remove("hidden");

  try{
    const data=await DB.getData(`users/${pathSafe(publicUID)}/publicBio`);
    if(!data){
      $("publicPageError").textContent="Bio tidak ditemukan.";
      return true;
    }

    const style={...defaultStyle,...(data.style||{})};
    const bio=document.createElement("div");
    bio.className="publicBio";
    bio.style.background=getBioBackground(style);
    bio.style.color=style.text;
    bio.style.padding="20px";
    bio.style.borderRadius="20px";

    bio.innerHTML=`<h1>${esc(data.title||"Bio Link")}</h1>
      <p>${esc(data.description||"")}</p>`;

    (data.links||[]).forEach(l=>{
      const a=document.createElement("a");
      a.className="publicLink"+(l.wiggle?" wiggle":"");
      a.style.background=l.color||style.button;
      a.style.color=l.textColor||style.buttonText;
      a.style.borderRadius=getShape(style.shape);
      a.href=safeURL(l.url);
      a.target="_blank";
      a.rel="noopener noreferrer";

      if(l.image){
        const img=document.createElement("img");
        img.src=l.image;
        img.alt="";
        a.appendChild(img);
      }
      a.appendChild(document.createTextNode(l.name||"Buka Link"));
      bio.appendChild(a);
    });

    // Landing page yang dipilih tampil di Bio
    const publicPages=await DB.getData(`users/${publicUID}/landingPages`);
    if(publicPages){
      Object.values(publicPages).filter(p=>p.showInBio).forEach(p=>{
        const a=document.createElement("a");
        a.className="publicLink";
        a.style.background=style.button;
        a.style.color=style.buttonText;
        a.href="?page="+encodeURIComponent(p.slug);
        a.textContent="📄 "+p.title;
        bio.appendChild(a);
      });
    }

    $("publicPageContent").appendChild(bio);
  }catch(e){
    console.error(e);
    $("publicPageError").textContent="Bio gagal dibuka: "+e.message;
  }

  return true;
}

/* ==========================================
   PUBLIC LANDING PAGE
========================================== */

async function loadPublicPage(){
  const slug=new URLSearchParams(location.search).get("page");
  if(!slug)return false;

  $("mainApp").classList.add("hidden");
  $("bottomNav").classList.add("hidden");
  $("publicPageView").classList.remove("hidden");

  try{
    const data=await DB.getData("publicPages/"+pathSafe(slug));
    if(!data||!data.published){
      $("publicPageError").textContent="Halaman tidak ditemukan.";
      return true;
    }

    const frame=document.createElement("iframe");
    frame.style.width="100%";
    frame.style.height="85vh";
    frame.style.border="0";
    frame.sandbox="";
    frame.srcdoc=data.content||"";
    $("publicPageContent").appendChild(frame);
  }catch(e){
    $("publicPageError").textContent="Gagal membuka halaman: "+e.message;
  }

  return true;
}

$("publicBack").onclick=()=>{
  location.href=location.pathname;
};

/* ==========================================
   QR VAULT
========================================== */

$("saveQR").onclick=async()=>{
  const name=$("qrName").value.trim();
  const url=$("qrUrl").value.trim();

  if(!name||!url){
    msg("qrScanStatus","Isi nama dan URL.");
    return;
  }

  try{
    await DB.pushData(userPath("qrVault"),{
      name,
      url:safeURL(url),
      createdAt:Date.now()
    });
    $("qrName").value="";
    $("qrUrl").value="";
    await loadQR();
    msg("qrScanStatus","QR link berhasil disimpan.");
  }catch(e){
    msg("qrScanStatus",e.message);
  }
};

function renderQR(){
  const box=$("qrList");
  box.innerHTML="";

  qrItems.forEach(q=>{
    const div=document.createElement("div");
    div.className="listItem";
    div.innerHTML=`<div class="info">
      <strong>${esc(q.name)}</strong><p>${esc(q.url)}</p>
      </div><div class="actions"><button data-copy>Copy</button><button data-del>🗑</button></div>`;

    div.querySelector("[data-copy]").onclick=()=>{
      copyText(q.url);
      alert("Link disalin.");
    };

    div.querySelector("[data-del]").onclick=async()=>{
      await DB.deleteData(userPath("qrVault/"+q.id));
      await loadQR();
    };

    box.appendChild(div);
  });
}

/* ==========================================
   NOTES
========================================== */

$("saveNote").onclick=async()=>{
  const title=$("noteTitle").value.trim();
  const content=$("noteContent").value.trim();

  if(!title||!content){
    alert("Isi judul dan catatan.");
    return;
  }

  try{
    await DB.pushData(userPath("notes"),{
      title,
      content,
      createdAt:Date.now()
    });
    $("noteTitle").value="";
    $("noteContent").value="";
    await loadNotes();
  }catch(e){
    alert(e.message);
  }
};

function renderNotes(){
  const box=$("notesList");
  box.innerHTML="";

  notes.forEach(n=>{
    const div=document.createElement("div");
    div.className="listItem";
    div.innerHTML=`<div class="info">
      <strong>${esc(n.title)}</strong>
      <p>${esc(n.content)}</p></div>
      <button class="btn danger small" data-del>🗑</button>`;

    div.querySelector("[data-del]").onclick=async()=>{
      if(!confirm("Hapus catatan?"))return;
      await DB.deleteData(userPath("notes/"+n.id));
      await loadNotes();
    };

    box.appendChild(div);
  });
}

/* ==========================================
   CAMERA
========================================== */

$("startCameraBtn").onclick=async()=>{
  try{
    stopCamera();
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"}},
      audio:false
    });
    $("cameraVideo").srcObject=cameraStream;
    $("cameraVideo").classList.remove("hidden");
    msg("scanStatus","Kamera aktif. Arahkan ke nomor HP.");
  }catch(e){
    msg("scanStatus","Kamera tidak tersedia. Gunakan upload foto.");
  }
};

function stopCamera(){
  if(cameraStream){
    cameraStream.getTracks().forEach(t=>t.stop());
    cameraStream=null;
  }
  const v=$("cameraVideo");
  if(v){
    v.srcObject=null;
    v.classList.add("hidden");
  }
}

$("stopCameraBtn").onclick=stopCamera;

$("captureBtn").onclick=async()=>{
  const video=$("cameraVideo");
  if(!cameraStream||!video.videoWidth){
    msg("scanStatus","Buka kamera terlebih dahulu.");
    return;
  }

  const canvas=document.createElement("canvas");
  canvas.width=video.videoWidth;
  canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);

  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.95));
  if(blob)performOCR(blob);
};

/* ==========================================
   UPLOAD IMAGE OCR
========================================== */

$("uploadScanBtn").onclick=()=>{
  $("scanImageInput").click();
};

$("scanImageInput").onchange=async()=>{
  const file=$("scanImageInput").files?.[0];
  if(!file)return;

  if(file.size>15*1024*1024){
    msg("scanStatus","Ukuran gambar maksimal 15 MB.");
    $("scanImageInput").value="";
    return;
  }

  performOCR(file);
};

async function prepareOCRImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);

    img.onload=()=>{
      try{
        const canvas=document.createElement("canvas");
        const scale=Math.min(2.5,Math.max(1,1800/img.width));

        canvas.width=Math.round(img.width*scale);
        canvas.height=Math.round(img.height*scale);

        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,canvas.width,canvas.height);

        const data=ctx.getImageData(0,0,canvas.width,canvas.height);
        const pixels=data.data;

        for(let i=0;i<pixels.length;i+=4){
          const gray=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
          const contrast=Math.max(0,Math.min(255,(gray-110)*1.35+110));
          pixels[i]=pixels[i+1]=pixels[i+2]=contrast;
        }

        ctx.putImageData(data,0,0);
        canvas.toBlob(blob=>{
          URL.revokeObjectURL(url);
          if(blob)resolve(blob);
          else reject(new Error("Gagal memproses gambar."));
        },"image/jpeg",.94);
      }catch(e){
        URL.revokeObjectURL(url);
        reject(e);
      }
    };

    img.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error("Gambar gagal dibuka."));
    };

    img.src=url;
  });
}

async function performOCR(image){
  if(ocrBusy)return;

  if(!window.Tesseract){
    msg("scanStatus","OCR tidak termuat. Periksa internet.");
    return;
  }

  ocrBusy=true;
  $("uploadScanBtn").disabled=true;
  $("captureBtn").disabled=true;
  $("ocrResults").innerHTML="";
  msg("scanStatus","Memproses gambar...");

  try{
    const prepared=await prepareOCRImage(image);

    const result=await Tesseract.recognize(prepared,"eng",{
      logger:data=>{
        if(data.status==="recognizing text"){
          msg("scanStatus","Membaca teks "+Math.round((data.progress||0)*100)+"%");
        }
      }
    });

    const text=result?.data?.text||"";
    const found=extractPhones(text);

    showOCR(text,found);

    if(found.length){
      $("scanPhoneResult").value=found[0];
      $("findPhone").value=found[0];
      msg("scanStatus","Berhasil menemukan "+found.length+" nomor HP. Pilih nomor di bawah.");
    }else{
      msg("scanStatus","Nomor belum terdeteksi. Coba crop, zoom, atau gunakan foto lebih jelas.");
    }
  }catch(e){
    console.error("OCR:",e);
    msg("scanStatus","OCR gagal: "+e.message);
  }finally{
    ocrBusy=false;
    $("uploadScanBtn").disabled=false;
    $("captureBtn").disabled=false;
  }
}

function extractPhones(text){
  const source=String(text||"")
    .replace(/[Oo]/g,"0")
    .replace(/[Il|]/g,"1");

  const matches=source.match(/(?:\+?62|0|8)[\d\s\-().]{7,22}/g)||[];
  const results=[];

  matches.forEach(raw=>{
    let n=raw.replace(/\D/g,"");

    if(n.startsWith("62"))n="0"+n.slice(2);
    else if(n.startsWith("8"))n="0"+n;

    if(n.startsWith("0")&&n.length>=10&&n.length<=14){
      if(!results.includes(n))results.push(n);
    }
  });

  return results;
}

function showOCR(text,phones){
  const box=$("ocrResults");
  box.innerHTML="";

  phones.forEach(n=>{
    const btn=document.createElement("button");
    btn.className="ocrChoice";
    btn.textContent="📞 "+n+" — Pilih";
    btn.onclick=()=>{
      document.querySelectorAll(".ocrChoice").forEach(x=>x.classList.remove("selected"));
      btn.classList.add("selected");
      $("scanPhoneResult").value=n;
      $("findPhone").value=n;
    };
    box.appendChild(btn);
  });

  const details=document.createElement("details");
  const summary=document.createElement("summary");
  summary.textContent="Lihat teks OCR yang dibaca";
  const pre=document.createElement("pre");
  pre.style.whiteSpace="pre-wrap";
  pre.style.overflowWrap="anywhere";
  pre.textContent=text;
  details.append(summary,pre);
  box.appendChild(details);
}

/* ==========================================
   INIT — PUBLIC PAGE FIRST
========================================== */

async function init(){
  try{
    const params=new URLSearchParams(location.search);
    if(params.has("page")){
      await loadPublicPage();
      return;
    }
    if(params.has("bio")){
      await loadPublicBio();
      return;
    }
  }catch(e){
    console.error("Public view error:",e);
  }
}

init();
