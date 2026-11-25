
/* =========================================
   POPER ONLINE SYSTEM
========================================= */

const Online = {
  uid: null,
  phone: null,
  profile: null,

  /* AUTH STATE */
  init() {
    POPER.onAuthStateChanged(POPER.auth, async user => {
      if (!user) {
        this.uid = null;
        this.phone = null;
        console.log("POPER: belum login");
        document.dispatchEvent(
          new CustomEvent("poper-logged-out")
        );
        return;
      }

      this.uid = user.uid;
      this.phone = user.phoneNumber;

      await this.loadProfile();

      document.dispatchEvent(
        new CustomEvent("poper-logged-in", {
          detail: user
        })
      );

      console.log("POPER login:", user.phoneNumber);
    });
  },

  /* PROFILE */
  async loadProfile() {
    if (!this.uid) return null;

    this.profile = await POPER.getProfile(this.uid);
    return this.profile;
  },

  async createProfile(name, description = "") {
    if (!this.uid) throw new Error("Login diperlukan");

    const profile = {
      name,
      description,
      phone: this.phone,
      links: {},
      updatedAt: Date.now()
    };

    await POPER.saveProfile(this.uid, profile);
    await POPER.registerPhone(this.uid, this.phone);

    this.profile = profile;
    return profile;
  },

  async updateProfile(data) {
    if (!this.uid) throw new Error("Login diperlukan");

    const updated = {
      ...(this.profile || {}),
      ...data,
      phone: this.phone,
      updatedAt: Date.now()
    };

    await POPER.saveProfile(this.uid, updated);
    await POPER.registerPhone(this.uid, this.phone);

    this.profile = updated;
    return updated;
  },

  /* PUBLIC BIO SEARCH BY PHONE */
  async searchBio(phone) {
    const lookup = await POPER.findPhone(phone);

    if (!lookup || !lookup.uid) return null;

    const bio = await POPER.getProfile(lookup.uid);
    if (!bio) return null;

    return bio;
  },

  /* QR VAULT */
  async saveQR(item) {
    if (!this.uid) throw new Error("Login diperlukan");

    return POPER.pushData("qrVault/" + this.uid, {
      ...item,
      createdAt: Date.now()
    });
  },

  async getQR() {
    if (!this.uid) return null;
    return POPER.getData("qrVault/" + this.uid);
  },

  async deleteQR(id) {
    if (!this.uid) throw new Error("Login diperlukan");
    return POPER.deleteData("qrVault/" + this.uid + "/" + id);
  },

  /* NOTES */
  async saveNote(note) {
    if (!this.uid) throw new Error("Login diperlukan");

    return POPER.pushData("notes/" + this.uid, {
      ...note,
      createdAt: Date.now()
    });
  },

  async getNotes() {
    if (!this.uid) return null;
    return POPER.getData("notes/" + this.uid);
  },

  async deleteNote(id) {
    if (!this.uid) throw new Error("Login diperlukan");
    return POPER.deleteData("notes/" + this.uid + "/" + id);
  },

  /* SCAN HISTORY */
  async addScanHistory(phone) {
    if (!this.uid) return;

    return POPER.pushData("scanHistory/" + this.uid, {
      phone: POPER.normalizePhone(phone),
      scannedAt: Date.now()
    });
  },

  async getScanHistory() {
    if (!this.uid) return null;
    return POPER.getData("scanHistory/" + this.uid);
  }
};

window.Online = Online;

console.log("🌐 POPER Online System Ready");
