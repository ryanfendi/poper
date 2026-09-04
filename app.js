import {
  auth,
  db
} from "./firebase-config.js";

import {
  uploadImage
} from "./cloudinary.js";


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
} from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


let currentUser = null;

let currentProfile = null;

let products = [];

let currentCategory = "Semua";

let cart =
  JSON.parse(
    localStorage.getItem("poper_cart") ||
    "[]"
  );

let notificationUnsubscribe = null;


/* =========================================
   BASIC
========================================= */

window.formatRupiah =
function formatRupiah(number) {

  return new Intl.NumberFormat(
    "id-ID",
    {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }
  ).format(
    Number(number || 0)
  );
};


window.escapeHtml =
function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};


function setText(id, value) {

  const el =
    document.getElementById(id);

  if (el) {
    el.textContent = value;
  }
}


function saveCart() {

  localStorage.setItem(
    "poper_cart",
    JSON.stringify(cart)
  );

}


function getFinalPrice(product) {

  const price =
    Number(product.price || 0);

  const discount =
    Number(product.discount || 0);

  return Math.round(
    price -
    price * discount / 100
  );
}


function getSubtotal() {

  return cart.reduce(
    (sum, item) =>
      sum +
      (
        getFinalPrice(item) *
        Number(item.quantity || 0)
      ),
    0
  );

}


/* =========================================
   PAGE
========================================= */

window.showPage =
function showPage(pageId) {

  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.remove(
        "active"
      );

    });


  const page =
    document.getElementById(
      pageId
    );


  if (page) {

    page.classList.add(
      "active"
    );

    window.scrollTo(
      0,
      0
    );
  }


  if (
    pageId ===
    "ordersPage"
  ) {

    loadBuyerOrders();

  }


  if (
    pageId ===
    "sellerPage"
  ) {

    loadSellerDashboard();

  }


  if (
    pageId ===
    "adminPage"
  ) {

    loadAdminDashboard();

  }

};


/* =========================================
   SHEETS
========================================= */

window.openSheet =
function openSheet(id) {

  const sheet =
    document.getElementById(id);

  if (!sheet) return;

  sheet.classList.add("open");

  document
    .getElementById("overlay")
    .classList.add("show");

};


window.closeSheet =
function closeSheet(id) {

  const sheet =
    document.getElementById(id);

  if (sheet) {

    sheet.classList.remove(
      "open"
    );

  }


  const openSheets =
    document.querySelectorAll(
      ".sheet.open"
    );


  if (!openSheets.length) {

    document
      .getElementById("overlay")
      .classList.remove("show");

  }

};


window.closeAllSheets =
function closeAllSheets() {

  document
    .querySelectorAll(".sheet")
    .forEach(
      sheet =>
        sheet.classList.remove(
          "open"
        )
    );


  document
    .getElementById("overlay")
    .classList.remove("show");

};


window.showToast =
function showToast(message) {

  const toast =
    document.getElementById(
      "toast"
    );


  toast.textContent =
    message;


  toast.style.display =
    "block";


  setTimeout(() => {

    toast.style.display =
      "none";

  }, 2500);

};


/* =========================================
   AUTH
========================================= */

window.toggleRegister =
function toggleRegister() {

  const login =
    document.getElementById(
      "loginForm"
    );

  const register =
    document.getElementById(
      "registerForm"
    );


  const visible =
    register.style.display !==
    "none";


  register.style.display =
    visible
      ? "none"
      : "block";


  login.style.display =
    visible
      ? "block"
      : "none";

};


window.registerUser =
async function registerUser(event) {

  event.preventDefault();


  try {

    const name =
      document
        .getElementById(
          "registerName"
        )
        .value
        .trim();


    const email =
      document
        .getElementById(
          "registerEmail"
        )
        .value
        .trim();


    const password =
      document
        .getElementById(
          "registerPassword"
        )
        .value;


    const role =
      document
        .getElementById(
          "registerRole"
        )
        .value;


    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );


    await setDoc(
      doc(
        db,
        "users",
        credential.user.uid
      ),
      {

        name,

        email,

        role,

        createdAt:
          serverTimestamp()

      }
    );


    if (role === "seller") {

      await setDoc(
        doc(
          db,
          "stores",
          credential.user.uid
        ),
        {

          ownerId:
            credential.user.uid,

          name:
            `${name}'s Store`,

          description:
            "",

          phone:
            "",

          address:
            "",

          active:
            true,

          rating:
            0,

          ratingCount:
            0,

          totalProducts:
            0,

          createdAt:
            serverTimestamp()

        }
      );


      await setDoc(
        doc(
          db,
          "wallets",
          credential.user.uid
        ),
        {

          userId:
            credential.user.uid,

          availableBalance:
            0,

          pendingBalance:
            0,

          totalEarned:
            0,

          updatedAt:
            serverTimestamp()

        }
      );

    }


    showToast(
      "Akun berhasil dibuat"
    );


  } catch (error) {

    console.error(error);

    showToast(
      error.message
    );

  }

};


