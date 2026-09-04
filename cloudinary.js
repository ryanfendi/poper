const CLOUD_NAME =
  "ad4aa679-e046-44d7-9ef5-524dcb5cf0ae";

const UPLOAD_PRESET =
  "poper_products";


export async function uploadImage(file) {

  if (!file) {
    throw new Error(
      "Pilih gambar terlebih dahulu"
    );
  }


  if (!file.type.startsWith("image/")) {
    throw new Error(
      "File harus berupa gambar"
    );
  }


  if (
    file.size >
    2 * 1024 * 1024
  ) {

    throw new Error(
      "Ukuran gambar maksimal 2 MB"
    );
  }


  const formData =
    new FormData();


  formData.append(
    "file",
    file
  );


  formData.append(
    "upload_preset",
    UPLOAD_PRESET
  );


  const response =
    await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData
      }
    );


  if (!response.ok) {
    throw new Error(
      "Upload gambar gagal"
    );
  }


  const data =
    await response.json();


  return data.secure_url;
}
