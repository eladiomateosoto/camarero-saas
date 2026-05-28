import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

function getApp() {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApps()[0];
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
    const app = getApp();
    const db = getFirestore(app);

    // Obtener datos del restaurante (token telegram)
    const restSnap = await getDoc(doc(db, "restaurantes", restauranteId));
    if (!restSnap.exists()) {
      return res.status(404).json({ error: "Restaurante no encontrado" });
    }
    const restData = restSnap.data();
    const { telegramToken, telegramChatId } = restData;

    const mesaRef = doc(db, "restaurantes", restauranteId, "mesas", String(mesa));
    const mesaSnap = await getDoc(mesaRef);
    const mesaData = mesaSnap.exists() ? mesaSnap.data() : {};

    const nuevoTotal = (mesaData.total || 0) + total;
    const ahora = serverTimestamp();

    // Actualizar/crear documento de mesa
    if (mesaData.estado === "ocupada") {
      await updateDoc(mesaRef, {
        total: nuevoTotal,
        ultimaComanda: ahora,
      });
    } else {
      await setDoc(mesaRef, {
        estado: "ocupada",
        clienteNombre: nombre,
        personas: personas,
        total: nuevoTotal,
        abiertaEn: ahora,
        ultimaComanda: ahora,
      });
    }

    // Guardar comanda
    await addDoc(collection(db, "restaurantes", restauranteId, "mesas", String(mesa), "comandas"), {
      items,
      total,
      creadaEn: ahora,
    });

    // Enviar a Telegram
    if (telegramToken && telegramChatId) {
      const itemsText = items
        .map((item) => `  • ${item.nombre} x${item.cantidad} — ${((item.precio || 0) * item.cantidad).toFixed(2)}€`)
        .join("\n");

      const mensaje = `🍽️ NUEVA COMANDA
━━━━━━━━━━━━━━━━━━
📍 Mesa: ${mesa}
👤 Cliente: ${nombre}
👥 Personas: ${personas}
━━━━━━━━━━━━━━━━━━
🛒 Pedido:
${itemsText}
━━━━━━━━━━━━━━━━━━
💶 Total: ${total.toFixed(2)}€`;

      const telegramUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: mensaje,
          parse_mode: "HTML",
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
