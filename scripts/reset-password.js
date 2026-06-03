import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "../camarero-saas-firebase-adminsdk-fbsvc-ae54dab4a9.json"), "utf8")
);

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();

const user = await auth.getUserByEmail("eladiomateosoto@gmail.com");
console.log("UID encontrado:", user.uid);

await auth.updateUser(user.uid, { password: "Camarero2025!" });
console.log("✓ Contraseña establecida: Camarero2025!");

process.exit(0);