window.loginUser =
async function loginUser(event) {

  event.preventDefault();


  try {

    const email =
      document
        .getElementById(
          "loginEmail"
        )
        .value
        .trim();


    const password =
      document
        .getElementById(
          "loginPassword"
        )
        .value;


    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );


    showToast(
      "Login berhasil"
    );


  } catch (error) {

    showToast(
      "Email atau password salah"
    );

  }

};


window.logoutUser =
async function logoutUser() {

  await signOut(auth);

  showToast(
    "Berhasil keluar"
  );

};


/* =========================================
   PROFILE
========================================= */

async function loadProfile() {

  if (!currentUser) return;


  const snap =
    await getDoc(
      doc(
        db,
        "users",
        currentUser.uid
      )
    );


  if (!snap.exists()) {

    currentProfile = null;

    return;

  }


  currentProfile =
    snap.data();


  setText(
    "profileName",
    currentProfile.name ||
    "Pengguna"
  );


  setText(
    "profileEmail",
    currentUser.email ||
    ""
  );


  setText(
    "profileRole",
    currentProfile.role ||
    "buyer"
  );


  const sellerEntry =
    document.getElementById(
      "sellerEntry"
    );


  const adminEntry =
    document.getElementById(
      "adminEntry"
    );


  if (
    currentProfile.role ===
    "seller"
  ) {

    sellerEntry.style.display =
      "block";

  } else {

    sellerEntry.style.display =
      "none";

  }


  if (
    currentProfile.role ===
    "admin"
  ) {

    adminEntry.style.display =
      "block";

  } else {

    adminEntry.style.display =
      "none";

  }

}


/* =========================================
   PRODUCTS
========================================= */

async function loadProducts() {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "products"
        )
      );


    products =
      snapshot.docs.map(
        item => ({

          id:
            item.id,

          ...item.data()

        })
      );


    renderProducts(
      products
    );


  } catch (error) {

    console.error(error);

    showToast(
      "Gagal memuat produk"
    );

  }

}


function renderProducts(list) {

  const grid =
    document.getElementById(
      "productGrid"
    );


  if (!grid) return;


  setText(
    "productCount",
    `${list.length} produk`
  );


  if (!list.length) {

    grid.innerHTML = `
      <div class="empty-state">
        Belum ada produk.
      </div>
    `;

    return;

  }


  grid.innerHTML =
    list
      .map(
        product =>
          productCard(product)
      )
      .join("");

}


function productCard(product) {

  const price =
    getFinalPrice(product);


  const oldPrice =
    Number(product.price || 0);


  return `

    <article class="product-card">

      <button
        class="favorite"
        onclick="
          toggleFavorite(
            '${product.id}'
          )
        "
      >
        ♡
      </button>


      <img
        class="product-image"
        src="${escapeHtml(
          product.imageUrl ||
          "https://via.placeholder.com/500"
        )}"
        alt="${escapeHtml(
          product.name
        )}"
      >


      <div class="product-body">

        <div class="product-name">
          ${escapeHtml(
            product.name
          )}
        </div>


        <div class="product-price">
          ${formatRupiah(price)}
        </div>


        ${
          Number(product.discount || 0) > 0
          ? `
            <div class="product-old-price">
              ${formatRupiah(oldPrice)}
            </div>
          `
          : ""
        }


        <div class="product-store">
          ${escapeHtml(
            product.storeName ||
            "POPER Store"
          )}
        </div>


        <button
          class="add-cart"
          onclick="
            addToCart(
              '${product.id}'
            )
          "
        >
          + Keranjang
        </button>

      </div>

    </article>

  `;

}


window.searchProducts =
function searchProducts(value) {

  const keyword =
    value
      .toLowerCase()
      .trim();


  const filtered =
    products.filter(
      product => {

        const matchName =
          String(
            product.name || ""
          )
          .toLowerCase()
          .includes(
            keyword
          );


        const matchCategory =
          currentCategory ===
          "Semua" ||
          product.category ===
          currentCategory;


        return (
          matchName &&
          matchCategory
        );

      }
    );


  renderProducts(
    filtered
  );

};


