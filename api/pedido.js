import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { restauranteId, mesa, nombre, personas, items, total } = req.body;

  if (!restauranteId || !mesa || !items) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    const restSnap = await db.collection("restaurantes").doc(restauranteId).get();
    if (!restSnap.exists) {
      return res.status(404).json({ error: "Restaurante no encontrado" });
    }
    const { telegramToken, telegramChatId } = restSnap.data();

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

    await mesaRef.collection("comandas").add({
      items,
      total,
      creadaEn: ahora,
    });

    if (telegramToken && telegramChatId) {
      const itemsText = items
        .map((i) => `  • ${i.nombre} x${i.cantidad} — ${((i.precio || 0) * i.cantidad).toFixed(2)}€`)
        .join("\n");

      const mensaje = `🍽️ NUEVA COMANDA\n━━━━━━━━━━━━━━━━━━\n📍 Mesa: ${mesa}\n👤 Cliente: ${nombre}\n👥 Personas: ${personas}\n━━━━━━━━━━━━━━━━━━\n🛒 Pedido:\n${itemsText}\n━━━━━━━━━━━━━━━━━━\n💶 Total: ${total.toFixed(2)}€`;

      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChatId, text: mensaje }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
