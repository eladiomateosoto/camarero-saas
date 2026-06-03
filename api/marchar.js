import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { restauranteId, mesa } = req.body || {};
  if (!restauranteId || !mesa) {
    return res.status(400).json({ error: "Faltan campos: restauranteId, mesa" });
  }

  try {
    const db = getFirestore(getAdminApp());
    const comandasRef = db
      .collection("restaurantes").doc(restauranteId)
      .collection("mesas").doc(String(mesa))
      .collection("comandas");

    const snap = await comandasRef.where("estado", "==", "pendiente").get();

    if (snap.empty) {
      return res.status(200).json({ ok: true, servidas: 0, mensaje: "No había pedidos pendientes" });
    }

    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { estado: "servida" }));
    await batch.commit();

    return res.status(200).json({ ok: true, servidas: snap.docs.length });
  } catch (err) {
    console.error("[marchar] ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
