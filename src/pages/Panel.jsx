import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteField,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";
const ADMIN_EMAIL = "eladiomateosoto@gmail.com";

const ESTADO_COLORES = {
  libre: "#22c55e",
  ocupada: "#f97316",
  pagando: "#ef4444",
  reservada: "#3b82f6",
};

const ESTADO_LABELS = {
  libre: "Libre",
  ocupada: "Ocupada",
  pagando: "Pagando",
  reservada: "Reservada",
};

const TURNO_LABELS = { comida: "🍽️ Comida", cena: "🌙 Cena" };
const TURNO_COLORES = { comida: "#f97316", cena: "#7c3aed" };

function tiempoTranscurrido(abiertaEn) {
  if (!abiertaEn) return "";
  const diff = Date.now() - abiertaEn.toMillis();
  const minutos = Math.floor(diff / 60000);
  if (minutos < 60) return `${minutos}m`;
  return `${Math.floor(minutos / 60)}h ${minutos % 60}m`;
}

// ─── Modal de Nueva Comanda ───────────────────────────────────────────────────
function ComandaModal({ mesaId, mesa, carta, onClose, onEnviado }) {
  const esLibre = !mesa || mesa.estado === "libre" || mesa.estado === "reservada";
  const [clienteNombre, setClienteNombre] = useState(mesa?.clienteNombre || "");
  const [personas, setPersonas] = useState(mesa?.personas || 2);
  const [seleccion, setSeleccion] = useState({});
  const [catIdx, setCatIdx] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const tabsRef = useRef(null);

  const categorias = carta?.categorias || [];
  const totalItems = Object.values(seleccion).reduce((a, v) => a + v.cantidad, 0);
  const total = Object.values(seleccion).reduce((a, v) => a + v.cantidad * v.precio, 0);

  function cambiarCantidad(nombre, precio, delta) {
    setSeleccion((prev) => {
      const actual = prev[nombre]?.cantidad || 0;
      const nueva = Math.max(0, actual + delta);
      if (nueva === 0) { const next = { ...prev }; delete next[nombre]; return next; }
      return { ...prev, [nombre]: { cantidad: nueva, precio } };
    });
  }

  async function enviar() {
    const items = Object.entries(seleccion).map(([nombre, v]) => ({ nombre, cantidad: v.cantidad, precio: v.precio }));
    if (items.length === 0) return;
    setEnviando(true); setError("");
    try {
      const res = await fetch("/api/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restauranteId: RESTAURANTE_ID, mesa: mesaId, nombre: clienteNombre.trim() || "Cliente", personas: Number(personas) || 1, items, total }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Error al enviar"); }
      onEnviado();
    } catch (err) { setError(err.message); }
    finally { setEnviando(false); }
  }

  return (
    <div style={{ backgroundColor: "#0f172a" }} className="fixed inset-0 z-50 flex flex-col">
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">← Cancelar</button>
        <h1 className="text-white font-bold flex-1">Mesa {mesaId} · Nueva comanda</h1>
        {totalItems > 0 && <span style={{ backgroundColor: "#f97316" }} className="text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalItems} ítem{totalItems !== 1 ? "s" : ""}</span>}
      </header>
      {esLibre && (
        <div style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex gap-3 shrink-0">
          <input placeholder="Nombre del cliente" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} style={{ backgroundColor: "#0f172a", borderColor: "#334155" }} className="flex-1 rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500" />
          <input type="number" min="1" max="30" placeholder="Pers." value={personas} onChange={(e) => setPersonas(e.target.value)} style={{ backgroundColor: "#0f172a", borderColor: "#334155" }} className="w-20 rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500" />
        </div>
      )}
      <div ref={tabsRef} style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-2 overflow-x-auto flex gap-2 shrink-0">
        {categorias.map((cat, i) => (
          <button key={cat.id} onClick={() => setCatIdx(i)} style={{ backgroundColor: i === catIdx ? "#f97316" : "#334155", whiteSpace: "nowrap" }} className="px-3 py-1.5 rounded-full text-white text-xs font-medium shrink-0 hover:opacity-90">
            {cat.nombre}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!carta ? <div className="text-center py-12 text-slate-500">Cargando carta...</div> : (
          <div className="space-y-2">
            {(categorias[catIdx]?.items || []).map((item) => {
              const cant = seleccion[item.nombre]?.cantidad || 0;
              return (
                <div key={item.nombre} style={{ backgroundColor: cant > 0 ? "#1e3a1e" : "#1e293b", borderColor: cant > 0 ? "#16a34a" : "transparent", borderWidth: 1 }} className="rounded-xl px-4 py-3 flex items-center gap-3 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${cant > 0 ? "text-green-400" : "text-white"}`}>{item.nombre}</p>
                    {item.alergenos && <p className="text-xs text-slate-500 mt-0.5 truncate">⚠ {item.alergenos}</p>}
                  </div>
                  <span className="text-orange-400 font-semibold text-sm shrink-0">{item.precio.toFixed(2)}€</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => cambiarCantidad(item.nombre, item.precio, -1)} disabled={cant === 0} style={{ backgroundColor: cant > 0 ? "#ef4444" : "#334155" }} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center hover:opacity-90 disabled:opacity-30">−</button>
                    <span className="text-white font-bold w-5 text-center tabular-nums">{cant}</span>
                    <button onClick={() => cambiarCantidad(item.nombre, item.precio, 1)} style={{ backgroundColor: "#16a34a" }} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center hover:opacity-90">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ backgroundColor: "#1e293b", borderTopColor: "#334155" }} className="border-t p-4 shrink-0">
        {error && <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-3 py-2 text-red-400 text-xs mb-3">{error}</div>}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-slate-400 text-xs mb-0.5">{totalItems === 0 ? "Selecciona platos" : `${totalItems} ítem${totalItems !== 1 ? "s" : ""}`}</p>
            <p className="text-2xl font-bold" style={{ color: "#f97316" }}>{total.toFixed(2)}€</p>
          </div>
          <button onClick={enviar} disabled={enviando || totalItems === 0} style={{ backgroundColor: totalItems > 0 ? "#f97316" : "#334155" }} className="px-6 py-4 rounded-xl text-white font-bold text-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
            {enviando ? "Enviando..." : "Enviar comanda"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de mesa ──────────────────────────────────────────────────────────
function MesaCard({ mesa, numero, onClick, onNuevaComanda }) {
  const estado = mesa?.estado || "libre";
  const color = ESTADO_COLORES[estado] || ESTADO_COLORES.libre;
  return (
    <div style={{ backgroundColor: "#1e293b", borderColor: color, borderWidth: 2 }} className={`rounded-xl p-3 border ${mesa?.nuevaComanda ? "blink" : ""}`}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-slate-400 text-xs">Mesa</span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: color }}>{ESTADO_LABELS[estado] || estado}</span>
      </div>
      <div onClick={() => estado !== "libre" && onClick(numero)} style={{ cursor: estado !== "libre" ? "pointer" : "default" }} className={estado !== "libre" ? "hover:opacity-80 transition-opacity" : ""}>
        <div className="text-2xl font-bold text-white">{numero}</div>
        {mesa?.clienteNombre && <div className="text-xs text-slate-300 truncate mt-0.5">{mesa.clienteNombre}</div>}
        {(estado === "ocupada" || estado === "pagando") && <div className="text-base font-bold mt-0.5" style={{ color: "#f97316" }}>{(mesa?.total || 0).toFixed(2)}€</div>}
        {mesa?.abiertaEn && <div className="text-xs text-slate-500 mt-0.5">{tiempoTranscurrido(mesa.abiertaEn)}</div>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onNuevaComanda(numero); }} style={{ backgroundColor: "#16a34a" }} className="mt-2 w-full py-1 rounded-lg text-white text-xs font-semibold hover:opacity-90 active:opacity-75 transition-opacity">
        + Comanda
      </button>
    </div>
  );
}

// ─── Tarjeta de reserva ───────────────────────────────────────────────────────
function ReservaCard({ reserva, onConfirmar, onNoShow }) {
  const estadoColores = {
    confirmada: { bg: "#1e3a5f", border: "#3b82f6", badge: "#3b82f6", label: "Confirmada" },
    en_local: { bg: "#1e3a1e", border: "#16a34a", badge: "#16a34a", label: "En local" },
    no_presentado: { bg: "#3b1a1a", border: "#ef4444", badge: "#ef4444", label: "No show" },
  };
  const est = estadoColores[reserva.estado] || estadoColores.confirmada;

  return (
    <div style={{ backgroundColor: est.bg, borderColor: est.border, borderWidth: 1 }} className="rounded-xl p-4 border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-bold truncate">{reserva.nombre}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: est.badge }}>{est.label}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-400">
            <span>👥 {reserva.personas} pers.</span>
            <span style={{ color: TURNO_COLORES[reserva.turno] || "#f97316" }}>{TURNO_LABELS[reserva.turno] || reserva.turno} · {reserva.hora}</span>
            {reserva.telefono && <span>📱 {reserva.telefono}</span>}
          </div>
        </div>
        {reserva.estado === "confirmada" && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onConfirmar(reserva)} style={{ backgroundColor: "#16a34a" }} className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90">✓ En local</button>
            <button onClick={() => onNoShow(reserva.id)} style={{ backgroundColor: "#7f1d1d" }} className="px-3 py-1.5 rounded-lg text-white text-xs hover:opacity-90">✗</button>
          </div>
        )}
        {reserva.estado === "en_local" && (
          <button onClick={() => onNoShow(reserva.id)} style={{ backgroundColor: "#334155" }} className="px-3 py-1.5 rounded-lg text-slate-300 text-xs hover:opacity-90 shrink-0">Deshacer</button>
        )}
      </div>
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────
export default function Panel() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mesas, setMesas] = useState({});
  const [restaurante, setRestaurante] = useState(null);
  const [pendientes, setPendientes] = useState([]);
  const [carta, setCarta] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [modalMesaId, setModalMesaId] = useState(null);
  const [cerrandoDia, setCerrandoDia] = useState(false);
  const [tab, setTab] = useState("mesas");
  const prevMesasRef = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); if (!u) navigate("/login"); });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "restaurantes", RESTAURANTE_ID)).then((s) => { if (s.exists()) setRestaurante(s.data()); });
    getDoc(doc(db, "restaurantes", RESTAURANTE_ID, "carta", "menu")).then((s) => { if (s.exists()) setCarta(s.data()); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "restaurantes", RESTAURANTE_ID, "mesas"), (snap) => {
      const nuevasMesas = {};
      snap.forEach((d) => { nuevasMesas[d.id] = d.data(); });
      Object.entries(nuevasMesas).forEach(([id, mesa]) => {
        const prev = prevMesasRef.current[id];
        if (mesa.estado === "ocupada" && prev?.estado === "ocupada" && mesa.ultimaComanda !== prev?.ultimaComanda) {
          playBeep();
          nuevasMesas[id] = { ...mesa, nuevaComanda: true };
          setTimeout(() => setMesas((m) => ({ ...m, [id]: { ...m[id], nuevaComanda: false } })), 3000);
        }
      });
      prevMesasRef.current = nuevasMesas;
      setMesas(nuevasMesas);
    });
  }, [user]);

  // Pedidos pendientes por mesa activa
  useEffect(() => {
    if (!user) return;
    const activeMesaIds = Object.keys(mesas).filter((id) => mesas[id]?.estado === "ocupada" || mesas[id]?.estado === "pagando");
    if (activeMesaIds.length === 0) { setPendientes([]); return; }
    const porMesa = {};
    const unsubs = activeMesaIds.map((mesaId) =>
      onSnapshot(collection(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas"), (snap) => {
        porMesa[mesaId] = snap.docs.filter((d) => { const e = d.data().estado; return !e || e === "pendiente"; }).map((d) => ({ id: d.id, ref: d.ref, mesaId, ...d.data() }));
        setPendientes(Object.values(porMesa).flat().sort((a, b) => (a.creadaEn?.toMillis?.() || 0) - (b.creadaEn?.toMillis?.() || 0)));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user, mesas]);

  // Reservas de hoy
  useEffect(() => {
    if (!user) return;
    const hoy = new Date().toISOString().split("T")[0];
    const q = query(collection(db, "restaurantes", RESTAURANTE_ID, "reservas"), where("fecha", "==", hoy));
    return onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => {
        if (a.turno !== b.turno) return a.turno === "comida" ? -1 : 1;
        return (a.hora || "").localeCompare(b.hora || "");
      });
      setReservas(lista);
    });
  }, [user]);

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  async function marcarServida(ref) {
    try { await updateDoc(ref, { estado: "servida" }); } catch (err) { console.error(err); }
  }

  async function confirmarLlegada(reserva) {
    const mesaStr = window.prompt(`¿Número de mesa para ${reserva.nombre}?\n(Deja vacío para no asignar mesa ahora)`);
    try {
      if (mesaStr && !isNaN(Number(mesaStr)) && Number(mesaStr) > 0) {
        const mesaId = String(Number(mesaStr));
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId), {
          estado: "reservada",
          clienteNombre: reserva.nombre,
          personas: reserva.personas || 1,
          abiertaEn: serverTimestamp(),
        });
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "reservas", reserva.id), { estado: "en_local", mesaId });
      } else {
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "reservas", reserva.id), { estado: "en_local" });
      }
    } catch (err) { console.error(err); }
  }

  async function marcarNoShow(reservaId) {
    try { await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "reservas", reservaId), { estado: "no_presentado" }); }
    catch (err) { console.error(err); }
  }

  async function cerrarDia() {
    const mesasOcupadas = Object.entries(mesas).filter(([, m]) => m?.estado === "ocupada" || m?.estado === "pagando");
    if (mesasOcupadas.length === 0) { alert("No hay mesas ocupadas para cerrar."); return; }
    if (!window.confirm(`¿Cerrar todas las mesas y pasar al histórico?\n\n${mesasOcupadas.length} mesa(s) ocupada(s) serán cerradas.`)) return;
    setCerrandoDia(true);
    try {
      for (const [mesaId, mesaData] of mesasOcupadas) {
        const comandasSnap = await getDocs(collection(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas"));
        const comandas = comandasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await addDoc(collection(db, "restaurantes", RESTAURANTE_ID, "historico"), {
          mesaId, clienteNombre: mesaData.clienteNombre || null, personas: mesaData.personas || null,
          total: mesaData.total || 0, abiertaEn: mesaData.abiertaEn || null, cerradaEn: serverTimestamp(),
          numComandas: comandas.length, items: comandas.flatMap((c) => c.items || []),
          comandas: comandas.map((c) => ({ total: c.total || 0, creadaEn: c.creadaEn || null, items: c.items || [] })),
          cierreManual: true,
        });
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId), {
          estado: "libre", clienteNombre: deleteField(), personas: deleteField(),
          total: deleteField(), abiertaEn: deleteField(), ultimaComanda: deleteField(),
        });
      }
      alert(`Día cerrado. ${mesasOcupadas.length} mesa(s) procesada(s).`);
    } catch (err) { alert("Error: " + err.message); }
    finally { setCerrandoDia(false); }
  }

  if (authLoading) {
    return <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }} className="flex items-center justify-center"><div className="text-slate-400">Cargando...</div></div>;
  }

  const numMesas = restaurante?.numMesas || 20;
  const numerosArray = Array.from({ length: numMesas }, (_, i) => i + 1);
  const mesaModal = modalMesaId ? mesas[String(modalMesaId)] : null;
  const reservasHoy = reservas.filter((r) => r.estado !== "no_presentado" && r.estado !== "cancelada");
  const reservasPendientes = reservas.filter((r) => r.estado === "confirmada");

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">🍽️ {restaurante?.nombre || "Panel"}</h1>
          <p className="text-slate-400 text-xs">{user?.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => navigate("/carta")} style={{ backgroundColor: "#7c3aed" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90">🍴 Carta</button>
          <button onClick={() => navigate("/estadisticas")} style={{ backgroundColor: "#1d4ed8" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90">📊 Stats</button>
          <button onClick={() => navigate("/historico")} style={{ backgroundColor: "#334155" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90">🗂 Histórico</button>
          {user?.email === ADMIN_EMAIL && (
            <button onClick={cerrarDia} disabled={cerrandoDia} style={{ backgroundColor: "#b45309" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {cerrandoDia ? "Cerrando..." : "🔒 Cerrar día"}
            </button>
          )}
          <button onClick={async () => { await signOut(auth); navigate("/login"); }} style={{ backgroundColor: "#ef4444" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90">Salir</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b flex">
        <button
          onClick={() => setTab("mesas")}
          style={{ borderBottomColor: tab === "mesas" ? "#f97316" : "transparent", borderBottomWidth: 2 }}
          className={`px-6 py-3 text-sm font-semibold transition-colors ${tab === "mesas" ? "text-orange-400" : "text-slate-400 hover:text-white"}`}
        >
          🪑 Mesas
        </button>
        <button
          onClick={() => setTab("reservas")}
          style={{ borderBottomColor: tab === "reservas" ? "#f97316" : "transparent", borderBottomWidth: 2 }}
          className={`px-6 py-3 text-sm font-semibold transition-colors flex items-center gap-2 ${tab === "reservas" ? "text-orange-400" : "text-slate-400 hover:text-white"}`}
        >
          🗓 Reservas
          {reservasPendientes.length > 0 && (
            <span style={{ backgroundColor: "#3b82f6" }} className="text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{reservasPendientes.length}</span>
          )}
        </button>
      </div>

      <main className="p-4">
        {/* ── TAB: MESAS ── */}
        {tab === "mesas" && (
          <>
            {/* Leyenda */}
            <div className="flex items-center gap-4 mb-3 flex-wrap">
              <h2 className="text-white font-semibold">Mesas ({numMesas})</h2>
              <div className="flex gap-3 text-xs flex-wrap">
                {Object.entries(ESTADO_COLORES).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1 text-slate-400">
                    <span style={{ backgroundColor: v }} className="w-2 h-2 rounded-full inline-block" />
                    {ESTADO_LABELS[k]}
                  </span>
                ))}
              </div>
            </div>

            {/* Grid de mesas */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {numerosArray.map((n) => (
                <MesaCard key={n} numero={n} mesa={mesas[String(n)]} onClick={(id) => navigate(`/mesa/${id}`)} onNuevaComanda={(id) => setModalMesaId(id)} />
              ))}
            </div>

            {/* Pedidos Pendientes */}
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-white font-semibold">Pedidos Pendientes</h2>
                {pendientes.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: "#ef4444" }}>{pendientes.length}</span>}
              </div>
              {pendientes.length === 0 ? (
                <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl px-4 py-6 text-center text-slate-400">Todo servido ✅</div>
              ) : (
                <div className="space-y-2">
                  {pendientes.map((comanda) => (
                    <div key={comanda.id} style={{ backgroundColor: "#1e293b", borderColor: "#b45309" }} className="rounded-xl p-3 border flex items-start gap-3">
                      <div style={{ backgroundColor: "#f97316" }} className="rounded-lg px-2.5 py-1.5 text-white font-bold text-sm shrink-0">Mesa {comanda.mesaId}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-500 text-xs mb-1">
                          {comanda.creadaEn?.toDate ? comanda.creadaEn.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </p>
                        <ul className="space-y-0.5">
                          {(comanda.items || []).map((item, i) => (
                            <li key={i} className="text-sm text-slate-200"><span className="font-medium">{item.cantidad}×</span> {item.nombre}</li>
                          ))}
                        </ul>
                      </div>
                      <button onClick={() => marcarServida(comanda.ref)} style={{ backgroundColor: "#16a34a" }} className="shrink-0 px-3 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 active:opacity-75 transition-opacity">✓ Servido</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB: RESERVAS ── */}
        {tab === "reservas" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">
                Reservas de hoy — {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <span className="text-slate-400 text-sm">{reservasHoy.length} reserva{reservasHoy.length !== 1 ? "s" : ""}</span>
            </div>

            {reservasHoy.length === 0 ? (
              <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-8 text-center text-slate-500">
                No hay reservas para hoy
              </div>
            ) : (
              <div className="space-y-4">
                {/* Comida */}
                {reservasHoy.some((r) => r.turno === "comida") && (
                  <div>
                    <h3 className="text-orange-400 font-semibold text-sm mb-2">🍽️ Turno de comida</h3>
                    <div className="space-y-2">
                      {reservasHoy.filter((r) => r.turno === "comida").map((r) => (
                        <ReservaCard key={r.id} reserva={r} onConfirmar={confirmarLlegada} onNoShow={marcarNoShow} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Cena */}
                {reservasHoy.some((r) => r.turno === "cena") && (
                  <div>
                    <h3 className="text-purple-400 font-semibold text-sm mb-2">🌙 Turno de cena</h3>
                    <div className="space-y-2">
                      {reservasHoy.filter((r) => r.turno === "cena").map((r) => (
                        <ReservaCard key={r.id} reserva={r} onConfirmar={confirmarLlegada} onNoShow={marcarNoShow} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de nueva comanda */}
      {modalMesaId !== null && (
        <ComandaModal mesaId={modalMesaId} mesa={mesaModal} carta={carta} onClose={() => setModalMesaId(null)} onEnviado={() => setModalMesaId(null)} />
      )}
    </div>
  );
}
