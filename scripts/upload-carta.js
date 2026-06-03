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

const carta = JSON.parse(
  readFileSync(join(__dirname, "../carta_pena_betica.json"), "utf8")
);

await db
  .collection("restaurantes")
  .doc("pena-betica")
  .collection("carta")
  .doc("menu")
  .set({ categorias: carta.categorias });

console.log(`✓ Carta subida: ${carta.categorias.length} categorías, ${carta.categorias.reduce((a, c) => a + c.items.length, 0)} platos`);
process.exit(0);
