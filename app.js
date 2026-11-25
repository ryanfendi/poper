
import "./firebase.js";

const $ = id => document.getElementById(id);
const P = window.POPER;
const auth = P.auth;

let confirmation = null;
let bioLinks = [];
let pages = [];
let chosenImage = "";
let cameraStream = null;

function currentUser(){
  const u = auth.currentUser;
  return u && typeof u.uid === "string" ? u : null;
}

function status(id,text){
  const el = $(id);
  if(el) el.textContent = text || "";
}

function esc(value=""){
  return String(value).replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function validURL(value=""){
  try{
    const u = new URL(value);
    return ["http:","https:"].includes(u.protocol) ? u.href : "";
  }catch{
    return "";
  }
}

function makeId(){
  return "p" + Date.now().toString(36) +
    Math.random().toString(36).slice(2,7);
}

function slugify(value=""){
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9 -]/g,"")
    .replace(/\s+/g,"-")
    .replace(/-+/g,"-")
    .slice(0,55);
}

function phoneKey(phone=""){
  return P.normalizePhone(phone).replace(/\D/g,"");
}

function baseURL(){
  return location.href.split("?")[0].split("#")[0];
}

function pageURL(slug){
  return baseURL()+"?page="+encodeURIComponent(slug);
}

/* THEME */
function setTheme(theme){
  document.documentElement.dataset.theme=theme;
  try{
    localStorage.setItem("poper-theme",theme);
  }catch{}
}

try{
  setTheme(localStorage.getItem("poper-theme")||"dark");
}catch{
  setTheme("dark");
}

$("themeBtn").onclick=()=>{
  const current=document.documentElement.dataset.theme;
  setTheme(current==="dark"?"light":"dark");
};

/* PUBLIC LANDING PAGE */
const publicSlug=new URLSearchParams(location.search).get("page");

async function openPublicPage(slug){
  $("mainApp").classList.add("hide");
  $("publicPageView").classList.remove("hide");

  try{
    const page=await P.getData("publicPages/"+slug);

    if(!page || !page.published){
      $("publicPageError").textContent=
        "Halaman tidak ditemukan atau belum dipublikasikan.";
      return;
    }

    $("publicPageContent").innerHTML=page.content||"";
    document.title=page.title||"POPER Page";
  }catch(e){
    $("publicPageError").textContent=
      e.message||"Gagal memuat halaman.";
  }
}

$("publicBack").onclick=()=>location.href=baseURL();

if(publicSlug){
  openPublicPage(publicSlug);
}

/* NAVIGATION */
function showTab(name){
  if(publicSlug)return;

  document.querySelectorAll(".section").forEach(s=>{
    s.classList.toggle("active",s.id===name);
  });

  document.querySelectorAll(".nav-btn").forEach(b=>{
    b.classList.toggle("active",b.dataset.tab===name);
  });

  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll("[data-tab]").forEach(b=>{
  b.onclick=()=>showTab(b.dataset.tab);
});

/* AUTH */
$("sendOtpBtn").onclick=async()=>{
  const phone=$("phoneInput").value.trim();

  if(!phone){
    status("authStatus","Masukkan nomor HP.");
    return;
  }

  try{
    status("authStatus","Mengirim OTP...");
    confirmation=await P.sendOTP(phone);
    $("otpSection").classList.remove("hide");
    status("authStatus","OTP terkirim. Periksa SMS.");
  }catch(e){
    status("authStatus",e.message||"Gagal mengirim OTP.");
    try{
      await P.resetRecaptcha();
    }catch{}
  }
};

$("verifyOtpBtn").onclick=async()=>{
  const code=$("otpInput").value.trim();

  if(!confirmation||!code){
    status("authStatus","Masukkan kode OTP.");
    return;
  }

  try{
    const result=await confirmation.confirm(code);
    status("authStatus","Login berhasil.");
    showLoginState(result.user);
  }catch(e){
    status("authStatus",e.message||"OTP salah.");
  }
};

$("logoutBtn").onclick=()=>P.logout().catch(e=>alert(e.message));

P.onAuth(user=>{
  showLoginState(user);
});

function showLoginState(user){
  if(publicSlug)return;

  $("loginPanel").classList.toggle("hide",!!user);
  $("dashboard").classList.toggle("hide",!user);
  $("logoutBtn").classList.toggle("hide",!user);

  if(user){
    $("myPhone").textContent=user.phoneNumber||"";
    loadAll().catch(console.error);
  }
}

/* IMAGE COMPRESSION */
function fileToSmallDataURL(file,max=700){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();

    reader.onerror=reject;

    reader.onload=()=>{
      const img=new Image();

      img.onerror=reject;

      img.onload=()=>{
        const scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement("canvas");

        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));

        canvas.getContext("2d").drawImage(
          img,0,0,canvas.width,canvas.height
        );

        resolve(canvas.toDataURL("image/jpeg",.78));
      };

      img.src=reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/* BIO IMAGE */
$("bioImage").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;

  if(file.size>5*1024*1024){
    status("bioStatus","Ukuran gambar maksimal 5MB.");
    e.target.value="";
    return;
  }

  try{
    chosenImage=await fileToSmallDataURL(file);
    $("bioImagePreview").src=chosenImage;
    $("bioImagePreview").classList.remove("hide");
  }catch{
    status("bioStatus","Gagal memuat gambar.");
  }
};

