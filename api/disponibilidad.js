import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

const MAX_MESAS = 18;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { restauranteId, fecha, turno } = req.query;
  if (!restauranteId || !fecha || !turno) {
    return res.status(400).json({ error: "Faltan parámetros: restauranteId, fecha, turno" });
  }
  if (!["comida", "cena"].includes(turno)) {
    return res.status(400).json({ error: "El turno debe ser 'comida' o 'cena'" });
  }

  try {
    const db = getFirestore(getAdminApp());
    const snap = await db
      .collection("restaurantes").doc(restauranteId)
      .collection("reservas")
      .where("fecha", "==", fecha)
      .get();

    const activas = snap.docs.filter((d) => {
      const data = d.data();
      return data.turno === turno && !["cancelada", "no_presentado"].includes(data.estado);
    });

    const ocupadas = activas.length;
    const libres = Math.max(0, MAX_MESAS - ocupadas);

    return res.status(200).json({
      ok: true,
      disponible: ocupadas < MAX_MESAS,
      mesasLibres: libres,
      mesasOcupadas: ocupadas,
      total: MAX_MESAS,
    });
  } catch (err) {
    console.error("[disponibilidad] ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
