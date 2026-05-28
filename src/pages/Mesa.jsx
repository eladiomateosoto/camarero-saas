import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteField,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";

export default function Mesa() {
  const { mesaId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mesa, setMesa] = useState(null);
  const [comandas, setComandas] = useState([]);
  const [pagando, setPagando] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
      else setUser(u);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId), (snap) => {
      setMesa(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [user, mesaId]);

  useEffect(() => {
    if (!user) return;
    const ref = query(
      collection(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas"),
      orderBy("creadaEn", "asc")
    );
    const unsub = onSnapshot(ref, (snap) => {
      setComandas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user, mesaId]);

  async function marcarPagada() {
    setPagando(true);
    try {
      await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId), {
        estado: "libre",
        clienteNombre: deleteField(),
        personas: deleteField(),
        total: deleteField(),
        abiertaEn: deleteField(),
        ultimaComanda: deleteField(),
      });
      navigate("/panel");
    } catch (err) {
      console.error(err);
      setPagando(false);
    }
  }

  function formatHora(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  const totalAcumulado = comandas.reduce((acc, c) => acc + (c.total || 0), 0);

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}>
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/panel")}
          className="text-slate-400 hover:text-white transition-colors text-sm"
        >
          ← Volver
        </button>
        <div>
          <h1 className="text-white font-bold">Mesa {mesaId}</h1>
          {mesa?.clienteNombre && (
            <p className="text-slate-400 text-xs">{mesa.clienteNombre} · {mesa.personas} persona{mesa.personas !== 1 ? "s" : ""}</p>
          )}
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        <div
          style={{ backgroundColor: "#1e293b" }}
          className="rounded-2xl p-6 mb-4 text-center"
        >
          <p className="text-slate-400 text-sm mb-1">Total acumulado</p>
          <p className="text-4xl font-bold" style={{ color: "#f97316" }}>
            {totalAcumulado.toFixed(2)}€
          </p>
          {mesa?.personas && (
            <p className="text-slate-400 text-sm mt-2">
              {(totalAcumulado / mesa.personas).toFixed(2)}€ / persona
            </p>
          )}
        </div>

        <div className="space-y-3 mb-6">
          {comandas.length === 0 && (
            <p className="text-slate-500 text-center py-8">No hay comandas todavía</p>
          )}
          {comandas.map((comanda, i) => (
            <div
              key={comanda.id}
              style={{ backgroundColor: "#1e293b" }}
              className="rounded-xl p-4"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400 text-xs">
                  Comanda #{i + 1} · {formatHora(comanda.creadaEn)}
                </span>
                <span className="font-semibold text-white">{(comanda.total || 0).toFixed(2)}€</span>
              </div>
              <ul className="space-y-1">
                {(comanda.items || []).map((item, j) => (
                  <li key={j} className="flex justify-between text-sm">
                    <span className="text-slate-300">
                      {item.nombre} x{item.cantidad}
                    </span>
                    <span className="text-slate-400">{((item.precio || 0) * item.cantidad).toFixed(2)}€</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button
            onClick={marcarPagada}
            disabled={pagando}
            style={{ backgroundColor: "#ef4444" }}
            className="w-full py-4 rounded-xl text-white font-bold text-lg hover:opacity-90 active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {pagando ? "Procesando..." : "✓ Marcar como pagada"}
          </button>
          <button
            onClick={() => navigate("/panel")}
            style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
            className="w-full py-3 rounded-xl text-slate-300 font-medium border hover:bg-slate-700 transition-colors"
          >
            Volver al panel
          </button>
        </div>
      </main>
    </div>
  );
}