$("clearBioImage").onclick=()=>{
  chosenImage="";
  $("bioImage").value="";
  $("bioImagePreview").src="";
  $("bioImagePreview").classList.add("hide");
};

/* ADD BIO LINK */
$("addBioLink").onclick=()=>{
  const title=$("bioTitle").value.trim();
  const url=validURL($("bioUrl").value.trim());

  if(!title||!url){
    status("bioStatus","Masukkan judul dan URL valid.");
    return;
  }

  bioLinks.push({
    id:makeId(),
    title,
    url,
    image:chosenImage,
    wiggle:$("bioWiggle").checked
  });

  $("bioTitle").value="";
  $("bioUrl").value="";
  $("bioWiggle").checked=false;
  chosenImage="";
  $("bioImage").value="";
  $("bioImagePreview").classList.add("hide");

  renderBioLinks();
};

/* RENDER BIO LINKS */
function renderBioLinks(){
  const box=$("bioLinks");
  if(!box)return;

  if(!bioLinks.length){
    box.innerHTML='<p class="subtle">Belum ada link.</p>';
    renderBioPreview();
    return;
  }

  box.innerHTML=bioLinks.map((l,i)=>`
    <div class="item">
      <div class="link-card">
        ${l.image?`<img src="${l.image}" alt="">`:""}
        <div>
          <strong>${esc(l.title)}</strong>
          <div class="small subtle">${esc(l.url)}</div>
          <small>${l.wiggle?"Animasi aktif":"Animasi mati"}</small>
        </div>
      </div>

      <div class="item-actions">
        <button class="secondary" data-up="${i}">↑</button>
        <button class="secondary" data-down="${i}">↓</button>
        <button class="secondary" data-wiggle="${i}">
          ${l.wiggle?"Matikan goyang":"Aktifkan goyang"}
        </button>
        <button class="danger" data-remove="${i}">Hapus</button>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-remove]").forEach(b=>{
    b.onclick=()=>{
      bioLinks.splice(Number(b.dataset.remove),1);
      renderBioLinks();
    };
  });

  box.querySelectorAll("[data-up]").forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.up);
      if(i>0){
        [bioLinks[i-1],bioLinks[i]]=
        [bioLinks[i],bioLinks[i-1]];
        renderBioLinks();
      }
    };
  });

  box.querySelectorAll("[data-down]").forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.down);
      if(i<bioLinks.length-1){
        [bioLinks[i],bioLinks[i+1]]=
        [bioLinks[i+1],bioLinks[i]];
        renderBioLinks();
      }
    };
  });

  box.querySelectorAll("[data-wiggle]").forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.wiggle);
      bioLinks[i].wiggle=!bioLinks[i].wiggle;
      renderBioLinks();
    };
  });

  renderBioPreview();
}

/* LIVE PREVIEW */
function renderBioPreview(){
  const box=$("bioLivePreview");
  if(!box)return;

  const bg=$("bioBgColor").value;
  const buttonColor=$("bioButtonColor").value;

  box.style.background=bg;

  box.innerHTML=`
    <h2>${esc($("bioName").value||"Nama Bio")}</h2>
    <p>${esc($("bioDesc").value||"Deskripsi Bio")}</p>

    ${bioLinks.map(l=>`
      <a
        class="${l.wiggle?"wiggle":""}"
        style="background:${buttonColor}"
        href="${esc(l.url)}"
        target="_blank"
        rel="noopener">
        ${l.image?`<img src="${l.image}" alt="">`:""}
        ${esc(l.title)}
      </a>
    `).join("")}

    ${pages.filter(p=>p.published&&p.showInBio).map(p=>`
      <a style="background:${buttonColor}"
         href="${pageURL(p.slug)}">
         📄 ${esc(p.title)}
      </a>
    `).join("")}
  `;
}

["bioName","bioDesc","bioBgColor","bioButtonColor"].forEach(id=>{
  $(id).addEventListener("input",renderBioPreview);
});

/* SAVE BIO */
$("saveBio").onclick=async()=>{
  const u=currentUser();

  if(!u){
    status("bioStatus","Login terlebih dahulu.");
    return;
  }

  try{
    const bio={
      name:$("bioName").value.trim(),
      description:$("bioDesc").value.trim(),
      phone:u.phoneNumber||"",
      links:bioLinks,
      bgColor:$("bioBgColor").value,
      buttonColor:$("bioButtonColor").value,
      landingPages:pages.filter(p=>p.published&&p.showInBio).map(p=>({
        id:p.id,
        title:p.title,
        slug:p.slug
      })),
      updatedAt:Date.now()
    };

    await P.saveData(`users/${u.uid}/publicBio`,bio);

    await P.saveData(
      `phoneLookup/${phoneKey(u.phoneNumber)}`,
      {uid:u.uid,phone:u.phoneNumber}
    );

    status("bioStatus","Bio berhasil disimpan!");
  }catch(e){
    status("bioStatus","Gagal menyimpan: "+(e.message||e));
  }
};

/* BIO HTML */
function bioHTML(b){
  const color=b.buttonColor||"#7659ee";
  const bg=b.bgColor||"#151a2d";

  return `
    <!doctype html>
    <html>
    <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(b.name||"Bio")}</title>
    <style>
      body{
        font:16px system-ui;
        margin:0;
        background:${bg};
        color:white;
      }
      .bio{
        max-width:540px;
        margin:auto;
        padding:24px;
        text-align:center;
      }
      .bio a{
        display:flex;
        gap:10px;
        align-items:center;
        justify-content:center;
        color:white;
        background:${color};
        padding:14px;
        margin:12px 0;
        border-radius:14px;
        text-decoration:none;
        font-weight:700;
      }
      .bio img{
        width:46px;
        height:46px;
        object-fit:cover;
        border-radius:8px;
      }
      .w{
        animation:w .8s infinite;
      }
      @keyframes w{
        25%{transform:rotate(-2deg)}
        75%{transform:rotate(2deg)}
      }
    </style>
    </head>
    <body>
    <div class="bio">
      <h1>${esc(b.name||"POPER")}</h1>
      <p>${esc(b.description||"")}</p>

      ${(b.links||[]).map(l=>`
        <a class="${l.wiggle?"w":""}"
           href="${esc(validURL(l.url))}"
           target="_blank"
           rel="noopener">
          ${l.image?`<img src="${l.image}" alt="">`:""}
          ${esc(l.title)}
        </a>
      `).join("")}

      ${(b.landingPages||[]).map(p=>`
        <a href="${pageURL(p.slug)}">📄 ${esc(p.title)}</a>
      `).join("")}
    </div>
    </body>
    </html>
  `;
}

$("openMyPublicBio").onclick=async()=>{
  const u=currentUser();
  if(!u)return;

  try{
    const b=await P.getData(`users/${u.uid}/publicBio`);

    if(!b){
      alert("Simpan Bio terlebih dahulu.");
      return;
    }

    const w=window.open("","_blank");

    if(!w){
      alert("Popup diblokir browser.");
      return;
    }

    w.document.open();
    w.document.write(bioHTML(b));
    w.document.close();
  }catch(e){
    alert(e.message||"Gagal membuka Bio.");
  }
};

/* OCR IMAGE */
$("phoneImage").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;

  status("ocrStatus","Sedang membaca gambar...");

  try{
    if(!window.Tesseract){
      throw new Error("OCR belum siap. Refresh halaman.");
    }

    const result=await Tesseract.recognize(file,"eng");
    const text=result.data.text||"";

    const matches=text.match(/(?:\+?62|0)\s*[0-9\s().-]{7,16}/g)||[];

    if(!matches.length){
      status("ocrStatus","Nomor tidak terdeteksi. Ketik manual.");
      return;
    }

    const number=matches[0].replace(/[^0-9+]/g,"");
    $("findPhone").value=number;

    status("ocrStatus","Nomor ditemukan: "+number);
  }catch(e){
    status("ocrStatus",e.message||"OCR gagal.");
  }
};

/* CAMERA */
$("startCamera").onclick=async()=>{
  try{
    if(!navigator.mediaDevices?.getUserMedia){
      throw new Error("Browser tidak mendukung kamera.");
    }

    cameraStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"environment"},
      audio:false
    });

    $("cameraVideo").srcObject=cameraStream;
    $("cameraVideo").classList.remove("hide");

    status("ocrStatus","Kamera aktif. Tekan Ambil & Baca.");

    if(!$("captureOCR")){
      const btn=document.createElement("button");
      btn.id="captureOCR";
      btn.textContent="📸 Ambil & Baca Nomor";
      btn.style.margin="10px 0";

      $("cameraVideo").after(btn);

      btn.onclick=async()=>{
        const video=$("cameraVideo");
        const canvas=document.createElement("canvas");

        canvas.width=video.videoWidth;
        canvas.height=video.videoHeight;

        canvas.getContext("2d").drawImage(video,0,0);

        canvas.toBlob(async blob=>{
          if(!blob)return;

          status("ocrStatus","Membaca gambar kamera...");

          try{
            const result=await Tesseract.recognize(blob,"eng");
            const text=result.data.text||"";
            const matches=text.match(/(?:\+?62|0)\s*[0-9\s().-]{7,16}/g)||[];

            if(matches.length){
              const number=matches[0].replace(/[^0-9+]/g,"");
              $("findPhone").value=number;
              status("ocrStatus","Nomor terdeteksi: "+number);
            }else{
              status("ocrStatus","Nomor tidak ditemukan. Coba lagi.");
            }
          }catch(e){
            status("ocrStatus","OCR gagal: "+(e.message||e));
          }
        },"image/jpeg",.9);
      };
    }
  }catch(e){
    status("ocrStatus","Kamera gagal: "+(e.message||e));
  }
};

$("stopCamera").onclick=stopCamera;

function stopCamera(){
  if(cameraStream){
    cameraStream.getTracks().forEach(t=>t.stop());
    cameraStream=null;
  }

  if($("cameraVideo")){
    $("cameraVideo").srcObject=null;
    $("cameraVideo").classList.add("hide");
  }

  $("captureOCR")?.remove();
}

/* FIND BIO */
$("findBio").onclick=async()=>{
  const raw=$("findPhone").value.trim();
  const result=$("findResult");

  result.textContent="Mencari Bio...";

  if(!raw){
    result.textContent="Masukkan nomor HP.";
    return;
  }

  try{
    const lookup=await P.getData("phoneLookup/"+phoneKey(raw));

    if(!lookup||typeof lookup.uid!=="string"||!lookup.uid){
      result.textContent="Bio tidak ditemukan.";
      return;
    }

    const bio=await P.getData(`users/${lookup.uid}/publicBio`);

    if(!bio){
      result.textContent="Bio belum dipublikasikan.";
      return;
    }

    result.innerHTML=bioHTMLInline(bio);
  }catch(e){
    result.textContent="Pencarian gagal: "+(e.message||e);
  }
};

function bioHTMLInline(b){
  const bg=b.bgColor||"#151a2d";
  const color=b.buttonColor||"#7659ee";

  return `
    <div class="item">
      <div class="bio-preview" style="background:${bg};color:white">
        <h2>${esc(b.name||"POPER")}</h2>
        <p>${esc(b.description||"")}</p>

        ${(b.links||[]).map(l=>`
          <a style="background:${color}"
             class="${l.wiggle?"wiggle":""}"
             href="${esc(validURL(l.url))}"
             target="_blank" rel="noopener">
            ${l.image?`<img src="${l.image}" alt="">`:""}
            ${esc(l.title)}
          </a>
        `).join("")}

        ${(b.landingPages||[]).map(p=>`
          <a style="background:${color}"
             href="${pageURL(p.slug)}">
             📄 ${esc(p.title)}
          </a>
        `).join("")}
      </div>
    </div>
  `;
}

/* LANDING PAGE */
$("pageTitle").addEventListener("input",()=>{
  if(!$("pageSlug").dataset.manual){
    $("pageSlug").value=slugify($("pageTitle").value);
  }
});

$("pageSlug").addEventListener("input",()=>{
  $("pageSlug").dataset.manual="1";
});

$("previewPage").onclick=()=>{
  previewHTML($("pageHTML").value);
};

function previewHTML(html){
  $("pagePreview").srcdoc=`
    <!doctype html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body{font:16px system-ui;padding:16px;color:#222}
        img{max-width:100%;height:auto}
      </style>
    </head>
    <body>${html||""}</body>
    </html>
  `;
};

$("savePage").onclick=async()=>{
  const u=currentUser();

  if(!u){
    status("pageStatus","Login terlebih dahulu.");
    return;
  }

  const title=$("pageTitle").value.trim();
  const slug=slugify($("pageSlug").value||title);
  const content=$("pageHTML").value.trim();
  const editId=$("savePage").dataset.editId||"";

  if(!title||!slug||!content){
    status("pageStatus","Isi judul, slug, dan HTML.");
    return;
  }

  if(pages.some(p=>p.slug===slug&&p.id!==editId)){
    status("pageStatus","Slug sudah digunakan.");
    return;
  }

  const id=editId||makeId();

  const page={
    id,title,slug,content,
    showInBio:$("pageShowInBio").checked,
    published:true,
    updatedAt:Date.now()
  };

  try{
    await P.saveData(`users/${u.uid}/landingPages/${id}`,page);

    await P.saveData(`publicPages/${slug}`,{
      title,content,owner:u.uid,
      published:true,
      updatedAt:page.updatedAt
    });

    const old=pages.find(p=>p.id===id);

    if(old&&old.slug!==slug){
      await P.deleteData(`publicPages/${old.slug}`);
    }

    pages=pages.filter(p=>p.id!==id);
    pages.push(page);

    delete $("savePage").dataset.editId;

    renderPages();
    renderBioPreview();

    status("pageStatus","Landing Page diterbitkan: "+pageURL(slug));
  }catch(e){
    status("pageStatus","Gagal menyimpan: "+(e.message||e));
  }
};

/* RENDER PAGE LIST */
function renderPages(){
  const box=$("pagesList");
  if(!box)return;

  if(!pages.length){
    box.innerHTML='<p class="subtle">Belum ada Landing Page.</p>';
    return;
  }

  box.innerHTML=pages.map(p=>`
    <div class="item">
      <strong>${esc(p.title)}</strong>
      <p class="small">${esc(pageURL(p.slug))}</p>

      <div class="item-actions">
        <button class="secondary" data-copy="${esc(p.slug)}">Salin Link</button>
        <button class="secondary" data-open="${esc(p.slug)}">Buka</button>
        <button class="secondary" data-edit="${esc(p.id)}">Edit</button>
        <button class="danger" data-delete="${esc(p.id)}">Hapus</button>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-copy]").forEach(b=>{
    b.onclick=()=>{
      const link=pageURL(b.dataset.copy);
      navigator.clipboard.writeText(link)
        .then(()=>alert("Link disalin"))
        .catch(()=>prompt("Salin link:",link));
    };
  });

  box.querySelectorAll("[data-open]").forEach(b=>{
    b.onclick=()=>window.open(pageURL(b.dataset.open),"_blank");
  });

  box.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick=()=>{
      const p=pages.find(x=>x.id===b.dataset.edit);
      if(!p)return;

      $("pageTitle").value=p.title;
      $("pageSlug").value=p.slug;
      delete $("pageSlug").dataset.manual;
      $("pageHTML").value=p.content;
      $("pageShowInBio").checked=!!p.showInBio;
      $("savePage").dataset.editId=p.id;

      previewHTML(p.content);
      showTab("pages");
    };
  });

  box.querySelectorAll("[data-delete]").forEach(b=>{
    b.onclick=async()=>{
      if(!confirm("Hapus Landing Page ini?"))return;

      const u=currentUser();
      const p=pages.find(x=>x.id===b.dataset.delete);

      if(!u||!p)return;

      try{
        await P.deleteData(`users/${u.uid}/landingPages/${p.id}`);
        await P.deleteData(`publicPages/${p.slug}`);

        pages=pages.filter(x=>x.id!==p.id);
        renderPages();
        renderBioPreview();
      }catch(e){
        alert("Gagal menghapus: "+(e.message||e));
      }
    };
  });
}

