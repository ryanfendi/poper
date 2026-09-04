import { auth, db } from "./firebase-config.js";

import { uploadImage } from "./cloudinary.js";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


/* =========================================================
   GLOBAL
========================================================= */

let currentUser = null;
let currentProfile = null;

let products = [];

let currentCategory = "Semua";

let cart = JSON.parse(
  localStorage.getItem("poper_cart") || "[]"
);

let notificationUnsubscribe = null;


/* =========================================================
   HELPER
========================================================= */

function formatRupiah(value) {

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function setText(id, value) {

  const el = document.getElementById(id);

  if (el) {
    el.textContent = value ?? "";
  }

}


function saveCart() {

  localStorage.setItem(
    "poper_cart",
    JSON.stringify(cart)
  );

}


function getFinalPrice(product) {

  return Number(
    product.finalPrice ??
    product.price ??
    0
  );

}


function getSubtotal() {

  return cart.reduce((total, item) => {

    return total +
      getFinalPrice(item) *
      Number(item.quantity || 1);

  }, 0);

}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function showToast(message) {

  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {

    toast.classList.remove("show");

  }, 3000);

}


/* =========================================================
   PAGE
========================================================= */

window.showPage = function(pageId) {

  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.remove("active");

    });

  const page = document.getElementById(pageId);

  if (page) {
    page.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "ordersPage") {
    loadBuyerOrders();
  }

  if (pageId === "sellerPage") {
    loadSellerDashboard();
  }

  if (pageId === "adminPage") {
    loadAdminDashboard();
  }

};


window.openSheet = function(id) {

  const sheet = document.getElementById(id);

  if (!sheet) return;

  document
    .querySelectorAll(".sheet")
    .forEach(item => {

      item.classList.remove("active");

    });

  sheet.classList.add("active");

  const overlay = document.getElementById("overlay");

  if (overlay) {
    overlay.classList.add("active");
  }

};


window.closeSheet = function(id) {

  const sheet = document.getElementById(id);

  if (sheet) {
    sheet.classList.remove("active");
  }

  const activeSheets = document.querySelectorAll(
    ".sheet.active"
  );

  if (activeSheets.length === 0) {

    const overlay =
      document.getElementById("overlay");

    if (overlay) {
      overlay.classList.remove("active");
    }

  }

};


window.closeAllSheets = function() {

  document
    .querySelectorAll(".sheet")
    .forEach(sheet => {

      sheet.classList.remove("active");

    });

  const overlay =
    document.getElementById("overlay");

  if (overlay) {
    overlay.classList.remove("active");
  }

};


/* =========================================================
   AUTH
========================================================= */

window.toggleRegister = function() {

  const loginForm =
    document.getElementById("loginForm");

  const registerForm =
    document.getElementById("registerForm");

  if (!loginForm || !registerForm) return;

  if (registerForm.style.display === "none") {

    loginForm.style.display = "none";
    registerForm.style.display = "block";

  } else {

    loginForm.style.display = "block";
    registerForm.style.display = "none";

  }

};


window.registerUser = async function(event) {

  event.preventDefault();

  const name =
    document.getElementById("registerName")
      .value.trim();

  const email =
    document.getElementById("registerEmail")
      .value.trim();

  const password =
    document.getElementById("registerPassword")
      .value;

  const role =
    document.getElementById("registerRole")
      .value;

  if (!name || !email || !password) {

    showToast("Lengkapi data terlebih dahulu");

    return;

  }

  try {

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    const uid = credential.user.uid;

    await setDoc(
      doc(db, "users", uid),
      {
        name,
        email,
        role,
        createdAt: serverTimestamp()
      }
    );

    if (role === "seller") {

      await setDoc(
        doc(db, "stores", uid),
        {
          ownerId: uid,
          name: `${name}'s Store`,
          description: "",
          phone: "",
          address: "",
          active: true,
          rating: 0,
          ratingCount: 0,
          totalProducts: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );

      await setDoc(
        doc(db, "wallets", uid),
        {
          userId: uid,
          availableBalance: 0,
          pendingBalance: 0,
          totalEarned: 0,
          updatedAt: serverTimestamp()
        }
      );

    }

    showToast("✅ Akun berhasil dibuat");

    showPage("homePage");

  } catch (error) {

    console.error(error);

    showToast(
      "Gagal daftar: " +
      getFirebaseError(error)
    );

  }

};


window.loginUser = async function(event) {

  event.preventDefault();

  const email =
    document.getElementById("loginEmail")
      .value.trim();

  const password =
    document.getElementById("loginPassword")
      .value;

  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    showToast("✅ Berhasil masuk");

    showPage("homePage");

  } catch (error) {

    console.error(error);

    showToast(
      "Login gagal: " +
      getFirebaseError(error)
    );

  }

};


window.logoutUser = async function() {

  try {

    await signOut(auth);

    currentUser = null;
    currentProfile = null;

    if (notificationUnsubscribe) {

      notificationUnsubscribe();

      notificationUnsubscribe = null;

    }

    showToast("Berhasil keluar");

    showPage("homePage");

  } catch (error) {

    console.error(error);

    showToast("Gagal keluar");

  }

};


function getFirebaseError(error) {

  const code = error?.code || "";

  const messages = {

    "auth/email-already-in-use":
      "Email sudah digunakan",

    "auth/invalid-email":
      "Email tidak valid",

    "auth/weak-password":
      "Password terlalu lemah",

    "auth/invalid-credential":
      "Email atau password salah",

    "auth/user-not-found":
      "Akun tidak ditemukan",

    "auth/wrong-password":
      "Password salah"

  };

  return messages[code] || error.message || "Terjadi kesalahan";

}


/* =========================================================
   PROFILE
========================================================= */

async function loadProfile() {

  if (!currentUser) return;

  try {

    const snap =
      await getDoc(
        doc(db, "users", currentUser.uid)
      );

    if (!snap.exists()) {

      currentProfile = null;

      return;

    }

    currentProfile = {
      id: currentUser.uid,
      ...snap.data()
    };

    setText(
      "profileName",
      currentProfile.name || "Pengguna"
    );

    setText(
      "profileEmail",
      currentProfile.email ||
      currentUser.email ||
      "-"
    );

    setText(
      "profileRole",
      currentProfile.role === "seller"
        ? "Seller"
        : currentProfile.role === "admin"
          ? "Admin"
          : "Buyer"
    );

    const sellerEntry =
      document.getElementById("sellerEntry");

    const adminEntry =
      document.getElementById("adminEntry");

    if (sellerEntry) {

      sellerEntry.style.display =
        currentProfile.role === "seller"
          ? "block"
          : "none";

    }

    if (adminEntry) {

      adminEntry.style.display =
        currentProfile.role === "admin"
          ? "block"
          : "none";

    }

    await loadBuyerAddress();

  } catch (error) {

    console.error(
      "loadProfile:",
      error
    );

  }

}


