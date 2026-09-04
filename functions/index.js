const {
  onCall,
  onRequest,
  HttpsError
} = require("firebase-functions/v2/https");

const {
  defineSecret
} = require("firebase-functions/params");

const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const db = admin.firestore();

const MIDTRANS_SERVER_KEY =
  defineSecret("MIDTRANS_SERVER_KEY");


/*
========================================
MIDTRANS CONFIG
========================================
*/

function midtransBaseUrl() {

  return process.env.MIDTRANS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

}


function midtransAuth(serverKey) {

  return Buffer
    .from(serverKey + ":")
    .toString("base64");

}


/*
========================================
CREATE PAYMENT
========================================
*/

exports.createPayment = onCall(
  {
    secrets: [MIDTRANS_SERVER_KEY]
  },
  async (request) => {

    if (!request.auth) {

      throw new HttpsError(
        "unauthenticated",
        "Silakan login."
      );

    }

    const buyerId =
      request.auth.uid;

    const {
      orderId
    } = request.data || {};

    if (!orderId) {

      throw new HttpsError(
        "invalid-argument",
        "orderId wajib."
      );

    }

    const orderRef =
      db.collection("orders")
        .doc(orderId);

    const orderSnap =
      await orderRef.get();

    if (!orderSnap.exists) {

      throw new HttpsError(
        "not-found",
        "Order tidak ditemukan."
      );

    }

    const order =
      orderSnap.data();

    if (
      order.buyerId !== buyerId
    ) {

      throw new HttpsError(
        "permission-denied",
        "Bukan pemilik order."
      );

    }

    if (
      order.payment === "COD"
    ) {

      throw new HttpsError(
        "failed-precondition",
        "COD tidak membutuhkan pembayaran."
      );

    }

    if (
      order.paymentStatus === "paid"
    ) {

      throw new HttpsError(
        "failed-precondition",
        "Order sudah dibayar."
      );

    }

    /*
    ====================================
    CEK PAYMENT LAMA
    ====================================
    */

    const paymentRef =
      db.collection("payments")
        .doc(orderId);

    const paymentSnap =
      await paymentRef.get();

    if (
      paymentSnap.exists &&
      paymentSnap.data().status === "pending"
    ) {

      return {
        success: true,
        ...paymentSnap.data()
      };

    }

    /*
    ====================================
    NOMINAL
    ====================================
    */

    const grossAmount =
      Number(order.total || 0);

    if (
      !Number.isInteger(grossAmount) ||
      grossAmount <= 0
    ) {

      throw new HttpsError(
        "invalid-argument",
        "Nominal order tidak valid."
      );

    }

    /*
    ====================================
    CUSTOMER
    ====================================
    */

    const userSnap =
      await db
        .collection("users")
        .doc(buyerId)
        .get();

    const user =
      userSnap.exists
        ? userSnap.data()
        : {};

    /*
    ====================================
    MIDTRANS PAYMENT TYPE
    ====================================
    */

    let paymentType =
      "qris";

    let requestBody = {

      payment_type:
        "qris",

      transaction_details: {

        order_id:
          orderId,

        gross_amount:
          grossAmount

      },

      customer_details: {

        first_name:
          user.name ||
          "POPER Buyer",

        email:
          user.email ||
          "",

        phone:
          order.phone ||
          ""

      }

    };


    /*
    QRIS
    */

    if (
      order.payment === "QRIS"
    ) {

      paymentType =
        "qris";

      requestBody =
        {

          payment_type:
            "qris",

          transaction_details: {

            order_id,
            gross_amount:
              grossAmount

          },

          qris: {

            acquirer:
              "gopay"

          },

          customer_details: {

            first_name:
              user.name ||
              "POPER Buyer",

            email:
              user.email ||
              "",

            phone:
              order.phone ||
              ""

          }

        };

    }


    /*
    BANK TRANSFER
    */

    else if (
      order.payment ===
      "BANK_TRANSFER"
    ) {

      paymentType =
        "bank_transfer";

      requestBody =
        {

          payment_type:
            "bank_transfer",

          transaction_details: {

            order_id,
            gross_amount:
              grossAmount

          },

          bank_transfer: {

            bank:
              "bca"

          },

          customer_details: {

            first_name:
              user.name ||
              "POPER Buyer",

            email:
              user.email ||
              "",

            phone:
              order.phone ||
              ""

          }

        };

    }


    /*
    E-WALLET
    */

    else if (
      order.payment ===
      "E_WALLET"
    ) {

      paymentType =
        "gopay";

      requestBody =
        {

          payment_type:
            "gopay",

          transaction_details: {

            order_id,
            gross_amount:
              grossAmount

          },

          gopay: {

            enable_callback:
              true

          },

          customer_details: {

            first_name:
              user.name ||
              "POPER Buyer",

            email:
              user.email ||
              "",

            phone:
              order.phone ||
              ""

          }

        };

    }


    else {

      throw new HttpsError(
        "invalid-argument",
        "Metode pembayaran tidak didukung."
      );

    }


    /*
    ====================================
    CALL MIDTRANS
    ====================================
    */

    const serverKey =
      MIDTRANS_SERVER_KEY.value();

    const auth =
      midtransAuth(serverKey);

    const response =
      await fetch(
        midtransBaseUrl() +
        "/v2/charge",
        {

          method: "POST",

          headers: {

            "Accept":
              "application/json",

            "Content-Type":
              "application/json",

            "Authorization":
              "Basic " + auth

          },

          body:
            JSON.stringify(
              requestBody
            )

        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      console.error(
        "Midtrans error:",
        result
      );

      throw new HttpsError(
        "internal",
        "Gateway pembayaran gagal."
      );

    }


    /*
    ====================================
    EXTRACT PAYMENT DATA
    ====================================
    */

    let qrUrl = "";

    let qrString = "";

    let vaNumber = "";

    let bank = "";

    let deeplink = "";


    if (
      result.actions
    ) {

      const qrAction =
        result.actions.find(
          x =>
            x.name ===
            "generate-qr-code"
        );

      if (qrAction) {

        qrUrl =
          qrAction.url || "";

      }

      const deeplinkAction =
        result.actions.find(
          x =>
            x.name ===
            "deeplink-redirect"
        );

      if (deeplinkAction) {

        deeplink =
          deeplinkAction.url || "";

      }

    }


    if (
      result.qr_string
    ) {

      qrString =
        result.qr_string;

    }


    if (
      result.va_numbers &&
      result.va_numbers.length
    ) {

      bank =
        result.va_numbers[0].bank ||
        "";

      vaNumber =
        result.va_numbers[0].va_number ||
        "";

    }


    /*
    ====================================
    SAVE PAYMENT
    ====================================
    */

    const paymentData = {

      orderId,

      buyerId,

      sellerId:
        order.sellerId ||
        "",

      amount:
        grossAmount,

      method:
        order.payment,

      midtransPaymentType:
        paymentType,

      transactionId:
        result.transaction_id ||
        "",

      status:
        "pending",

      transactionStatus:
        result.transaction_status ||
        "pending",

      qrUrl,

      qrString,

      deeplink,

      bank,

      vaNumber,

      expiryTime:
        result.expiry_time ||
        null,

      createdAt:
        admin.firestore
          .FieldValue
          .serverTimestamp(),

      updatedAt:
        admin.firestore
          .FieldValue
          .serverTimestamp()

    };


    await paymentRef.set(
      paymentData,
      {
        merge: true
      }
    );


    await orderRef.update({

      paymentStatus:
        "pending",

      status:
        "waiting_payment",

      paymentCreatedAt:
        admin.firestore
          .FieldValue
          .serverTimestamp(),

      updatedAt:
        admin.firestore
          .FieldValue
          .serverTimestamp()

    });


    return {

      success: true,

      orderId,

      status:
        "pending",

      amount:
        grossAmount,

      method:
        order.payment,

      transactionId:
        result.transaction_id ||
        "",

      qrUrl,

      qrString,

      deeplink,

      bank,

      vaNumber,

      expiryTime:
        result.expiry_time ||
        null

    };

  }
);


/*
========================================
MIDTRANS WEBHOOK
========================================
*/

exports.midtransWebhook =
onRequest(
  {
    secrets: [
      MIDTRANS_SERVER_KEY
    ]
  },
  async (req, res) => {

    if (
      req.method !== "POST"
    ) {

      return res
        .status(405)
        .json({
          error:
            "Method not allowed"
        });

    }


    try {

      const body =
        req.body || {};


      const {

        order_id,
        status_code,
        gross_amount,
        signature_key,
        transaction_status,
        fraud_status

      } = body;


      if (
        !order_id ||
        !status_code ||
        !gross_amount ||
        !signature_key
      ) {

        return res
          .status(400)
          .json({
            error:
              "Webhook tidak lengkap."
          });

      }


      /*
      ==================================
      VERIFY SIGNATURE
      ==================================
      */

      const serverKey =
        MIDTRANS_SERVER_KEY.value();

      const raw =
        order_id +
        status_code +
        gross_amount +
        serverKey;

      const expected =
        crypto
          .createHash("sha512")
          .update(raw)
          .digest("hex");


      if (
        expected !==
        signature_key
      ) {

        console.error(
          "Invalid Midtrans signature"
        );

        return res
          .status(403)
          .json({
            error:
              "Signature invalid"
          });

      }


      /*
      ==================================
      GET ORDER
      ==================================
      */

      const orderRef =
        db.collection("orders")
          .doc(order_id);

      const paymentRef =
        db.collection("payments")
          .doc(order_id);


      await db.runTransaction(
        async transaction => {

          const orderSnap =
            await transaction.get(
              orderRef
            );

          if (
            !orderSnap.exists
          ) {

            throw new Error(
              "Order tidak ditemukan"
            );

          }

          const order =
            orderSnap.data();


          /*
          ================================
          IDENTITY / AMOUNT CHECK
          ================================
          */

          if (
            String(order.total) !==
            String(gross_amount)
          ) {

            throw new Error(
              "Nominal pembayaran tidak cocok"
            );

          }


          const paymentSnap =
            await transaction.get(
              paymentRef
            );


          /*
          ================================
          PAID
          ================================
          */

          const paid =
            transaction_status ===
              "settlement" ||

            (
              transaction_status ===
                "capture" &&

              fraud_status ===
                "accept"
            );


          if (paid) {

            /*
            Idempotency
            */

            if (
              order.paymentStatus ===
              "paid"
            ) {

              return;

            }


            transaction.update(
              orderRef,
              {

                paymentStatus:
                  "paid",

                status:
                  "processing",

                paidAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),

                updatedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp()

              }
            );


            /*
            Seller wallet
            */

            const sellerId =
              order.sellerId;

            if (sellerId) {

              const walletRef =
                db.collection("wallets")
                  .doc(sellerId);

              const walletSnap =
                await transaction.get(
                  walletRef
                );

              const wallet =
                walletSnap.exists
                  ? walletSnap.data()
                  : {};

              const sellerRevenue =
                Number(
                  order.sellerRevenue ||
                  0
                );


              transaction.set(
                walletRef,
                {

                  userId:
                    sellerId,

                  pendingBalance:
                    Number(
                      wallet.pendingBalance ||
                      0
                    ) +
                    sellerRevenue,

                  totalEarned:
                    Number(
                      wallet.totalEarned ||
                      0
                    ) +
                    sellerRevenue,

                  updatedAt:
                    admin.firestore
                      .FieldValue
                      .serverTimestamp()

                },
                {
                  merge: true
                }
              );


              transaction.set(
                paymentRef,
                {

                  status:
                    "paid",

                  transactionStatus:
                    transaction_status,

                  updatedAt:
                    admin.firestore
                      .FieldValue
                      .serverTimestamp()

                },
                {
                  merge: true
                }
              );

            }

          }


          /*
          ================================
          EXPIRED / CANCEL / DENY
          ================================
          */

          else {

            let newStatus =
              "pending";

            if (
              transaction_status ===
              "expire"
            ) {

              newStatus =
                "expired";

            }

            if (
              transaction_status ===
              "cancel"
            ) {

              newStatus =
                "cancelled";

            }

            if (
              transaction_status ===
              "deny"
            ) {

              newStatus =
                "failed";

            }


            transaction.set(
              paymentRef,
              {

                status:
                  newStatus,

                transactionStatus:
                  transaction_status,

                updatedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp()

              },
              {
                merge: true
              }
            );


            if (
              newStatus ===
              "expired" ||
              newStatus ===
              "cancelled" ||
              newStatus ===
              "failed"
            ) {

              transaction.update(
                orderRef,
                {

                  paymentStatus:
                    newStatus,

                  status:
                    newStatus,

                  updatedAt:
                    admin.firestore
                      .FieldValue
                      .serverTimestamp()

                }
              );

            }

          }

        }
      );


      return res
        .status(200)
        .json({
          success: true
        });


    } catch (error) {

      console.error(
        "Webhook error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Webhook gagal."
        });

    }

  }
);


