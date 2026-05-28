import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";

const ESTADO_COLORES = {
  libre: "#22c55e",
  ocupada: "#f97316",
  pagando: "#ef4444",
};

const ESTADO_LABELS = {
  libre: "Libre",
  ocupada: "Ocupada",
  pagando: "Pagando",
};

function tiempoTranscurrido(abiertaEn) {
  if (!abiertaEn) return "";
  const ahora = Date.now();
  const diff = ahora - abiertaEn.toMillis();
  const minutos = Math.floor(diff / 60000);
  if (minutos < 60) return `${minutos}m`;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${horas}h ${mins}m`;
}

function MesaCard({ mesa, numero, onClick }) {
  const estado = mesa?.estado || "libre";
  const color = ESTADO_COLORES[estado];

  return (
    <div
      onClick={() => estado !== "libre" && onClick(numero)}
      style={{
        backgroundColor: "#1e293b",
        borderColor: color,
        cursor: estado !== "libre" ? "pointer" : "default",
        borderWidth: 2,
      }}
      className={`rounded-xl p-4 border transition-transform ${
        estado !== "libre" ? "hover:scale-105 active:scale-95" : ""
      } ${mesa?.nuevaComanda ? "blink" : ""}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-slate-400 text-xs font-medium">Mesa</span>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {ESTADO_LABELS[estado]}
        </span>
      </div>

      <div className="text-2xl font-bold text-white mb-1">{numero}</div>

      {mesa?.clienteNombre && (
        <div className="text-sm text-slate-300 truncate">{mesa.clienteNombre}</div>
      )}

      {mesa?.total > 0 && (
        <div className="text-lg font-bold mt-1" style={{ color: "#f97316" }}>
          {mesa.total.toFixed(2)}€
        </div>
      )}

      {mesa?.abiertaEn && (
        <div className="text-xs text-slate-500 mt-1">{tiempoTranscurrido(mesa.abiertaEn)}</div>
      )}
    </div>
  );
}

export default function Panel() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mesas, setMesas] = useState({});
  const [restaurante, setRestaurante] = useState(null);
  const prevMesasRef = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) navigate("/login");
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "restaurantes", RESTAURANTE_ID)).then((snap) => {
      if (snap.exists()) setRestaurante(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, "restaurantes", RESTAURANTE_ID, "mesas");
    const unsub = onSnapshot(ref, (snap) => {
      const nuevasMesas = {};
      snap.forEach((d) => {
        nuevasMesas[d.id] = d.data();
      });

      // Detectar nueva comanda
      Object.entries(nuevasMesas).forEach(([id, mesa]) => {
        const prev = prevMesasRef.current[id];
        if (
          mesa.estado === "ocupada" &&
          prev?.estado === "ocupada" &&
          mesa.ultimaComanda !== prev?.ultimaComanda
        ) {
          playBeep();
          nuevasMesas[id] = { ...mesa, nuevaComanda: true };
          setTimeout(() => {
            setMesas((m) => ({ ...m, [id]: { ...m[id], nuevaComanda: false } }));
          }, 3000);
        }
      });

      prevMesasRef.current = nuevasMesas;
      setMesas(nuevasMesas);
    });
    return unsub;
  }, [user]);

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  async function handleLogout() {
    await signOut(auth);
    navigate("/login");
  }

  if (authLoading) {
    return (
      <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }} className="flex items-center justify-center">
        <div className="text-slate-400">Cargando...</div>
      </div>
    );
  }

  const numMesas = restaurante?.numMesas || 20;
  const numerosArray = Array.from({ length: numMesas }, (_, i) => i + 1);

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}>
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">🍽️ {restaurante?.nombre || "Panel"}</h1>
          <p className="text-slate-400 text-xs">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          style={{ backgroundColor: "#ef4444" }}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90"
        >
          Cerrar sesión
        </button>
      </header>

      <main className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-white font-semibold">Mesas ({numMesas})</h2>
          <div className="flex gap-3 text-xs">
            {Object.entries(ESTADO_COLORES).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-slate-400">
                <span style={{ backgroundColor: v }} className="w-2 h-2 rounded-full inline-block" />
                {ESTADO_LABELS[k]}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
          {numerosArray.map((n) => (
            <MesaCard
              key={n}
              numero={n}
              mesa={mesas[String(n)]}
              onClick={(id) => navigate(`/mesa/${id}`)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