window.filterCategory =
function filterCategory(category) {

  currentCategory =
    category;


  searchProducts(
    document
      .getElementById(
        "searchInput"
      )
      .value
  );

};


/* =========================================
   CART
========================================= */

window.addToCart =
function addToCart(productId) {

  const product =
    products.find(
      p =>
        p.id ===
        productId
    );


  if (!product) {

    showToast(
      "Produk tidak ditemukan"
    );

    return;

  }


  const existing =
    cart.find(
      item =>
        item.productId ===
        productId
    );


  if (existing) {

    existing.quantity++;

  } else {

    cart.push({

      productId:
        product.id,

      name:
        product.name,

      price:
        product.price,

      discount:
        product.discount || 0,

      imageUrl:
        product.imageUrl,

      stock:
        product.stock,

      storeId:
        product.storeId,

      storeName:
        product.storeName,

      sellerId:
        product.sellerId,

      quantity:
        1

    });

  }


  saveCart();

  updateCartBadge();

  showToast(
    "Produk masuk keranjang"
  );

};


function updateCartBadge() {

  const count =
    cart.reduce(
      (sum, item) =>
        sum +
        Number(
          item.quantity || 0
        ),
      0
    );


  setText(
    "cartBadge",
    count
  );

}


function renderCart() {

  const container =
    document.getElementById(
      "cartItems"
    );


  if (!container) return;


  if (!cart.length) {

    container.innerHTML = `
      <div class="empty-state">
        Keranjang masih kosong.
      </div>
    `;

    setText(
      "cartTotal",
      formatRupiah(0)
    );

    return;

  }


  container.innerHTML =
    cart.map(
      item => `

        <div class="cart-item">

          <img
            src="${escapeHtml(
              item.imageUrl ||
              "https://via.placeholder.com/200"
            )}"
          >


          <div class="cart-info">

            <strong>
              ${escapeHtml(
                item.name
              )}
            </strong>

            <div>
              ${formatRupiah(
                getFinalPrice(item)
              )}
            </div>


            <div class="qty">

              <button
                onclick="
                  changeCartQuantity(
                    '${item.productId}',
                    -1
                  )
                "
              >
                −
              </button>


              <span>
                ${item.quantity}
              </span>


              <button
                onclick="
                  changeCartQuantity(
                    '${item.productId}',
                    1
                  )
                "
              >
                +
              </button>


              <button
                onclick="
                  removeCartItem(
                    '${item.productId}'
                  )
                "
              >
                🗑
              </button>

            </div>

          </div>

        </div>

      `
    ).join("");


  setText(
    "cartTotal",
    formatRupiah(
      getSubtotal()
    )
  );

}


window.changeCartQuantity =
function changeCartQuantity(
  productId,
  amount
) {

  const item =
    cart.find(
      x =>
        x.productId ===
        productId
    );


  if (!item) return;


  item.quantity +=
    amount;


  if (
    item.quantity <= 0
  ) {

    cart =
      cart.filter(
        x =>
          x.productId !==
          productId
      );

  }


  saveCart();

  updateCartBadge();

  renderCart();

};


window.removeCartItem =
function removeCartItem(
  productId
) {

  cart =
    cart.filter(
      x =>
        x.productId !==
        productId
    );


  saveCart();

  updateCartBadge();

  renderCart();

};


/* =========================================
   CHECKOUT
========================================= */

window.openCheckout =
function openCheckout() {

  if (!currentUser) {

    showToast(
      "Silakan login terlebih dahulu"
    );

    closeSheet(
      "cartSheet"
    );

    showPage(
      "authPage"
    );

    return;

  }


  if (!cart.length) {

    showToast(
      "Keranjang kosong"
    );

    return;

  }


  const subtotal =
    getSubtotal();


  const shipping =
    10000;


  setText(
    "checkoutSubtotal",
    formatRupiah(
      subtotal
    )
  );


  setText(
    "checkoutShipping",
    formatRupiah(
      shipping
    )
  );


  setText(
    "checkoutTotal",
    formatRupiah(
      subtotal +
      shipping
    )
  );


  closeSheet(
    "cartSheet"
  );


  openSheet(
    "checkoutSheet"
  );

};