/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {

  try {

    const snapshot =
      await getDocs(
        collection(db, "products")
      );

    products = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderProducts();

  } catch (error) {

    console.error(
      "loadProducts:",
      error
    );

    showToast("Gagal memuat produk");

  }

}


function renderProducts() {

  let filtered = products;

  if (currentCategory !== "Semua") {

    filtered =
      filtered.filter(
        product =>
          product.category === currentCategory
      );

  }

  const grid =
    document.getElementById("productGrid");

  if (!grid) return;

  setText(
    "productCount",
    `${filtered.length} produk`
  );

  if (filtered.length === 0) {

    grid.innerHTML = `
      <div class="empty">
        Belum ada produk.
      </div>
    `;

    return;

  }

  grid.innerHTML =
    filtered
      .map(productCard)
      .join("");

}


function productCard(product) {

  const image =
    product.imageUrl ||
    product.image ||
    "https://via.placeholder.com/500?text=POPER";

  const price =
    getFinalPrice(product);

  return `
    <div class="product-card">

      <img
        class="product-image"
        src="${escapeHtml(image)}"
        alt="${escapeHtml(product.name || "Produk")}"
        onerror="this.src='https://via.placeholder.com/500?text=POPER'"
      >

      <div class="product-info">

        <h3>
          ${escapeHtml(product.name || "Produk")}
        </h3>

        <div class="product-store">
          🏪 ${escapeHtml(product.storeName || "Toko")}
        </div>

        <div class="product-price">
          ${formatRupiah(price)}
        </div>

        <div class="product-category">
          ${escapeHtml(product.category || "Lainnya")}
        </div>

        <div class="product-actions">

          <button
            class="favorite-btn"
            onclick="toggleFavorite('${product.id}')"
          >
            ♡
          </button>

          <button
            class="add-btn"
            onclick="addToCart('${product.id}')"
          >
            + Keranjang
          </button>

        </div>

      </div>

    </div>
  `;

}


window.filterCategory = function(category) {

  currentCategory = category;

  renderProducts();

};


window.searchProducts = function(value) {

  const keyword =
    String(value || "")
      .trim()
      .toLowerCase();

  showPage("searchPage");

  const grid =
    document.getElementById("searchGrid");

  if (!grid) return;

  let result = products;

  if (currentCategory !== "Semua") {

    result =
      result.filter(
        p =>
          p.category === currentCategory
      );

  }

  if (keyword) {

    result =
      result.filter(product => {

        const text = `
          ${product.name || ""}
          ${product.storeName || ""}
          ${product.category || ""}
          ${product.description || ""}
        `.toLowerCase();

        return text.includes(keyword);

      });

  }

  if (result.length === 0) {

    grid.innerHTML = `
      <div class="empty">
        Produk tidak ditemukan.
      </div>
    `;

    return;

  }

  grid.innerHTML =
    result.map(productCard).join("");

};


window.toggleFavorite = function(productId) {

  const key = "poper_favorites";

  let favorites =
    JSON.parse(
      localStorage.getItem(key) || "[]"
    );

  if (favorites.includes(productId)) {

    favorites =
      favorites.filter(id => id !== productId);

    showToast("Dihapus dari favorit");

  } else {

    favorites.push(productId);

    showToast("❤️ Ditambahkan ke favorit");

  }

  localStorage.setItem(
    key,
    JSON.stringify(favorites)
  );

};


/* =========================================================
   CART
========================================================= */

window.addToCart = function(productId) {

  const product =
    products.find(
      item => item.id === productId
    );

  if (!product) {

    showToast("Produk tidak ditemukan");

    return;

  }

  const existing =
    cart.find(
      item => item.id === productId
    );

  if (existing) {

    existing.quantity =
      Number(existing.quantity || 1) + 1;

  } else {

    cart.push({
      ...product,
      quantity: 1
    });

  }

  saveCart();

  renderCart();

  updateCartBadge();

  showToast("🛒 Produk masuk keranjang");

};


window.changeCartQty = function(productId, change) {

  const item =
    cart.find(
      product => product.id === productId
    );

  if (!item) return;

  item.quantity =
    Number(item.quantity || 1) + change;

  if (item.quantity <= 0) {

    cart =
      cart.filter(
        product => product.id !== productId
      );

  }

  saveCart();

  renderCart();

  updateCartBadge();

};


window.removeCartItem = function(productId) {

  cart =
    cart.filter(
      item => item.id !== productId
    );

  saveCart();

  renderCart();

  updateCartBadge();

};


function updateCartBadge() {

  const count =
    cart.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 1),
      0
    );

  setText(
    "cartBadge",
    count
  );

}


function renderCart() {

  const container =
    document.getElementById("cartItems");

  const summary =
    document.getElementById("cartSummary");

  const checkoutButton =
    document.getElementById("checkoutButton");

  if (!container) return;

  if (cart.length === 0) {

    container.innerHTML = `
      <div class="empty">
        🛒<br>
        Keranjang masih kosong.
      </div>
    `;

    if (summary) {
      summary.innerHTML = "";
    }

    if (checkoutButton) {
      checkoutButton.disabled = true;
      checkoutButton.style.opacity = ".5";
    }

    return;

  }

  if (checkoutButton) {

    checkoutButton.disabled = false;
    checkoutButton.style.opacity = "1";

  }

  container.innerHTML =
    cart.map(item => {

      const image =
        item.imageUrl ||
        item.image ||
        "https://via.placeholder.com/100?text=POPER";

      return `
        <div class="cart-item">

          <img
            src="${escapeHtml(image)}"
            alt=""
          >

          <div class="cart-item-info">

            <h4>
              ${escapeHtml(item.name || "Produk")}
            </h4>

            <small>
              ${formatRupiah(getFinalPrice(item))}
            </small>

            <div class="qty-controls">

              <button
                onclick="changeCartQty('${item.id}', -1)"
              >
                −
              </button>

              <strong>
                ${Number(item.quantity || 1)}
              </strong>

              <button
                onclick="changeCartQty('${item.id}', 1)"
              >
                +
              </button>

              <button
                onclick="removeCartItem('${item.id}')"
              >
                🗑️
              </button>

            </div>

          </div>

        </div>
      `;

    }).join("");

  const subtotal =
    getSubtotal();

  const shipping =
    cart.length > 0 ? 10000 : 0;

  const total =
    subtotal + shipping;

  if (summary) {

    summary.innerHTML = `
      <div class="summary-row">
        <span>Subtotal</span>
        <strong>${formatRupiah(subtotal)}</strong>
      </div>

      <div class="summary-row">
        <span>Pengiriman</span>
        <strong>${formatRupiah(shipping)}</strong>
      </div>

      <div class="summary-row total">
        <span>Total</span>
        <strong>${formatRupiah(total)}</strong>
      </div>
    `;

  }

}