/* QR VAULT */
$("saveQR").onclick=async()=>{
  const u=currentUser();
  const name=$("qrName").value.trim()||"Saved Link";
  const url=validURL($("qrUrl").value.trim());

  if(!u)return;

  if(!url){
    status("qrScanStatus","Masukkan URL valid.");
    return;
  }

  try{
    await P.pushData(`qrVault/${u.uid}`,{
      name,url,createdAt:Date.now()
    });

    $("qrName").value="";
    $("qrUrl").value="";
    status("qrScanStatus","Link berhasil disimpan.");
    loadQR();
  }catch(e){
    status("qrScanStatus",e.message||"Gagal menyimpan.");
  }
};

async function loadQR(){
  const u=currentUser();
  if(!u)return;

  const data=await P.getData(`qrVault/${u.uid}`);
  const box=$("qrList");

  if(!data){
    box.innerHTML='<p class="subtle">Vault kosong.</p>';
    return;
  }

  box.innerHTML=Object.entries(data).map(([k,v])=>`
    <div class="item">
      <strong>${esc(v.name)}</strong>
      <p>${esc(v.url)}</p>
      <a href="${esc(validURL(v.url))}" target="_blank" rel="noopener">Buka Link</a>
      <button class="danger" data-qrdel="${esc(k)}">Hapus</button>
    </div>
  `).join("");

  box.querySelectorAll("[data-qrdel]").forEach(b=>{
    b.onclick=async()=>{
      await P.deleteData(`qrVault/${u.uid}/${b.dataset.qrdel}`);
      loadQR();
    };
  });
}