window.checkout =
async function checkout(event) {

  event.preventDefault();


  if (!currentUser) {

    showToast(
      "Silakan login"
    );

    return;

  }


  if (!cart.length) {

    showToast(
      "Keranjang kosong"
    );

    return;

  }


  try {

    const address =
      document
        .getElementById(
          "checkoutAddress"
        )
        .value
        .trim();


    const phone =
      document
        .getElementById(
          "checkoutPhone"
        )
        .value
        .trim();


    const payment =
      document.querySelector(
        'input[name="payment"]:checked'
      ).value;


    const groups = {};


    cart.forEach(item => {

      if (
        !groups[item.storeId]
      ) {

        groups[item.storeId] =
          [];

      }


      groups[item.storeId]
        .push(item);

    });


    for (
      const storeId
      of Object.keys(groups)
    ) {

      const items =
        groups[storeId];


      const subtotal =
        items.reduce(
          (sum, item) =>
            sum +
            (
              getFinalPrice(item) *
              item.quantity
            ),
          0
        );


      const shipping =
        10000;


      const total =
        subtotal +
        shipping;


      const platformFee =
        Math.round(
          subtotal * 0.10
        );


      const sellerRevenue =
        subtotal -
        platformFee;


      const sellerId =
        items[0].sellerId;


      const orderRef =
        await addDoc(
          collection(
            db,
            "orders"
          ),
          {

            buyerId:
              currentUser.uid,

            sellerId,

            storeId,

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

            balanceReleased:
              false,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()

          }
        );


      for (
        const item
        of items
      ) {

        await addDoc(
          collection(
            db,
            "orders",
            orderRef.id,
            "items"
          ),
          {

            productId:
              item.productId,

            name:
              item.name,

            price:
              getFinalPrice(item),

            quantity:
              item.quantity,

            imageUrl:
              item.imageUrl,

            storeId,

            sellerId

          }
        );

      }


      await addDoc(
        collection(
          db,
          "notifications"
        ),
        {

          userId:
            sellerId,

          title:
            "Pesanan baru",

          message:
            "Kamu menerima pesanan baru.",

          type:
            "order",

          orderId:
            orderRef.id,

          read:
            false,

          createdAt:
            serverTimestamp()

        }
      );

    }


    cart = [];

    saveCart();

    updateCartBadge();


    closeSheet(
      "checkoutSheet"
    );


    showToast(
      "Pesanan berhasil dibuat"
    );


    showPage(
      "ordersPage"
    );


    loadBuyerOrders();


  } catch (error) {

    console.error(error);

    showToast(
      "Checkout gagal"
    );

  }

};


/* =========================================
   BUYER ORDERS
========================================= */

async function loadBuyerOrders() {

  if (!currentUser) return;


  const container =
    document.getElementById(
      "orders"
    );


  if (!container) return;


  try {

    const q =
      query(
        collection(
          db,
          "orders"
        ),
        where(
          "buyerId",
          "==",
          currentUser.uid
        )
      );


    const snapshot =
      await getDocs(q);


    if (snapshot.empty) {

      container.innerHTML = `
        <div class="empty-state">
          Belum ada pesanan.
        </div>
      `;

      return;

    }


    const orders =
      snapshot.docs
        .map(
          item => ({
            id:
              item.id,
            ...item.data()
          })
        )
        .sort(
          (a,b) =>
            (
              b.createdAt?.seconds ||
              0
            ) -
            (
              a.createdAt?.seconds ||
              0
            )
        );


    container.innerHTML =
      orders
        .map(
          order => `

            <div class="order-card">

              <h3>
                Pesanan #${order.id.slice(0,8)}
              </h3>

              <span class="status">
                ${escapeHtml(
                  order.status
                )}
              </span>

              <p>
                ${formatRupiah(
                  order.total
                )}
              </p>

              <p>
                Pembayaran:
                ${escapeHtml(
                  order.payment
                )}
              </p>


              ${
                order.status ===
                "shipped"
                ? `
                  <button
                    class="primary-btn"
                    onclick="
                      confirmDelivery(
                        '${order.id}'
                      )
                    "
                  >
                    Pesanan sudah diterima
                  </button>
                `
                : ""
              }


              <button
                class="primary-btn"
                onclick="
                  trackOrder(
                    '${order.id}'
                  )
                "
              >
                Lacak Pesanan
              </button>

            </div>

          `
        )
        .join("");


  } catch (error) {

    console.error(error);

  }

}


/* =========================================
   TRACKING
========================================= */

window.trackOrder =
function trackOrder(orderId) {

  openSheet(
    "trackingSheet"
  );


  const content =
    document.getElementById(
      "trackingContent"
    );


  content.innerHTML = `
    <p>
      Menghubungkan tracking...
    </p>
  `;


  onSnapshot(
    doc(
      db,
      "orders",
      orderId
    ),
    snapshot => {

      if (!snapshot.exists()) {

        content.innerHTML =
          "Pesanan tidak ditemukan.";

        return;

      }


      const order =
        snapshot.data();


      content.innerHTML = `

        <div class="order-card">

          <h2>
            ${escapeHtml(
              order.status
            )}
          </h2>

          <p>
            Status pesanan diperbarui
            secara realtime.
          </p>

        </div>

      `;

    }
  );

};


