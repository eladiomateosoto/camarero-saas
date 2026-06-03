import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

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
  if (!email) return;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  if (!gmailUser || !gmailPass) {
    console.warn("[reserva] GMAIL_USER / GMAIL_PASS no configuradas, email omitido");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });

  const telefonoRest = restaurante?.telefono || null;
  const direccion = restaurante?.direccion || "";
  const nombreRest = "Peña Bética Cultural";
  const turnoLabel = turno === "comida" ? "Comida" : "Cena";

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
      <h2 style="color:#f97316;margin-bottom:8px">✅ Reserva confirmada</h2>
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Tu reserva en <strong>${nombreRest}</strong> ha sido confirmada con los siguientes datos:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr style="background:#f8fafc">
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">📅 Fecha</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0">${fecha}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">🕐 Turno</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0">${turnoLabel} — ${hora}</td>
        </tr>
        <tr style="background:#f8fafc">
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">👥 Personas</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0">${personas}</td>
        </tr>
      </table>
      ${direccion ? `<p>📍 <strong>Dirección:</strong> ${direccion}</p>` : ""}
      ${telefonoRest ? `<p>📞 <strong>Teléfono de contacto:</strong> ${telefonoRest}</p>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:14px">
        Si necesitas modificar o cancelar tu reserva, contáctanos con antelación.
      </p>
      <p style="color:#64748b;font-size:14px">¡Hasta pronto! 🍽️</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;font-size:12px">${nombreRest}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${nombreRest}" <${gmailUser}>`,
      to: email,
      subject: "Reserva confirmada - Peña Bética Cultural",
      html,
    });
    console.log("[reserva] Email enviado a:", email);
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

    const restSnap = await db.collection("restaurantes").doc(restauranteId).get();
    const restaurante = restSnap.exists ? restSnap.data() : {};

    // Telegram (no bloquea si falla)
    const { telegramToken, telegramChatId } = restaurante;
    if (telegramToken && telegramChatId) {
      const msg = `🗓️ NUEVA RESERVA\n━━━━━━━━━━━━━━━━━━\n👤 Nombre: ${nombre}\n👥 Personas: ${personas || 1}\n📅 Fecha: ${fecha}\n🕐 Turno: ${turno} · ${hora}\n📱 Teléfono: ${telefono || "—"}\n📧 Email: ${email || "—"}\n━━━━━━━━━━━━━━━━━━\n✅ CONFIRMADA`;
      await enviarTelegram(telegramToken, telegramChatId, msg);
    }

    // Email (no bloquea si falla)
    await enviarEmailConfirmacion({ email, nombre, fecha, turno, hora, personas: personas || 1, restaurante });

    return res.status(200).json({ ok: true, mensaje: "Reserva confirmada", mesasLibres: MAX_MESAS - activas.length - 1 });
  } catch (err) {
    console.error("[reserva] ERROR:", err.message);
    // Intentamos devolver ok:true si la reserva ya se guardó antes del error
    return res.status(500).json({ error: err.message });
  }
}
