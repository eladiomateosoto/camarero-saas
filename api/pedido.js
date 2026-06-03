import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) {
    console.log("[pedido] Reutilizando app Firebase existente");
    return getApps()[0];
  }
  console.log("[pedido] Inicializando nueva app Firebase Admin");
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT no está definida");
  const serviceAccount = JSON.parse(raw);
  console.log("[pedido] project_id del service account:", serviceAccount.project_id);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  console.log("[pedido] Método:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  console.log("[pedido] Body recibido:", JSON.stringify(body));

  const { restauranteId, mesa, nombre, personas, items, total } = body;

  if (!restauranteId || !mesa || !items) {
    return res.status(400).json({ error: "Faltan campos requeridos", recibido: { restauranteId, mesa, items } });
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);
    console.log("[pedido] Firestore inicializado");

    console.log("[pedido] Buscando restaurante:", restauranteId);
    const restRef = db.collection("restaurantes").doc(restauranteId);
    console.log("[pedido] Path del documento:", restRef.path);

    const restSnap = await restRef.get();
    console.log("[pedido] restSnap.exists:", restSnap.exists);

    if (!restSnap.exists) {
      // Listar documentos existentes para diagnóstico
      const colSnap = await db.collection("restaurantes").limit(5).get();
      const existentes = colSnap.docs.map((d) => d.id);
      console.log("[pedido] Documentos en 'restaurantes':", existentes);
      return res.status(404).json({
        error: "Restaurante no encontrado",
        buscado: restauranteId,
        existentes,
      });
    }

    const { telegramToken, telegramChatId } = restSnap.data();
    console.log("[pedido] Restaurante encontrado. Telegram configurado:", !!(telegramToken && telegramChatId));

    const mesaRef = db
      .collection("restaurantes")
      .doc(restauranteId)
      .collection("mesas")
      .doc(String(mesa));

    const mesaSnap = await mesaRef.get();
    const mesaData = mesaSnap.exists ? mesaSnap.data() : {};
    const nuevoTotal = (mesaData.total || 0) + total;
    const ahora = FieldValue.serverTimestamp();

    if (mesaData.estado === "ocupada") {
      await mesaRef.update({ total: nuevoTotal, ultimaComanda: ahora });
    } else {
      await mesaRef.set({
        estado: "ocupada",
        clienteNombre: nombre,
        personas,
        total: nuevoTotal,
        abiertaEn: ahora,
        ultimaComanda: ahora,
      });
    }

    await mesaRef.collection("comandas").add({ items, total, creadaEn: ahora, estado: "pendiente" });
    console.log("[pedido] Comanda guardada en Firestore");

    if (telegramToken && telegramChatId) {
      const itemsText = items
        .map((i) => `  • ${i.nombre} x${i.cantidad} — ${((i.precio || 0) * i.cantidad).toFixed(2)}€`)
        .join("\n");

      const mensaje = `🍽️ NUEVA COMANDA\n━━━━━━━━━━━━━━━━━━\n📍 Mesa: ${mesa}\n👤 Cliente: ${nombre}\n👥 Personas: ${personas}\n━━━━━━━━━━━━━━━━━━\n🛒 Pedido:\n${itemsText}\n━━━━━━━━━━━━━━━━━━\n💶 Total: ${total.toFixed(2)}€`;

      const tgRes = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChatId, text: mensaje }),
      });
      console.log("[pedido] Telegram status:", tgRes.status);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[pedido] ERROR:", err.message, err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack?.split("\n").slice(0, 5) });
  }
}
