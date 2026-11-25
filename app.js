
import "./firebase.js";

const $ = id => document.getElementById(id);
const DB = window.POPER;
const auth = DB.auth;

let confirmation = null;
let links = [];
let landingPages = [];
let selectedImage = "";
let editingPageId = null;
let cameraStream = null;
let notes = [];

/* =========================
   HELPERS
========================= */

function status(id,text){
  const el=$(id);
  if(el) el.textContent=text||"";
}

function escapeHTML(value=""){
  return String(value).replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function safeURL(value=""){
  try{
    const u=new URL(value);
    if(u.protocol==="https:"||u.protocol==="http:")return u.href;
  }catch{}
  return "";
}

function uid(){
  return auth.currentUser?.uid||"";
}

function userPath(path){
  if(!uid())throw new Error("Silakan login terlebih dahulu.");
  return `users/${uid()}/${path}`;
}

function makeId(){
  return "p"+Date.now().toString(36)+
    Math.random().toString(36).slice(2,8);
}

function slugify(s=""){
  return s.toLowerCase().trim()
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

function imageToDataURL(file,maxSize=900){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        const scale=Math.min(1,maxSize/Math.max(img.width,img.height));
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",0.78));
      };
      img.onerror=reject;
      img.src=reader.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

function setTheme(theme){
  document.body.classList.toggle("dark",theme==="dark");
  localStorage.setItem("poper-theme",theme);
  $("themeToggle").textContent=theme==="dark"?"☀️":"🌙";
}

setTheme(localStorage.getItem("poper-theme")||"light");

$("themeToggle").onclick=()=>{
  setTheme(document.body.classList.contains("dark")?"light":"dark");
};

/* =========================
   NAVIGATION
========================= */

function showTab(name){
  document.querySelectorAll("#dashboard section").forEach(s=>{
    s.classList.toggle("hidden",s.id!=="tab-"+name);
  });

  document.querySelectorAll("[data-tab]").forEach(b=>{
    b.classList.toggle("active",b.dataset.tab===name);
  });

  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-tab]").forEach(b=>{
  b.onclick=()=>showTab(b.dataset.tab);
});

/* =========================
   AUTH
========================= */

$("sendOtpBtn").onclick=async()=>{
  const phone=$("loginPhone").value.trim();
  if(!phone){
    status("loginStatus","Masukkan nomor HP.");
    return;
  }

  try{
    status("loginStatus","Mengirim OTP...");
    confirmation=await DB.sendOTP(phone);
    $("otpArea").classList.remove("hidden");
    status("loginStatus","OTP terkirim. Silakan periksa SMS.");
  }catch(e){
    console.error(e);
    status("loginStatus",e.message||"Gagal mengirim OTP.");
    try{await DB.resetRecaptcha();}catch{}
  }
};

$("verifyOtpBtn").onclick=async()=>{
  const code=$("otpCode").value.trim();
  if(!confirmation||!code){
    status("loginStatus","Masukkan kode OTP.");
    return;
  }

  try{
    status("loginStatus","Memverifikasi...");
    await confirmation.confirm(code);
    status("loginStatus","Login berhasil.");
  }catch(e){
    status("loginStatus",e.message||"OTP tidak valid.");
  }
};

$("logoutBtn").onclick=()=>DB.logout();

DB.onAuth(user=>{
  $("loginPanel").classList.toggle("hidden",!!user);
  $("dashboard").classList.toggle("hidden",!user);
  $("bottomNav").classList.toggle("hidden",!user);
  $("logoutBtn").classList.toggle("hidden",!user);

  if(user)loadAll();
});

/* =========================
   BIO LINKS
========================= */

$("bioImage").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;

  if(file.size>5*1024*1024){
    status("bioStatus","Gambar maksimal 5MB.");
    e.target.value="";
    return;
  }

  try{
    selectedImage=await imageToDataURL(file);
    $("bioImagePreview").innerHTML=
      `<img src="${selectedImage}" style="max-width:100px;border-radius:12px">`;
  }catch{
    status("bioStatus","Gagal membaca gambar.");
  }
};

$("clearBioImage").onclick=()=>{
  selectedImage="";
  $("bioImage").value="";
  $("bioImagePreview").innerHTML="";
};

