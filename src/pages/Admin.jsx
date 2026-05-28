import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const ADMIN_EMAIL = "eladiomateosoto@gmail.com";

export default function Admin() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [restaurantes, setRestaurantes] = useState([]);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    telegramToken: "",
    telegramChatId: "",
    numMesas: 20,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
      else if (u.email !== ADMIN_EMAIL) navigate("/panel");
      else setUser(u);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "restaurantes"), (snap) => {
      setRestaurantes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  function slugify(nombre) {
    return nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleCrear(e) {
    e.preventDefault();
    setError("");
    setExito("");
    setGuardando(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const id = slugify(form.nombre);
      await setDoc(doc(db, "restaurantes", id), {
        nombre: form.nombre,
        email: form.email,
        uid: cred.user.uid,
        telegramToken: form.telegramToken,
        telegramChatId: form.telegramChatId,
        numMesas: Number(form.numMesas),
        activo: true,
        creadoEn: serverTimestamp(),
      });
      setExito(`Restaurante "${form.nombre}" creado con éxito (ID: ${id})`);
      setForm({ nombre: "", email: "", password: "", telegramToken: "", telegramChatId: "", numMesas: 20 });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(id, activo) {
    await updateDoc(doc(db, "restaurantes", id), { activo: !activo });
  }

  const inputStyle = {
    backgroundColor: "#0f172a",
    borderColor: "#334155",
  };

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}>
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">⚙️ Admin — CamareroAI</h1>
          <p className="text-slate-400 text-xs">{user?.email}</p>
        </div>
        <button
          onClick={() => navigate("/panel")}
          className="text-slate-400 hover:text-white text-sm"
        >
          ← Panel
        </button>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-8">
        <section>
          <h2 className="text-white font-semibold text-lg mb-4">Añadir restaurante</h2>
          <div style={{ backgroundColor: "#1e293b" }} className="rounded-2xl p-6">
            <form onSubmit={handleCrear} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { key: "nombre", label: "Nombre del restaurante", type: "text", full: true },
                { key: "email", label: "Email acceso", type: "email" },
                { key: "password", label: "Contraseña", type: "password" },
                { key: "telegramToken", label: "Telegram Token", type: "text" },
                { key: "telegramChatId", label: "Telegram Chat ID", type: "text" },
                { key: "numMesas", label: "Número de mesas", type: "number" },
              ].map(({ key, label, type, full }) => (
                <div key={key} className={full ? "sm:col-span-2" : ""}>
                  <label className="block text-slate-300 text-sm mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    required
                    style={inputStyle}
                    className="w-full rounded-lg px-3 py-2 text-white border outline-none focus:border-orange-500"
                  />
                </div>
              ))}

              {error && (
                <div className="sm:col-span-2 bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              {exito && (
                <div className="sm:col-span-2 bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 text-sm">
                  {exito}
                </div>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={guardando}
                  style={{ backgroundColor: "#f97316" }}
                  className="px-6 py-3 rounded-lg text-white font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {guardando ? "Creando..." : "Crear restaurante"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section>
          <h2 className="text-white font-semibold text-lg mb-4">
            Restaurantes ({restaurantes.length})
          </h2>
          <div className="space-y-3">
            {restaurantes.map((r) => (
              <div
                key={r.id}
                style={{ backgroundColor: "#1e293b", borderColor: r.activo ? "#22c55e" : "#334155" }}
                className="rounded-xl p-4 border flex items-center justify-between"
              >
                <div>
                  <p className="text-white font-medium">{r.nombre}</p>
                  <p className="text-slate-400 text-xs">{r.email} · {r.numMesas} mesas · ID: {r.id}</p>
                </div>
                <button
                  onClick={() => toggleActivo(r.id, r.activo)}
                  style={{ backgroundColor: r.activo ? "#22c55e" : "#475569" }}
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {r.activo ? "Activo" : "Inactivo"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
