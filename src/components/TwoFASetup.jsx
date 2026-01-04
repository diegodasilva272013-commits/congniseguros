import React, { useState } from "react";
import { Loader2, Mail, Phone, Copy, Check } from "lucide-react";

export default function TwoFASetup({ userId, onSuccess }) {
  const [paso, setPaso] = useState(1); // 1: elegir tipo, 2: enviar, 3: verificar, 4: backup codes
  const [tipo, setTipo] = useState(null); // 'email' o 'sms'
  const [contacto, setContacto] = useState("");
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState([]);
  const [copiado, setCopiado] = useState(false);

  const handleSetupClick = async () => {
    if (!tipo || !contacto) {
      alert("Completa todos los campos");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aseguradora_id: userId,
          tipo,
          contacto,
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        setPaso(3);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyClick = async () => {
    if (!codigo) {
      alert("Ingresa el código");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/2fa/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aseguradora_id: userId,
          codigo,
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        setBackupCodes(data.backup_codes || []);
        setPaso(4);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-6">🔐 Configurar 2FA</h2>

      {paso === 1 && (
        <>
          <p className="text-gray-600 mb-6">Elige cómo quieres recibir códigos de verificación</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setTipo("email");
                setPaso(2);
              }}
              className="w-full p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-3"
            >
              <Mail size={24} className="text-blue-600" />
              <div className="text-left">
                <div className="font-bold">Email</div>
                <div className="text-sm text-gray-600">Recibir código por email</div>
              </div>
            </button>

            <button
              onClick={() => {
                setTipo("sms");
                setPaso(2);
              }}
              className="w-full p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 flex items-center gap-3"
            >
              <Phone size={24} className="text-green-600" />
              <div className="text-left">
                <div className="font-bold">SMS</div>
                <div className="text-sm text-gray-600">Recibir código por teléfono</div>
              </div>
            </button>
          </div>
        </>
      )}

      {paso === 2 && (
        <>
          <p className="text-gray-600 mb-4">Ingresa tu {tipo === "email" ? "email" : "teléfono"}</p>
          <input
            type={tipo === "email" ? "email" : "tel"}
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            placeholder={tipo === "email" ? "tu@email.com" : "+5491234567890"}
            className="w-full p-2 border border-gray-300 rounded mb-4"
          />
          <button
            onClick={handleSetupClick}
            disabled={loading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Enviar código
          </button>
        </>
      )}

      {paso === 3 && (
        <>
          <p className="text-gray-600 mb-4">Ingresa el código que recibiste</p>
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.slice(0, 6))}
            maxLength="6"
            placeholder="000000"
            className="w-full p-2 border border-gray-300 rounded mb-4 text-center text-lg tracking-widest"
          />
          <button
            onClick={handleVerifyClick}
            disabled={loading || codigo.length !== 6}
            className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Verificar
          </button>
        </>
      )}

      {paso === 4 && (
        <>
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p className="font-bold text-yellow-900 mb-2">⚠️ Códigos de respaldo</p>
            <p className="text-sm text-yellow-800 mb-3">
              Guarda estos códigos en un lugar seguro. Úsalos si pierdes acceso a tu método 2FA.
            </p>

            <div className="bg-white p-3 rounded border border-gray-200 mb-3 max-h-40 overflow-y-auto font-mono text-sm">
              {backupCodes.map((code, i) => (
                <div key={i}>{code}</div>
              ))}
            </div>

            <button
              onClick={copyToClipboard}
              className="w-full bg-gray-600 text-white p-2 rounded hover:bg-gray-700 flex items-center justify-center gap-2"
            >
              {copiado ? <Check size={16} /> : <Copy size={16} />}
              {copiado ? "Copiado" : "Copiar códigos"}
            </button>
          </div>

          <button
            onClick={() => {
              setPaso(1);
              setTipo(null);
              setContacto("");
              setCodigo("");
              setBackupCodes([]);
              if (onSuccess) onSuccess();
            }}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
          >
            ✅ Listo
          </button>
        </>
      )}
    </div>
  );
}
