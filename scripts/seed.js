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

await db.collection("restaurantes").doc("pena-betica").set({
  nombre: "Peña Betica Bollullos",
  email: "eladiomateosoto@gmail.com",
  telegramToken: "8939655780:AAFsLxfCoYcEXTVGOIPdk1A2lDsQBo8Ufdc",
  telegramChatId: "-5264026816",
  numMesas: 20,
  activo: true,
  creadoEn: new Date(),
});

console.log("✓ Restaurante 'pena-betica' creado en Firestore");
process.exit(0);
