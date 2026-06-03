import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";

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

async function enviarEmailConfirmacion({ email, nombre, fecha, turno, hora, personas, restaurante }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) return;

  const resend = new Resend(apiKey);
  const fromEmail = "onboarding@resend.dev";
  const telefonoRest = restaurante?.telefono || null;
  const direccion = restaurante?.direccion || "";
  const nombreRest = "Peña Bética Cultural";

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
      <h2 style="color:#f97316;margin-bottom:8px">✅ Reserva confirmada</h2>
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Tu reserva en <strong>${nombreRest}</strong> ha sido confirmada con los siguientes datos:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;border-radius:8px;overflow:hidden">
        <tr style="background:#f8fafc"><td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">📅 Fecha</td><td style="padding:10px 14px;border:1px solid #e2e8f0">${fecha}</td></tr>
        <tr><td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">🕐 Turno</td><td style="padding:10px 14px;border:1px solid #e2e8f0">${turno.charAt(0).toUpperCase() + turno.slice(1)} — ${hora}</td></tr>
        <tr style="background:#f8fafc"><td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">👥 Personas</td><td style="padding:10px 14px;border:1px solid #e2e8f0">${personas}</td></tr>
      </table>
      ${direccion ? `<p>📍 <strong>Dirección:</strong> ${direccion}</p>` : ""}
      ${telefonoRest ? `<p>📞 <strong>Teléfono de contacto:</strong> ${telefonoRest}</p>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:14px">Si necesitas modificar o cancelar tu reserva, contáctanos con antelación.</p>
      <p style="color:#64748b;font-size:14px">¡Hasta pronto! 🍽️</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;font-size:12px">${nombreRest}</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Reserva confirmada - Peña Bética Cultural",
      html,
    });
  } catch (err) {
    console.error("[reserva] Email error:", err.message);
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

    // Contar reservas activas para esa fecha + turno (filtrar por fecha, resto en cliente)
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

    // Guardar reserva en Firestore
    await db.collection("restaurantes").doc(restauranteId)
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

    // Datos del restaurante para Telegram y email
    const restSnap = await db.collection("restaurantes").doc(restauranteId).get();
    const restaurante = restSnap.exists ? restSnap.data() : {};

    // Telegram
    const { telegramToken, telegramChatId } = restaurante;
    if (telegramToken && telegramChatId) {
      const msg = `🗓️ NUEVA RESERVA\n━━━━━━━━━━━━━━━━━━\n👤 Nombre: ${nombre}\n👥 Personas: ${personas || 1}\n📅 Fecha: ${fecha}\n🕐 Turno: ${turno} · ${hora}\n📱 Teléfono: ${telefono || "—"}\n📧 Email: ${email || "—"}\n━━━━━━━━━━━━━━━━━━\n✅ CONFIRMADA`;
      await enviarTelegram(telegramToken, telegramChatId, msg);
    }

    // Email de confirmación
    if (email) {
      await enviarEmailConfirmacion({ email, nombre, fecha, turno, hora, personas: personas || 1, restaurante });
    }

    return res.status(200).json({ ok: true, mensaje: "Reserva confirmada", mesasLibres: MAX_MESAS - activas.length - 1 });
  } catch (err) {
    console.error("[reserva] ERROR:", err.message, err.stack?.split("\n")[0]);
    return res.status(500).json({ error: err.message });
  }
}
