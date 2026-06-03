import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
    const mesaRef = db
      .collection("restaurantes").doc(restauranteId)
      .collection("mesas").doc(String(mesa));

    const mesaSnap = await mesaRef.get();
    if (!mesaSnap.exists || mesaSnap.data().estado === "libre") {
      return res.status(200).json({ ok: true, mensaje: "La mesa ya estaba libre" });
    }

    const mesaData = mesaSnap.data();
    const comandasSnap = await mesaRef.collection("comandas").get();
    const comandas = comandasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Guardar en histórico
    await db.collection("restaurantes").doc(restauranteId)
      .collection("historico").add({
        mesaId: String(mesa),
        clienteNombre: mesaData.clienteNombre || null,
        personas: mesaData.personas || null,
        total: mesaData.total || 0,
        abiertaEn: mesaData.abiertaEn || null,
        cerradaEn: FieldValue.serverTimestamp(),
        numComandas: comandas.length,
        items: comandas.flatMap((c) => c.items || []),
        comandas: comandas.map((c) => ({
          total: c.total || 0,
          creadaEn: c.creadaEn || null,
          items: c.items || [],
        })),
      });

    // Limpiar mesa
    await mesaRef.update({
      estado: "libre",
      clienteNombre: FieldValue.delete(),
      personas: FieldValue.delete(),
      total: FieldValue.delete(),
      abiertaEn: FieldValue.delete(),
      ultimaComanda: FieldValue.delete(),
    });

    return res.status(200).json({ ok: true, mesa: String(mesa) });
  } catch (err) {
    console.error("[cerrar-mesa] ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