$("addBioLink").onclick=()=>{
  const title=$("bioName").value.trim();
  const url=safeURL($("bioUrl").value.trim());

  if(!title||!url){
    status("bioStatus","Isi nama link dan URL valid (https://).");
    return;
  }

  links.push({
    id:makeId(),
    title,
    url,
    image:selectedImage,
    color:$("linkColor").value,
    textColor:$("linkTextColor").value,
    wiggle:$("bioWiggle").value==="on"
  });

  $("bioName").value="";
  $("bioUrl").value="";
  $("bioImage").value="";
  $("bioImagePreview").innerHTML="";
  selectedImage="";

  renderBioLinks();
  status("bioStatus","Link ditambahkan.");
};

function renderBioLinks(){
  const container=$("bioLinks");
  if(!container)return;

  if(!links.length){
    container.innerHTML="<p class='muted'>Belum ada link.</p>";
  }else{
    container.innerHTML=links.map((l,i)=>`
      <div class="link-editor">
        <strong>${escapeHTML(l.title)}</strong>
        <p class="muted">${escapeHTML(l.url)}</p>
        ${l.image?`<img src="${l.image}">`:""}
        <div class="row" style="margin-top:10px">
          <button class="btn secondary small" data-up="${i}">↑</button>
          <button class="btn secondary small" data-down="${i}">↓</button>
          <button class="btn secondary small" data-wiggle="${i}">
            ${l.wiggle?"Matikan Goyang":"Goyangkan"}
          </button>
          <button class="btn secondary small" data-editlink="${i}">Edit</button>
          <button class="btn danger small" data-delete="${i}">Hapus</button>
        </div>
      </div>
    `).join("");
  }

  container.querySelectorAll("[data-up]").forEach(b=>{
    b.onclick=()=>{
      const i=+b.dataset.up;
      if(i>0){
        [links[i],links[i-1]]=[links[i-1],links[i]];
        renderBioLinks();
      }
    };
  });

  container.querySelectorAll("[data-down]").forEach(b=>{
    b.onclick=()=>{
      const i=+b.dataset.down;
      if(i<links.length-1){
        [links[i],links[i+1]]=[links[i+1],links[i]];
        renderBioLinks();
      }
    };
  });

  container.querySelectorAll("[data-wiggle]").forEach(b=>{
    b.onclick=()=>{
      links[+b.dataset.wiggle].wiggle=
        !links[+b.dataset.wiggle].wiggle;
      renderBioLinks();
    };
  });

  container.querySelectorAll("[data-delete]").forEach(b=>{
    b.onclick=()=>{
      links.splice(+b.dataset.delete,1);
      renderBioLinks();
    };
  });

  container.querySelectorAll("[data-editlink]").forEach(b=>{
    b.onclick=()=>{
      const i=+b.dataset.editlink;
      const l=links[i];
      const name=prompt("Nama link:",l.title);
      if(name===null)return;
      const url=prompt("URL:",l.url);
      if(url===null)return;

      const safe=safeURL(url);
      if(!name.trim()||!safe){
        alert("Nama atau URL tidak valid.");
        return;
      }

      l.title=name.trim();
      l.url=safe;
      renderBioLinks();
    };
  });

  renderBioPreview();
}

/* =========================
   LIVE BIO PREVIEW
========================= */

function bioStyle(){
  const c1=$("bioBgColor").value;
  const c2=$("bioBgColor2").value;
  const type=$("bioBgType").value;

  const background=type==="gradient"
    ?`linear-gradient(135deg,${c1},${c2})`
    :c1;

  const shape=$("bioButtonShape").value;
  const radius=shape==="pill"?"999px":
    shape==="square"?"4px":"15px";

  return {background,radius};
}

function renderBioPreview(){
  const container=$("bioPreview");
  if(!container)return;

  const style=bioStyle();

  container.innerHTML=`
    <div class="bio-preview" style="
      background:${style.background};
      color:${$("bioTextColor").value};
    ">
      <h2>${escapeHTML($("bioTitle").value||"Nama Profil")}</h2>
      <p>${escapeHTML($("bioDesc").value||"Deskripsi profil")}</p>
      ${links.map(l=>`
        <a class="bio-btn ${l.wiggle?"wiggle":""}"
          href="${escapeHTML(l.url)}"
          style="
            background:${l.color||$("bioButtonColor").value};
            color:${l.textColor||$("bioButtonTextColor").value};
            border-radius:${style.radius};
          ">
          ${l.image?`<img src="${l.image}" alt="">`:""}
          ${escapeHTML(l.title)}
        </a>
      `).join("")}
      ${landingPages.filter(p=>p.published&&p.showInBio).map(p=>`
        <a class="bio-btn" href="${pageURL(p.slug)}"
          style="background:${$("bioButtonColor").value};
          color:${$("bioButtonTextColor").value};
          border-radius:${style.radius}">
          🌐 ${escapeHTML(p.title)}
        </a>
      `).join("")}
    </div>
  `;
}

