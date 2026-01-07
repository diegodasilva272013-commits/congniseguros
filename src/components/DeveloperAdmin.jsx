import React, { useEffect, useState } from "react";
import { Shield, LogOut, KeyRound, Loader2 } from "lucide-react";
import AdminDashboard from "./AdminDashboard.jsx";

export default function DeveloperAdmin({ onExit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  const logout = () => {
    try {
      localStorage.removeItem("token");
    } catch {
      // ignore
    }
    setHasToken(false);
    setEmail("");
    setPassword("");
  };

  const login = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.status !== "success") {
        alert(data.message || "No se pudo iniciar sesión");
        return;
      }
      if (data.token) {
        try {
          localStorage.setItem("token", String(data.token));
        } catch {
          // ignore
        }
      }
      setHasToken(true);
      setPassword("");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (hasToken) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <div className="bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-xl">
                <Shield size={22} />
              </div>
              <div>
                <div className="font-black leading-none">Panel Admin (Desarrollador)</div>
                <div className="text-xs text-slate-300">Acceso por usuario admin</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={logout}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black flex items-center gap-2"
                type="button"
              >
                <LogOut size={16} /> Salir
              </button>
              <button
                onClick={onExit}
                className="px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-black hover:bg-slate-100"
                type="button"
              >
                Volver
              </button>
            </div>
          </div>
        </div>

        <AdminDashboard />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 border border-slate-800">
        <div className="text-center mb-8">
          <div className="mx-auto bg-blue-600 p-3 rounded-2xl w-fit mb-4">
            <KeyRound className="text-white" size={28} />
          </div>
          <div className="text-3xl font-black text-slate-900">Admin (Desarrollador)</div>
          <div className="text-slate-500 text-sm mt-2">Ingresá con tu usuario admin para gestionar licencias y accesos.</div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              type="email"
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu password"
              type="password"
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
            />
          </div>

          <button
            type="button"
            onClick={login}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg"
            disabled={loading || !String(email || "").trim() || !String(password || "").trim()}
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={18} /> Entrando...
              </span>
            ) : (
              "Ingresar"
            )}
          </button>

          <button
            type="button"
            onClick={onExit}
            className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-3 rounded-2xl"
          >
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
