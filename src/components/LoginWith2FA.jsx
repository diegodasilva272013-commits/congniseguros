import React, { useState } from "react";
import { Loader2, Mail, Smartphone } from "lucide-react";

export default function LoginWith2FA({ onLoginSuccess }) {
  const [paso, setPaso] = useState(1); // 1: email/password, 2: 2FA
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo2FA, setCodigo2FA] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [metodo2FA, setMetodo2FA] = useState(null); // 'email' o 'sms'

  const handleLoginStep1 = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.status === "success") {
        // Sin 2FA, login directo
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        onLoginSuccess(data.user);
      } else if (data.status === "2fa_required") {
        // 2FA activado
        setSessionToken(data.session_token);
        setMetodo2FA(data.method);
        setPaso(2);
      } else {
        setError(data.message || "Error en login");
      }
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginStep2 = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_token: sessionToken,
          codigo: codigo2FA,
        }),
      });

      const data = await res.json();

      if (data.status === "success") {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        onLoginSuccess(data.user);
      } else {
        setError(data.message || "Código inválido");
      }
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">🔐 Login</h2>

      {paso === 1 && (
        <form onSubmit={handleLoginStep1} className="space-y-4">
          {error && <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full p-2 border border-gray-300 rounded"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            required
            className="w-full p-2 border border-gray-300 rounded"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Ingresar
          </button>
        </form>
      )}

      {paso === 2 && (
        <form onSubmit={handleLoginStep2} className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-900">
              {metodo2FA === "email" && (
                <>
                  <Mail className="inline mr-2" size={16} />
                  Enviamos un código a tu email
                </>
              )}
              {metodo2FA === "sms" && (
                <>
                  <Smartphone className="inline mr-2" size={16} />
                  Enviamos un código a tu teléfono
                </>
              )}
            </p>
          </div>

          {error && <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>}

          <input
            type="text"
            value={codigo2FA}
            onChange={(e) => setCodigo2FA(e.target.value.slice(0, 6))}
            maxLength="6"
            placeholder="000000"
            className="w-full p-2 border border-gray-300 rounded text-center text-lg tracking-widest"
          />

          <div className="text-sm text-gray-600">
            <p>O ingresa un código de respaldo si tienes uno</p>
          </div>

          <button
            type="submit"
            disabled={loading || codigo2FA.length !== 6}
            className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Verificar
          </button>

          <button
            type="button"
            onClick={() => {
              setPaso(1);
              setError("");
            }}
            className="w-full text-blue-600 hover:underline"
          >
            Volver
          </button>
        </form>
      )}
    </div>
  );
}
