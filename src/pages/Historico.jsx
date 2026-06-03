import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";

export default function Historico() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    setLoading(true);
    const [year, month, day] = fecha.split("-").map(Number);
    const dia = new Date(year, month - 1, day, 0, 0, 0);
    const diaSiguiente = new Date(year, month - 1, day + 1, 0, 0, 0);

    const q = query(
      collection(db, "restaurantes", RESTAURANTE_ID, "historico"),
      where("cerradaEn", ">=", Timestamp.fromDate(dia)),
      where("cerradaEn", "<", Timestamp.fromDate(diaSiguiente)),
      orderBy("cerradaEn", "desc")
    );

    getDocs(q)
      .then((snap) => {
        setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [fecha]);

  function formatHora(ts) {
    if (!ts?.toDate) return "—";
    return ts.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  const totalDia = registros.reduce((acc, r) => acc + (r.total || 0), 0);

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}>
      <header
        style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }}
        className="border-b px-4 py-3 flex items-center gap-3"
      >
        <button
          onClick={() => navigate("/panel")}
          className="text-slate-400 hover:text-white transition-colors text-sm"
        >
          ← Volver
        </button>
        <h1 className="text-white font-bold flex-1">🗂 Histórico</h1>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          style={{
            backgroundColor: "#0f172a",
            borderColor: "#334155",
            colorScheme: "dark",
          }}
          className="rounded-lg px-3 py-1.5 text-white text-sm border outline-none focus:border-orange-500"
        />
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Cargando...</div>
        ) : registros.length === 0 ? (
          <div
            style={{ backgroundColor: "#1e293b" }}
            className="rounded-xl p-8 text-center text-slate-500"
          >
            No hay registros para este día
          </div>
        ) : (
          <>
            <div
              style={{ backgroundColor: "#1e293b" }}
              className="rounded-xl p-4 mb-4 flex justify-between items-center"
            >
              <span className="text-slate-400 text-sm">
                {registros.length} mesa{registros.length !== 1 ? "s" : ""} cerrada{registros.length !== 1 ? "s" : ""}
              </span>
              <span className="text-white font-bold">
                Total:{" "}
                <span style={{ color: "#f97316" }}>{totalDia.toFixed(2)}€</span>
              </span>
            </div>

            <div className="space-y-3">
              {registros.map((r) => (
                <div
                  key={r.id}
                  style={{ backgroundColor: "#1e293b" }}
                  className="rounded-xl p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-white font-bold">Mesa {r.mesaId}</span>
                      {r.clienteNombre && (
                        <span className="text-slate-400 text-sm ml-2">
                          · {r.clienteNombre}
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-bold" style={{ color: "#f97316" }}>
                      {(r.total || 0).toFixed(2)}€
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>🕐 Apertura: {formatHora(r.abiertaEn)}</span>
                    <span>🕐 Cierre: {formatHora(r.cerradaEn)}</span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                    {r.personas && (
                      <span>👥 {r.personas} persona{r.personas !== 1 ? "s" : ""}</span>
                    )}
                    <span>
                      📋 {r.numComandas || 0} comanda{(r.numComandas || 0) !== 1 ? "s" : ""}
                    </span>
                    {r.personas && r.total && (
                      <span>💰 {(r.total / r.personas).toFixed(2)}€/persona</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