window.confirmDelivery =
async function confirmDelivery(
  orderId
) {

  showToast(
    "Memproses konfirmasi..."
  );


  try {

    await updateDoc(
      doc(
        db,
        "orders",
        orderId
      ),
      {

        status:
          "delivered",

        updatedAt:
          serverTimestamp()

      }
    );


    showToast(
      "Pesanan selesai"
    );


    loadBuyerOrders();


  } catch (error) {

    console.error(error);

    showToast(
      "Gagal mengonfirmasi"
    );

  }

};


/* =========================================
   SELLER
========================================= */

async function loadSellerDashboard() {

  if (
    !currentUser ||
    !currentProfile ||
    currentProfile.role !==
    "seller"
  ) {

    return;

  }


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
      store.name ||
      "Toko Saya"
    );


    setText(
      "storeAddress",
      store.address ||
      "Belum ada alamat"
    );

  }


  await loadSellerProducts();

  await loadSellerOrders();

  await loadSellerWallet();

}


async function loadSellerProducts() {

  const grid =
    document.getElementById(
      "sellerProductGrid"
    );


  if (!grid) return;


  const q =
    query(
      collection(
        db,
        "products"
      ),
      where(
        "sellerId",
        "==",
        currentUser.uid
      )
    );


  const snapshot =
    await getDocs(q);


  setText(
    "sellerProducts",
    snapshot.size
  );


  grid.innerHTML =
    snapshot.docs
      .map(
        item => {

          const product =
            {
              id:
                item.id,
              ...item.data()
            };


          return productCard(
            product
          );

        }
      )
      .join("");

}


async function loadSellerOrders() {

  const container =
    document.getElementById(
      "sellerOrdersList"
    );


  if (!container) return;


  const q =
    query(
      collection(
        db,
        "orders"
      ),
      where(
        "sellerId",
        "==",
        currentUser.uid
      )
    );


  const snapshot =
    await getDocs(q);


  setText(
    "sellerOrders",
    snapshot.size
  );


  let revenue = 0;


  snapshot.forEach(
    item => {

      const order =
        item.data();


      if (
        order.status !==
        "cancelled"
      ) {

        revenue +=
          Number(
            order.sellerRevenue ||
            0
          );

      }

    }
  );


  setText(
    "sellerRevenue",
    formatRupiah(
      revenue
    )
  );


  if (snapshot.empty) {

    container.innerHTML =
      "Belum ada pesanan.";

    return;

  }


  container.innerHTML =
    snapshot.docs
      .map(
        item => {

          const order =
            item.data();


          return `

            <div class="order-card">

              <h3>
                #${item.id.slice(0,8)}
              </h3>

              <span class="status">
                ${escapeHtml(
                  order.status
                )}
              </span>

              <p>
                ${formatRupiah(
                  order.total
                )}
              </p>


              ${
                order.status ===
                "pending"
                ? `
                  <button
                    class="primary-btn"
                    onclick="
                      updateOrderStatus(
                        '${item.id}',
                        'confirmed'
                      )
                    "
                  >
                    Konfirmasi
                  </button>
                `
                : ""
              }


              ${
                order.status ===
                "confirmed"
                ? `
                  <button
                    class="primary-btn"
                    onclick="
                      updateOrderStatus(
                        '${item.id}',
                        'processing'
                      )
                    "
                  >
                    Proses
                  </button>
                `
                : ""
              }


              ${
                order.status ===
                "processing"
                ? `
                  <button
                    class="primary-btn"
                    onclick="
                      updateOrderStatus(
                        '${item.id}',
                        'shipped'
                      )
                    "
                  >
                    Kirim
                  </button>
                `
                : ""
              }

            </div>

          `;

        }
      )
      .join("");

}


window.updateOrderStatus =
async function updateOrderStatus(
  orderId,
  status
) {

  try {

    const orderSnap =
      await getDoc(
        doc(
          db,
          "orders",
          orderId
        )
      );


    if (!orderSnap.exists()) {

      throw new Error(
        "Pesanan tidak ditemukan"
      );

    }


    const order =
      orderSnap.data();


    if (
      order.sellerId !==
      currentUser.uid
    ) {

      throw new Error(
        "Tidak memiliki akses"
      );

    }


    await updateDoc(
      doc(
        db,
        "orders",
        orderId
      ),
      {

        status,

        updatedAt:
          serverTimestamp()

      }
    );


    await addDoc(
      collection(
        db,
        "notifications"
      ),
      {

        userId:
          order.buyerId,

        title:
          "Pesanan diperbarui",

        message:
          `Pesanan sekarang ${status}`,

        type:
          "order",

        orderId,

        read:
          false,

        createdAt:
          serverTimestamp()

      }
    );


    showToast(
      "Status diperbarui"
    );


    loadSellerOrders();


  } catch (error) {

    console.error(error);

    showToast(
      error.message
    );

  }

};


