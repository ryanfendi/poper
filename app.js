
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;
const db = window.POPER.db;

let confirmation = null;
let links = [];

function phoneKey(phone){
  return window.POPER.normalizePhone(phone).replace(/\D/g,"");
}

function showStatus(id,msg){
  const el=$(id);
  if(el) el.textContent=msg;
}

function safeURL(url){
  try{
    const u=new URL(url);
    return ["http:","https:"].includes(u.protocol)?u.href:null;
  }catch{return null}
}

function escapeHTML(str=""){
  return String(str).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#39;"
  }[c]));
}

/* AUTH */

function loginUI(user){
  $("loginPanel").hidden=!!user;
  $("dashboard").hidden=!user;
  $("logoutBtn").hidden=!user;

  if(user){
    $("myPhone").textContent=user.phoneNumber||"";
    $("welcome").textContent="Selamat datang di POPER";
    loadAll();
  }
}

$("sendOtpBtn").onclick=async()=>{
  try{
    confirmation=await window.POPER.sendOTP($("phoneInput").value);
    $("otpSection").hidden=false;
    showStatus("authStatus","OTP terkirim. Periksa SMS.");
  }catch(e){
    showStatus("authStatus",e.message);
    await window.POPER.resetRecaptcha();
  }
};

$("verifyOtpBtn").onclick=async()=>{
  try{
    if(!confirmation)throw Error("Kirim OTP dahulu");
    const result=await confirmation.confirm($("otpInput").value.trim());
    confirmation=null;
    loginUI(result.user);
  }catch(e){
    showStatus("authStatus","OTP salah atau kedaluwarsa.");
  }
};

$("logoutBtn").onclick=async()=>{
  await window.POPER.logout();
};

/* TABS */

document.querySelectorAll(".tab").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  };
});

/* BIO LINKS */

$("addBioLink").onclick=()=>{
  const title=$("bioTitle").value.trim();
  const url=safeURL($("bioUrl").value.trim());
  if(!title||!url)return alert("Isi judul dan URL valid dahulu.");

  links.push({title,url});
  $("bioTitle").value="";
  $("bioUrl").value="";
  renderLinks();
};

function renderLinks(){
  $("bioLinks").innerHTML=links.map((l,i)=>`
    <div class="item">
      <b>${escapeHTML(l.title)}</b><br>
      <a href="${escapeHTML(l.url)}" target="_blank" rel="noopener">${escapeHTML(l.url)}</a>
      <button class="secondary" data-del-link="${i}">Hapus</button>
    </div>`).join("");

  $("bioLinks").querySelectorAll("[data-del-link]").forEach(btn=>{
    btn.onclick=()=>{
      links.splice(Number(btn.dataset.delLink),1);
      renderLinks();
    };
  });
}

$("saveBio").onclick=async()=>{
  const user=auth.currentUser;
  if(!user)return alert("Login dahulu");

  try{
    const profile={
      name:$("bioName").value.trim(),
      description:$("bioDesc").value.trim(),
      phone:user.phoneNumber,
      links,
      updatedAt:Date.now()
    };

    await window.POPER.saveData("users/"+user.uid+"/publicBio",profile);
    await window.POPER.saveData("phoneLookup/"+phoneKey(user.phoneNumber),{
      uid:user.uid,
      phone:user.phoneNumber
    });

    showStatus("bioStatus","Bio berhasil disimpan online!");
  }catch(e){
    showStatus("bioStatus","Gagal: "+e.message);
  }
};

async function loadBio(){
  const user=auth.currentUser;
  if(!user)return;

  const p=await window.POPER.getData("users/"+user.uid+"/publicBio");
  if(!p)return;

  $("bioName").value=p.name||"";
  $("bioDesc").value=p.description||"";
  links=Array.isArray(p.links)?p.links:[[];
  renderLinks();
}

/* QR VAULT */

$("saveQR").onclick=async()=>{
  const name=$("qrName").value.trim();
  const value=$("qrUrl").value.trim();
  if(!name||!value)return alert("Isi nama dan data QR");

  try{
    await window.POPER.pushData("qrVault/"+auth.currentUser.uid,{
      name,value,createdAt:Date.now()
    });
    $("qrName").value="";
    $("qrUrl").value="";
    loadQR();
  }catch(e){alert("Gagal simpan QR: "+e.message)}
};

async function loadQR(){
  if(!auth.currentUser)return;
  const data=await window.POPER.getData("qrVault/"+auth.currentUser.uid);
  $("qrList").innerHTML="";
  if(!data)return;

  Object.entries(data).forEach(([id,q])=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`<b>${escapeHTML(q.name)}</b><p>${escapeHTML(q.value)}</p>
      <button class="secondary danger">Hapus</button>`;
    div.querySelector("button").onclick=async()=>{
      await window.POPER.deleteData("qrVault/"+auth.currentUser.uid+"/"+id);
      loadQR();
    };
    $("qrList").appendChild(div);
  });
}

/* NOTES */

$("saveNote").onclick=async()=>{
  const title=$("noteTitle").value.trim();
  const content=$("noteContent").value.trim();
  if(!title||!content)return alert("Isi judul dan catatan");

  try{
    await window.POPER.pushData("notes/"+auth.currentUser.uid,{
      title,content,createdAt:Date.now()
    });
    $("noteTitle").value="";
    $("noteContent").value="";
    loadNotes();
  }catch(e){alert("Gagal simpan: "+e.message)}
};

async function loadNotes(){
  if(!auth.currentUser)return;
  const data=await window.POPER.getData("notes/"+auth.currentUser.uid);
  $("notesList").innerHTML="";
  if(!data)return;

  Object.entries(data).reverse().forEach(([id,n])=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`<b>${escapeHTML(n.title)}</b><p>${escapeHTML(n.content)}</p>
      <button class="secondary danger">Hapus</button>`;
    div.querySelector("button").onclick=async()=>{
      await window.POPER.deleteData("notes/"+auth.currentUser.uid+"/"+id);
      loadNotes();
    };
    $("notesList").appendChild(div);
  });
}

/* FIND BIO */

$("findBio").onclick=async()=>{
  const phone=$("findPhone").value.trim();
  if(!phone)return alert("Masukkan nomor HP");

  $("findResult").textContent="Mencari...";
  try{
    const key=phoneKey(phone);
    const lookup=await window.POPER.getData("phoneLookup/"+key);
    if(!lookup){
      $("findResult").textContent="Bio tidak ditemukan.";
      return;
    }

    const p=await window.POPER.getData("users/"+lookup.uid+"/publicBio");
    if(!p){
      $("findResult").textContent="Profil tidak tersedia.";
      return;
    }

    $("findResult").innerHTML=`
      <div class="item">
        <div class="avatar">👤</div>
        <h2>${escapeHTML(p.name||"POPER User")}</h2>
        <p>${escapeHTML(p.description||"")}</p>
        <small>${escapeHTML(p.phone||"")}</small>
        ${(p.links||[]).map(l=>`
          <p><a href="${escapeHTML(l.url)}" target="_blank" rel="noopener">${escapeHTML(l.title)}</a></p>
        `).join("")}
      </div>`;
  }catch(e){
    $("findResult").textContent="Gagal mencari Bio: "+e.message;
  }
};

/* LOAD */

async function loadAll(){
  await Promise.all([loadBio(),loadQR(),loadNotes()]);
}

window.POPER.onAuth(user=>{
  loginUI(user);
});

console.log("POPER APP siap");
