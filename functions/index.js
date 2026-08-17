// functions/index.js
//
// Server-side relay for WhatsApp Cloud API sends.
//
// Why this exists: calling graph.facebook.com directly from the browser
// (a) exposes the long-lived access token in every network request, and
// (b) may be blocked by CORS since that endpoint is designed for
//     server-to-server use. This function fixes both: the token stays in
//     Firestore and is only ever read on the server, and the client talks
//     to Firebase's own callable-function endpoint (which handles CORS
//     correctly out of the box).
//
// Deploy with: firebase deploy --only functions
// Requires the Blaze (pay-as-you-go) plan — Cloud Functions on the free
// Spark plan cannot make outbound network requests to graph.facebook.com.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Cost per message, in the same unit as walletBalance (e.g. INR).
// Change this to match your real pricing later.
const COST_PER_MESSAGE = 0.35;

exports.sendWhatsAppMessage = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const { to, message } = request.data || {};
  if (!to || !message) {
    throw new HttpsError("invalid-argument", "'to' and 'message' are required.");
  }

  const userRef = db.collection("users").doc(uid);

  // Atomically check + deduct wallet balance before sending.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.data() || {};
    const balance = data.walletBalance || 0;
    if (balance < COST_PER_MESSAGE) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient balance. You have ${balance.toFixed(2)}, need ${COST_PER_MESSAGE.toFixed(2)} per message.`
      );
    }
    tx.update(userRef, { walletBalance: admin.firestore.FieldValue.increment(-COST_PER_MESSAGE) });
  });

  const logTxn = (type, amount, reason) =>
    userRef.collection("transactions").add({
      type, amount, reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

  await logTxn("debit", COST_PER_MESSAGE, `Message to ${to}`);

  const userSnap = await userRef.get();
  const { waPhoneId, waAccessToken } = userSnap.data() || {};
  if (!waPhoneId || !waAccessToken) {
    // Refund since we can't actually send without credentials.
    await userRef.update({ walletBalance: admin.firestore.FieldValue.increment(COST_PER_MESSAGE) });
    await logTxn("credit", COST_PER_MESSAGE, "Refund — no WhatsApp API credentials on file");
    throw new HttpsError("failed-precondition", "No WhatsApp API credentials saved in Settings.");
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: String(to).replace(/[^\d]/g, ""),
        type: "text",
        text: { body: message }
      })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      // Refund on failure so people aren't charged for messages that never sent.
      await userRef.update({ walletBalance: admin.firestore.FieldValue.increment(COST_PER_MESSAGE) });
      await logTxn("credit", COST_PER_MESSAGE, "Refund — send failed");
      return { ok: false, error: (data.error && data.error.message) || `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.messages && data.messages[0] && data.messages[0].id };
  } catch (err) {
    await userRef.update({ walletBalance: admin.firestore.FieldValue.increment(COST_PER_MESSAGE) });
    await logTxn("credit", COST_PER_MESSAGE, "Refund — network error calling Meta");
    return { ok: false, error: "Network error calling Meta: " + err.message };
  }
});
