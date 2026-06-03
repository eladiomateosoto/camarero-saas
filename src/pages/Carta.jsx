import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const RESTAURANTE_ID = "pena-betica";
const ADMIN_EMAIL = "eladiomateosoto@gmail.com";

const CARTA_REF = () => doc(db, "restaurantes", RESTAURANTE_ID, "carta", "menu");

export default function Carta() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [carta, setCarta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(null); // { catIdx, itemIdx } or { catIdx, itemIdx: "nuevo" }
  const [formItem, setFormItem] = useState({ nombre: "", precio: "", alergenos: "" });
  const [busqueda, setBusqueda] = useState("");

  const esAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/login");
      else setUser(u);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    getDoc(CARTA_REF()).then((snap) => {
      if (snap.exists()) setCarta(snap.data());
      setLoading(false);
    });
  }, [user]);

  async function guardarCarta(nuevaCarta) {
    setGuardando(true);
    try {
      await setDoc(CARTA_REF(), nuevaCarta);
      setCarta(nuevaCarta);
    } finally {
      setGuardando(false);
    }
  }

  function abrirEdicion(catIdx, itemIdx) {
    const item =
      itemIdx === "nuevo"
        ? { nombre: "", precio: "", alergenos: "" }
        : carta.categorias[catIdx].items[itemIdx];
    setFormItem({
      nombre: item.nombre,
      precio: String(item.precio),
      alergenos: item.alergenos || "",
    });
    setEditando({ catIdx, itemIdx });
  }

  function cancelarEdicion() {
    setEditando(null);
    setFormItem({ nombre: "", precio: "", alergenos: "" });
  }

  async function guardarItem() {
    const precio = parseFloat(formItem.precio);
    if (!formItem.nombre.trim() || isNaN(precio) || precio <= 0) return;

    const nuevaCarta = JSON.parse(JSON.stringify(carta));
    const nuevoItem = {
      nombre: formItem.nombre.trim(),
      precio,
      alergenos: formItem.alergenos.trim(),
    };

    if (editando.itemIdx === "nuevo") {
      nuevaCarta.categorias[editando.catIdx].items.push(nuevoItem);
    } else {
      nuevaCarta.categorias[editando.catIdx].items[editando.itemIdx] = nuevoItem;
    }

    await guardarCarta(nuevaCarta);
    cancelarEdicion();
  }

  async function eliminarItem(catIdx, itemIdx) {
    if (!confirm("¿Eliminar este plato?")) return;
    const nuevaCarta = JSON.parse(JSON.stringify(carta));
    nuevaCarta.categorias[catIdx].items.splice(itemIdx, 1);
    await guardarCarta(nuevaCarta);
  }

  const categoriasFiltradas = carta?.categorias
    .map((cat) => ({
      ...cat,
      items: busqueda
        ? cat.items.filter((i) =>
            i.nombre.toLowerCase().includes(busqueda.toLowerCase())
          )
        : cat.items,
    }))
    .filter((cat) => cat.items.length > 0);

  const totalPlatos = carta?.categorias.reduce((a, c) => a + c.items.length, 0) || 0;

  if (loading) {
    return (
      <div
        style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}
        className="flex items-center justify-center"
      >
        <div className="text-slate-400">Cargando carta...</div>
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
        <div className="flex-1">
          <h1 className="text-white font-bold">🍽️ Carta — Peña Bética</h1>
          <p className="text-slate-400 text-xs">
            {carta?.categorias.length || 0} categorías · {totalPlatos} platos
          </p>
        </div>
        {guardando && <span className="text-slate-400 text-xs">Guardando...</span>}
      </header>

      <main className="p-4 max-w-3xl mx-auto">
        {/* Búsqueda */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar plato..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
            className="w-full rounded-xl px-4 py-3 text-white border outline-none focus:border-orange-500"
          />
        </div>

        {/* Categorías */}
        <div className="space-y-4">
          {(categoriasFiltradas || []).map((cat, catOrigIdx) => {
            const catIdx = carta.categorias.findIndex((c) => c.id === cat.id);
            return (
              <div
                key={cat.id}
                style={{ backgroundColor: "#1e293b" }}
                className="rounded-2xl overflow-hidden"
              >
                <div
                  style={{ borderBottomColor: "#334155" }}
                  className="px-4 py-3 border-b flex items-center justify-between"
                >
                  <h2 className="text-white font-semibold">{cat.nombre}</h2>
                  <span className="text-slate-500 text-xs">{cat.items.length} platos</span>
                </div>

                <div className="divide-y divide-slate-700/50">
                  {cat.items.map((item, itemIdx) => {
                    const realItemIdx = carta.categorias[catIdx].items.findIndex(
                      (i) => i.nombre === item.nombre && i.precio === item.precio
                    );
                    const estaEditando =
                      editando?.catIdx === catIdx && editando?.itemIdx === realItemIdx;

                    if (estaEditando) {
                      return (
                        <div key={item.nombre} className="px-4 py-3 space-y-2">
                          <input
                            placeholder="Nombre del plato"
                            value={formItem.nombre}
                            onChange={(e) =>
                              setFormItem((f) => ({ ...f, nombre: e.target.value }))
                            }
                            style={{ backgroundColor: "#0f172a", borderColor: "#f97316" }}
                            className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Precio €"
                              value={formItem.precio}
                              onChange={(e) =>
                                setFormItem((f) => ({ ...f, precio: e.target.value }))
                              }
                              style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                              className="w-28 rounded-lg px-3 py-2 text-white text-sm border outline-none"
                            />
                            <input
                              placeholder="Alérgenos"
                              value={formItem.alergenos}
                              onChange={(e) =>
                                setFormItem((f) => ({ ...f, alergenos: e.target.value }))
                              }
                              style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                              className="flex-1 rounded-lg px-3 py-2 text-white text-sm border outline-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={guardarItem}
                              disabled={guardando}
                              style={{ backgroundColor: "#16a34a" }}
                              className="px-4 py-1.5 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={cancelarEdicion}
                              style={{ backgroundColor: "#334155" }}
                              className="px-4 py-1.5 rounded-lg text-white text-sm hover:opacity-90"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.nombre + item.precio}
                        className="px-4 py-3 flex items-start gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{item.nombre}</p>
                          {item.alergenos && (
                            <p className="text-slate-500 text-xs mt-0.5 truncate">
                              ⚠ {item.alergenos}
                            </p>
                          )}
                        </div>
                        <span className="text-orange-400 font-semibold text-sm shrink-0">
                          {item.precio.toFixed(2)}€
                        </span>
                        {esAdmin && !editando && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => abrirEdicion(catIdx, realItemIdx)}
                              style={{ backgroundColor: "#334155" }}
                              className="px-2 py-1 rounded text-white text-xs hover:opacity-90"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => eliminarItem(catIdx, realItemIdx)}
                              style={{ backgroundColor: "#7f1d1d" }}
                              className="px-2 py-1 rounded text-white text-xs hover:opacity-90"
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Añadir plato en esta categoría */}
                {esAdmin && !editando && (
                  <div
                    style={{ borderTopColor: "#334155" }}
                    className="border-t px-4 py-2"
                  >
                    {editando?.catIdx === catIdx && editando?.itemIdx === "nuevo" ? null : (
                      <button
                        onClick={() => abrirEdicion(catIdx, "nuevo")}
                        className="text-orange-400 text-sm hover:text-orange-300 transition-colors"
                      >
                        + Añadir plato
                      </button>
                    )}
                  </div>
                )}

                {/* Formulario nuevo plato inline */}
                {editando?.catIdx === catIdx && editando?.itemIdx === "nuevo" && (
                  <div
                    style={{ borderTopColor: "#334155" }}
                    className="border-t px-4 py-3 space-y-2"
                  >
                    <p className="text-slate-400 text-xs font-semibold uppercase">
                      Nuevo plato
                    </p>
                    <input
                      placeholder="Nombre del plato"
                      value={formItem.nombre}
                      onChange={(e) =>
                        setFormItem((f) => ({ ...f, nombre: e.target.value }))
                      }
                      style={{ backgroundColor: "#0f172a", borderColor: "#f97316" }}
                      className="w-full rounded-lg px-3 py-2 text-white text-sm border outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Precio €"
                        value={formItem.precio}
                        onChange={(e) =>
                          setFormItem((f) => ({ ...f, precio: e.target.value }))
                        }
                        style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                        className="w-28 rounded-lg px-3 py-2 text-white text-sm border outline-none"
                      />
                      <input
                        placeholder="Alérgenos"
                        value={formItem.alergenos}
                        onChange={(e) =>
                          setFormItem((f) => ({ ...f, alergenos: e.target.value }))
                        }
                        style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                        className="flex-1 rounded-lg px-3 py-2 text-white text-sm border outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={guardarItem}
                        disabled={guardando}
                        style={{ backgroundColor: "#16a34a" }}
                        className="px-4 py-1.5 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        Añadir
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        style={{ backgroundColor: "#334155" }}
                        className="px-4 py-1.5 rounded-lg text-white text-sm hover:opacity-90"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
