
import "./firebase.js";

const auth = window.POPER?.auth;

let confirmationResult = null;

window.POPER_AUTH = {
  get user() {
    return auth?.currentUser || null;
  },

  get isLoggedIn() {
    return !!auth?.currentUser;
  },

  async sendOTP(phone) {
    if (!auth) {
      throw new Error("Firebase Auth belum terhubung.");
    }

    phone = window.POPER.normalizePhone(phone);

    if (!phone.startsWith("+")) {
      throw new Error("Format nomor HP tidak valid.");
    }

    if (!window.POPER.recaptchaVerifier) {
      window.POPER.setupRecaptcha();
    }

    confirmationResult =
      await window.POPER.sendOTP(phone);

    return true;
  },

  async verifyOTP(code) {
    if (!confirmationResult) {
      throw new Error("Silakan minta OTP terlebih dahulu.");
    }

    const result =
      await confirmationResult.confirm(code);

    confirmationResult = null;

    return result.user;
  },

  async logout() {
    if (!auth) return;

    await window.POPER.logout();
    confirmationResult = null;
  },

  onAuth(callback) {
    return window.POPER.onAuth(callback);
  }
};