/*
========================================
BUYER CONFIRM DELIVERY
========================================

Memindahkan pendingBalance →
availableBalance.

Dilakukan server-side.
========================================
*/

exports.confirmDelivery =
onCall(async request => {

  if (!request.auth) {

    throw new HttpsError(
      "unauthenticated",
      "Login diperlukan."
    );

  }

  const buyerId =
    request.auth.uid;

  const {
    orderId
  } =
    request.data || {};

  if (!orderId) {

    throw new HttpsError(
      "invalid-argument",
      "orderId wajib."
    );

  }

  const orderRef =
    db.collection("orders")
      .doc(orderId);


  await db.runTransaction(
    async transaction => {

      const orderSnap =
        await transaction.get(
          orderRef
        );

      if (
        !orderSnap.exists
      ) {

        throw new HttpsError(
          "not-found",
          "Order tidak ditemukan."
        );

      }

      const order =
        orderSnap.data();


      if (
        order.buyerId !==
        buyerId
      ) {

        throw new HttpsError(
          "permission-denied",
          "Akses ditolak."
        );

      }


      if (
        order.status ===
        "delivered"
      ) {

        return;

      }


      if (
        order.status !==
        "shipped"
      ) {

        throw new HttpsError(
          "failed-precondition",
          "Pesanan belum dikirim."
        );

      }


      const sellerId =
        order.sellerId;

      const sellerRevenue =
        Number(
          order.sellerRevenue ||
          0
        );


      const walletRef =
        db.collection("wallets")
          .doc(sellerId);


      const walletSnap =
        await transaction.get(
          walletRef
        );

      const wallet =
        walletSnap.exists
          ? walletSnap.data()
          : {};


      const pending =
        Number(
          wallet.pendingBalance ||
          0
        );


      const available =
        Number(
          wallet.availableBalance ||
          0
        );


      transaction.update(
        orderRef,
        {

          status:
            "delivered",

          balanceReleased:
            true,

          deliveredAt:
            admin.firestore
              .FieldValue
              .serverTimestamp(),

          updatedAt:
            admin.firestore
              .FieldValue
              .serverTimestamp()

        }
      );


      transaction.set(
        walletRef,
        {

          availableBalance:
            available +
            sellerRevenue,

          pendingBalance:
            Math.max(
              0,
              pending -
              sellerRevenue
            ),

          updatedAt:
            admin.firestore
              .FieldValue
              .serverTimestamp()

        },
        {
          merge: true
        }
      );

    }
  );


  return {
    success: true
  };

});