[
  "bioTitle","bioDesc","bioBgType","bioBgColor",
  "bioBgColor2","bioTextColor","bioButtonColor",
  "bioButtonTextColor","bioButtonShape"
].forEach(id=>{
  $(id)?.addEventListener("input",renderBioPreview);
  $(id)?.addEventListener("change",renderBioPreview);
});

/* =========================
   SAVE / LOAD BIO
========================= */

$("saveBio").onclick=async()=>{
  if(!auth.currentUser)return;

  try{
    const bio={
      name:$("bioTitle").value.trim(),
      description:$("bioDesc").value.trim(),
      phone:auth.currentUser.phoneNumber||"",
      links,
      settings:{
        bgType:$("bioBgType").value,
        bgColor:$("bioBgColor").value,
        bgColor2:$("bioBgColor2").value,
        textColor:$("bioTextColor").value,
        buttonColor:$("bioButtonColor").value,
        buttonTextColor:$("bioButtonTextColor").value,
        shape:$("bioButtonShape").value
      },
      landingPages:landingPages.filter(p=>p.published&&p.showInBio)
        .map(p=>({id:p.id,title:p.title,slug:p.slug})),
      updatedAt:Date.now()
    };

    await DB.saveData(userPath("publicBio"),bio);

    const key=DB.normalizePhone(auth.currentUser.phoneNumber).replace(/\D/g,"");
    await DB.saveData(`phoneLookup/${key}`,{
      uid:auth.currentUser.uid,
      phone:auth.currentUser.phoneNumber
    });

    status("bioStatus","Bio Link berhasil disimpan!");
  }catch(e){
    console.error(e);
    status("bioStatus","Gagal: "+e.message);
  }
};

async function loadBio(){
  const data=await DB.getData(userPath("publicBio"));
  if(!data)return;

  $("bioTitle").value=data.name||"";
  $("bioDesc").value=data.description||"";
  links=Array.isArray(data.links)?data.links:[];

  const s=data.settings||{};
  if(s.bgType)$("bioBgType").value=s.bgType;
  if(s.bgColor)$("bioBgColor").value=s.bgColor;
  if(s.bgColor2)$("bioBgColor2").value=s.bgColor2;
  if(s.textColor)$("bioTextColor").value=s.textColor;
  if(s.buttonColor)$("bioButtonColor").value=s.buttonColor;
  if(s.buttonTextColor)$("bioButtonTextColor").value=s.buttonTextColor;
  if(s.shape)$("bioButtonShape").value=s.shape;

  renderBioLinks();
}

/* =========================
   BIO PUBLIC VIEW
========================= */

function publicBioHTML(bio){
  const s=bio.settings||{};
  const bg=s.bgType==="gradient"
    ?`linear-gradient(135deg,${s.bgColor||"#7357ef"},${s.bgColor2||"#b8aaff"})`
    :(s.bgColor||"#7357ef");

  const radius=s.shape==="pill"?"999px":
    s.shape==="square"?"4px":"15px";

  const buttons=(bio.links||[]).map(l=>{
    const url=safeURL(l.url);
    if(!url)return "";

    return `<a class="bio-btn ${l.wiggle?"wiggle":""}" href="${escapeHTML(url)}" target="_blank" rel="noopener"
      style="background:${l.color||s.buttonColor||"#fff"};
      color:${l.textColor||s.buttonTextColor||"#333"};
      border-radius:${radius}">
      ${l.image?`<img src="${l.image}" alt="">`:""}
      ${escapeHTML(l.title)}
    </a>`;
  }).join("");

  const pages=(bio.landingPages||[]).map(p=>`
    <a class="bio-btn" href="${pageURL(p.slug)}"
      style="background:${s.buttonColor||"#fff"};
      color:${s.buttonTextColor||"#333"};
      border-radius:${radius}">
      🌐 ${escapeHTML(p.title)}
    </a>
  `).join("");

  return `
    <div style="min-height:100vh;background:${bg};color:${s.textColor||"#fff"};font-family:Arial;padding:25px 15px">
      <div style="max-width:520px;margin:auto;text-align:center">
        <h1>${escapeHTML(bio.name||"POPER")}</h1>
        <p>${escapeHTML(bio.description||"")}</p>
        ${buttons}
        ${pages}
      </div>
    </div>
    <style>
      .bio-btn{display:block;text-align:center;text-decoration:none;padding:15px;margin:12px 0;font-weight:bold;overflow-wrap:anywhere}
      .bio-btn img{display:block;max-width:100%;max-height:200px;object-fit:contain;margin:0 auto 8px;border-radius:12px}
      .wiggle{animation:wiggle 1.6s infinite}
      @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-2deg)}75%{transform:rotate(2deg)}}
    </style>
  `;
}

