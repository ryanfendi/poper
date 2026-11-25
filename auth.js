
import "./firebase.js";

const $ = id => document.getElementById(id);

const loginPanel = $("loginPanel");
const accountPanel = $("accountPanel");
const phoneInput = $("phoneInput");
const otpInput = $("otpInput");
const sendOtpBtn = $("sendOtpBtn");
const verifyOtpBtn = $("verifyOtpBtn");
const logoutBtn = $("logoutBtn");
const authStatus = $("authStatus");
const otpSection = $("otpSection");

let confirmationResult = null;
let cooldown = false;

function showStatus(message, type = "") {
  if (!authStatus) return;

  authStatus.textContent = message;
  authStatus.className = "auth-status " + type;
}

function showLogin() {
  if (loginPanel) loginPanel.hidden = false;
  if (accountPanel) accountPanel.hidden = true;
  if (otpSection) otpSection.hidden = true;
}

function showAccount(user) {
  if (loginPanel) loginPanel.hidden = true;
  if (accountPanel) accountPanel.hidden = false;

  const accountPhone = $("accountPhone");

  if (accountPhone) {
    accountPhone.textContent =
      user.phoneNumber || "Nomor tidak tersedia";
  }

  showStatus("Login berhasil.", "success");
}

function setLoading(button, state, originalText) {
  if (!button) return;

  button.disabled = state;
  button.textContent = state ? "Memproses..." : originalText;
}

// =================================
// SEND OTP
// =================================

sendOtpBtn?.addEventListener("click", async () => {
  if (cooldown) return;

  const phone = phoneInput?.value.trim();

  if (!phone) {
    showStatus("Masukkan nomor HP terlebih dahulu.", "error");
    return;
  }

  try {
    cooldown = true;
    setLoading(sendOtpBtn, true, "Kirim OTP");

    showStatus("Menyiapkan verifikasi...");

    confirmationResult =
      await window.POPER.sendOTP(phone);

    if (otpSection) otpSection.hidden = false;

    showStatus(
      "OTP telah dikirim. Periksa SMS kamu.",
      "success"
    );

    otpInput?.focus();

  } catch (error) {
    console.error(error);

    showStatus(
      error.message || "Gagal mengirim OTP.",
      "error"
    );

    await window.POPER.resetRecaptcha();

  } finally {
    setLoading(sendOtpBtn, false, "Kirim OTP");

    cooldown = false;
  }
});

// =================================
// VERIFY OTP
// =================================

verifyOtpBtn?.addEventListener("click", async () => {
  const code = otpInput?.value.trim();

  if (!confirmationResult) {
    showStatus("Kirim OTP terlebih dahulu.", "error");
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    showStatus("Masukkan 6 digit kode OTP.", "error");
    return;
  }

  try {
    setLoading(verifyOtpBtn, true, "Verifikasi OTP");

    showStatus("Memverifikasi kode...");

    const result = await confirmationResult.confirm(code);

    confirmationResult = null;

    showAccount(result.user);

  } catch (error) {
    console.error(error);

    showStatus(
      "Kode OTP salah atau sudah kedaluwarsa.",
      "error"
    );

  } finally {
    setLoading(verifyOtpBtn, false, "Verifikasi OTP");
  }
});

// =================================
// LOGOUT
// =================================

logoutBtn?.addEventListener("click", async () => {
  try {
    await window.POPER.logout();
    confirmationResult = null;
    if (otpInput) otpInput.value = "";
    showStatus("Berhasil logout.");
  } catch (error) {
    showStatus("Gagal logout.", "error");
  }
});

// =================================
// AUTH STATE
// =================================

window.POPER.onAuth(user => {
  if (user) {
    showAccount(user);
  } else {
    showLogin();
  }
});

console.log("POPER Auth UI siap.");
