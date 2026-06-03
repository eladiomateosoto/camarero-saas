import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";

export default function Estadisticas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const q = query(
      collection(db, "restaurantes", RESTAURANTE_ID, "historico"),
      where("cerradaEn", ">=", Timestamp.fromDate(hoy)),
      where("cerradaEn", "<", Timestamp.fromDate(manana))
    );

    getDocs(q)
      .then((snap) => {
        setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalFacturado = registros.reduce((acc, r) => acc + (r.total || 0), 0);
  const numMesas = registros.length;
  const ticketMedio = numMesas > 0 ? totalFacturado / numMesas : 0;

  const doblajes = {};
  registros.forEach((r) => {
    doblajes[r.mesaId] = (doblajes[r.mesaId] || 0) + 1;
  });
  const doblajesSorted = Object.entries(doblajes)
    .filter(([, v]) => v > 1)
    .sort((a, b) => b[1] - a[1]);

  const conteoPlatos = {};
  registros.forEach((r) => {
    (r.items || []).forEach((item) => {
      conteoPlatos[item.nombre] = (conteoPlatos[item.nombre] || 0) + (item.cantidad || 1);
    });
  });
  const platosOrdenados = Object.entries(conteoPlatos).sort((a, b) => b[1] - a[1]);
  const platoTop = platosOrdenados[0];

  const comandasPorHora = Array(24).fill(0);
  registros.forEach((r) => {
    (r.comandas || []).forEach((c) => {
      if (c.creadaEn?.toDate) {
        const hora = c.creadaEn.toDate().getHours();
        comandasPorHora[hora]++;
      }
    });
  });
  const horasGrafico = Array.from({ length: 16 }, (_, i) => ({
    hora: i + 8,
    count: comandasPorHora[i + 8] || 0,
  }));
  const maxComandas = Math.max(...horasGrafico.map((h) => h.count), 1);

  if (loading) {
    return (
      <div
        style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}
        className="flex items-center justify-center"
      >
        <div className="text-slate-400">Cargando estadísticas...</div>
      </div>
    );
  }

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
        <h1 className="text-white font-bold">📊 Estadísticas del día</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {numMesas === 0 && !loading && (
          <div
            style={{ backgroundColor: "#1e293b" }}
            className="rounded-xl p-8 text-center text-slate-500"
          >
            No hay datos de hoy todavía. Las estadísticas aparecerán cuando se cierren mesas.
          </div>
        )}

        {numMesas > 0 && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <div
                style={{ backgroundColor: "#1e293b" }}
                className="rounded-xl p-4 text-center"
              >
                <p className="text-slate-400 text-xs mb-1">Total facturado</p>
                <p className="text-2xl font-bold" style={{ color: "#f97316" }}>
                  {totalFacturado.toFixed(2)}€
                </p>
              </div>
              <div
                style={{ backgroundColor: "#1e293b" }}
                className="rounded-xl p-4 text-center"
              >
                <p className="text-slate-400 text-xs mb-1">Mesas atendidas</p>
                <p className="text-2xl font-bold text-white">{numMesas}</p>
              </div>
              <div
                style={{ backgroundColor: "#1e293b" }}
                className="rounded-xl p-4 text-center"
              >
                <p className="text-slate-400 text-xs mb-1">Ticket medio</p>
                <p className="text-2xl font-bold text-white">{ticketMedio.toFixed(2)}€</p>
              </div>
              <div
                style={{ backgroundColor: "#1e293b" }}
                className="rounded-xl p-4 text-center"
              >
                <p className="text-slate-400 text-xs mb-1">Plato más pedido</p>
                {platoTop ? (
                  <>
                    <p className="text-sm font-bold text-white truncate">{platoTop[0]}</p>
                    <p className="text-slate-400 text-xs">{platoTop[1]} uds</p>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">—</p>
                )}
              </div>
            </div>

            {/* Mesas dobladas */}
            {doblajesSorted.length > 0 && (
              <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">Mesas dobladas hoy</h3>
                <div className="space-y-2">
                  {doblajesSorted.map(([mesaId, veces]) => (
                    <div key={mesaId} className="flex justify-between items-center">
                      <span className="text-slate-300 text-sm">Mesa {mesaId}</span>
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-full text-white"
                        style={{ backgroundColor: "#f97316" }}
                      >
                        {veces} veces
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top platos */}
            {platosOrdenados.length > 0 && (
              <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">Platos más pedidos</h3>
                <div className="space-y-2">
                  {platosOrdenados.slice(0, 10).map(([nombre, cant]) => (
                    <div key={nombre} className="flex items-center gap-2">
                      <span className="text-slate-300 text-sm truncate w-40">{nombre}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <div
                          style={{
                            backgroundColor: "#f97316",
                            width: `${(cant / platosOrdenados[0][1]) * 100}%`,
                            height: "8px",
                            borderRadius: "4px",
                            transition: "width 0.3s",
                          }}
                        />
                        <span className="text-slate-400 text-xs w-6 text-right">{cant}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gráfico comandas por hora */}
            <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-4">
              <h3 className="text-white font-semibold mb-4">Comandas por hora</h3>
              <div className="flex items-end gap-1" style={{ height: "120px" }}>
                {horasGrafico.map(({ hora, count }) => (
                  <div key={hora} className="flex-1 flex flex-col items-center justify-end gap-1">
                    {count > 0 && (
                      <span className="text-slate-400 text-xs">{count}</span>
                    )}
                    <div
                      style={{
                        backgroundColor: count > 0 ? "#f97316" : "#1e3a5f",
                        height: count > 0 ? `${Math.max((count / maxComandas) * 80, 4)}px` : "4px",
                        borderRadius: "3px 3px 0 0",
                        width: "100%",
                      }}
                    />
                    <span className="text-slate-500 text-xs">{hora}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
