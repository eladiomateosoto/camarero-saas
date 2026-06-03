import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

async function enviarTelegram(token, chatId, mensaje) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: mensaje }),
    });
  } catch (err) {
    console.error("[reserva] Telegram error:", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { restauranteId, nombre, personas, fecha, turno, hora, telefono, email } = req.body || {};

  if (!restauranteId || !nombre || !fecha || !turno || !hora) {
    return res.status(400).json({ error: "Faltan campos: restauranteId, nombre, fecha, turno, hora" });
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

    const MAX_MESAS = 18;
    if (activas.length >= MAX_MESAS) {
      return res.status(200).json({ ok: false, mensaje: "No hay mesas disponibles para esa fecha y turno" });
    }

    const docRef = await db.collection("restaurantes").doc(restauranteId)
      .collection("reservas").add({
        nombre,
        personas: Number(personas) || 1,
        fecha,
        turno,
        hora,
        telefono: telefono || "",
        email: email || "",
        estado: "confirmada",
        creadaEn: FieldValue.serverTimestamp(),
      });

    // Telegram
    const restSnap = await db.collection("restaurantes").doc(restauranteId).get();
    const restaurante = restSnap.exists ? restSnap.data() : {};
    const { telegramToken, telegramChatId } = restaurante;
    if (telegramToken && telegramChatId) {
      const msg = `🗓️ NUEVA RESERVA\n━━━━━━━━━━━━━━━━━━\n👤 Nombre: ${nombre}\n👥 Personas: ${personas || 1}\n📅 Fecha: ${fecha}\n🕐 Turno: ${turno} · ${hora}\n📱 Teléfono: ${telefono || "—"}\n📧 Email: ${email || "—"}\n━━━━━━━━━━━━━━━━━━\n✅ CONFIRMADA`;
      await enviarTelegram(telegramToken, telegramChatId, msg);
    }

    return res.status(200).json({
      ok: true,
      mensaje: "Reserva recibida",
      reservaId: docRef.id,
      mesasLibres: MAX_MESAS - activas.length - 1,
    });
  } catch (err) {
    console.error("[reserva] ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