/* NOTES */
$("saveNote").onclick=async()=>{
  const u=currentUser();
  const title=$("noteTitle").value.trim();
  const content=$("noteContent").value.trim();

  if(!u)return;

  if(!title||!content){
    alert("Isi judul dan catatan.");
    return;
  }

  try{
    await P.pushData(`notes/${u.uid}`,{
      title,content,createdAt:Date.now()
    });

    $("noteTitle").value="";
    $("noteContent").value="";
    loadNotes();
  }catch(e){
    alert(e.message||"Gagal menyimpan.");
  }
};

async function loadNotes(){
  const u=currentUser();
  if(!u)return;

  const data=await P.getData(`notes/${u.uid}`);
  const box=$("notesList");

  if(!data){
    box.innerHTML='<p class="subtle">Belum ada catatan.</p>';
    return;
  }

  box.innerHTML=Object.entries(data).map(([k,n])=>`
    <div class="item">
      <strong>${esc(n.title)}</strong>
      <p>${esc(n.content)}</p>
      <button class="danger" data-notedel="${esc(k)}">Hapus</button>
    </div>
  `).join("");

  box.querySelectorAll("[data-notedel]").forEach(b=>{
    b.onclick=async()=>{
      await P.deleteData(`notes/${u.uid}/${b.dataset.notedel}`);
      loadNotes();
    };
  });
}

