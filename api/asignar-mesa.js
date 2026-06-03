import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return initializeApp({ credential: cert(serviceAccount) });
}

async function enviarEmailMesaAsignada({ email, nombre, fecha, turno, hora, mesaAsignada, personas, restaurante }) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  if (!gmailUser || !gmailPass || !email) return;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });

  const turnoLabel = turno === "comida" ? "Comida" : "Cena";
  const nombreRest = restaurante?.nombre || "Peña Bética Cultural";
  const direccion = restaurante?.direccion || "";
  const telefonoRest = restaurante?.telefono || null;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
      <h2 style="color:#3b82f6;margin-bottom:8px">🪑 Tu mesa está lista</h2>
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Tu mesa está preparada en <strong>${nombreRest}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr style="background:#eff6ff">
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">🪑 Mesa</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-size:18px;font-weight:bold">Mesa ${mesaAsignada}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">📅 Fecha</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0">${fecha}</td>
        </tr>
        <tr style="background:#f8fafc">
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">🕐 Turno</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0">${turnoLabel} — ${hora}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600">👥 Personas</td>
          <td style="padding:10px 14px;border:1px solid #e2e8f0">${personas}</td>
        </tr>
      </table>
      ${direccion ? `<p>📍 <strong>Dirección:</strong> ${direccion}</p>` : ""}
      ${telefonoRest ? `<p>📞 <strong>Teléfono:</strong> ${telefonoRest}</p>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:14px">¡Te esperamos!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;font-size:12px">${nombreRest}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${nombreRest}" <${gmailUser}>`,
      to: email,
      subject: "Tu mesa está lista - Peña Bética Cultural",
      html,
    });
    console.log("[asignar-mesa] Email enviado a:", email);
  } catch (err) {
    console.error("[asignar-mesa] Email error:", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { restauranteId, reservaId, mesaAsignada, email, nombre, fecha, turno, hora, personas } = req.body || {};

  if (!restauranteId || !reservaId || mesaAsignada === undefined || mesaAsignada === null) {
    return res.status(400).json({ error: "Faltan campos: restauranteId, reservaId, mesaAsignada" });
  }

  try {
    const db = getFirestore(getAdminApp());

    await db.collection("restaurantes").doc(restauranteId)
      .collection("reservas").doc(reservaId)
      .update({ mesaAsignada: Number(mesaAsignada), estado: "mesa_asignada" });

    const restSnap = await db.collection("restaurantes").doc(restauranteId).get();
    const restaurante = restSnap.exists ? restSnap.data() : {};

    await enviarEmailMesaAsignada({ email, nombre, fecha, turno, hora, mesaAsignada, personas, restaurante });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[asignar-mesa] ERROR:", err.message);
    return res.status(500).json({ ok: true, warning: err.message });
  }
}
