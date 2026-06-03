import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/panel");
    } catch (err) {
      setError("Email o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e) {
    e.preventDefault();
    setResetMsg("");
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMsg("Enlace enviado. Revisa tu bandeja de entrada.");
    } catch {
      setResetMsg("No se pudo enviar el enlace. Verifica el email.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div
      style={{ backgroundColor: "#0f172a", minHeight: "100vh" }}
      className="flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: "#1e293b" }}
        className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-3xl font-bold text-white">CamareroAI</h1>
          <p className="text-slate-400 mt-1 text-sm">Panel de gestión</p>
        </div>

        {!showReset ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
                style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                className="w-full rounded-lg px-4 py-3 text-white border outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                className="w-full rounded-lg px-4 py-3 text-white border outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: "#f97316" }}
              className="w-full rounded-lg px-4 py-3 text-white font-semibold text-base hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50 mt-2"
            >
              {loading ? "Iniciando sesión..." : "Entrar"}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setShowReset(true); setResetEmail(email); setResetMsg(""); }}
                className="text-slate-400 text-sm hover:text-orange-400 transition-colors underline underline-offset-2"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Recuperar contraseña</h2>
              <p className="text-slate-400 text-sm">
                Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
              </p>
            </div>

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  placeholder="tu@email.com"
                  style={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                  className="w-full rounded-lg px-4 py-3 text-white border outline-none focus:border-orange-500 transition-colors"
                />
              </div>

              {resetMsg && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    resetMsg.includes("enviado")
                      ? "bg-green-900/30 border border-green-500/50 text-green-400"
                      : "bg-red-900/30 border border-red-500/50 text-red-400"
                  }`}
                >
                  {resetMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                style={{ backgroundColor: "#f97316" }}
                className="w-full rounded-lg px-4 py-3 text-white font-semibold text-base hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50"
              >
                {resetLoading ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="w-full text-slate-400 text-sm hover:text-white transition-colors pt-1"
            >
              ← Volver al login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
