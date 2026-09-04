const {
  onCall,
  HttpsError
} =
require("firebase-functions/v2/https");


const {
  onDocumentUpdated
} =
require("firebase-functions/v2/firestore");


const {
  initializeApp
} =
require("firebase-admin/app");


const {
  getFirestore,
  FieldValue
} =
require("firebase-admin/firestore");


initializeApp();


const db =
  getFirestore();


/* =========================================
   SELLER ORDER STATUS
========================================= */

exports.sellerUpdateOrder =
onCall(
  async request => {

    if (!request.auth) {

      throw new HttpsError(
        "unauthenticated",
        "Login diperlukan"
      );

    }


    const uid =
      request.auth.uid;


    const {
      orderId,
      newStatus
    } =
      request.data;


    if (
      !orderId ||
      !newStatus
    ) {

      throw new HttpsError(
        "invalid-argument",
        "Data tidak lengkap"
      );

    }


    const orderRef =
      db.collection(
        "orders"
      ).doc(orderId);


    const orderSnap =
      await orderRef.get();


    if (!orderSnap.exists) {

      throw new HttpsError(
        "not-found",
        "Pesanan tidak ditemukan"
      );

    }


    const order =
      orderSnap.data();


    if (
      order.sellerId !== uid
    ) {

      throw new HttpsError(
        "permission-denied",
        "Bukan seller pesanan"
      );

    }


    const transitions = {

      pending: [
        "confirmed",
        "cancelled"
      ],

      confirmed: [
        "processing",
        "cancelled"
      ],

      processing: [
        "shipped"
      ]

    };


    const allowed =
      transitions[
        order.status
      ] || [];


    if (
      !allowed.includes(
        newStatus
      )
    ) {

      throw new HttpsError(
        "failed-precondition",
        "Perubahan status tidak valid"
      );

    }


    await orderRef.update({

      status:
        newStatus,

      updatedAt:
        FieldValue.serverTimestamp()

    });


    await db
      .collection(
        "notifications"
      )
      .add({

        userId:
          order.buyerId,

        title:
          "Pesanan diperbarui",

        message:
          `Pesanan berubah menjadi ${newStatus}`,

        type:
          "order",

        orderId,

        read:
          false,

        createdAt:
          FieldValue.serverTimestamp()

      });


    return {
      success: true
    };

  }
);


/* =========================================
   BUYER CONFIRM DELIVERY
========================================= */

exports.confirmDelivery =
onCall(
  async request => {

    if (!request.auth) {

      throw new HttpsError(
        "unauthenticated",
        "Login diperlukan"
      );

    }


    const uid =
      request.auth.uid;


    const {
      orderId
    } =
    request.data;


    const orderRef =
      db.collection(
        "orders"
      ).doc(orderId);


    const walletRef =
      db.collection(
        "wallets"
      ).doc();


    let sellerId;


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
            "Pesanan tidak ditemukan"
          );

        }


        const order =
          orderSnap.data();


        if (
          order.buyerId !== uid
        ) {

          throw new HttpsError(
            "permission-denied",
            "Bukan pembeli"
          );

        }


        if (
          order.status !==
          "shipped"
        ) {

          throw new HttpsError(
            "failed-precondition",
            "Pesanan belum dikirim"
          );

        }


        if (
          order.balanceReleased
        ) {

          throw new HttpsError(
            "already-exists",
            "Saldo sudah dirilis"
          );

        }


        sellerId =
          order.sellerId;


        const realWalletRef =
          db
            .collection(
              "wallets"
            )
            .doc(
              sellerId
            );


        const walletSnap =
          await transaction.get(
            realWalletRef
          );


        const oldBalance =
          walletSnap.exists
            ? Number(
                walletSnap.data()
                  .availableBalance ||
                0
              )
            : 0;


        const oldEarned =
          walletSnap.exists
            ? Number(
                walletSnap.data()
                  .totalEarned ||
                0
              )
            : 0;


        const revenue =
          Number(
            order.sellerRevenue ||
            0
          );


        transaction.set(
          realWalletRef,
          {

            userId:
              sellerId,

            availableBalance:
              oldBalance +
              revenue,

            pendingBalance:
              Number(
                walletSnap.data()
                  ?.pendingBalance ||
                0
              ),

            totalEarned:
              oldEarned +
              revenue,

            updatedAt:
              FieldValue.serverTimestamp()

          },
          {
            merge: true
          }
        );


        const transactionRef =
          db
            .collection(
              "walletTransactions"
            )
            .doc();


        transaction.set(
          transactionRef,
          {

            sellerId,

            orderId,

            type:
              "sale",

            amount:
              revenue,

            status:
              "available",

            createdAt:
              FieldValue.serverTimestamp()

          }
        );


        transaction.update(
          orderRef,
          {

            status:
              "delivered",

            balanceReleased:
              true,

            updatedAt:
              FieldValue.serverTimestamp()

          }
        );

      }
    );


    return {
      success: true,
      sellerId
    };

  }
);


/* =========================================
   NOTIFICATION WHEN ORDER CHANGES
========================================= */

exports.orderNotification =
onDocumentUpdated(
  "orders/{orderId}",
  async event => {

    const before =
      event.data.before.data();


    const after =
      event.data.after.data();


    if (
      before.status ===
      after.status
    ) {

      return;

    }


    await db
      .collection(
        "notifications"
      )
      .add({

        userId:
          after.buyerId,

        title:
          "Status pesanan",

        message:
          `Pesanan ${event.params.orderId.slice(0,8)}
          sekarang ${after.status}`,

        type:
          "order",

        orderId:
          event.params.orderId,

        read:
          false,

        createdAt:
          FieldValue.serverTimestamp()

      });

  }
);
