import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "../camarero-saas-firebase-adminsdk-fbsvc-ae54dab4a9.json"), "utf8")
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

await db.collection("restaurantes").doc("pena-betica").update({
  nombre: "Peña Bética Cultural",
  cif: "B-XXXXXXXX",
  direccion: "C/ Ejemplo, 1 - Bollullos Par del Condado",
  ultimoTicket: 0,
});

// Crear documento de config para contador de tickets
await db.collection("restaurantes").doc("pena-betica")
  .collection("config").doc("tickets")
  .set({ ultimo: 0 }, { merge: true });

console.log("✓ Restaurante actualizado con nombre, CIF, dirección y contador de tickets");
process.exit(0);