/* =========================================================
   BUYER ADDRESS
========================================================= */

async function loadBuyerAddress() {

  if (!currentUser) return;

  try {

    const snap =
      await getDoc(
        doc(
          db,
          "addresses",
          currentUser.uid
        )
      );

    if (!snap.exists()) return;

    const data = snap.data();

    const name =
      document.getElementById("addressName");

    const phone =
      document.getElementById("addressPhone");

    const text =
      document.getElementById("addressText");

    if (name) name.value = data.name || "";

    if (phone) phone.value = data.phone || "";

    if (text) text.value = data.address || "";

  } catch (error) {

    console.error(
      "loadBuyerAddress:",
      error
    );

  }

}


window.saveAddress = async function() {

  if (!currentUser) {

    showToast("Silakan login terlebih dahulu");

    return;

  }

  const name =
    document.getElementById("addressName")
      .value.trim();

  const phone =
    document.getElementById("addressPhone")
      .value.trim();

  const address =
    document.getElementById("addressText")
      .value.trim();

  if (!name || !phone || !address) {

    showToast("Lengkapi alamat terlebih dahulu");

    return;

  }

  try {

    await setDoc(
      doc(
        db,
        "addresses",
        currentUser.uid
      ),
      {
        userId: currentUser.uid,
        name,
        phone,
        address,
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );

    showToast("✅ Alamat pengiriman tersimpan");

    closeSheet("addressSheet");

  } catch (error) {

    console.error(error);

    showToast(
      "Gagal menyimpan alamat: " +
      error.message
    );

  }

};


/* =========================================================
   CHECKOUT
========================================================= */

window.openCheckout = async function() {

  if (!currentUser) {

    showToast("Silakan login terlebih dahulu");

    showPage("authPage");

    return;

  }

  if (cart.length === 0) {

    showToast("Keranjang kosong");

    return;

  }

  try {

    await loadBuyerAddress();

    const subtotal =
      getSubtotal();

    const shipping =
      10000;

    const total =
      subtotal + shipping;

    setText(
      "checkoutSummary",
      ""
    );

    const summary =
      document.getElementById(
        "checkoutSummary"
      );

    if (summary) {

      summary.innerHTML = `
        <div class="summary-row">
          <span>Subtotal</span>
          <strong>${formatRupiah(subtotal)}</strong>
        </div>

        <div class="summary-row">
          <span>Pengiriman</span>
          <strong>${formatRupiah(shipping)}</strong>
        </div>

        <div class="summary-row total">
          <span>Total</span>
          <strong>${formatRupiah(total)}</strong>
        </div>
      `;

    }

    closeSheet("cartSheet");

    openSheet("checkoutSheet");

  } catch (error) {

    console.error(error);

  }

};


window.placeOrder = async function() {

  if (!currentUser) {

    showToast("Silakan login");

    return;

  }

  if (cart.length === 0) {

    showToast("Keranjang kosong");

    return;

  }

  const name =
    document.getElementById("checkoutName")
      .value.trim();

  const phone =
    document.getElementById("checkoutPhone")
      .value.trim();

  const address =
    document.getElementById("checkoutAddress")
      .value.trim();

  const payment =
    document.getElementById("checkoutPayment")
      .value;

  if (!name || !phone || !address) {

    showToast("Lengkapi data pengiriman");

    return;

  }

  try {

    /*
      Satu cart bisa berisi produk dari
      beberapa toko.
    */

    const grouped = {};

    cart.forEach(item => {

      const storeId =
        item.storeId ||
        item.sellerId;

      if (!storeId) return;

      if (!grouped[storeId]) {
        grouped[storeId] = [];
      }

      grouped[storeId].push(item);

    });

    const storeIds =
      Object.keys(grouped);

    if (storeIds.length === 0) {

      showToast(
        "Produk tidak memiliki toko"
      );

      return;

    }

    for (const storeId of storeIds) {

      const items =
        grouped[storeId];

      const sellerId =
        items[0].sellerId ||
        storeId;

      const subtotal =
        items.reduce(
          (sum, item) =>
            sum +
            getFinalPrice(item) *
            Number(item.quantity || 1),
          0
        );

      const shipping =
        10000;

      const total =
        subtotal + shipping;

      const platformFee =
        Math.round(
          subtotal * 0.10
        );

      const sellerRevenue =
        subtotal - platformFee;

      const orderRef =
        await addDoc(
          collection(db, "orders"),
          {
            buyerId: currentUser.uid,

            sellerId,

            storeId,

            buyerName: name,

            address,

            phone,

            payment,

            subtotal,

            shipping,

            total,

            platformFee,

            sellerRevenue,

            status:
              payment === "COD"
                ? "pending"
                : "waiting_payment",

            balanceReleased: false,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          }
        );

      for (const item of items) {

        await addDoc(
          collection(
            db,
            "orders",
            orderRef.id,
            "items"
          ),
          {
            productId: item.id,

            name: item.name || "",

            imageUrl:
              item.imageUrl ||
              item.image ||
              "",

            price:
              getFinalPrice(item),

            quantity:
              Number(item.quantity || 1),

            sellerId,

            storeId,

            createdAt:
              serverTimestamp()
          }
        );

      }

      await addDoc(
        collection(db, "notifications"),
        {
          userId: sellerId,

          type: "new_order",

          title: "Pesanan baru",

          message:
            `Pesanan baru sebesar ${formatRupiah(total)}`,

          orderId: orderRef.id,

          read: false,

          createdAt:
            serverTimestamp()
        }
      );

    }

    cart = [];

    saveCart();

    renderCart();

    updateCartBadge();

    closeAllSheets();

    showToast(
      "🎉 Pesanan berhasil dibuat"
    );

    showPage("ordersPage");

    await loadBuyerOrders();

  } catch (error) {

    console.error(
      "placeOrder:",
      error
    );

    showToast(
      "Gagal membuat pesanan: " +
      error.message
    );

  }

};


/* =========================================================
   BUYER ORDERS
========================================================= */

async function loadBuyerOrders() {

  const container =
    document.getElementById("orders");

  if (!container) return;

  if (!currentUser) {

    container.innerHTML = `
      <div class="empty">
        Silakan login untuk melihat pesanan.
      </div>
    `;

    return;

  }

  try {

    const q =
      query(
        collection(db, "orders"),
        where(
          "buyerId",
          "==",
          currentUser.uid
        )
      );

    const snapshot =
      await getDocs(q);

    const orders =
      snapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .sort(
          (a, b) =>
            timestampValue(b.createdAt) -
            timestampValue(a.createdAt)
        );

    if (orders.length === 0) {

      container.innerHTML = `
        <div class="empty">
          📦<br>
          Belum ada pesanan.
        </div>
      `;

      return;

    }

    container.innerHTML =
      orders.map(order => {

        return `
          <div class="order-card">

            <div class="order-header">

              <strong>
                Pesanan #${escapeHtml(order.id.slice(0, 8))}
              </strong>

              <span class="status">
                ${escapeHtml(order.status || "pending")}
              </span>

            </div>

            <p>
              Total:
              <strong>
                ${formatRupiah(order.total)}
              </strong>
            </p>

            <p>
              Pembayaran:
              ${escapeHtml(order.payment || "-")}
            </p>

            <div class="order-actions">

              <button
                onclick="openTracking('${order.id}')"
              >
                Lihat Detail
              </button>

              ${
                order.status === "shipped"
                  ? `
                    <button
                      onclick="confirmDelivery('${order.id}')"
                    >
                      Pesanan Diterima
                    </button>
                  `
                  : ""
              }

            </div>

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(error);

    container.innerHTML = `
      <div class="empty">
        Gagal memuat pesanan.
      </div>
    `;

  }

}


function timestampValue(timestamp) {

  if (!timestamp) return 0;

  if (
    typeof timestamp.toMillis === "function"
  ) {

    return timestamp.toMillis();

  }

  if (timestamp.seconds) {

    return timestamp.seconds * 1000;

  }

  return 0;

}


window.openTracking = async function(orderId) {

  try {

    const snap =
      await getDoc(
        doc(db, "orders", orderId)
      );

    if (!snap.exists()) {

      showToast("Pesanan tidak ditemukan");

      return;

    }

    const order = snap.data();

    const content =
      document.getElementById(
        "trackingContent"
      );

    if (!content) return;

    content.innerHTML = `

      <div class="order-card">

        <h3>
          Pesanan #${escapeHtml(orderId.slice(0, 8))}
        </h3>

        <p>
          Status:
          <strong>
            ${escapeHtml(order.status || "-")}
          </strong>
        </p>

        <p>
          Total:
          <strong>
            ${formatRupiah(order.total)}
          </strong>
        </p>

        <p>
          Alamat:
          ${escapeHtml(order.address || "-")}
        </p>

        <p>
          Pembayaran:
          ${escapeHtml(order.payment || "-")}
        </p>

      </div>

    `;

    openSheet("trackingSheet");

  } catch (error) {

    console.error(error);

    showToast("Gagal membuka pesanan");

  }

};


window.confirmDelivery = async function(orderId) {

  if (!currentUser) return;

  try {

    const orderRef =
      doc(db, "orders", orderId);

    const orderSnap =
      await getDoc(orderRef);

    if (!orderSnap.exists()) {

      showToast("Pesanan tidak ditemukan");

      return;

    }

    const order =
      orderSnap.data();

    if (
      order.buyerId !== currentUser.uid
    ) {

      showToast("Akses ditolak");

      return;

    }

    await updateDoc(
      orderRef,
      {
        status: "delivered",
        updatedAt: serverTimestamp()
      }
    );

    showToast(
      "✅ Pesanan diterima"
    );

    await loadBuyerOrders();

  } catch (error) {

    console.error(error);

    showToast(
      "Gagal mengonfirmasi pesanan"
    );

  }

};


/* =========================================================
   SELLER STORE
========================================================= */

/*
  INI BAGIAN YANG MEMPERBAIKI MASALAH UTAMA:

  Alamat buyer disimpan di:
  addresses/{uid}

  Alamat toko disimpan di:
  stores/{uid}

  Jadi seller TIDAK menggunakan saveAddress().
*/


window.openEditStore = async function() {

  if (!currentUser) {

    showToast(
      "Silakan login terlebih dahulu"
    );

    return;

  }

  if (
    currentProfile?.role !== "seller"
  ) {

    showToast(
      "Akun ini bukan seller"
    );

    return;

  }

  try {

    const storeRef =
      doc(
        db,
        "stores",
        currentUser.uid
      );

    const storeSnap =
      await getDoc(storeRef);

    if (!storeSnap.exists()) {

      showToast(
        "Data toko belum dibuat"
      );

      return;

    }

    const store =
      storeSnap.data();

    const name =
      document.getElementById(
        "editStoreName"
      );

    const phone =
      document.getElementById(
        "editStorePhone"
      );

    const address =
      document.getElementById(
        "editStoreAddress"
      );

    const description =
      document.getElementById(
        "editStoreDescription"
      );

    if (name) {
      name.value = store.name || "";
    }

    if (phone) {
      phone.value = store.phone || "";
    }

    if (address) {
      address.value = store.address || "";
    }

    if (description) {
      description.value =
        store.description || "";
    }

    openSheet("editStoreSheet");

  } catch (error) {

    console.error(
      "openEditStore:",
      error
    );

    showToast(
      "Gagal membuka data toko"
    );

  }

};


window.saveStoreSettings = async function(event) {

  event.preventDefault();

  if (!currentUser) {

    showToast(
      "Silakan login terlebih dahulu"
    );

    return;

  }

  if (
    currentProfile?.role !== "seller"
  ) {

    showToast(
      "Hanya seller yang dapat mengubah toko"
    );

    return;

  }

  const name =
    document.getElementById(
      "editStoreName"
    ).value.trim();

  const phone =
    document.getElementById(
      "editStorePhone"
    ).value.trim();

  const address =
    document.getElementById(
      "editStoreAddress"
    ).value.trim();

  const description =
    document.getElementById(
      "editStoreDescription"
    ).value.trim();

  if (name.length < 3) {

    showToast(
      "Nama toko minimal 3 karakter"
    );

    return;

  }

  if (!address) {

    showToast(
      "Alamat toko wajib diisi"
    );

    return;

  }

  const submitButton =
    event.target.querySelector(
      'button[type="submit"]'
    );

  if (submitButton) {

    submitButton.disabled = true;
    submitButton.textContent =
      "Menyimpan...";

  }

  try {

    const storeRef =
      doc(
        db,
        "stores",
        currentUser.uid
      );

    const storeSnap =
      await getDoc(storeRef);

    if (!storeSnap.exists()) {

      showToast(
        "Data toko tidak ditemukan"
      );

      return;

    }

    const oldStore =
      storeSnap.data();

    const oldName =
      oldStore.name || "";

    /*
      SIMPAN DATA TOKO
    */

    await updateDoc(
      storeRef,
      {
        name,

        phone,

        address,

        description,

        updatedAt:
          serverTimestamp()
      }
    );

    /*
      JIKA NAMA TOKO BERUBAH,
      UPDATE storeName PADA PRODUK SELLER.
    */

    if (oldName !== name) {

      const productQuery =
        query(
          collection(db, "products"),
          where(
            "sellerId",
            "==",
            currentUser.uid
          )
        );

      const productSnapshot =
        await getDocs(productQuery);

      for (
        const productDoc
        of productSnapshot.docs
      ) {

        await updateDoc(
          doc(
            db,
            "products",
            productDoc.id
          ),
          {
            storeName: name,
            updatedAt:
              serverTimestamp()
          }
        );

      }

    }

    /*
      UPDATE TAMPILAN LANGSUNG
    */

    setText(
      "storeName",
      name
    );

    setText(
      "storeAddress",
      address
    );

    closeSheet(
      "editStoreSheet"
    );

    showToast(
      "✅ Data toko berhasil disimpan"
    );

    /*
      REFRESH PRODUK
    */

    await loadProducts();

    await loadSellerProducts();

  } catch (error) {

    console.error(
      "saveStoreSettings:",
      error
    );

    showToast(
      "Gagal menyimpan toko: " +
      error.message
    );

  } finally {

    if (submitButton) {

      submitButton.disabled = false;

      submitButton.textContent =
        "💾 Simpan Perubahan";

    }

  }

};


/* =========================================================
   SELLER DASHBOARD
========================================================= */

async function loadSellerDashboard() {

  if (
    !currentUser ||
    !currentProfile ||
    currentProfile.role !== "seller"
  ) {
    return;
  }

  try {

    const storeSnap =
      await getDoc(
        doc(
          db,
          "stores",
          currentUser.uid
        )
      );

    if (storeSnap.exists()) {

      const store =
        storeSnap.data();

      setText(
        "storeName",
        store.name || "Toko Saya"
      );

      setText(
        "storeAddress",
        store.address ||
        "Belum ada alamat toko"
      );

    } else {

      setText(
        "storeName",
        "Toko Saya"
      );

      setText(
        "storeAddress",
        "Data toko belum dibuat"
      );

    }

    await loadSellerProducts();

    await loadSellerOrders();

    await loadSellerWallet();

  } catch (error) {

    console.error(
      "loadSellerDashboard:",
      error
    );

  }

}


/* =========================================================
   SELLER PRODUCT
========================================================= */

async function loadSellerProducts() {

  if (!currentUser) return;

  const grid =
    document.getElementById(
      "sellerProductGrid"
    );

  if (!grid) return;

  try {

    const q =
      query(
        collection(db, "products"),
        where(
          "sellerId",
          "==",
          currentUser.uid
        )
      );

    const snapshot =
      await getDocs(q);

    const sellerProducts =
      snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

    setText(
      "sellerProducts",
      sellerProducts.length
    );

    if (sellerProducts.length === 0) {

      grid.innerHTML = `
        <div class="empty">
          Belum ada produk.
        </div>
      `;

      return;

    }

    grid.innerHTML =
      sellerProducts
        .map(product => {

          const image =
            product.imageUrl ||
            product.image ||
            "https://via.placeholder.com/300?text=POPER";

          return `
            <div class="product-card">

              <img
                class="product-image"
                src="${escapeHtml(image)}"
                alt=""
              >

              <div class="product-info">

                <h3>
                  ${escapeHtml(product.name)}
                </h3>

                <div class="product-price">
                  ${formatRupiah(
                    getFinalPrice(product)
                  )}
                </div>

                <div class="product-category">
                  Stok:
                  ${Number(product.stock || 0)}
                </div>

                <button
                  class="secondary-btn full"
                  style="margin-top:10px"
                  onclick="deleteSellerProduct('${product.id}')"
                >
                  🗑️ Hapus
                </button>

              </div>

            </div>
          `;

        }).join("");

  } catch (error) {

    console.error(
      "loadSellerProducts:",
      error
    );

    grid.innerHTML = `
      <div class="empty">
        Gagal memuat produk.
      </div>
    `;

  }

}


window.saveSellerProduct = async function(event) {

  event.preventDefault();

  if (!currentUser) {

    showToast("Silakan login");

    return;

  }

  if (
    currentProfile?.role !== "seller"
  ) {

    showToast("Hanya seller");

    return;

  }

  const name =
    document.getElementById(
      "productName"
    ).value.trim();

  const price =
    Number(
      document.getElementById(
        "productPrice"
      ).value
    );

  const stock =
    Number(
      document.getElementById(
        "productStock"
      ).value
    );

  const category =
    document.getElementById(
      "productCategory"
    ).value;

  const description =
    document.getElementById(
      "productDescription"
    ).value.trim();

  const file =
    document.getElementById(
      "productImage"
    ).files[0];

  if (!name || price <= 0 || stock < 0) {

    showToast(
      "Data produk tidak valid"
    );

    return;

  }

  if (!file) {

    showToast(
      "Pilih gambar produk"
    );

    return;

  }

  const button =
    event.target.querySelector(
      'button[type="submit"]'
    );

  if (button) {

    button.disabled = true;
    button.textContent =
      "Mengupload...";

  }

  try {

    /*
      AMBIL NAMA TOKO TERBARU
    */

    const storeSnap =
      await getDoc(
        doc(
          db,
          "stores",
          currentUser.uid
        )
      );

    if (!storeSnap.exists()) {

      showToast(
        "Toko belum dibuat"
      );

      return;

    }

    const store =
      storeSnap.data();

    /*
      UPLOAD CLOUDINARY
    */

    const imageUrl =
      await uploadImage(file);

    /*
      SIMPAN FIRESTORE
    */

    await addDoc(
      collection(db, "products"),
      {
        sellerId:
          currentUser.uid,

        storeId:
          currentUser.uid,

        storeName:
          store.name || "Toko",

        name,

        price,

        finalPrice:
          price,

        stock,

        category,

        description,

        imageUrl,

        active: true,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
      }
    );

    /*
      UPDATE JUMLAH PRODUK TOKO
    */

    await updateDoc(
      doc(
        db,
        "stores",
        currentUser.uid
      ),
      {
        totalProducts:
          Number(store.totalProducts || 0) + 1,

        updatedAt:
          serverTimestamp()
      }
    );

    event.target.reset();

    closeSheet(
      "sellerFormSheet"
    );

    showToast(
      "✅ Produk berhasil ditambahkan"
    );

    await loadProducts();

    await loadSellerProducts();

  } catch (error) {

    console.error(
      "saveSellerProduct:",
      error
    );

    showToast(
      "Gagal menyimpan produk: " +
      error.message
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Upload & Simpan Produk";

    }

  }

};


window.deleteSellerProduct = async function(productId) {

  if (!currentUser) return;

  const confirmDelete =
    confirm(
      "Hapus produk ini?"
    );

  if (!confirmDelete) return;

  try {

    const productRef =
      doc(
        db,
        "products",
        productId
      );

    const productSnap =
      await getDoc(productRef);

    if (!productSnap.exists()) {

      showToast(
        "Produk tidak ditemukan"
      );

      return;

    }

    const product =
      productSnap.data();

    if (
      product.sellerId !==
      currentUser.uid
    ) {

      showToast(
        "Anda tidak memiliki akses"
      );

      return;

    }

    await deleteDoc(productRef);

    /*
      UPDATE TOTAL PRODUK TOKO
    */

    const storeRef =
      doc(
        db,
        "stores",
        currentUser.uid
      );

    const storeSnap =
      await getDoc(storeRef);

    if (storeSnap.exists()) {

      const store =
        storeSnap.data();

      await updateDoc(
        storeRef,
        {
          totalProducts:
            Math.max(
              0,
              Number(
                store.totalProducts || 0
              ) - 1
            ),

          updatedAt:
            serverTimestamp()
        }
      );

    }

    showToast(
      "Produk dihapus"
    );

    await loadProducts();

    await loadSellerProducts();

  } catch (error) {

    console.error(error);

    showToast(
      "Gagal menghapus produk"
    );

  }

};


/* =========================================================
   SELLER ORDERS
========================================================= */

async function loadSellerOrders() {

  if (!currentUser) return;

  const container =
    document.getElementById(
      "sellerOrdersList"
    );

  if (!container) return;

  try {

    const q =
      query(
        collection(db, "orders"),
        where(
          "sellerId",
          "==",
          currentUser.uid
        )
      );

    const snapshot =
      await getDocs(q);

    const orders =
      snapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .sort(
          (a, b) =>
            timestampValue(b.createdAt) -
            timestampValue(a.createdAt)
        );

    setText(
      "sellerOrders",
      orders.length
    );

    const revenue =
      orders.reduce(
        (sum, order) => {

          if (
            order.status === "cancelled"
          ) {
            return sum;
          }

          return (
            sum +
            Number(
              order.sellerRevenue || 0
            )
          );

        },
        0
      );

    setText(
      "sellerRevenue",
      formatRupiah(revenue)
    );

    if (orders.length === 0) {

      container.innerHTML = `
        <div class="empty">
          Belum ada pesanan masuk.
        </div>
      `;

      return;

    }

    container.innerHTML =
      orders.map(order => {

        return `
          <div class="order-card">

            <div class="order-header">

              <strong>
                #${escapeHtml(
                  order.id.slice(0, 8)
                )}
              </strong>

              <span class="status">
                ${escapeHtml(
                  order.status || "pending"
                )}
              </span>

            </div>

            <p>
              Pembeli:
              ${escapeHtml(
                order.buyerName || "-"
              )}
            </p>

            <p>
              Total:
              <strong>
                ${formatRupiah(order.total)}
              </strong>
            </p>

            <p>
              Pendapatan seller:
              <strong>
                ${formatRupiah(
                  order.sellerRevenue
                )}
              </strong>
            </p>

            <div class="order-actions">

              <button
                onclick="sellerUpdateOrderStatus('${order.id}', 'processing')"
              >
                Proses
              </button>

              <button
                onclick="sellerUpdateOrderStatus('${order.id}', 'shipped')"
              >
                Kirim
              </button>

              <button
                onclick="sellerUpdateOrderStatus('${order.id}', 'cancelled')"
              >
                Batal
              </button>

            </div>

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(
      "loadSellerOrders:",
      error
    );

    container.innerHTML = `
      <div class="empty">
        Gagal memuat pesanan.
      </div>
    `;

  }

}


window.sellerUpdateOrderStatus =
  async function(orderId, status) {

    if (!currentUser) return;

    try {

      const orderRef =
        doc(
          db,
          "orders",
          orderId
        );

      const snap =
        await getDoc(orderRef);

      if (!snap.exists()) {

        showToast(
          "Pesanan tidak ditemukan"
        );

        return;

      }

      const order =
        snap.data();

      if (
        order.sellerId !==
        currentUser.uid
      ) {

        showToast(
          "Akses ditolak"
        );

        return;

      }

      await updateDoc(
        orderRef,
        {
          status,
          updatedAt:
            serverTimestamp()
        }
      );

      /*
        NOTIFIKASI BUYER
      */

      await addDoc(
        collection(
          db,
          "notifications"
        ),
        {
          userId:
            order.buyerId,

          type:
            "order_update",

          title:
            "Status pesanan berubah",

          message:
            `Pesanan kamu sekarang ${status}`,

          orderId,

          read: false,

          createdAt:
            serverTimestamp()
        }
      );

      /*
        Jika COD / order sudah selesai,
        saldo seller nantinya dapat dirilis.
      */

      showToast(
        "Status pesanan diperbarui"
      );

      await loadSellerOrders();

    } catch (error) {

      console.error(error);

      showToast(
        "Gagal mengubah status"
      );

    }

  };


/* =========================================================
   SELLER WALLET
========================================================= */

async function loadSellerWallet() {

  if (!currentUser) return;

  try {

    const snap =
      await getDoc(
        doc(
          db,
          "wallets",
          currentUser.uid
        )
      );

    if (!snap.exists()) {

      setText(
        "sellerBalance",
        formatRupiah(0)
      );

      setText(
        "payoutAvailable",
        formatRupiah(0)
      );

      return;

    }

    const wallet =
      snap.data();

    const balance =
      Number(
        wallet.availableBalance || 0
      );

    setText(
      "sellerBalance",
      formatRupiah(balance)
    );

    setText(
      "payoutAvailable",
      formatRupiah(balance)
    );

  } catch (error) {

    console.error(
      "loadSellerWallet:",
      error
    );

  }

}


/* =========================================================
   PAYOUT
========================================================= */

window.requestPayout = async function() {

  if (!currentUser) {

    showToast("Silakan login");

    return;

  }

  const amount =
    Number(
      document.getElementById(
        "payoutAmount"
      ).value
    );

  const bank =
    document.getElementById(
      "payoutBank"
    ).value.trim();

  const account =
    document.getElementById(
      "payoutAccount"
    ).value.trim();

  const accountName =
    document.getElementById(
      "payoutAccountName"
    ).value.trim();

  if (amount < 10000) {

    showToast(
      "Minimal penarikan Rp10.000"
    );

    return;

  }

  if (!bank || !account || !accountName) {

    showToast(
      "Lengkapi rekening"
    );

    return;

  }

  try {

    const walletRef =
      doc(
        db,
        "wallets",
        currentUser.uid
      );

    const payoutRef =
      doc(
        collection(db, "payouts")
      );

    await runTransaction(
      db,
      async transaction => {

        const walletSnap =
          await transaction.get(
            walletRef
          );

        if (!walletSnap.exists()) {

          throw new Error(
            "Wallet tidak ditemukan"
          );

        }

        const wallet =
          walletSnap.data();

        const available =
          Number(
            wallet.availableBalance || 0
          );

        if (amount > available) {

          throw new Error(
            "Saldo tidak mencukupi"
          );

        }

        /*
          KUNCI PENTING:

          saldo langsung dikurangi saat
          payout dibuat supaya seller tidak
          dapat mengajukan payout dua kali.
        */

        transaction.update(
          walletRef,
          {
            availableBalance:
              available - amount,

            pendingBalance:
              Number(
                wallet.pendingBalance || 0
              ) + amount,

            updatedAt:
              serverTimestamp()
          }
        );

        transaction.set(
          payoutRef,
          {
            sellerId:
              currentUser.uid,

            amount,

            bank,

            account,

            accountName,

            status:
              "pending",

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()
          }
        );

      }
    );

    document.getElementById(
      "payoutAmount"
    ).value = "";

    document.getElementById(
      "payoutBank"
    ).value = "";

    document.getElementById(
      "payoutAccount"
    ).value = "";

    document.getElementById(
      "payoutAccountName"
    ).value = "";

    closeSheet(
      "payoutSheet"
    );

    showToast(
      "✅ Permintaan payout dikirim"
    );

    await loadSellerWallet();

  } catch (error) {

    console.error(
      "requestPayout:",
      error
    );

    showToast(
      "Payout gagal: " +
      error.message
    );

  }

};


/* =========================================================
   ADMIN
========================================================= */

async function loadAdminDashboard() {

  if (
    !currentUser ||
    currentProfile?.role !== "admin"
  ) {
    return;
  }

  try {

    const usersSnap =
      await getDocs(
        collection(db, "users")
      );

    let buyers = 0;
    let sellers = 0;

    usersSnap.forEach(item => {

      const data = item.data();

      if (data.role === "buyer") {
        buyers++;
      }

      if (data.role === "seller") {
        sellers++;
      }

    });

    setText(
      "adminBuyers",
      buyers
    );

    setText(
      "adminSellers",
      sellers
    );


    const productsSnap =
      await getDocs(
        collection(db, "products")
      );

    setText(
      "adminProducts",
      productsSnap.size
    );


    const ordersSnap =
      await getDocs(
        collection(db, "orders")
      );

    setText(
      "adminOrders",
      ordersSnap.size
    );

    let gmv = 0;
    let commission = 0;

    ordersSnap.forEach(item => {

      const order =
        item.data();

      if (
        order.status !== "cancelled"
      ) {

        gmv += Number(
          order.subtotal || 0
        );

        commission += Number(
          order.platformFee || 0
        );

      }

    });

    setText(
      "adminGMV",
      formatRupiah(gmv)
    );

    setText(
      "adminCommission",
      formatRupiah(commission)
    );

    await loadAdminPayouts();

    await loadAdminOrders();

  } catch (error) {

    console.error(
      "loadAdminDashboard:",
      error
    );

  }

}


/* =========================================================
   ADMIN PAYOUTS
========================================================= */

async function loadAdminPayouts() {

  const container =
    document.getElementById(
      "adminPayouts"
    );

  if (!container) return;

  try {

    const snapshot =
      await getDocs(
        collection(db, "payouts")
      );

    const payouts =
      snapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .sort(
          (a, b) =>
            timestampValue(b.createdAt) -
            timestampValue(a.createdAt)
        );

    if (payouts.length === 0) {

      container.innerHTML = `
        <div class="empty">
          Belum ada payout.
        </div>
      `;

      return;

    }

    container.innerHTML =
      payouts.map(payout => {

        return `
          <div class="payout-card">

            <strong>
              ${formatRupiah(payout.amount)}
            </strong>

            <p>
              Seller:
              ${escapeHtml(
                payout.sellerId || "-"
              )}
            </p>

            <p>
              ${escapeHtml(
                payout.bank || "-"
              )}
              -
              ${escapeHtml(
                payout.account || "-"
              )}
            </p>

            <p>
              Status:
              <strong>
                ${escapeHtml(
                  payout.status || "-"
                )}
              </strong>
            </p>

            ${
              payout.status === "pending"
                ? `
                  <div class="order-actions">

                    <button
                      onclick="adminApprovePayout('${payout.id}')"
                    >
                      ✅ Approve
                    </button>

                    <button
                      onclick="adminRejectPayout('${payout.id}')"
                    >
                      ❌ Tolak
                    </button>

                  </div>
                `
                : ""
            }

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(
      "loadAdminPayouts:",
      error
    );

  }

}


window.adminApprovePayout =
  async function(payoutId) {

    if (
      currentProfile?.role !== "admin"
    ) {

      showToast("Akses ditolak");

      return;

    }

    try {

      const payoutRef =
        doc(
          db,
          "payouts",
          payoutId
        );

      const payoutSnap =
        await getDoc(payoutRef);

      if (!payoutSnap.exists()) {

        showToast(
          "Payout tidak ditemukan"
        );

        return;

      }

      const payout =
        payoutSnap.data();

      if (
        payout.status !== "pending"
      ) {

        showToast(
          "Payout sudah diproses"
        );

        return;

      }

      const walletRef =
        doc(
          db,
          "wallets",
          payout.sellerId
        );

      await runTransaction(
        db,
        async transaction => {

          const walletSnap =
            await transaction.get(
              walletRef
            );

          if (!walletSnap.exists()) {

            throw new Error(
              "Wallet seller tidak ditemukan"
            );

          }

          const wallet =
            walletSnap.data();

          transaction.update(
            walletRef,
            {
              pendingBalance:
                Math.max(
                  0,
                  Number(
                    wallet.pendingBalance || 0
                  ) -
                  Number(
                    payout.amount || 0
                  )
                ),

              updatedAt:
                serverTimestamp()
            }
          );

          transaction.update(
            payoutRef,
            {
              status: "approved",

              processedBy:
                currentUser.uid,

              processedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );

        }
      );

      await addDoc(
        collection(db, "notifications"),
        {
          userId:
            payout.sellerId,

          type:
            "payout_update",

          title:
            "Payout disetujui",

          message:
            `Payout ${formatRupiah(
              payout.amount
            )} disetujui.`,

          read: false,

          createdAt:
            serverTimestamp()
        }
      );

      showToast(
        "Payout disetujui"
      );

      await loadAdminPayouts();

    } catch (error) {

      console.error(error);

      showToast(
        "Gagal approve payout: " +
        error.message
      );

    }

  };


window.adminRejectPayout =
  async function(payoutId) {

    if (
      currentProfile?.role !== "admin"
    ) {

      showToast("Akses ditolak");

      return;

    }

    try {

      const payoutRef =
        doc(
          db,
          "payouts",
          payoutId
        );

      const payoutSnap =
        await getDoc(payoutRef);

      if (!payoutSnap.exists()) {

        showToast(
          "Payout tidak ditemukan"
        );

        return;

      }

      const payout =
        payoutSnap.data();

      if (
        payout.status !== "pending"
      ) {

        showToast(
          "Payout sudah diproses"
        );

        return;

      }

      const walletRef =
        doc(
          db,
          "wallets",
          payout.sellerId
        );

      await runTransaction(
        db,
        async transaction => {

          const walletSnap =
            await transaction.get(
              walletRef
            );

          if (!walletSnap.exists()) {

            throw new Error(
              "Wallet seller tidak ditemukan"
            );

          }

          const wallet =
            walletSnap.data();

          const available =
            Number(
              wallet.availableBalance || 0
            );

          const pending =
            Number(
              wallet.pendingBalance || 0
            );

          const amount =
            Number(
              payout.amount || 0
            );

          transaction.update(
            walletRef,
            {
              availableBalance:
                available + amount,

              pendingBalance:
                Math.max(
                  0,
                  pending - amount
                ),

              updatedAt:
                serverTimestamp()
            }
          );

          transaction.update(
            payoutRef,
            {
              status: "rejected",

              processedBy:
                currentUser.uid,

              processedAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp()
            }
          );

        }
      );

      await addDoc(
        collection(db, "notifications"),
        {
          userId:
            payout.sellerId,

          type:
            "payout_update",

          title:
            "Payout ditolak",

          message:
            `Payout ${formatRupiah(
              payout.amount
            )} ditolak dan saldo dikembalikan.`,

          read: false,

          createdAt:
            serverTimestamp()
        }
      );

      showToast(
        "Payout ditolak"
      );

      await loadAdminPayouts();

    } catch (error) {

      console.error(error);

      showToast(
        "Gagal menolak payout: " +
        error.message
      );

    }

  };


/* =========================================================
   ADMIN ORDERS
========================================================= */

async function loadAdminOrders() {

  const container =
    document.getElementById(
      "adminOrdersList"
    );

  if (!container) return;

  try {

    const snapshot =
      await getDocs(
        collection(db, "orders")
      );

    const orders =
      snapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .sort(
          (a, b) =>
            timestampValue(b.createdAt) -
            timestampValue(a.createdAt)
        );

    if (orders.length === 0) {

      container.innerHTML = `
        <div class="empty">
          Belum ada pesanan.
        </div>
      `;

      return;

    }

    container.innerHTML =
      orders.map(order => {

        return `
          <div class="order-card">

            <div class="order-header">

              <strong>
                #${escapeHtml(
                  order.id.slice(0, 8)
                )}
              </strong>

              <span class="status">
                ${escapeHtml(
                  order.status || "-"
                )}
              </span>

            </div>

            <p>
              Buyer:
              ${escapeHtml(
                order.buyerId || "-"
              )}
            </p>

            <p>
              Seller:
              ${escapeHtml(
                order.sellerId || "-"
              )}
            </p>

            <p>
              GMV:
              <strong>
                ${formatRupiah(
                  order.subtotal
                )}
              </strong>
            </p>

            <p>
              Komisi:
              <strong>
                ${formatRupiah(
                  order.platformFee
                )}
              </strong>
            </p>

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(
      "loadAdminOrders:",
      error
    );

  }

}


/* =========================================================
   NOTIFICATIONS
========================================================= */

function startNotificationListener() {

  if (!currentUser) return;

  if (notificationUnsubscribe) {

    notificationUnsubscribe();

  }

  const q =
    query(
      collection(
        db,
        "notifications"
      ),
      where(
        "userId",
        "==",
        currentUser.uid
      ),
      where(
        "read",
        "==",
        false
      )
    );

  notificationUnsubscribe =
    onSnapshot(
      q,
      snapshot => {

        if (
          snapshot.docChanges().length === 0
        ) {
          return;
        }

        snapshot.docChanges()
          .forEach(change => {

            if (
              change.type === "added"
            ) {

              const data =
                change.doc.data();

              if (data.title) {

                showToast(
                  "🔔 " +
                  data.title
                );

              }

            }

          });

      },
      error => {

        console.error(
          "notification listener:",
          error
        );

      }
    );

}


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    currentUser = user;

    if (!user) {

      currentProfile = null;

      if (notificationUnsubscribe) {

        notificationUnsubscribe();

        notificationUnsubscribe = null;

      }

      /*
        Tetap tampilkan marketplace.
      */

      await loadProducts();

      showPage("homePage");

      return;

    }

    try {

      await loadProfile();

      await loadProducts();

      startNotificationListener();

      if (
        currentProfile?.role === "seller"
      ) {

        await loadSellerDashboard();

      }

      if (
        currentProfile?.role === "admin"
      ) {

        await loadAdminDashboard();

      }

      showPage("homePage");

    } catch (error) {

      console.error(
        "auth state:",
        error
      );

    }

  }
);


/* =========================================================
   INITIAL
========================================================= */

renderCart();

updateCartBadge();
