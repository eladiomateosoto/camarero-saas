import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { restauranteId, mesa } = req.query;
  if (!restauranteId || !mesa) {
    return res.status(400).json({ error: "Faltan parámetros: restauranteId, mesa" });
  }

  try {
    const db = getFirestore(getAdminApp());
    const mesaRef = db
      .collection("restaurantes").doc(restauranteId)
      .collection("mesas").doc(String(mesa));

    const mesaSnap = await mesaRef.get();
    const mesaData = mesaSnap.exists ? mesaSnap.data() : { estado: "libre" };

    const comandasSnap = await mesaRef.collection("comandas")
      .orderBy("creadaEn", "asc").get();

    const comandas = comandasSnap.docs.map((d) => {
      const data = d.data();
      const totalCalculado = data.total > 0
        ? data.total
        : (data.items || []).reduce((a, i) => a + (i.precio || 0) * (i.cantidad || 1), 0);
      return {
        id: d.id,
        estado: data.estado || "pendiente",
        total: totalCalculado,
        creadaEn: data.creadaEn?.toDate?.().toISOString() || null,
        items: (data.items || []).map((i) => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio: i.precio || 0,
          subtotal: (i.precio || 0) * i.cantidad,
        })),
      };
    });

    const pendientes = comandas.filter((c) => c.estado === "pendiente");
    const servidas = comandas.filter((c) => c.estado !== "pendiente");
    const totalAcumulado = comandas.reduce((a, c) => a + c.total, 0);

    return res.status(200).json({
      ok: true,
      mesa: {
        id: String(mesa),
        estado: mesaData.estado || "libre",
        clienteNombre: mesaData.clienteNombre || null,
        personas: mesaData.personas || null,
        total: mesaData.total || totalAcumulado,
        abiertaEn: mesaData.abiertaEn?.toDate?.().toISOString() || null,
      },
      comandas: {
        total: comandas.length,
        pendientes: pendientes.length,
        servidas: servidas.length,
        lista: comandas,
      },
    });
  } catch (err) {
    console.error("[estado-mesa] ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