/* =========================================
   WALLET
========================================= */

async function loadSellerWallet() {

  if (!currentUser) return;


  const snap =
    await getDoc(
      doc(
        db,
        "wallets",
        currentUser.uid
      )
    );


  const balance =
    snap.exists()
      ? Number(
          snap.data()
            .availableBalance || 0
        )
      : 0;


  setText(
    "sellerBalance",
    formatRupiah(
      balance
    )
  );


  setText(
    "payoutAvailable",
    formatRupiah(
      balance
    )
  );

}


window.requestPayout =
async function requestPayout() {

  if (!currentUser) {

    showToast(
      "Login terlebih dahulu"
    );

    return;

  }


  const amount =
    Number(
      document
        .getElementById(
          "payoutAmount"
        )
        .value
    );


  const method =
    document
      .getElementById(
        "payoutMethod"
      )
      .value;


  const name =
    document
      .getElementById(
        "payoutName"
      )
      .value
      .trim();


  const account =
    document
      .getElementById(
        "payoutAccount"
      )
      .value
      .trim();


  if (
    amount <= 0 ||
    !name ||
    !account
  ) {

    showToast(
      "Lengkapi data payout"
    );

    return;

  }


  try {

    const walletSnap =
      await getDoc(
        doc(
          db,
          "wallets",
          currentUser.uid
        )
      );


    if (!walletSnap.exists()) {

      throw new Error(
        "Wallet belum tersedia"
      );

    }


    const available =
      Number(
        walletSnap.data()
          .availableBalance || 0
      );


    if (
      amount >
      available
    ) {

      throw new Error(
        "Saldo tidak mencukupi"
      );

    }


    await addDoc(
      collection(
        db,
        "payouts"
      ),
      {

        sellerId:
          currentUser.uid,

        amount,

        method,

        accountName:
          name,

        accountNumber:
          account,

        status:
          "pending",

        createdAt:
          serverTimestamp()

      }
    );


    closeSheet(
      "payoutSheet"
    );


    showToast(
      "Payout diajukan"
    );


  } catch (error) {

    showToast(
      error.message
    );

  }

};


/* =========================================
   SELLER PRODUCT
========================================= */

window.createProduct =
async function createProduct(event) {

  event.preventDefault();


  if (!currentUser) {

    showToast(
      "Login sebagai seller"
    );

    return;

  }


  try {

    const file =
      document
        .getElementById(
          "sellerProductImage"
        )
        .files[0];


    const imageUrl =
      await uploadImage(
        file
      );


    const name =
      document
        .getElementById(
          "sellerProductName"
        )
        .value
        .trim();


    const price =
      Number(
        document
          .getElementById(
            "sellerProductPrice"
          )
          .value
      );


    const discount =
      Number(
        document
          .getElementById(
            "sellerProductDiscount"
          )
          .value ||
          0
      );


    const stock =
      Number(
        document
          .getElementById(
            "sellerProductStock"
          )
          .value
      );


    const category =
      document
        .getElementById(
          "sellerProductCategory"
        )
        .value;


    const description =
      document
        .getElementById(
          "sellerProductDescription"
        )
        .value
        .trim();


    const storeSnap =
      await getDoc(
        doc(
          db,
          "stores",
          currentUser.uid
        )
      );


    const store =
      storeSnap.exists()
        ? storeSnap.data()
        : {};


    await addDoc(
      collection(
        db,
        "products"
      ),
      {

        ownerId:
          currentUser.uid,

        sellerId:
          currentUser.uid,

        storeId:
          currentUser.uid,

        storeName:
          store.name ||
          "POPER Store",

        name,

        price,

        discount,

        stock,

        category,

        description,

        imageUrl,

        active:
          true,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()

      }
    );


    closeSheet(
      "sellerFormSheet"
    );


    document
      .getElementById(
        "sellerForm"
      )
      .reset();


    showToast(
      "Produk berhasil dibuat"
    );


    await loadProducts();

    await loadSellerProducts();


  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Gagal membuat produk"
    );

  }

};


/* IMAGE PREVIEW */