$("openMyPublicBio").onclick=async()=>{
  try{
    const bio=await DB.getData(userPath("publicBio"));
    if(!bio){
      alert("Simpan Bio terlebih dahulu.");
      return;
    }

    const w=window.open("","_blank");
    if(!w){
      alert("Popup diblokir. Izinkan popup browser.");
      return;
    }

    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${publicBioHTML(bio)}</body></html>`);
    w.document.close();
  }catch(e){
    alert(e.message);
  }
};

/* =========================
   BIO LANDING PAGE SELECTOR
========================= */

function renderBioLandingList(){
  const container=$("bioLandingList");
  if(!container)return;

  const published=landingPages.filter(p=>p.published);
  container.innerHTML=published.length?published.map(p=>`
    <label style="display:flex;align-items:center;gap:10px;padding:10px">
      <input type="checkbox" style="width:auto;margin:0"
        data-bio-page="${p.id}" ${p.showInBio?"checked":""}>
      ${escapeHTML(p.title)}
    </label>
  `).join(""):"<p class='muted'>Belum ada halaman dipublikasikan.</p>";

  container.querySelectorAll("[data-bio-page]").forEach(c=>{
    c.onchange=()=>{
      const p=landingPages.find(x=>x.id===c.dataset.bioPage);
      if(p)p.showInBio=c.checked;
      renderBioPreview();
    };
  });
}

/* =========================
   PAGE EDITOR
========================= */

function getEditorContent(){
  return $("pageMode").value==="html"
    ?$("htmlEditor").value
    :$("visualEditor").innerHTML;
}

function setEditorContent(mode,content){
  $("pageMode").value=mode;
  $("visualEditorArea").classList.toggle("hidden",mode!=="visual");
  $("htmlEditorArea").classList.toggle("hidden",mode!=="html");

  if(mode==="html") $("htmlEditor").value=content||"";
  else $("visualEditor").innerHTML=content||"";
}

function updatePreview(){
  const frame=$("pagePreviewFrame");
  const html=getEditorContent();

  const doc=frame.contentDocument;
  if(!doc)return;

  doc.open();
  doc.write(`<!DOCTYPE html>
    <html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{font-family:Arial,sans-serif;color:#222;padding:15px;overflow-wrap:anywhere}
      img{max-width:100%;height:auto}
      *{box-sizing:border-box}
    </style>
    </head><body>${html}</body></html>`);
  doc.close();
}

$("pageMode").onchange=()=>{
  const mode=$("pageMode").value;
  $("visualEditorArea").classList.toggle("hidden",mode!=="visual");
  $("htmlEditorArea").classList.toggle("hidden",mode!=="html");
  updatePreview();
};

$("visualEditor").oninput=updatePreview;
$("htmlEditor").oninput=updatePreview;
$("previewPage").onclick=updatePreview;

$("clearPageEditor").onclick=()=>{
  if(!confirm("Bersihkan editor?"))return;
  $("visualEditor").innerHTML="";
  $("htmlEditor").value="";
  updatePreview();
};

document.querySelectorAll("[data-format]").forEach(b=>{
  b.onclick=()=>{
    $("visualEditor").focus();
    document.execCommand(b.dataset.format,false,null);
    updatePreview();
  };
});

$("pageTitle").oninput=()=>{
  if(!$("pageSlug").dataset.manual){
    $("pageSlug").value=slugify($("pageTitle").value);
  }
};

$("pageSlug").oninput=()=>{$("pageSlug").dataset.manual="1";};

/* =========================
   SAVE PAGE
========================= */

$("savePage").onclick=async()=>{
  if(!auth.currentUser)return;

  const title=$("pageTitle").value.trim();
  const slug=slugify($("pageSlug").value||title);
  const content=getEditorContent();

  if(!title||!slug||!content.trim()){
    status("pageStatus","Isi judul, slug dan konten.");
    return;
  }

  if(landingPages.some(p=>p.slug===slug&&p.id!==editingPageId)){
    status("pageStatus","Slug sudah dipakai.");
    return;
  }

  const page={
    id:editingPageId||makeId(),
    title,slug,content,
    mode:$("pageMode").value,
    published:true,
    showInBio:$("pageShowInBio").checked,
    updatedAt:Date.now()
  };

  try{
    const old=landingPages.find(p=>p.id===page.id);
    if(old&&old.slug!==slug){
      await DB.deleteData(`publicPages/${old.slug}`);
    }

    await DB.saveData(userPath(`landingPages/${page.id}`),page);

    await DB.saveData(`publicPages/${slug}`,{
      title,content,owner:uid(),published:true,updatedAt:page.updatedAt
    });

    const idx=landingPages.findIndex(p=>p.id===page.id);
    if(idx>=0)landingPages[idx]=page;
    else landingPages.push(page);

    renderPages();
    renderBioLandingList();
    renderBioPreview();
    status("pageStatus","Landing Page tersimpan!");
    resetPageEditor();
  }catch(e){
    console.error(e);
    status("pageStatus","Gagal simpan: "+e.message);
  }
};

function resetPageEditor(){
  editingPageId=null;
  $("pageTitle").value="";
  $("pageSlug").value="";
  delete $("pageSlug").dataset.manual;
  $("visualEditor").innerHTML="";
  $("htmlEditor").value="";
  $("pageShowInBio").checked=true;
  setEditorContent("visual","");
  updatePreview();
}

/* =========================
   PAGE LIST
========================= */

function renderPages(){
  const c=$("pagesList");
  if(!c)return;

  if(!landingPages.length){
    c.innerHTML="<p class='muted'>Belum ada halaman.</p>";
    return;
  }

  c.innerHTML=landingPages.map(p=>`
    <div class="page-card">
      <strong>${escapeHTML(p.title)}</strong>
      <p class="muted">${escapeHTML(p.slug)}</p>
      <div class="row">
        <button class="btn secondary small" data-page-open="${p.slug}">Buka</button>
        <button class="btn secondary small" data-page-copy="${p.slug}">Copy Link</button>
        <button class="btn secondary small" data-page-edit="${p.id}">Edit</button>
        <button class="btn danger small" data-page-delete="${p.id}">Hapus</button>
      </div>
    </div>
  `).join("");

  c.querySelectorAll("[data-page-open]").forEach(b=>{
    b.onclick=()=>window.open(pageURL(b.dataset.pageOpen),"_blank");
  });

  c.querySelectorAll("[data-page-copy]").forEach(b=>{
    b.onclick=async()=>{
      const link=pageURL(b.dataset.pageCopy);
      try{
        await navigator.clipboard.writeText(link);
        alert("Link disalin:\n"+link);
      }catch{
        prompt("Salin link:",link);
      }
    };
  });

  c.querySelectorAll("[data-page-edit]").forEach(b=>{
    b.onclick=()=>{
      const p=landingPages.find(x=>x.id===b.dataset.pageEdit);
      if(!p)return;
      editingPageId=p.id;
      $("pageTitle").value=p.title;
      $("pageSlug").value=p.slug;
      delete $("pageSlug").dataset.manual;
      $("pageShowInBio").checked=!!p.showInBio;
      setEditorContent(p.mode||"visual",p.content);
      showTab("pages");
      updatePreview();
    };
  });

  c.querySelectorAll("[data-page-delete]").forEach(b=>{
    b.onclick=async()=>{
      if(!confirm("Hapus halaman ini?"))return;
      const p=landingPages.find(x=>x.id===b.dataset.pageDelete);
      if(!p)return;

      try{
        await DB.deleteData(userPath(`landingPages/${p.id}`));
        await DB.deleteData(`publicPages/${p.slug}`);
        landingPages=landingPages.filter(x=>x.id!==p.id);
        renderPages();
        renderBioLandingList();
        renderBioPreview();
      }catch(e){
        alert("Gagal hapus: "+e.message);
      }
    };
  });
}

/* =========================
   PUBLIC PAGE MODE
========================= */

async function openPublicPage(slug){
  $("dashboard").classList.add("hidden");
  $("loginPanel").classList.add("hidden");
  $("bottomNav").classList.add("hidden");
  $("publicPageView").classList.remove("hidden");

  try{
    const p=await DB.getData(`publicPages/${slug}`);
    if(!p||!p.published){
      status("publicPageError","Halaman tidak ditemukan.");
      return;
    }

    const frame=document.createElement("iframe");
    frame.className="preview-frame";
    frame.style.height="100vh";
    frame.setAttribute("sandbox","allow-same-origin");
    $("publicPageContent").replaceChildren(frame);

    frame.contentDocument.open();
    frame.contentDocument.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${p.content}</body></html>`);
    frame.contentDocument.close();
    document.title=p.title||"POPER";
  }catch(e){
    status("publicPageError",e.message||"Gagal membuka halaman.");
  }
}