/* LOAD BIO */
async function loadBio(){
  const u=currentUser();
  if(!u)return;

  const b=await P.getData(`users/${u.uid}/publicBio`);

  if(!b){
    bioLinks=[];
    renderBioLinks();
    return;
  }

  $("bioName").value=b.name||"";
  $("bioDesc").value=b.description||"";
  $("bioBgColor").value=b.bgColor||"#151a2d";
  $("bioButtonColor").value=b.buttonColor||"#7659ee";

  bioLinks=Array.isArray(b.links)?b.links:
    (b.links?Object.values(b.links):[]);

  bioLinks=bioLinks.map(l=>({
    id:l.id||makeId(),
    title:l.title||"",
    url:l.url||"",
    image:l.image||"",
    wiggle:!!l.wiggle
  }));

  renderBioLinks();
}

/* LOAD PAGES */
async function loadPages(){
  const u=currentUser();
  if(!u)return;

  const data=await P.getData(`users/${u.uid}/landingPages`);
  pages=data?Object.values(data):[];

  renderPages();
  renderBioPreview();
}

/* LOAD EVERYTHING */
async function loadAll(){
  await Promise.allSettled([
    loadBio(),
    loadQR(),
    loadNotes(),
    loadPages()
  ]);
}

renderBioLinks();
renderPages();
renderBioPreview();

console.log("POPER Recovery ready.");