document
  .getElementById(
    "sellerProductImage"
  )
  ?.addEventListener(
    "change",
    event => {

      const file =
        event.target.files[0];


      if (!file) return;


      const preview =
        document.getElementById(
          "imagePreview"
        );


      preview.src =
        URL.createObjectURL(
          file
        );


      preview.style.display =
        "block";

    }
  );


/* =========================================
   ADDRESS
========================================= */

window.saveAddress =
async function saveAddress() {

  if (!currentUser) return;


  const name =
    document
      .getElementById(
        "addressName"
      )
      .value
      .trim();


  const phone =
    document
      .getElementById(
        "addressPhone"
      )
      .value
      .trim();


  const address =
    document
      .getElementById(
        "addressText"
      )
      .value
      .trim();


  if (
    !name ||
    !phone ||
    !address
  ) {

    showToast(
      "Lengkapi alamat"
    );

    return;

  }


  await addDoc(
    collection(
      db,
      "addresses"
    ),
    {

      userId:
        currentUser.uid,

      name,

      phone,

      address,

      createdAt:
        serverTimestamp()

    }
  );


  showToast(
    "Alamat disimpan"
  );


  closeSheet(
    "addressSheet"
  );

};


/* =========================================
   FAVORITE
========================================= */

window.toggleFavorite =
async function toggleFavorite(
  productId
) {

  if (!currentUser) {

    showToast(
      "Login untuk menyimpan favorit"
    );

    return;

  }


  const ref =
    doc(
      db,
      "favorites",
      currentUser.uid,
      "items",
      productId
    );


  const snap =
    await getDoc(ref);


  if (snap.exists()) {

    await deleteDoc(ref);

    showToast(
      "Dihapus dari favorit"
    );

  } else {

    await setDoc(
      ref,
      {

        productId,

        createdAt:
          serverTimestamp()

      }
    );


    showToast(
      "Ditambahkan ke favorit"
    );

  }

};


/* =========================================
   ADMIN
========================================= */

async function isAdmin() {

  if (
    !currentUser ||
    !currentProfile
  ) {

    return false;

  }


  return (
    currentProfile.role ===
    "admin"
  );

}


async function loadAdminDashboard() {

  if (
    !(await isAdmin())
  ) {

    showToast(
      "Akses admin ditolak"
    );

    return;

  }


  try {

    const users =
      await getDocs(
        collection(
          db,
          "users"
        )
      );


    const productsSnap =
      await getDocs(
        collection(
          db,
          "products"
        )
      );


    const ordersSnap =
      await getDocs(
        collection(
          db,
          "orders"
        )
      );


    let buyers = 0;

    let sellers = 0;

    let gmv = 0;

    let commission = 0;


    users.forEach(
      item => {

        const user =
          item.data();


        if (
          user.role ===
          "buyer"
        ) buyers++;


        if (
          user.role ===
          "seller"
        ) sellers++;

      }
    );


    ordersSnap.forEach(
      item => {

        const order =
          item.data();


        if (
          order.status ===
          "cancelled"
        ) return;


        gmv +=
          Number(
            order.total || 0
          );


        commission +=
          Number(
            order.platformFee ||
            0
          );

      }
    );


    setText(
      "adminBuyers",
      buyers
    );


    setText(
      "adminSellers",
      sellers
    );


    setText(
      "adminProducts",
      productsSnap.size
    );


    setText(
      "adminOrders",
      ordersSnap.size
    );


    setText(
      "adminGMV",
      formatRupiah(
        gmv
      )
    );


    setText(
      "adminCommission",
      formatRupiah(
        commission
      )
    );


    await loadAdminPayouts();

    await loadAdminOrders();


  } catch (error) {

    console.error(error);

  }

}


async function loadAdminPayouts() {

  const container =
    document.getElementById(
      "adminPayouts"
    );


  if (!container) return;


  const q =
    query(
      collection(
        db,
        "payouts"
      ),
      where(
        "status",
        "==",
        "pending"
      )
    );


  const snapshot =
    await getDocs(q);


  if (snapshot.empty) {

    container.innerHTML =
      `
        <div class="order-card">
          Tidak ada payout.
        </div>
      `;

    return;

  }


  container.innerHTML =
    snapshot.docs
      .map(
        item => {

          const payout =
            item.data();


          return `

            <div class="payout-card">

              <strong>
                ${formatRupiah(
                  payout.amount
                )}
              </strong>

              <p>
                ${escapeHtml(
                  payout.accountName
                )}
              </p>

              <p>
                ${escapeHtml(
                  payout.accountNumber
                )}
              </p>

              <button
                onclick="
                  approvePayout(
                    '${item.id}'
                  )
                "
              >
                Setujui
              </button>

              <button
                onclick="
                  rejectPayout(
                    '${item.id}'
                  )
                "
              >
                Tolak
              </button>

            </div>

          `;

        }
      )
      .join("");

}