$("publicBack").onclick=()=>location.href=baseURL();

const publicSlug=new URLSearchParams(location.search).get("page");
if(publicSlug)openPublicPage(publicSlug);

/* =========================
   FIND BIO
========================= */

async function findBioByPhone(phone){
  const clean=DB.normalizePhone(phone).replace(/\D/g,"");
  if(!clean)throw new Error("Nomor HP tidak valid.");

  const lookup=await DB.getData(`phoneLookup/${clean}`);
  if(!lookup||typeof lookup.uid!=="string"||!lookup.uid){
    throw new Error("Bio tidak ditemukan.");
  }

  return await DB.getData(`users/${lookup.uid}/publicBio`);
}

$("findBio").onclick=async()=>{
  const b=$("findBio");
  const c=$("findResult");
  b.disabled=true;
  c.textContent="Mencari Bio...";

  try{
    const bio=await findBioByPhone($("findPhone").value);
    if(!bio){
      c.textContent="Bio belum dibuat.";
      return;
    }
    c.innerHTML=publicBioHTML(bio);
  }catch(e){
    c.textContent=e.message||"Gagal mencari.";
  }finally{
    b.disabled=false;
  }
};

$("searchScannedPhone").onclick=()=>{
  $("findPhone").value=$("scanPhoneResult").value;
  showTab("find");
  $("findBio").click();
};

