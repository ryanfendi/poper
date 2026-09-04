const CLOUD_NAME = "knoced6s";
const UPLOAD_PRESET = "poper_products";

export async function uploadImage(file, folder = "poper") {
  if (!CLOUD_NAME || CLOUD_NAME.includes("ISI_")) {
    throw new Error("Cloud Name Cloudinary belum diisi.");
  }

  if (!file) {
    throw new Error("Pilih gambar terlebih dahulu.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar.");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Ukuran gambar maksimal 8 MB.");
  }

  const url =
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  // Folder opsional
  formData.append("folder", folder);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    console.log("Cloudinary response:", data);

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        "Upload gambar ke Cloudinary gagal."
      );
    }

    if (!data.secure_url) {
      throw new Error(
        "Cloudinary tidak mengembalikan URL gambar."
      );
    }

    return data.secure_url;

  } catch (error) {
    console.error("UPLOAD ERROR:", error);

    throw new Error(
      error.message || "Upload gambar gagal."
    );
  }
}