window.approvePayout =
async function approvePayout(
  payoutId
) {

  if (
    !(await isAdmin())
  ) return;


  try {

    await updateDoc(
      doc(
        db,
        "payouts",
        payoutId
      ),
      {

        status:
          "approved",

        approvedAt:
          serverTimestamp(),

        approvedBy:
          currentUser.uid

      }
    );


    showToast(
      "Payout disetujui"
    );


    loadAdminPayouts();


  } catch (error) {

    showToast(
      "Gagal menyetujui"
    );

  }

};


window.rejectPayout =
async function rejectPayout(
  payoutId
) {

  if (
    !(await isAdmin())
  ) return;


  try {

    await updateDoc(
      doc(
        db,
        "payouts",
        payoutId
      ),
      {

        status:
          "rejected",

        rejectedAt:
          serverTimestamp(),

        rejectedBy:
          currentUser.uid

      }
    );


    showToast(
      "Payout ditolak"
    );


    loadAdminPayouts();


  } catch (error) {

    showToast(
      "Gagal menolak"
    );

  }

};


async function loadAdminOrders() {

  const container =
    document.getElementById(
      "adminOrdersList"
    );


  if (!container) return;


  const snapshot =
    await getDocs(
      collection(
        db,
        "orders"
      )
    );


  container.innerHTML =
    snapshot.docs
      .slice(0,50)
      .map(
        item => {

          const order =
            item.data();


          return `

            <div class="order-card">

              <strong>
                #${item.id.slice(0,8)}
              </strong>

              <p>
                ${formatRupiah(
                  order.total
                )}
              </p>

              <span class="status">
                ${escapeHtml(
                  order.status
                )}
              </span>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================
   NOTIFICATION
========================================= */

function listenNotifications() {

  if (!currentUser) return;


  if (
    notificationUnsubscribe
  ) {

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
          snapshot.size > 0
        ) {

          showToast(
            `${snapshot.size} notifikasi baru`
          );

        }

      }
    );

}


/* =========================================
   AUTH STATE
========================================= */

onAuthStateChanged(
  auth,
  async user => {

    currentUser =
      user;


    if (!user) {

      currentProfile =
        null;


      showPage(
        "authPage"
      );


      return;

    }


    await loadProfile();

    await loadProducts();

    listenNotifications();

    updateCartBadge();


    if (
      currentProfile?.role ===
      "seller"
    ) {

      await loadSellerDashboard();

    }


    if (
      currentProfile?.role ===
      "admin"
    ) {

      await loadAdminDashboard();

    }


    showPage(
      "homePage"
    );

  }
);


/* =========================================
   INITIAL
========================================= */

renderCart();

updateCartBadge();

window.openEditStoreName = async function () {
  if (!currentUser) {
    showToast("Silakan login terlebih dahulu");
    return;
  }

  try {
    const storeRef = doc(db, "stores", currentUser.uid);
    const storeSnap = await getDoc(storeRef);

    if (!storeSnap.exists()) {
      showToast("Toko belum dibuat");
      return;
    }

    const store = storeSnap.data();

    document.getElementById("editStoreName").value =
      store.name || "";

    openSheet("editStoreNameSheet");

  } catch (error) {
    console.error(error);
    showToast("Gagal membuka pengaturan toko");
  }
};

document
  .getElementById("editStoreNameForm")
  .addEventListener("submit", async function (e) {

    e.preventDefault();

    if (!currentUser) return;

    const input = document.getElementById("editStoreName");
    const newName = input.value.trim();

    if (!newName) {
      showToast("Nama toko wajib diisi");
      return;
    }

    if (newName.length < 3) {
      showToast("Nama toko minimal 3 karakter");
      return;
    }

    try {
      const storeRef = doc(db, "stores", currentUser.uid);

      await updateDoc(storeRef, {
        name: newName,
        updatedAt: serverTimestamp()
      });

      // Update tampilan
      const storeNameElement =
        document.getElementById("storeName");

      if (storeNameElement) {
        storeNameElement.textContent = newName;
      }

      closeAllSheets();

      showToast("✅ Nama toko berhasil diperbarui");

      // Refresh data toko
      if (typeof loadSellerData === "function") {
        await loadSellerData();
      }

    } catch (error) {
      console.error(error);
      showToast("❌ Gagal mengubah nama toko");
    }
  });
