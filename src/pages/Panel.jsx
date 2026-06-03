import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, onSnapshot, doc, getDoc, getDocs,
  updateDoc, addDoc, deleteField, serverTimestamp, query, where,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";
const ADMIN_EMAIL = "eladiomateosoto@gmail.com";
const TODAY = () => new Date().toISOString().split("T")[0];

const ESTADO_COLORES = {
  libre: "#22c55e", ocupada: "#f97316", pagando: "#ef4444", reservada: "#3b82f6",
};
const ESTADO_LABELS = {
  libre: "Libre", ocupada: "Ocupada", pagando: "Pagando", reservada: "Reservada",
};
const TURNO_COLOR = { comida: "#f97316", cena: "#7c3aed" };

function tiempoTranscurrido(abiertaEn) {
  if (!abiertaEn) return "";
  const diff = Date.now() - abiertaEn.toMillis();
  const m = Math.floor(diff / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Modal: Asignar mesa a una reserva ───────────────────────────────────────
function ModalAsignarMesa({ reserva, mesas, reservas, numMesas, onClose, onAsignada }) {
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState("");

  const mesasYaAsignadas = new Set(
    reservas
      .filter(r => r.turno === reserva.turno && r.mesaAsignada && r.id !== reserva.id && !["cancelada", "no_presentado"].includes(r.estado))
      .map(r => String(r.mesaAsignada))
  );

  function colorMesa(num) {
    const id = String(num);
    const m = mesas[id];
    if (m?.estado === "ocupada" || m?.estado === "pagando") return "ocupada";
    if (mesasYaAsignadas.has(id)) return "reservada";
    return "libre";
  }

  async function seleccionar(num) {
    if (colorMesa(num) !== "libre" || asignando) return;
    setAsignando(true);
    setError("");
    try {
      const res = await fetch("/api/asignar-mesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restauranteId: RESTAURANTE_ID,
          reservaId: reserva.id,
          mesaAsignada: num,
          email: reserva.email,
          nombre: reserva.nombre,
          fecha: reserva.fecha,
          turno: reserva.turno,
          hora: reserva.hora,
          personas: reserva.personas,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error al asignar");
      onAsignada();
    } catch (err) {
      setError(err.message);
      setAsignando(false);
    }
  }

  const cols = { libre: ESTADO_COLORES.libre, ocupada: ESTADO_COLORES.ocupada, reservada: ESTADO_COLORES.reservada };
  const labs = { libre: "Libre", ocupada: "Ocupada", reservada: "Reservada" };

  return (
    <div style={{ backgroundColor: "#0f172a" }} className="fixed inset-0 z-50 flex flex-col">
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">← Cancelar</button>
        <div>
          <h1 className="text-white font-bold">Asignar mesa — {reserva.nombre}</h1>
          <p className="text-slate-400 text-xs capitalize">{reserva.turno} · {reserva.hora} · {reserva.personas} pers.</p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-2 text-red-400 text-sm mb-4">{error}</div>}
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 mb-4">
          {Array.from({ length: numMesas }, (_, i) => i + 1).map(n => {
            const c = colorMesa(n);
            const libre = c === "libre";
            return (
              <button key={n} onClick={() => seleccionar(n)} disabled={!libre || asignando}
                style={{ backgroundColor: "#1e293b", borderColor: cols[c], borderWidth: 2, opacity: libre ? 1 : 0.45 }}
                className={`rounded-xl p-3 text-center transition-transform ${libre ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-not-allowed"}`}>
                <div className="text-white font-bold text-xl">{n}</div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: cols[c] }}>{labs[c]}</div>
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          {Object.entries(cols).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5"><span style={{ backgroundColor: v }} className="w-2.5 h-2.5 rounded-full" />{labs[k]}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Nueva reserva manual ─────────────────────────────────────────────
function ModalNuevaReserva({ mesaNumero, fecha, turnoDefault, onClose, onCreada }) {
  const [form, setForm] = useState({ nombre: "", personas: "2", turno: turnoDefault || "comida", hora: "", telefono: "", email: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre || !form.hora) { setError("Nombre y hora son obligatorios"); return; }
    setEnviando(true); setError("");
    try {
      const res = await fetch("/api/reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restauranteId: RESTAURANTE_ID, nombre: form.nombre, personas: Number(form.personas) || 2, fecha, turno: form.turno, hora: form.hora, telefono: form.telefono, email: form.email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.mensaje || "No disponible");

      if (mesaNumero && data.reservaId) {
        await fetch("/api/asignar-mesa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restauranteId: RESTAURANTE_ID, reservaId: data.reservaId, mesaAsignada: mesaNumero, email: form.email, nombre: form.nombre, fecha, turno: form.turno, hora: form.hora, personas: Number(form.personas) || 2 }),
        });
      }
      onCreada();
    } catch (err) { setError(err.message); }
    finally { setEnviando(false); }
  }

  const inp = "w-full rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500";
  const inpStyle = { backgroundColor: "#0f172a", borderColor: "#334155" };

  return (
    <div style={{ backgroundColor: "#0f172a" }} className="fixed inset-0 z-50 flex flex-col">
      <header style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">← Cancelar</button>
        <h1 className="text-white font-bold">
          Nueva reserva{mesaNumero ? ` — Mesa ${mesaNumero}` : ""}
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm mb-1">Nombre *</label>
            <input value={form.nombre} onChange={e => f("nombre", e.target.value)} required placeholder="Nombre del cliente" className={inp} style={inpStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 text-sm mb-1">Personas</label>
              <input type="number" min="1" max="30" value={form.personas} onChange={e => f("personas", e.target.value)} className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="block text-slate-300 text-sm mb-1">Hora *</label>
              <input type="time" value={form.hora} onChange={e => f("hora", e.target.value)} required className={inp} style={inpStyle} />
            </div>
          </div>
          <div>
            <label className="block text-slate-300 text-sm mb-1">Turno</label>
            <div className="flex gap-2">
              {["comida", "cena"].map(t => (
                <button key={t} type="button" onClick={() => f("turno", t)}
                  style={{ backgroundColor: form.turno === t ? TURNO_COLOR[t] : "#334155" }}
                  className="flex-1 py-2 rounded-lg text-white text-sm font-medium capitalize hover:opacity-90">
                  {t === "comida" ? "🍽️ Comida" : "🌙 Cena"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-slate-300 text-sm mb-1">Teléfono</label>
            <input value={form.telefono} onChange={e => f("telefono", e.target.value)} placeholder="600 000 000" className={inp} style={inpStyle} />
          </div>
          <div>
            <label className="block text-slate-300 text-sm mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => f("email", e.target.value)} placeholder="cliente@email.com" className={inp} style={inpStyle} />
          </div>
          {error && <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-2 text-red-400 text-sm">{error}</div>}
          <button type="submit" disabled={enviando} style={{ backgroundColor: "#f97316" }}
            className="w-full py-3 rounded-xl text-white font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
            {enviando ? "Guardando..." : mesaNumero ? `Reservar Mesa ${mesaNumero}` : "Crear reserva"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Comanda ────────────────────────────────────────────────────────────
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

  function cambiar(nombre, precio, delta) {
    setSeleccion(prev => {
      const cant = Math.max(0, (prev[nombre]?.cantidad || 0) + delta);
      if (cant === 0) { const n = { ...prev }; delete n[nombre]; return n; }
      return { ...prev, [nombre]: { cantidad: cant, precio } };
    });
  }

  async function enviar() {
    const items = Object.entries(seleccion).map(([nombre, v]) => ({ nombre, cantidad: v.cantidad, precio: v.precio }));
    if (!items.length) return;
    setEnviando(true); setError("");
    try {
      const res = await fetch("/api/pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restauranteId: RESTAURANTE_ID, mesa: mesaId, nombre: clienteNombre.trim() || "Cliente", personas: Number(personas) || 1, items, total }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error");
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
          <input placeholder="Nombre del cliente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} style={{ backgroundColor: "#0f172a", borderColor: "#334155" }} className="flex-1 rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500" />
          <input type="number" min="1" max="30" placeholder="Pers." value={personas} onChange={e => setPersonas(e.target.value)} style={{ backgroundColor: "#0f172a", borderColor: "#334155" }} className="w-20 rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500" />
        </div>
      )}
      <div ref={tabsRef} style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b px-4 py-2 overflow-x-auto flex gap-2 shrink-0">
        {categorias.map((cat, i) => <button key={cat.id} onClick={() => setCatIdx(i)} style={{ backgroundColor: i === catIdx ? "#f97316" : "#334155", whiteSpace: "nowrap" }} className="px-3 py-1.5 rounded-full text-white text-xs font-medium shrink-0 hover:opacity-90">{cat.nombre}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {!carta ? <div className="text-center py-12 text-slate-500">Cargando carta...</div> : (
          <div className="space-y-2">
            {(categorias[catIdx]?.items || []).map(item => {
              const cant = seleccion[item.nombre]?.cantidad || 0;
              return (
                <div key={item.nombre} style={{ backgroundColor: cant > 0 ? "#1e3a1e" : "#1e293b", borderColor: cant > 0 ? "#16a34a" : "transparent", borderWidth: 1 }} className="rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${cant > 0 ? "text-green-400" : "text-white"}`}>{item.nombre}</p>
                    {item.alergenos && <p className="text-xs text-slate-500 mt-0.5 truncate">⚠ {item.alergenos}</p>}
                  </div>
                  <span className="text-orange-400 font-semibold text-sm shrink-0">{item.precio.toFixed(2)}€</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => cambiar(item.nombre, item.precio, -1)} disabled={cant === 0} style={{ backgroundColor: cant > 0 ? "#ef4444" : "#334155" }} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center hover:opacity-90 disabled:opacity-30">−</button>
                    <span className="text-white font-bold w-5 text-center tabular-nums">{cant}</span>
                    <button onClick={() => cambiar(item.nombre, item.precio, 1)} style={{ backgroundColor: "#16a34a" }} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center hover:opacity-90">+</button>
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
          <button onClick={enviar} disabled={enviando || totalItems === 0} style={{ backgroundColor: totalItems > 0 ? "#f97316" : "#334155" }} className="px-6 py-4 rounded-xl text-white font-bold text-lg hover:opacity-90 disabled:opacity-40">{enviando ? "Enviando..." : "Enviar comanda"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de mesa ──────────────────────────────────────────────────────────
function MesaCard({ mesa, numero, reservadaParaTurno, onClick, onNuevaComanda }) {
  const estadoBase = mesa?.estado || "libre";
  const estado = (estadoBase === "libre" && reservadaParaTurno) ? "reservada" : estadoBase;
  const color = ESTADO_COLORES[estado] || ESTADO_COLORES.libre;
  return (
    <div style={{ backgroundColor: "#1e293b", borderColor: color, borderWidth: 2 }} className={`rounded-xl p-3 border ${mesa?.nuevaComanda ? "blink" : ""}`}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-slate-400 text-xs">Mesa</span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: color }}>{ESTADO_LABELS[estado]}</span>
      </div>
      <div onClick={() => estadoBase !== "libre" && onClick(numero)} style={{ cursor: estadoBase !== "libre" ? "pointer" : "default" }} className={estadoBase !== "libre" ? "hover:opacity-80" : ""}>
        <div className="text-2xl font-bold text-white">{numero}</div>
        {mesa?.clienteNombre && <div className="text-xs text-slate-300 truncate mt-0.5">{mesa.clienteNombre}</div>}
        {(estadoBase === "ocupada" || estadoBase === "pagando") && <div className="text-base font-bold mt-0.5" style={{ color: "#f97316" }}>{(mesa?.total || 0).toFixed(2)}€</div>}
        {mesa?.abiertaEn && <div className="text-xs text-slate-500 mt-0.5">{tiempoTranscurrido(mesa.abiertaEn)}</div>}
      </div>
      <button onClick={e => { e.stopPropagation(); onNuevaComanda(numero); }} style={{ backgroundColor: "#16a34a" }} className="mt-2 w-full py-1 rounded-lg text-white text-xs font-semibold hover:opacity-90 active:opacity-75">+ Comanda</button>
    </div>
  );
}

// ─── Tarjeta de reserva ───────────────────────────────────────────────────────
function ReservaCard({ reserva, onConfirmar, onNoShow, onAsignarMesa }) {
  const cfg = {
    confirmada: { bg: "#1e3a5f", border: "#3b82f6", badge: "#3b82f6", label: "Confirmada" },
    mesa_asignada: { bg: "#1a2e4a", border: "#60a5fa", badge: "#60a5fa", label: "Mesa asignada" },
    en_local: { bg: "#1e3a1e", border: "#16a34a", badge: "#16a34a", label: "En local" },
    no_presentado: { bg: "#3b1a1a", border: "#ef4444", badge: "#ef4444", label: "No show" },
  };
  const est = cfg[reserva.estado] || cfg.confirmada;
  return (
    <div style={{ backgroundColor: est.bg, borderColor: est.border, borderWidth: 1 }} className="rounded-xl p-4 border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-white font-bold">{reserva.nombre}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: est.badge }}>{est.label}</span>
            {reserva.mesaAsignada && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: ESTADO_COLORES.reservada }}>Mesa {reserva.mesaAsignada}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-400">
            <span>👥 {reserva.personas} pers.</span>
            <span style={{ color: TURNO_COLOR[reserva.turno] }}>{reserva.turno === "comida" ? "🍽️ Comida" : "🌙 Cena"} · {reserva.hora}</span>
            {reserva.telefono && <span>📱 {reserva.telefono}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {(reserva.estado === "confirmada" || reserva.estado === "mesa_asignada") && (
            <button onClick={() => onAsignarMesa(reserva)} style={{ backgroundColor: "#1d4ed8" }} className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90 whitespace-nowrap">
              🪑 {reserva.mesaAsignada ? `Mesa ${reserva.mesaAsignada}` : "Asignar mesa"}
            </button>
          )}
          {reserva.estado === "confirmada" && (
            <button onClick={() => onConfirmar(reserva)} style={{ backgroundColor: "#16a34a" }} className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90">✓ En local</button>
          )}
          {reserva.estado === "mesa_asignada" && (
            <button onClick={() => onConfirmar(reserva)} style={{ backgroundColor: "#16a34a" }} className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90">✓ En local</button>
          )}
          {(reserva.estado === "confirmada" || reserva.estado === "mesa_asignada") && (
            <button onClick={() => onNoShow(reserva.id)} style={{ backgroundColor: "#7f1d1d" }} className="px-3 py-1.5 rounded-lg text-white text-xs hover:opacity-90">✗ No show</button>
          )}
        </div>
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
  const [reservasHoy, setReservasHoy] = useState([]);
  const [tab, setTab] = useState("mesas");
  const [turnoMesas, setTurnoMesas] = useState("comida");
  const [fechaFiltro, setFechaFiltro] = useState(TODAY());
  const [turnoFiltro, setTurnoFiltro] = useState("todos");
  const [modalComanda, setModalComanda] = useState(null);
  const [modalAsignar, setModalAsignar] = useState(null);
  const [modalNuevaReserva, setModalNuevaReserva] = useState(null);
  const [cerrandoDia, setCerrandoDia] = useState(false);
  const prevMesasRef = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); if (!u) navigate("/login"); });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "restaurantes", RESTAURANTE_ID)).then(s => { if (s.exists()) setRestaurante(s.data()); });
    getDoc(doc(db, "restaurantes", RESTAURANTE_ID, "carta", "menu")).then(s => { if (s.exists()) setCarta(s.data()); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "restaurantes", RESTAURANTE_ID, "mesas"), snap => {
      const nm = {};
      snap.forEach(d => { nm[d.id] = d.data(); });
      Object.entries(nm).forEach(([id, mesa]) => {
        const prev = prevMesasRef.current[id];
        if (mesa.estado === "ocupada" && prev?.estado === "ocupada" && mesa.ultimaComanda !== prev?.ultimaComanda) {
          playBeep();
          nm[id] = { ...mesa, nuevaComanda: true };
          setTimeout(() => setMesas(m => ({ ...m, [id]: { ...m[id], nuevaComanda: false } })), 3000);
        }
      });
      prevMesasRef.current = nm;
      setMesas(nm);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const activas = Object.keys(mesas).filter(id => mesas[id]?.estado === "ocupada" || mesas[id]?.estado === "pagando");
    if (!activas.length) { setPendientes([]); return; }
    const porMesa = {};
    const unsubs = activas.map(mesaId =>
      onSnapshot(collection(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas"), snap => {
        porMesa[mesaId] = snap.docs.filter(d => { const e = d.data().estado; return !e || e === "pendiente"; }).map(d => ({ id: d.id, ref: d.ref, mesaId, ...d.data() }));
        setPendientes(Object.values(porMesa).flat().sort((a, b) => (a.creadaEn?.toMillis?.() || 0) - (b.creadaEn?.toMillis?.() || 0)));
      })
    );
    return () => unsubs.forEach(u => u());
  }, [user, mesas]);

  // Reservas para la fecha/turno seleccionados en el filtro (pestaña Reservas)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "restaurantes", RESTAURANTE_ID, "reservas"), where("fecha", "==", fechaFiltro));
    return onSnapshot(q, snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => a.turno === b.turno ? (a.hora || "").localeCompare(b.hora || "") : a.turno === "comida" ? -1 : 1);
      setReservas(lista);
    });
  }, [user, fechaFiltro]);

  // Reservas de HOY — siempre el día actual, para el overlay azul en pestaña Mesas
  useEffect(() => {
    if (!user) return;
    const hoy = TODAY();
    // Si el filtro ya apunta a hoy, reusar el listener de reservas
    if (fechaFiltro === hoy) {
      setReservasHoy(reservas);
      return;
    }
    const q = query(collection(db, "restaurantes", RESTAURANTE_ID, "reservas"), where("fecha", "==", hoy));
    return onSnapshot(q, snap => {
      setReservasHoy(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user, fechaFiltro, reservas]);

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

  async function marcarServida(ref) { try { await updateDoc(ref, { estado: "servida" }); } catch {} }

  async function confirmarLlegada(reserva) {
    const mesaIdAsignada = reserva.mesaAsignada ? String(reserva.mesaAsignada) : null;
    let mesaId = mesaIdAsignada;
    if (!mesaId) {
      const input = window.prompt(`¿Número de mesa para ${reserva.nombre}? (vacío = sin asignar)`);
      if (input && !isNaN(Number(input)) && Number(input) > 0) mesaId = String(Number(input));
    }
    try {
      if (mesaId) {
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId), { estado: "reservada", clienteNombre: reserva.nombre, personas: reserva.personas || 1, abiertaEn: serverTimestamp() });
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "reservas", reserva.id), { estado: "en_local", mesaId });
      } else {
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "reservas", reserva.id), { estado: "en_local" });
      }
    } catch (err) { console.error(err); }
  }

  async function marcarNoShow(id) {
    try { await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "reservas", id), { estado: "no_presentado" }); } catch {}
  }

  async function cerrarDia() {
    const ocupadas = Object.entries(mesas).filter(([, m]) => m?.estado === "ocupada" || m?.estado === "pagando");
    if (!ocupadas.length) { alert("No hay mesas ocupadas."); return; }
    if (!window.confirm(`¿Cerrar ${ocupadas.length} mesa(s) y pasar al histórico?`)) return;
    setCerrandoDia(true);
    try {
      for (const [mesaId, mesaData] of ocupadas) {
        const snap = await getDocs(collection(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas"));
        const comandas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        await addDoc(collection(db, "restaurantes", RESTAURANTE_ID, "historico"), { mesaId, clienteNombre: mesaData.clienteNombre || null, personas: mesaData.personas || null, total: mesaData.total || 0, abiertaEn: mesaData.abiertaEn || null, cerradaEn: serverTimestamp(), numComandas: comandas.length, items: comandas.flatMap(c => c.items || []), comandas: comandas.map(c => ({ total: c.total || 0, creadaEn: c.creadaEn || null, items: c.items || [] })), cierreManual: true });
        await updateDoc(doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId), { estado: "libre", clienteNombre: deleteField(), personas: deleteField(), total: deleteField(), abiertaEn: deleteField(), ultimaComanda: deleteField() });
      }
      alert(`${ocupadas.length} mesa(s) cerrada(s).`);
    } catch (err) { alert("Error: " + err.message); }
    finally { setCerrandoDia(false); }
  }

  if (authLoading) return <div style={{ backgroundColor: "#0f172a", minHeight: "100vh" }} className="flex items-center justify-center"><div className="text-slate-400">Cargando...</div></div>;

  const numMesas = restaurante?.numMesas || 20;
  const numerosArray = Array.from({ length: numMesas }, (_, i) => i + 1);

  // Overlay azul en pestaña Mesas: siempre basado en reservasHoy (no en fechaFiltro)
  const mesasConReservaTurno = new Set(
    reservasHoy
      .filter(r => r.turno === turnoMesas && r.mesaAsignada && !["cancelada", "no_presentado", "en_local"].includes(r.estado))
      .map(r => String(r.mesaAsignada))
  );

  // Reservas filtradas para pestaña reservas
  const reservasMostradas = reservas.filter(r =>
    (turnoFiltro === "todos" || r.turno === turnoFiltro) && r.estado !== "cancelada"
  );

  // Contador por turno: solo tiene sentido calcular mesas libres para un turno concreto
  const contadorReservas = (() => {
    const esHoy = fechaFiltro === TODAY();
    if (turnoFiltro === "todos") {
      const nComida = reservas.filter(r => r.turno === "comida" && !["cancelada", "no_presentado"].includes(r.estado)).length;
      const nCena   = reservas.filter(r => r.turno === "cena"   && !["cancelada", "no_presentado"].includes(r.estado)).length;
      if (nComida === 0 && nCena === 0) return "0 reservas";
      const partes = [];
      if (nComida > 0) partes.push(`${nComida} comida`);
      if (nCena > 0)   partes.push(`${nCena} cena`);
      return partes.join(" · ");
    }
    const n = reservas.filter(r => r.turno === turnoFiltro && !["cancelada", "no_presentado"].includes(r.estado)).length;
    const libres = Math.max(0, 18 - n);
    return `${n} reserva${n !== 1 ? "s" : ""} · ${libres} mesa${libres !== 1 ? "s" : ""} libre${libres !== 1 ? "s" : ""}`;
  })();

  // Color del grid de mesas en pestaña Reservas
  function colorMesaReservas(num) {
    const id = String(num);
    const m = mesas[id];
    const esHoy = fechaFiltro === TODAY();

    // Naranja solo para el día actual y mesa ocupada en tiempo real
    if (esHoy && (m?.estado === "ocupada" || m?.estado === "pagando")) return "ocupada";

    // Azul si tiene reserva para la fecha+turno seleccionados
    const turnosAComprobar = turnoFiltro === "todos" ? ["comida", "cena"] : [turnoFiltro];
    const tieneReserva = reservas.some(r =>
      String(r.mesaAsignada) === id &&
      turnosAComprobar.includes(r.turno) &&
      !["cancelada", "no_presentado"].includes(r.estado)
    );
    if (tieneReserva) return "reservada";

    return "libre";
  }

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
            <button onClick={cerrarDia} disabled={cerrandoDia} style={{ backgroundColor: "#b45309" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">{cerrandoDia ? "Cerrando..." : "🔒 Cerrar día"}</button>
          )}
          <button onClick={async () => { await signOut(auth); navigate("/login"); }} style={{ backgroundColor: "#ef4444" }} className="px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90">Salir</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }} className="border-b flex">
        {[["mesas", "🪑 Mesas"], ["reservas", "🗓 Reservas"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ borderBottomColor: tab === key ? "#f97316" : "transparent", borderBottomWidth: 2 }}
            className={`px-6 py-3 text-sm font-semibold flex items-center gap-2 ${tab === key ? "text-orange-400" : "text-slate-400 hover:text-white"}`}>
            {label}
            {key === "reservas" && reservasActivas.filter(r => r.estado === "confirmada").length > 0 && (
              <span style={{ backgroundColor: "#3b82f6" }} className="text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {reservasActivas.filter(r => r.estado === "confirmada").length}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="p-4">
        {/* ── TAB MESAS ── */}
        {tab === "mesas" && (
          <>
            {/* Selector de turno */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h2 className="text-white font-semibold">Mesas ({numMesas})</h2>
              <div className="flex gap-2">
                {["comida", "cena"].map(t => (
                  <button key={t} onClick={() => setTurnoMesas(t)}
                    style={{ backgroundColor: turnoMesas === t ? TURNO_COLOR[t] : "#334155" }}
                    className="px-3 py-1 rounded-full text-white text-xs font-medium capitalize hover:opacity-90">
                    {t === "comida" ? "🍽️ Comida" : "🌙 Cena"}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 text-xs ml-auto">
                {Object.entries(ESTADO_COLORES).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1 text-slate-400">
                    <span style={{ backgroundColor: v }} className="w-2 h-2 rounded-full" />{ESTADO_LABELS[k]}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {numerosArray.map(n => (
                <MesaCard key={n} numero={n} mesa={mesas[String(n)]} reservadaParaTurno={mesasConReservaTurno.has(String(n))} onClick={id => navigate(`/mesa/${id}`)} onNuevaComanda={id => setModalComanda(id)} />
              ))}
            </div>

            {/* Pedidos pendientes */}
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-white font-semibold">Pedidos Pendientes</h2>
                {pendientes.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: "#ef4444" }}>{pendientes.length}</span>}
              </div>
              {pendientes.length === 0 ? (
                <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl px-4 py-6 text-center text-slate-400">Todo servido ✅</div>
              ) : (
                <div className="space-y-2">
                  {pendientes.map(c => (
                    <div key={c.id} style={{ backgroundColor: "#1e293b", borderColor: "#b45309" }} className="rounded-xl p-3 border flex items-start gap-3">
                      <div style={{ backgroundColor: "#f97316" }} className="rounded-lg px-2.5 py-1.5 text-white font-bold text-sm shrink-0">Mesa {c.mesaId}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-500 text-xs mb-1">{c.creadaEn?.toDate ? c.creadaEn.toDate().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                        <ul className="space-y-0.5">{(c.items || []).map((item, i) => <li key={i} className="text-sm text-slate-200"><span className="font-medium">{item.cantidad}×</span> {item.nombre}</li>)}</ul>
                      </div>
                      <button onClick={() => marcarServida(c.ref)} style={{ backgroundColor: "#16a34a" }} className="shrink-0 px-3 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90">✓ Servido</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB RESERVAS ── */}
        {tab === "reservas" && (
          <div>
            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4 items-center">
              <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
                style={{ backgroundColor: "#1e293b", borderColor: "#334155", colorScheme: "dark" }}
                className="rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500" />
              <div className="flex gap-2">
                {[["todos", "Todos"], ["comida", "🍽️ Comida"], ["cena", "🌙 Cena"]].map(([val, label]) => (
                  <button key={val} onClick={() => setTurnoFiltro(val)}
                    style={{ backgroundColor: turnoFiltro === val ? (val === "cena" ? "#7c3aed" : val === "comida" ? "#f97316" : "#475569") : "#334155" }}
                    className="px-3 py-1.5 rounded-full text-white text-xs font-medium hover:opacity-90">{label}</button>
                ))}
              </div>
              <span className="text-slate-400 text-sm ml-auto">{contadorReservas}</span>
              <button onClick={() => setModalNuevaReserva({ mesaNumero: null })} style={{ backgroundColor: "#16a34a" }} className="px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90">+ Nueva reserva</button>
            </div>

            {/* Lista de reservas */}
            {reservasMostradas.length === 0 ? (
              <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-8 text-center text-slate-500 mb-6">No hay reservas para estos filtros</div>
            ) : (
              <div className="space-y-4 mb-6">
                {["comida", "cena"].map(turno => {
                  const grupo = reservasMostradas.filter(r => r.turno === turno && r.estado !== "no_presentado");
                  if (!grupo.length) return null;
                  return (
                    <div key={turno}>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: TURNO_COLOR[turno] }}>{turno === "comida" ? "🍽️ Comida" : "🌙 Cena"}</h3>
                      <div className="space-y-2">
                        {grupo.map(r => <ReservaCard key={r.id} reserva={r} onConfirmar={confirmarLlegada} onNoShow={marcarNoShow} onAsignarMesa={setModalAsignar} />)}
                      </div>
                    </div>
                  );
                })}
                {/* No shows al final */}
                {reservasMostradas.some(r => r.estado === "no_presentado") && (
                  <div>
                    <h3 className="text-xs text-slate-500 font-semibold mb-2">No presentados</h3>
                    <div className="space-y-2 opacity-60">
                      {reservasMostradas.filter(r => r.estado === "no_presentado").map(r => <ReservaCard key={r.id} reserva={r} onConfirmar={confirmarLlegada} onNoShow={marcarNoShow} onAsignarMesa={setModalAsignar} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Grid de mesas */}
            <div style={{ borderTopColor: "#334155" }} className="border-t pt-4">
              <h3 className="text-white font-semibold mb-3 text-sm">Estado de mesas — pulsa una libre para crear reserva</h3>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
                {numerosArray.map(n => {
                  const c = colorMesaReservas(n);
                  const libre = c === "libre";
                  const col = ESTADO_COLORES[c] || ESTADO_COLORES.libre;
                  return (
                    <button key={n} onClick={() => libre && setModalNuevaReserva({ mesaNumero: n })}
                      style={{ backgroundColor: "#1e293b", borderColor: col, borderWidth: 2 }}
                      className={`rounded-xl py-2 text-center border ${libre ? "hover:scale-105 active:scale-95 cursor-pointer transition-transform" : "cursor-default opacity-70"}`}>
                      <div className="text-white font-bold">{n}</div>
                      <div className="text-xs mt-0.5" style={{ color: col }}>{ESTADO_LABELS[c]}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                {Object.entries(ESTADO_COLORES).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1.5"><span style={{ backgroundColor: v }} className="w-2.5 h-2.5 rounded-full" />{ESTADO_LABELS[k]}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modales */}
      {modalComanda !== null && (
        <ComandaModal mesaId={modalComanda} mesa={mesas[String(modalComanda)]} carta={carta} onClose={() => setModalComanda(null)} onEnviado={() => setModalComanda(null)} />
      )}
      {modalAsignar && (
        <ModalAsignarMesa reserva={modalAsignar} mesas={mesas} reservas={reservas} numMesas={numMesas} onClose={() => setModalAsignar(null)} onAsignada={() => setModalAsignar(null)} />
      )}
      {modalNuevaReserva && (
        <ModalNuevaReserva mesaNumero={modalNuevaReserva.mesaNumero} fecha={fechaFiltro} turnoDefault={turnoFiltro !== "todos" ? turnoFiltro : "comida"} onClose={() => setModalNuevaReserva(null)} onCreada={() => setModalNuevaReserva(null)} />
      )}
    </div>
  );
}
