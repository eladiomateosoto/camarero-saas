import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
        </form>
      </div>
    </div>
  );
}