/* =========================
   OCR SCANNER
========================= */

function extractPhones(text){
  const matches=text.match(/(?:\+?62|0)[\s.-]*(?:\d[\s.-]*){8,15}/g)||[];
  const result=[...new Set(matches.map(s=>{
    let n=s.replace(/\D/g,"");
    if(n.startsWith("62"))n="0"+n.slice(2);
    return n;
  }).filter(n=>/^08\d{8,13}$/.test(n)))];
  return result;
}

async function scanImage(file){
  if(!file)return;
  status("scanStatus","OCR sedang membaca gambar...");
  $("ocrResults").innerHTML="";

  try{
    const result=await Tesseract.recognize(file,"eng",{
      logger:m=>{
        if(m.status==="recognizing text"){
          status("scanStatus",`Membaca ${Math.round((m.progress||0)*100)}%`);
        }
      }
    });

    const phones=extractPhones(result.data.text);
    status("scanStatus",phones.length
      ?`Ditemukan ${phones.length} nomor HP.`
      :"Nomor HP tidak ditemukan. Coba gambar yang lebih jelas.");

    $("ocrResults").innerHTML=phones.map(p=>`
      <button class="btn secondary small" data-phone="${escapeHTML(p)}">${escapeHTML(p)}</button>
    `).join("");

    $("ocrResults").querySelectorAll("[data-phone]").forEach(b=>{
      b.onclick=()=>{
        $("scanPhoneResult").value=b.dataset.phone;
        $("findPhone").value=b.dataset.phone;
      };
    });

    if(phones.length===1){
      $("scanPhoneResult").value=phones[0];
    }
  }catch(e){
    console.error(e);
    status("scanStatus","OCR gagal: "+(e.message||""));
  }
}

$("uploadScanBtn").onclick=()=>{
  scanImage($("scanImageInput").files?.[0]);
};

$("scanImageInput").onchange=()=>{
  const f=$("scanImageInput").files?.[0];
  if(f)scanImage(f);
};

