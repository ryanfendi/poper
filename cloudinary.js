const CLOUD_NAME="poper_products";
const UPLOAD_PRESET="ad4aa679-e046-44d7-9ef5-524dcb5cf0ae";
export async function uploadImage(file,folder="poper"){
 if(!file)return "";
 if(!file.type.startsWith("image/"))throw new Error("File harus berupa gambar.");
 if(file.size>5*1024*1024)throw new Error("Maksimal 5 MB.");
 const fd=new FormData();fd.append("file",file);fd.append("upload_preset",UPLOAD_PRESET);fd.append("folder",folder);
 const r=await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,{method:"POST",body:fd});
 if(!r.ok)throw new Error("Upload gambar gagal."); return (await r.json()).secure_url;
}
