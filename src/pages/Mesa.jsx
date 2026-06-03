import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteField,
  addDoc,
  serverTimestamp,
  runTransaction,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";

// Calcula el total de una comanda desde items como fallback si total===0
function calcTotal(comanda) {
  if (comanda.total > 0) return comanda.total;
  return (comanda.items || []).reduce(
    (a, i) => a + (i.precio || 0) * (i.cantidad || 1),
    0
  );
}

function generarHTMLTicket({ restaurante, numTicket, mesaId, mesa, comandas, conceptosManuales, totalAcumulado, totalManuales, totalFinal }) {
  const fecha = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const numStr = String(numTicket).padStart(4, "0");
  const base = totalFinal / 1.10;
  const iva = totalFinal - base;

  const filaItem = (nombre, cantidad, precio) => `
    <tr>
      <td>${cantidad}</td>
      <td>${nombre}</td>
      <td style="text-align:right">${precio.toFixed(2)}€</td>
      <td style="text-align:right">${(precio * cantidad).toFixed(2)}€</td>
    </tr>`;

  const filasComandas = comandas
    .flatMap((c) => (c.items || []).map((i) => filaItem(i.nombre, i.cantidad, i.precio || 0)))
    .join("");

  const filasExtras = conceptosManuales
    .map((c) => filaItem(c.descripcion, 1, c.importe))
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Ticket ${numStr}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 13px; max-width: 320px; margin: 0 auto; padding: 16px; color: #111; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .big { font-size: 16px; }
    hr { border: none; border-top: 1px dashed #555; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th { text-align: left; font-size: 11px; color: #555; padding-bottom: 4px; }
    td { padding: 2px 0; vertical-align: top; }
    td:first-child { width: 24px; }
    td:nth-child(3), td:nth-child(4) { white-space: nowrap; }
    .totales td { padding: 2px 0; }
    .total-final { font-weight: bold; font-size: 16px; }
    .footer { margin-top: 16px; font-size: 11px; color: #555; }
    .actions { margin-top: 20px; display: flex; gap: 8px; justify-content: center; }
    .btn { padding: 8px 20px; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
    .btn-print { background: #f97316; color: white; }
    .btn-close { background: #475569; color: white; }
    @media print {
      .actions { display: none; }
      body { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="center bold big">${restaurante?.nombre || "Establecimiento"}</div>
  ${restaurante?.cif ? `<div class="center">CIF: ${restaurante.cif}</div>` : ""}
  ${restaurante?.direccion ? `<div class="center">${restaurante.direccion}</div>` : ""}
  <hr>
  <table class="totales">
    <tr><td>Ticket Nº:</td><td style="text-align:right">${numStr}</td></tr>
    <tr><td>Fecha:</td><td style="text-align:right">${fecha}</td></tr>
    <tr><td>Mesa:</td><td style="text-align:right">${mesaId}</td></tr>
    ${mesa?.clienteNombre ? `<tr><td>Cliente:</td><td style="text-align:right">${mesa.clienteNombre}</td></tr>` : ""}
    ${mesa?.personas ? `<tr><td>Personas:</td><td style="text-align:right">${mesa.personas}</td></tr>` : ""}
  </table>
  <hr>
  <table>
    <thead><tr><th>Cant</th><th>Descripción</th><th style="text-align:right">P.Unit</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${filasComandas}</tbody>
  </table>
  ${filasExtras ? `
  <hr>
  <div class="bold" style="font-size:11px;color:#555;margin-bottom:4px">EXTRAS</div>
  <table><tbody>${filasExtras}</tbody></table>` : ""}
  <hr>
  <table class="totales">
    ${conceptosManuales.length > 0 ? `
    <tr><td>Subtotal comandas</td><td style="text-align:right">${totalAcumulado.toFixed(2)}€</td></tr>
    <tr><td>Conceptos adicionales</td><td style="text-align:right">${totalManuales.toFixed(2)}€</td></tr>` : ""}
    <tr><td>Base imponible</td><td style="text-align:right">${base.toFixed(2)}€</td></tr>
    <tr><td>IVA 10%</td><td style="text-align:right">${iva.toFixed(2)}€</td></tr>
    <tr class="total-final"><td>TOTAL</td><td style="text-align:right">${totalFinal.toFixed(2)}€</td></tr>
  </table>
  <hr>
  <div class="center footer">¡Gracias por su visita!</div>
  <div class="actions">
    <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir</button>
    <button class="btn btn-close" onclick="window.close()">✕ Cerrar</button>
  </div>
</body>
</html>`;
}

export default function Mesa() {
  const { mesaId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mesa, setMesa] = useState(null);
  const [restaurante, setRestaurante] = useState(null);
  const [comandas, setComandas] = useState([]);
  const [pagando, setPagando] = useState(false);
  const [mostrarCuenta, setMostrarCuenta] = useState(false);
  const [conceptosManuales, setConceptosManuales] = useState([]);
  const [nuevoConcepto, setNuevoConcepto] = useState({ descripcion: "", importe: "" });
  const [generandoTicket, setGenerandoTicket] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
      else setUser(u);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    // Cargar datos del restaurante (para el ticket)
    getDoc(doc(db, "restaurantes", RESTAURANTE_ID)).then((snap) => {
      if (snap.exists()) setRestaurante(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId),
      (snap) => setMesa(snap.exists() ? snap.data() : null)
    );
  }, [user, mesaId]);

  useEffect(() => {
    if (!user) return;
    const ref = query(
      collection(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas"),
      orderBy("creadaEn", "asc")
    );
    return onSnapshot(ref, (snap) => {
      setComandas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user, mesaId]);

  async function toggleEstadoComanda(comandaId, estadoActual) {
    const nuevoEstado = estadoActual === "servida" ? "pendiente" : "servida";
    try {
      await updateDoc(
        doc(db, "restaurantes", RESTAURANTE_ID, "mesas", mesaId, "comandas", comandaId),
        { estado: nuevoEstado }
      );
    } catch (err) {
      console.error(err);
    }
  }

  function addConceptoManual() {
    const importe = parseFloat(nuevoConcepto.importe);
    if (!nuevoConcepto.descripcion.trim() || isNaN(importe) || importe <= 0) return;
    setConceptosManuales([...conceptosManuales, { descripcion: nuevoConcepto.descripcion.trim(), importe }]);
    setNuevoConcepto({ descripcion: "", importe: "" });
  }

  function removeConceptoManual(idx) {
    setConceptosManuales(conceptosManuales.filter((_, i) => i !== idx));
  }

  async function imprimirTicket() {
    setGenerandoTicket(true);
    try {
      // Incrementar contador de tickets atómicamente
      const configRef = doc(db, "restaurantes", RESTAURANTE_ID, "config", "tickets");
      const numTicket = await runTransaction(db, async (tx) => {
        const snap = await tx.get(configRef);
        const actual = snap.exists() ? (snap.data().ultimo || 0) : 0;
        const siguiente = actual + 1;
        tx.set(configRef, { ultimo: siguiente }, { merge: true });
        return siguiente;
      });

      const html = generarHTMLTicket({
        restaurante,
        numTicket,
        mesaId,
        mesa,
        comandas,
        conceptosManuales,
        totalAcumulado,
        totalManuales,
        totalFinal,
      });

      const win = window.open("", "_blank", "width=420,height=650,scrollbars=yes");
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      console.error("Error al generar ticket:", err);
    } finally {
      setGenerandoTicket(false);
    }
  }

  async function marcarPagada() {
    setPagando(true);
    try {
      await addDoc(collection(db, "restaurantes", RESTAURANTE_ID, "historico"), {
        mesaId: String(mesaId),
        clienteNombre: mesa?.clienteNombre || null,
        personas: mesa?.personas || null,
        total: totalFinal,
        abiertaEn: mesa?.abiertaEn || null,
        cerradaEn: serverTimestamp(),
        numComandas: comandas.length,
        items: comandas.flatMap((c) => c.items || []),
        comandas: comandas.map((c) => ({
          total: calcTotal(c),
          creadaEn: c.creadaEn || null,
          items: c.items || [],
        })),
      });
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

  // Totales calculados correctamente (fallback a suma de items si total===0)
  const totalAcumulado = comandas.reduce((acc, c) => acc + calcTotal(c), 0);
  const totalManuales = conceptosManuales.reduce((acc, c) => acc + c.importe, 0);
  const totalFinal = totalAcumulado + totalManuales;

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
        <div>
          <h1 className="text-white font-bold">Mesa {mesaId}</h1>
          {mesa?.clienteNombre && (
            <p className="text-slate-400 text-xs">
              {mesa.clienteNombre} · {mesa.personas} persona{mesa.personas !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        {/* Total acumulado */}
        <div style={{ backgroundColor: "#1e293b" }} className="rounded-2xl p-6 mb-4 text-center">
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

        {/* Lista de comandas */}
        <div className="space-y-3 mb-6">
          {comandas.length === 0 && (
            <p className="text-slate-500 text-center py-8">No hay comandas todavía</p>
          )}
          {comandas.map((comanda, i) => {
            const estadoComanda = comanda.estado || "pendiente";
            const esServida = estadoComanda === "servida";
            const totalComanda = calcTotal(comanda);
            return (
              <div key={comanda.id} style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-xs">
                    Comanda #{i + 1} · {formatHora(comanda.creadaEn)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {totalComanda.toFixed(2)}€
                    </span>
                    <button
                      onClick={() => toggleEstadoComanda(comanda.id, estadoComanda)}
                      className="text-xs font-semibold px-2 py-1 rounded-full transition-colors"
                      style={{ backgroundColor: esServida ? "#16a34a" : "#b45309", color: "white" }}
                    >
                      {esServida ? "Servida" : "Pendiente"}
                    </button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {(comanda.items || []).map((item, j) => (
                    <li key={j} className="flex justify-between text-sm">
                      <span className={esServida ? "text-slate-500 line-through" : "text-slate-300"}>
                        {item.nombre} x{item.cantidad}
                      </span>
                      <span className="text-slate-400">
                        {((item.precio || 0) * item.cantidad).toFixed(2)}€
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Botones */}
        <div className="space-y-3">
          <button
            onClick={() => setMostrarCuenta(true)}
            style={{ backgroundColor: "#f97316" }}
            className="w-full py-4 rounded-xl text-white font-bold text-lg hover:opacity-90 active:opacity-80 transition-opacity"
          >
            🧾 Cuenta final
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

      {/* ── Overlay Cuenta final ─────────────────────────── */}
      {mostrarCuenta && (
        <div style={{ backgroundColor: "#0f172a" }} className="fixed inset-0 z-50 overflow-y-auto">
          <header
            style={{ backgroundColor: "#1e293b", borderBottomColor: "#334155" }}
            className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10"
          >
            <button
              onClick={() => setMostrarCuenta(false)}
              className="text-slate-400 hover:text-white transition-colors text-sm"
            >
              ← Volver
            </button>
            <div>
              <h1 className="text-white font-bold">Cuenta final · Mesa {mesaId}</h1>
              {mesa?.clienteNombre && (
                <p className="text-slate-400 text-xs">
                  {mesa.clienteNombre} · {mesa.personas} persona{mesa.personas !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </header>

          <div className="p-4 max-w-lg mx-auto pb-8">
            {/* Desglose de comandas */}
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Comandas
            </h3>
            <div className="space-y-3 mb-6">
              {comandas.map((comanda, i) => (
                <div key={comanda.id} style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-400 text-xs font-semibold">
                      Comanda #{i + 1} · {formatHora(comanda.creadaEn)}
                    </span>
                    <span className="font-semibold text-white">{calcTotal(comanda).toFixed(2)}€</span>
                  </div>
                  <ul className="space-y-1">
                    {(comanda.items || []).map((item, j) => (
                      <li key={j} className="flex justify-between text-sm">
                        <span className="text-slate-300">{item.nombre} x{item.cantidad}</span>
                        <span className="text-slate-400">
                          {((item.precio || 0) * item.cantidad).toFixed(2)}€
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Conceptos manuales */}
            <div style={{ backgroundColor: "#1e293b" }} className="rounded-xl p-4 mb-4">
              <h3 className="text-white font-semibold mb-3">Conceptos adicionales</h3>
              {conceptosManuales.length > 0 && (
                <ul className="space-y-2 mb-3">
                  {conceptosManuales.map((c, i) => (
                    <li key={i} className="flex justify-between items-center">
                      <span className="text-slate-300 text-sm">{c.descripcion}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm">{c.importe.toFixed(2)}€</span>
                        <button onClick={() => removeConceptoManual(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Descripción"
                  value={nuevoConcepto.descripcion}
                  onChange={(e) => setNuevoConcepto({ ...nuevoConcepto, descripcion: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addConceptoManual()}
                  style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  className="flex-1 rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500"
                />
                <input
                  type="number" placeholder="€" min="0" step="0.01"
                  value={nuevoConcepto.importe}
                  onChange={(e) => setNuevoConcepto({ ...nuevoConcepto, importe: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addConceptoManual()}
                  style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  className="w-20 rounded-lg px-3 py-2 text-white text-sm border outline-none focus:border-orange-500"
                />
                <button
                  onClick={addConceptoManual}
                  style={{ backgroundColor: "#334155" }}
                  className="px-3 py-2 rounded-lg text-white text-sm font-bold hover:bg-slate-600"
                >+</button>
              </div>
            </div>

            {/* Total con desglose IVA */}
            <div style={{ backgroundColor: "#1e293b" }} className="rounded-2xl p-6 mb-4">
              {conceptosManuales.length > 0 && (
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-slate-400 text-sm">
                    <span>Subtotal comandas</span>
                    <span>{totalAcumulado.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-sm">
                    <span>Conceptos adicionales</span>
                    <span>{totalManuales.toFixed(2)}€</span>
                  </div>
                  <div style={{ borderColor: "#334155" }} className="border-t my-2" />
                </div>
              )}
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-slate-500 text-sm">
                  <span>Base imponible</span>
                  <span>{(totalFinal / 1.10).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-slate-500 text-sm">
                  <span>IVA 10%</span>
                  <span>{(totalFinal - totalFinal / 1.10).toFixed(2)}€</span>
                </div>
              </div>
              <div style={{ borderColor: "#334155" }} className="border-t pt-3 text-center">
                <p className="text-slate-400 text-sm mb-1">Total general</p>
                <p className="text-5xl font-bold" style={{ color: "#f97316" }}>
                  {totalFinal.toFixed(2)}€
                </p>
                {mesa?.personas && (
                  <p className="text-slate-400 text-sm mt-2">
                    {(totalFinal / mesa.personas).toFixed(2)}€ / persona
                  </p>
                )}
              </div>
            </div>

            {/* Botones de ticket */}
            <button
              onClick={imprimirTicket}
              disabled={generandoTicket || totalFinal === 0}
              style={{ backgroundColor: "#1d4ed8" }}
              className="w-full py-3 rounded-xl text-white font-semibold text-base hover:opacity-90 active:opacity-80 disabled:opacity-40 transition-opacity mb-3"
            >
              {generandoTicket ? "Generando..." : "🖨️ Imprimir / Descargar ticket"}
            </button>

            {/* Botón Mesa pagada */}
            <button
              onClick={marcarPagada}
              disabled={pagando}
              style={{ backgroundColor: "#ef4444" }}
              className="w-full py-5 rounded-xl text-white font-bold text-xl hover:opacity-90 active:opacity-80 disabled:opacity-50 transition-opacity"
            >
              {pagando ? "Procesando..." : "✓ Mesa pagada"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