$("startCameraBtn").onclick=async()=>{
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"environment"},audio:false
    });
    $("cameraVideo").srcObject=cameraStream;
  }catch(e){
    status("scanStatus","Kamera tidak tersedia: "+e.message);
  }
};

$("captureBtn").onclick=()=>{
  const v=$("cameraVideo");
  if(!v.videoWidth){
    status("scanStatus","Buka kamera terlebih dahulu.");
    return;
  }
  const canvas=document.createElement("canvas");
  canvas.width=v.videoWidth;
  canvas.height=v.videoHeight;
  canvas.getContext("2d").drawImage(v,0,0);
  canvas.toBlob(blob=>{
    if(blob)scanImage(blob);
  },"image/jpeg",0.9);
};

$("stopCameraBtn").onclick=()=>{
  cameraStream?.getTracks().forEach(t=>t.stop());
  cameraStream=null;
  $("cameraVideo").srcObject=null;
};

/* =========================
   QR VAULT
========================= */

$("saveQR").onclick=async()=>{
  const name=$("qrName").value.trim()||"QR Link";
  const url=safeURL($("qrUrl").value.trim());

  if(!url){
    status("qrScanStatus","URL tidak valid.");
    return;
  }

  try{
    await DB.pushData(userPath("qrVault"),{
      name,url,createdAt:Date.now()
    });
    $("qrName").value="";
    $("qrUrl").value="";
    status("qrScanStatus","QR link tersimpan.");
    loadQR();
  }catch(e){
    status("qrScanStatus",e.message);
  }
};

async function loadQR(){
  const data=await DB.getData(userPath("qrVault"));
  const c=$("qrList");

  if(!data){
    c.innerHTML="<p class='muted'>Vault kosong.</p>";
    return;
  }

  c.innerHTML=Object.entries(data).map(([id,q])=>`
    <div class="page-card">
      <strong>${escapeHTML(q.name)}</strong>
      <p>${escapeHTML(q.url)}</p>
      <a href="${escapeHTML(safeURL(q.url))}" target="_blank">Buka link</a>
      <button class="btn danger small" data-qr-delete="${id}">Hapus</button>
    </div>
  `).join("");

  c.querySelectorAll("[data-qr-delete]").forEach(b=>{
    b.onclick=async()=>{
      await DB.deleteData(userPath("qrVault/"+b.dataset.qrDelete));
      loadQR();
    };
  });
}

/* =========================
   NOTES
========================= */

$("saveNote").onclick=async()=>{
  const title=$("noteTitle").value.trim();
  const content=$("noteContent").value.trim();
  if(!title||!content){
    alert("Isi judul dan isi catatan.");
    return;
  }

  try{
    await DB.pushData(userPath("notes"),{
      title,content,createdAt:Date.now()
    });
    $("noteTitle").value="";
    $("noteContent").value="";
    loadNotes();
  }catch(e){
    alert(e.message);
  }
};

async function loadNotes(){
  const data=await DB.getData(userPath("notes"));
  notes=data?Object.entries(data).map(([id,n])=>({...n,id})):[];

  const c=$("notesList");
  if(!notes.length){
    c.innerHTML="<p class='muted'>Belum ada catatan.</p>";
    return;
  }

  c.innerHTML=notes.map(n=>`
    <div class="page-card">
      <strong>${escapeHTML(n.title)}</strong>
      <p>${escapeHTML(n.content)}</p>
      <button class="btn danger small" data-note-delete="${n.id}">Hapus</button>
    </div>
  `).join("");

  c.querySelectorAll("[data-note-delete]").forEach(b=>{
    b.onclick=async()=>{
      await DB.deleteData(userPath("notes/"+b.dataset.noteDelete));
      loadNotes();
    };
  });
}

/* =========================
   LOAD ALL
========================= */

async function loadPages(){
  const data=await DB.getData(userPath("landingPages"));
  landingPages=data?Object.values(data):[];
  renderPages();
  renderBioLandingList();
  renderBioPreview();
}

async function loadAll(){
  try{
    await Promise.all([
      loadBio(),
      loadQR(),
      loadNotes(),
      loadPages()
    ]);
  }catch(e){
    console.error("POPER Load:",e);
  }
}

/* =========================
   INIT
========================= */

renderBioLinks();
renderBioPreview();
updatePreview();

console.log("POPER FIX loaded.");
