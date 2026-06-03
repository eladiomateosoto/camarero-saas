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

try {
  const user = await auth.createUser({
    email: "eladiomateosoto@gmail.com",
    password: "Camarero2025!",
    displayName: "Peña Betica Bollullos",
  });
  console.log("✓ Usuario creado:", user.uid);
} catch (err) {
  if (err.code === "auth/email-already-exists") {
    await auth.updateUser(
      (await auth.getUserByEmail("eladiomateosoto@gmail.com")).uid,
      { password: "Camarero2025!" }
    );
    console.log("✓ Usuario ya existía, contraseña actualizada");
  } else {
    throw err;
  }
}

process.exit(0);
