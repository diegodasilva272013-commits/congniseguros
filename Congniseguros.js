// ⚠️ ARCHIVO LEGACY.
// Fuente de verdad: src/App.jsx
// NO copiar/pegar este archivo sobre src/App.jsx.
// (Se mantiene solo como referencia/histórico y para scripts auxiliares.)

// App.jsx (FRONT COMPLETO) — SegurosPro ✅
// Cirugía aplicada (SIN tocar lo que funciona):
// 1) ELIMINADOS TODOS los botones "Llamar" (pero WhatsApp queda intacto)
// 2) En Portal Cliente > Grúa: agregado botón "Copiar número" (copia automático)
// 3) "Ver póliza" FIX real: abre PDF con Blob URL (evita pestaña vacía)
// 4) Asistente IA: ahora recibe también datos de la aseguradora (asegPerfil) para horarios/teléfono/etc
// 5) ✅ MIC FIX (SIN BACKEND): Persistencia de sesión + chat + vista para que si el navegador refresca
//    por permisos del micrófono, NO te vuelva al menú y NO pierdas el chat.
// 6) ✅ NUEVO: MENÚ "PAGOS" (front) + filtros + WhatsApp manual/auto + Monto en cliente (front)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Shield,
  Users,
  User,
  Building2,
  LogOut,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Download,
  MessageCircle,
  Loader2,
  X,
  Settings,
  Clock,
  Sparkles,
  ChevronLeft,
  Copy,
  Phone,
  Search,
  Send,
  FileText,
  RefreshCcw,
  Mic,
  Volume2,
  VolumeX,
  Mail,
  MapPin,
  DollarSign,
  Filter,
  Printer,
} from "lucide-react";

/* ================== CONFIG ================== */
const API_URL =
  "https://script.google.com/macros/s/AKfycbxQVq4hyugSoL8tnZDHqnllifiXqvnFPvi5SqMuqxet-wEmr4yz4Dgwt_LdFGEnthyDyA/exec";
const SUPPORT_PHONE = "59892064193";

// ✅ NUEVO: alias fijo
const PAGO_ALIAS = "PAGO.MP";

/* ================== HELPERS ================== */
const safeUpper = (v) => String(v || "").toUpperCase().trim();
const safeLower = (v) => String(v || "").toLowerCase().trim();
const normalizePhoneDigits = (p) => String(p || "").replace(/[^\d]/g, "");

// ✅ NUEVO: Persistencia (para sobrevivir refresh por permisos de mic)
const STORAGE_KEY = "segurospro_front_state_v1";
const MIC_KEY = "segurospro_mic_granted_v1";

const safeJsonParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const loadPersistedState = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? safeJsonParse(raw) : null;
  } catch {
    return null;
  }
};
const savePersistedState = (obj) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
};
const clearPersistedState = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
};

const formatDateForInput = (dateStr) => {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  if (str.includes("T")) return str.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return "";
};
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return "-";
  const s = String(dateStr).trim();
  const d = s.includes("T") ? s.split("T")[0] : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  }
  return d;
};

const calcDaysLeft = (fechaFinStr) => {
  if (!fechaFinStr) return null;
  const d = String(fechaFinStr).includes("T")
    ? String(fechaFinStr).split("T")[0]
    : String(fechaFinStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, m, dd] = d.split("-").map((n) => parseInt(n, 10));
  const fin = new Date(Date.UTC(y, m - 1, dd, 0, 0, 0));
  const hoy = new Date();
  const hoyUTC = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 0, 0, 0)
  );
  const diffMs = fin.getTime() - hoyUTC.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

const normalizePdfDataUrl = (value) => {
  if (!value) return "";
  const s = String(value).trim();

  if (s.startsWith("data:")) {
    if (!s.startsWith("data:application/pdf")) {
      const comma = s.indexOf(",");
      if (comma !== -1) {
        const b64 = s.slice(comma + 1);
        return "data:application/pdf;base64," + b64;
      }
    }
    return s;
  }

  const looksBase64 = /^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100;
  if (looksBase64) return "data:application/pdf;base64," + s.replace(/\s/g, "");
  return s;
};

const triggerDownloadPdf = (pdfDataUrl, name = "cliente") => {
  const url = normalizePdfDataUrl(pdfDataUrl);
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = `Poliza_${name}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ✅ PDF: FIX real (evita pestaña vacía) usando Blob URL cuando viene base64
const openPdfNewTab = (pdfDataUrl) => {
  const url = normalizePdfDataUrl(pdfDataUrl);
  if (!url) return alert("No hay PDF cargado");

  // URL normal
  if (/^https?:\/\//i.test(url)) {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) alert("El navegador bloqueó la pestaña. Permití popups para este sitio.");
    return;
  }

  // DataURL base64 -> BlobURL
  if (url.startsWith("data:application/pdf;base64,")) {
    try {
      const b64 = url.split(",")[1] || "";
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);

      const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!w) alert("El navegador bloqueó la pestaña. Permití popups para este sitio.");

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return;
    } catch (e) {
      alert("No se pudo abrir el PDF.");
      return;
    }
  }

  // fallback
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) alert("El navegador bloqueó la pestaña. Permití popups para este sitio.");
};

const openWhatsAppManual = (telefono, msg) => {
  const to = normalizePhoneDigits(telefono);
  if (!to) return alert("Teléfono inválido");
  window.open(
    `https://wa.me/${to}?text=${encodeURIComponent(msg)}`,
    "_blank",
    "noopener,noreferrer"
  );
};

// ⚠️ Se deja helper, pero NO se usa porque eliminamos los botones "Llamar"
const callPhone = (telefono) => {
  const to = normalizePhoneDigits(telefono);
  if (!to) return alert("Teléfono inválido");
  window.location.href = `tel:${to}`;
};

const openSupport = () => {
  const msg = "Hola, necesito ayuda con la configuración real de SegurosPro.";
  window.open(
    `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(msg)}`,
    "_blank",
    "noopener,noreferrer"
  );
};

async function request(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data?.status === "error") throw new Error(data.message || "Error");
  return data;
}

// ✅ NUEVO: normalizar monto (front)
const normalizeMonto = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  // acepta "1500", "1500.50", "1.500,50", etc.
  return s;
};

// ✅ NUEVO: determinar estado de pago (sin inventar)
const getPagoStatus = (c) => {
  // Si backend manda boolean
  const boolCandidates = [
    c?.cuota_al_dia,
    c?.pago_al_dia,
    c?.al_dia,
    c?.cuotaPagada,
    c?.cuota_pagada,
  ];
  for (const b of boolCandidates) {
    if (typeof b === "boolean") return b ? "AL_DIA" : "VENCIDA";
    if (b === 1 || b === "1") return "AL_DIA";
    if (b === 0 || b === "0") return "VENCIDA";
  }

  // Si backend manda string
  const strCandidates = [c?.cuota_estado, c?.pago_estado, c?.estado_pago, c?.estadoPago];
  for (const raw of strCandidates) {
    const s = String(raw || "").toLowerCase().trim();
    if (!s) continue;
    if (["al_dia", "aldia", "al día", "ok", "pagado", "pago", "paga", "paid"].includes(s))
      return "AL_DIA";
    if (
      ["vencida", "vencido", "moroso", "impago", "no_pagado", "no pago", "debe", "atrasado", "overdue"].includes(s)
    )
      return "VENCIDA";
  }

  return "SIN_DATO";
};

/* ================== UI ================== */
function BackButton({ show, onClick, dark = false }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed top-6 left-6 z-[9999] flex items-center gap-2 text-sm font-black px-3 py-2 rounded-xl shadow-lg border ${
        dark
          ? "bg-slate-900/80 text-slate-100 border-slate-700 hover:bg-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      <ChevronLeft size={18} />
      Volver
    </button>
  );
}

function Pill({ children, tone = "slate" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center px-3 py-1.5 text-[11px] font-black rounded-xl border ${cls}`}
    >
      {children}
    </span>
  );
}

function MenuBtn({ icon, label, onClick, active, badge }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 rounded-2xl border shadow-sm text-xs font-black hover:bg-slate-50 flex items-center justify-center gap-2 ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200"
      }`}
    >
      {icon} {label}
      {badge ? (
        <span
          className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${
            active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function FieldInput({ label, name, defaultValue, required = false, type = "text", step }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-black text-slate-600">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue}
        required={required}
        className="w-full px-4 py-2.5 border rounded-2xl outline-none"
      />
    </div>
  );
}

function DataLine({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-[11px] uppercase font-black text-slate-500">{label}</div>
      <div className="text-sm font-black text-slate-800 text-right break-all">{value || "-"}</div>
    </div>
  );
}

// ✅ Tarjeta “Ficha técnica” Aseguradora (vista bonita)
// (Se elimina botón LLAMAR según requerimiento actual)
function AseguradoraProfileCard({ perfil, onWhatsApp }) {
  const hasAny =
    !!(
      perfil?.nombre_comercial ||
      perfil?.telefono ||
      perfil?.email ||
      perfil?.direccion ||
      perfil?.horarios ||
      perfil?.logo_dataurl
    );

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Building2 size={18} /> Perfil de la empresa
          </div>
          <div className="text-sm text-slate-500">Ficha técnica (lo que ya tenés cargado).</div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={onWhatsApp}
            disabled={!perfil?.telefono}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-60"
          >
            <MessageCircle size={16} /> WhatsApp
          </button>
        </div>
      </div>

      <div className="p-6">
        {!hasAny ? (
          <div className="text-sm text-slate-500">
            Todavía no cargaste datos del perfil. Completalos abajo y guardá.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-4">
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                    {perfil?.logo_dataurl ? (
                      <img src={perfil.logo_dataurl} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <Building2 className="text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-black text-slate-900 truncate">
                      {perfil?.nombre_comercial || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {perfil?.horarios ? `Horarios: ${perfil.horarios}` : "Horarios: —"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-800">
                  <Phone size={16} className="text-slate-500" />
                  <span className="font-black">{perfil?.telefono || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-800">
                  <Mail size={16} className="text-slate-500" />
                  <span className="font-black break-all">{perfil?.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-800">
                  <MapPin size={16} className="text-slate-500" />
                  <span className="font-black">{perfil?.direccion || "—"}</span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
                  Tip: estos datos también se muestran en el Portal Cliente.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================== APP ================== */
export default function App() {
  const [rootView, setRootView] = useState("home"); // home | aseguradoras | clientes

  // Aseguradoras
  const [mode, setMode] = useState("auth"); // auth | dashboard
  const [authView, setAuthView] = useState("login"); // login | register
  // ✅ NUEVO: pagos
  const [menu, setMenu] = useState("cartera"); // cartera | vencimientos | pagos | config | marketing | perfil

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ message: "", type: "" });

  // ✅ NUEVO: “hydration” para restaurar estado antes de persistir
  const hydratedRef = useRef(false);

  const showMessage = (msg, type = "info") => {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    setStatusMsg({ message: text, type });
    setTimeout(() => {
      setStatusMsg((prev) => (prev.message === text ? { message: "", type: "" } : prev));
    }, 4500);
  };

  const Toast = useMemo(() => {
    if (!statusMsg.message) return null;
    const cls =
      statusMsg.type === "error"
        ? "bg-red-600"
        : statusMsg.type === "success"
        ? "bg-emerald-600"
        : "bg-blue-600";
    return (
      <div className={`fixed top-0 left-0 w-full z-[9999] text-center py-2 font-black text-white ${cls}`}>
        {statusMsg.message}
      </div>
    );
  }, [statusMsg]);

  // Auth
  const [user, setUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const authFormRef = useRef(null);

  // Data
  const [clients, setClients] = useState([]);

  // ✅ NUEVO: filtros pagos
  const [pagosFilter, setPagosFilter] = useState("ALL"); // ALL | AL_DIA | VENCIDA
  const [pagosSearch, setPagosSearch] = useState("");

  // Client modal (ABM)
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const clientFormRef = useRef(null);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);

  // Config WhatsApp
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaved, setCfgSaved] = useState(false);
  const [cfgPhoneId, setCfgPhoneId] = useState("");
  const [cfgToken, setCfgToken] = useState("");
  const [cfgHasPhone, setCfgHasPhone] = useState(false);
  const [cfgHasToken, setCfgHasToken] = useState(false);
  const [cfgSecretOpen, setCfgSecretOpen] = useState(false);

  // Marketing IA
  const [mkPrompt, setMkPrompt] = useState("");
  const [mkCopy, setMkCopy] = useState("");
  const [mkCopyLoading, setMkCopyLoading] = useState(false);
  const [mkImgLoading, setMkImgLoading] = useState(false);
  const [mkImage, setMkImage] = useState("");

  // PERFIL ASEGURADORA
  const [perfilLoading, setPerfilLoading] = useState(false);
  const [perfil, setPerfil] = useState({
    nombre_comercial: "",
    telefono: "",
    email: "",
    direccion: "",
    horarios: "",
    logo_dataurl: "",
  });
  const [perfilLogoFile, setPerfilLogoFile] = useState(null);

  // CLIENT PORTAL
  const [clienteDni, setClienteDni] = useState("");
  const [clienteLoading, setClienteLoading] = useState(false);
  const [clienteData, setClienteData] = useState(null);
  const [asegPerfil, setAsegPerfil] = useState(null);

  const [clienteChat, setClienteChat] = useState([]); // {role:"user"|"assistant", text:""}
  const [clienteMsg, setClienteMsg] = useState("");
  const chatBoxRef = useRef(null);

  // Voz (TTS) + Mic (SpeechRecognition)
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);

  // ✅ NUEVO: SpeechRecognition persistente (evita re-crear y reduce prompts)
  const recRef = useRef(null);

  const resetSession = () => {
    setMode("auth");
    setAuthView("login");
    setMenu("cartera");
    setUser(null);
    setClients([]);
  };

  const logout = () => {
    resetSession();
    clearPersistedState(); // ✅ NUEVO: si salen, limpiamos la persistencia general
    showMessage("Sesión cerrada.", "info");
  };

  const loadClients = async (aseguradoraId) => {
    if (!aseguradoraId) return;
    setLoading(true);
    try {
      const res = await request({ action: "getClients", aseguradora_id: aseguradoraId });
      const list = (res.data || []).map((c) => ({
        ...c,
        dias_left: calcDaysLeft(c.fecha_fin_str),
        monto: normalizeMonto(c.monto), // ✅ NUEVO
      }));
      setClients(list);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(authFormRef.current);
      const payload =
        authView === "login"
          ? { action: "login", email: fd.get("email"), password: fd.get("password") }
          : { action: "register", nombre: fd.get("nombre"), email: fd.get("email"), password: fd.get("password") };

      const res = await request(payload);

      if (authView === "login") {
        setUser(res.user);
        setMode("dashboard");
        setMenu("cartera");
        showMessage(`Bienvenido ${res.user.nombre}`, "success");
        await loadClients(res.user.id);
      } else {
        showMessage("Cuenta creada. Iniciá sesión.", "success");
        setAuthView("login");
      }
    } catch (e2) {
      showMessage(e2.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ABM client
  const openNewClient = () => {
    setEditingClient(null);
    setSelectedFile(null);
    setShowClientModal(true);
  };
  const openEditClient = (c) => {
    setEditingClient(c);
    setSelectedFile(null);
    setShowClientModal(true);
  };
  const closeClientModal = () => {
    setShowClientModal(false);
    setEditingClient(null);
    setSelectedFile(null);
  };

  const buildClientPayloadFromForm = () => {
    const fd = new FormData(clientFormRef.current);
    return {
      nombre: safeUpper(fd.get("nombre")),
      apellido: safeUpper(fd.get("apellido")),
      mail: safeLower(fd.get("mail")),
      telefono: String(fd.get("telefono") || "").trim(),
      documento: String(fd.get("documento") || "").trim(),
      // ✅ NUEVO: monto
      monto: String(fd.get("monto") || "").trim(),
      grua_nombre: safeUpper(fd.get("grua_nombre")),
      grua_telefono: String(fd.get("grua_telefono") || "").trim(),
      descripcion_seguro: String(fd.get("descripcion_seguro") || "").trim(),
      fecha_inicio_str: String(fd.get("fecha_inicio") || "").trim(),
      fecha_fin_str: String(fd.get("fecha_fin") || "").trim(),
    };
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    const base = buildClientPayloadFromForm();
    if (!base.nombre || !base.apellido || !base.mail || !base.telefono || !base.documento) {
      showMessage("Faltan campos obligatorios: nombre, apellido, email, teléfono, DNI.", "error");
      return;
    }

    setLoading(true);
    try {
      let polizasFinal = editingClient?.polizas || "";
      if (selectedFile) polizasFinal = await fileToBase64(selectedFile);

      if (editingClient?.id) {
        await request({
          action: "updateClient",
          aseguradora_id: user.id,
          id: String(editingClient.id),
          ...base,
          polizas: polizasFinal,
        });
        showMessage("Cliente actualizado.", "success");
      } else {
        await request({
          action: "addClient",
          aseguradora_id: user.id,
          ...base,
          polizas: polizasFinal,
        });
        showMessage("Cliente creado.", "success");
      }

      closeClientModal();
      await loadClients(user.id);
    } catch (e2) {
      showMessage(e2.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (c) => {
    setClientToDelete(c);
    setDeleteModalOpen(true);
  };
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setClientToDelete(null);
  };
  const confirmDelete = async () => {
    if (!clientToDelete?.id) return;
    setLoading(true);
    try {
      await request({
        action: "deleteClient",
        aseguradora_id: user.id,
        id: String(clientToDelete.id),
      });
      showMessage("Cliente eliminado.", "success");
      closeDeleteModal();
      await loadClients(user.id);
    } catch (e) {
      showMessage("No se pudo eliminar: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Remove PDF (edit only)
  const handleRemovePdf = async () => {
    if (!editingClient?.id) return;
    if (!window.confirm("¿Eliminar la póliza PDF de este cliente?")) return;

    setLoading(true);
    try {
      await request({
        action: "updateClient",
        aseguradora_id: user.id,
        id: String(editingClient.id),
        nombre: editingClient.nombre,
        apellido: editingClient.apellido,
        mail: editingClient.mail,
        telefono: editingClient.telefono,
        documento: editingClient.documento,
        // ✅ NUEVO
        monto: editingClient.monto || "",
        grua_nombre: editingClient.grua_nombre || "",
        grua_telefono: editingClient.grua_telefono || "",
        descripcion_seguro: editingClient.descripcion_seguro || "",
        fecha_inicio_str: editingClient.fecha_inicio_str || "",
        fecha_fin_str: editingClient.fecha_fin_str || "",
        polizas: "",
      });
      showMessage("Póliza eliminada.", "success");
      closeClientModal();
      await loadClients(user.id);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Vencimientos <=7
  const vencimientos = useMemo(() => {
    return (clients || []).filter((c) => typeof c.dias_left === "number" && c.dias_left <= 7);
  }, [clients]);

  // ✅ NUEVO: lista pagos con filtros + búsqueda (sin romper nada)
  const pagosList = useMemo(() => {
    const q = String(pagosSearch || "").toLowerCase().trim();
    let list = [...(clients || [])];

    if (pagosFilter === "AL_DIA") list = list.filter((c) => getPagoStatus(c) === "AL_DIA");
    if (pagosFilter === "VENCIDA") list = list.filter((c) => getPagoStatus(c) === "VENCIDA");

    if (q) {
      list = list.filter((c) => {
        const blob = `${c.nombre || ""} ${c.apellido || ""} ${c.documento || ""} ${c.telefono || ""} ${c.mail || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }, [clients, pagosFilter, pagosSearch]);

  const pagosCountVencida = useMemo(() => {
    return (clients || []).filter((c) => getPagoStatus(c) === "VENCIDA").length;
  }, [clients]);

  // WhatsApp auto (vencimientos)
  const sendWhatsAppAuto = async (c) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await request({
        action: "sendWhatsAppVencimiento",
        aseguradora_id: user.id,
        telefono: c.telefono,
        nombre: c.nombre,
        apellido: c.apellido,
        fecha_fin_str: c.fecha_fin_str || "",
        dias_restantes: c.dias_left ?? "",
      });
      showMessage("WhatsApp enviado al cliente.", "success");
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsAppManual = (c) => {
    const dias = c.dias_left ?? "";
    const msg =
      `Hola ${c.nombre} ${c.apellido} su seguro esta por vencer. ` +
      `Por favor contactanos para no quedarse si cobertura. ` +
      `Le quedan ${dias || "pocos"} dia(s) para quedar sin cobertura. Saludos`;
    openWhatsAppManual(c.telefono, msg);
  };

  // ✅ NUEVO: WhatsApp pagos (manual + auto)
  const buildPagoMsg = (c) => {
    const monto = normalizeMonto(c.monto);
    const montoTxt = monto ? `Monto: ${monto}. ` : "";
    return (
      `Hola ${c.nombre} ${c.apellido}, su cuota ha vencido. ` +
      montoTxt +
      `Alias: ${PAGO_ALIAS}. ` +
      `Por favor regularice para ponerse al día.`
    );
  };

  const sendWhatsAppPagoManual = (c) => {
    openWhatsAppManual(c.telefono, buildPagoMsg(c));
  };

  const sendWhatsAppPagoAuto = async (c) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // ⚠️ Backend ya lo tenés: acción esperada "sendWhatsAppPago"
      await request({
        action: "sendWhatsAppPago",
        aseguradora_id: user.id,
        telefono: c.telefono,
        nombre: c.nombre,
        apellido: c.apellido,
        monto: normalizeMonto(c.monto) || "",
        alias: PAGO_ALIAS,
      });
      showMessage("WhatsApp de pago enviado.", "success");
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Config WhatsApp (safe)
  const loadConfig = async () => {
    if (!user?.id) return;
    setCfgLoading(true);
    setCfgSaved(false);
    try {
      const res = await request({
        action: "getConfig",
        scope: "ASEGURADORA",
        scope_id: user.id,
      });
      const cfg = res.data || {};
      setCfgPhoneId(cfg.wpp_phone_number_id_masked || "");
      setCfgToken(cfg.wpp_access_token_masked || "");
      setCfgHasPhone(!!cfg.wpp_has_phone_number_id);
      setCfgHasToken(!!cfg.wpp_has_access_token);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setCfgLoading(false);
    }
  };

  const saveConfig = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    const looksMasked = (v) => String(v || "").includes("••••••••") || String(v || "").includes("*");
    const phoneToSend = looksMasked(cfgPhoneId) ? "" : String(cfgPhoneId || "").trim();
    const tokenToSend = looksMasked(cfgToken) ? "" : String(cfgToken || "").trim();

    setCfgLoading(true);
    try {
      await request({
        action: "saveConfig",
        scope: "ASEGURADORA",
        scope_id: user.id,
        wpp_phone_number_id: phoneToSend,
        wpp_access_token: tokenToSend,
      });
      setCfgSaved(true);
      showMessage("Configuración guardada.", "success");
      await loadConfig();
    } catch (e2) {
      showMessage(e2.message, "error");
    } finally {
      setCfgLoading(false);
    }
  };

  // PERFIL ASEGURADORA
  const loadPerfil = async () => {
    if (!user?.id) return;
    setPerfilLoading(true);
    try {
      const res = await request({ action: "getAseguradoraPerfil", aseguradora_id: user.id });
      const d = res.data || {};
      setPerfil({
        nombre_comercial: d.nombre_comercial || "",
        telefono: d.telefono || "",
        email: d.email || "",
        direccion: d.direccion || "",
        horarios: d.horarios || "",
        logo_dataurl: d.logo_dataurl || "",
      });
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setPerfilLoading(false);
    }
  };

  const savePerfil = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    setPerfilLoading(true);
    try {
      let logo_dataurl = perfil.logo_dataurl || "";
      if (perfilLogoFile) {
        logo_dataurl = await fileToBase64(perfilLogoFile);
      }

      await request({
        action: "saveAseguradoraPerfil",
        aseguradora_id: user.id,
        nombre_comercial: perfil.nombre_comercial,
        telefono: perfil.telefono,
        email: perfil.email,
        direccion: perfil.direccion,
        horarios: perfil.horarios,
        logo_dataurl,
      });

      showMessage("Perfil guardado.", "success");
      setPerfilLogoFile(null);
      await loadPerfil();
    } catch (e2) {
      showMessage(e2.message, "error");
    } finally {
      setPerfilLoading(false);
    }
  };

  // Marketing IA
  const sanitizeToSingle = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    const m = s.match(/1\)\s*([\s\S]*?)(?:\n2\)|$)/);
    if (m && m[1]) return m[1].trim();
    return s.replace(/^\s*(?:1\)|-|\*)\s*/m, "").trim();
  };

  const generateCopy = async () => {
    const p = String(mkPrompt || "").trim();
    if (!p) return showMessage("Escribí una idea base para el anuncio.", "error");
    setMkCopyLoading(true);
    try {
      const promptFinal =
        `Escribí UN SOLO texto publicitario profesional para seguros (autos/vida) en español rioplatense neutro, ` +
        `sin emojis, listo para copiar y pegar en WhatsApp. ` +
        `Debe tener: inicio atractivo, explicación breve, y un llamado a la acción claro. ` +
        `No escribas las palabras "hook", "cuerpo" ni "CTA". ` +
        `Base del anuncio: ${p}`;

      const res = await request({ action: "generateAdCopy", prompt: promptFinal });
      const out = sanitizeToSingle(res.copy || "");
      setMkCopy(out);
      showMessage("Copy generado.", "success");
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setMkCopyLoading(false);
    }
  };

  const generateImage = async () => {
    const base = String(mkPrompt || "").trim();
    if (!base) return showMessage("Escribí la idea del anuncio antes de generar imagen.", "error");
    setMkImgLoading(true);
    try {
      const res = await request({
        action: "generateAdImageOpenAI",
        prompt: `Anuncio para seguros. Concepto: ${base}. Estilo corporativo, limpio, profesional. Sin texto en la imagen.`,
      });
      setMkImage(res.image || "");
      showMessage("Imagen generada.", "success");
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setMkImgLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      showMessage("Copiado.", "success");
    } catch {
      showMessage("No se pudo copiar.", "error");
    }
  };

  // ===== CLIENT PORTAL =====
  const clienteLogin = async () => {
    const dni = String(clienteDni || "").trim();
    if (!dni) return showMessage("Ingresá tu DNI.", "error");
    setClienteLoading(true);
    try {
      const res = await request({ action: "getClients", aseguradora_id: "ALL" });
      const list = res.data || [];
      const found = list.find(
        (c) => String(c.documento || "").replace(/[^\d]/g, "") === dni.replace(/[^\d]/g, "")
      );

      if (!found) {
        setClienteData(null);
        setAsegPerfil(null);
        showMessage("No encontramos un cliente con ese DNI.", "error");
      } else {
        const full = {
          ...found,
          dias_left: calcDaysLeft(found.fecha_fin_str),
          monto: normalizeMonto(found.monto), // ✅ NUEVO
        };
        setClienteData({
          ...full,
          grua_telefono: full.grua_telefono || SUPPORT_PHONE, // Default to support phone if no grua phone
        });

        // Perfil aseguradora
        try {
          const asegId =
            full.aseguradora_id || full.aseguradoraId || full.aseguradora || full.aseguradoraID;
          if (asegId) {
            const pr = await request({
              action: "getAseguradoraPerfil",
              aseguradora_id: String(asegId),
            });
            setAsegPerfil(pr.data || null);
          } else {
            setAsegPerfil(null);
          }
        } catch (e) {
          setAsegPerfil(null);
          showMessage(e.message, "error");
        }

        // saludo inicial
        setClienteChat([
          {
            role: "assistant",
            text: `Hola ${full.nombre}. ¿Cómo estás? Soy tu asistente. Decime en qué puedo ayudarte con tu póliza o cobertura.`,
          },
        ]);
        setClienteMsg("");
        showMessage(`Bienvenido ${full.nombre} ${full.apellido}`, "success");
      }
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setClienteLoading(false);
    }
  };

  const clienteLogout = () => {
    setClienteData(null);
    setAsegPerfil(null);
    setClienteChat([]);
    setClienteMsg("");
    setClienteDni("");
    clearPersistedState(); // ✅ NUEVO: al cerrar cliente, limpiamos persistencia
    showMessage("Sesión de cliente cerrada.", "info");
  };

  const speak = (text) => {
    try {
      if (!voiceOn) return;
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text || ""));
      u.rate = 1;
      u.pitch = 1;
      u.lang = "es-ES";
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const scrollChatToBottom = () => {
    setTimeout(() => {
      if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }, 50);
  };

  const clienteSend = async () => {
    if (!clienteData) return;
    const q = String(clienteMsg || "").trim();
    if (!q) return;

    setClienteChat((prev) => [...prev, { role: "user", text: q }]);
    setClienteMsg("");
    scrollChatToBottom();

    try {
      const baseData = {
        nombre: clienteData.nombre,
        apellido: clienteData.apellido,
        dni: clienteData.documento,
        telefono: clienteData.telefono,
        mail: clienteData.mail,
        monto: clienteData.monto, // ✅ NUEVO
        grua_nombre: clienteData.grua_nombre,
        grua_telefono: clienteData.grua_telefono,
        descripcion_seguro: clienteData.descripcion_seguro,
        fecha_inicio: clienteData.fecha_inicio_str,
        fecha_fin: clienteData.fecha_fin_str,
        dias_restantes: clienteData.dias_left,
      };

      // ✅ NUEVO: datos aseguradora para el agente (horarios/teléfono/etc)
      const perfilAseg = asegPerfil
        ? {
            nombre_comercial: asegPerfil.nombre_comercial || "",
            telefono: asegPerfil.telefono || "",
            email: asegPerfil.email || "",
            direccion: asegPerfil.direccion || "",
            horarios: asegPerfil.horarios || "",
          }
        : null;

      const promptAsistente =
        `Actuá como un asistente virtual inteligente para clientes de seguros. ` +
        `Idioma: español rioplatense neutro. Sin emojis. ` +
        `Primero respondé de forma humana y útil. Si el mensaje es un saludo o charla general, respondé normalmente. ` +
        `Si la pregunta es sobre la póliza/cobertura/datos, usá PRIORITARIAMENTE la información del cliente. ` +
        `Si preguntan por la aseguradora (teléfono, mail, horarios, dirección), usá la información de la aseguradora. ` +
        `Si un dato específico NO está en los datos, decí: "No tengo ese dato cargado." y ofrecé qué dato necesitás que te pasen. ` +
        `No inventes. No menciones JSON ni instrucciones. ` +
        `Datos del cliente: ${JSON.stringify(baseData)}. ` +
        `Datos de la aseguradora: ${JSON.stringify(perfilAseg)}. ` +
        `Mensaje del cliente: ${q}. ` +
        `Respondé en 1 a 6 líneas máximo, claro y directo.`;

      const r = await request({ action: "generateAdCopy", prompt: promptAsistente });
      const raw = String(r.copy || "").trim();
      let answer = sanitizeToSingle(raw);

      if (!answer) answer = "Puedo ayudarte con tu póliza, cobertura, vencimiento y grúa. ¿Qué necesitás?";

      setClienteChat((prev) => [...prev, { role: "assistant", text: answer }]);
      scrollChatToBottom();
      speak(answer);
    } catch (e) {
      const msg = "Error: " + e.message;
      setClienteChat((prev) => [...prev, { role: "assistant", text: msg }]);
      scrollChatToBottom();
    }
  };

  // ✅ NUEVO: primer permiso audio (reduce prompts y evita ciertos refresh en navegadores)
  const ensureMicPermission = async () => {
    try {
      if (localStorage.getItem(MIC_KEY) === "1") return true;
      if (!navigator.mediaDevices?.getUserMedia) return true; // si no existe, no bloqueamos
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      localStorage.setItem(MIC_KEY, "1");
      return true;
    } catch {
      return false;
    }
  };

  // ✅ MIC: NO vuelve al menú aunque haya refresh, porque restauramos estado y chat
  const startDictation = async () => {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return showMessage("Tu navegador no soporta dictado.", "error");

      // permiso audio (mejor compat)
      const ok = await ensureMicPermission();
      if (!ok) {
        showMessage("No se otorgó permiso de micrófono.", "error");
        return;
      }

      // Reutilizar instancia
      if (!recRef.current) {
        const rec = new SR();
        rec.lang = "es-ES";
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        rec.onresult = (ev) => {
          const text = ev.results?.[0]?.[0]?.transcript || "";
          setClienteMsg((prev) => (prev ? prev + " " + text : text));
        };
        rec.onerror = () => {
          setListening(false);
        };
        rec.onend = () => {
          setListening(false);
        };

        recRef.current = rec;
      }

      // Start
      setListening(true);
      try {
        recRef.current.start();
      } catch {
        // si ya estaba arrancado o quedó colgado, intentamos reset básico
        try {
          recRef.current.stop();
        } catch {}
        try {
          recRef.current.start();
        } catch {
          setListening(false);
          showMessage("No se pudo iniciar el dictado.", "error");
        }
      }
    } catch {
      showMessage("No se pudo iniciar el dictado.", "error");
      setListening(false);
    }
  };

  // ✅ NUEVO: Restaurar estado si el navegador refresca (por permisos / iOS / etc)
  useEffect(() => {
    const st = loadPersistedState();
    if (st) {
      if (st.rootView) setRootView(st.rootView);
      if (st.mode) setMode(st.mode);
      if (st.authView) setAuthView(st.authView);
      if (st.menu) setMenu(st.menu);

      if (typeof st.voiceOn === "boolean") setVoiceOn(st.voiceOn);

      if (typeof st.clienteDni === "string") setClienteDni(st.clienteDni);
      if (st.clienteData) setClienteData(st.clienteData);
      if (st.asegPerfil) setAsegPerfil(st.asegPerfil);
      if (Array.isArray(st.clienteChat)) setClienteChat(st.clienteChat);
      if (typeof st.clienteMsg === "string") setClienteMsg(st.clienteMsg);

      // ✅ NUEVO: filtros pagos
      if (typeof st.pagosFilter === "string") setPagosFilter(st.pagosFilter);
      if (typeof st.pagosSearch === "string") setPagosSearch(st.pagosSearch);
    }

    hydratedRef.current = true;
  }, []);

  // ✅ NUEVO: Persistir estado mínimo (solo front) para sobrevivir refresh del navegador
  useEffect(() => {
    if (!hydratedRef.current) return;
    savePersistedState({
      rootView,
      mode,
      authView,
      menu,
      voiceOn,

      clienteDni,
      clienteData,
      asegPerfil,
      clienteChat,
      clienteMsg,

      // ✅ NUEVO: pagos
      pagosFilter,
      pagosSearch,
    });
  }, [
    rootView,
    mode,
    authView,
    menu,
    voiceOn,
    clienteDni,
    clienteData,
    asegPerfil,
    clienteChat,
    clienteMsg,
    pagosFilter,
    pagosSearch,
  ]);

  // auto-load
  useEffect(() => {
    if (mode === "dashboard" && user?.id) loadClients(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  useEffect(() => {
    if (mode === "dashboard" && menu === "config") loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, mode]);

  useEffect(() => {
    if (mode === "dashboard" && menu === "perfil") loadPerfil();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, mode]);

  /* ================== HOME ================== */
  if (rootView === "home") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        {Toast}
        <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-800 p-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="bg-blue-600 p-3 rounded-2xl">
              <Shield size={26} className="text-white" />
            </div>
            <div className="text-3xl font-black text-slate-900">SegurosPro</div>
          </div>

          <div className="text-center text-slate-500 mb-10">Elegí el panel que querés usar.</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button
              onClick={() => setRootView("aseguradoras")}
              className="p-8 rounded-3xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Building2 className="text-blue-600" />
                <div className="text-xl font-black text-slate-900">Aseguradoras</div>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Login, cartera completa, vencimientos, pagos, WhatsApp y marketing IA.
              </div>
            </button>

            <button
              onClick={() => {
                resetClientPortalState();
                setRootView("clientes");
              }}
              className="p-8 rounded-3xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left shadow-sm"
            >
              <div className="flex items-center gap-3">
                <User className="text-emerald-600" />
                <div className="text-xl font-black text-slate-900">Clientes</div>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Ingreso por DNI, ver datos completos, grúa, póliza y asistente IA.
              </div>
            </button>
          </div>

          <div className="mt-10 flex items-center justify-between">
            <div className="text-xs text-slate-400">Backend por Google Apps Script (sin keys en el front).</div>
            <button
              onClick={openSupport}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
            >
              <MessageCircle size={16} /> Contactar soporte
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ================== CLIENTES PORTAL ================== */
  if (rootView === "clientes") {
    return (
      <div className="min-h-screen bg-slate-900 p-6 font-sans">
        {Toast}
        <BackButton show onClick={() => setRootView("home")} dark />

        <div className="max-w-5xl mx-auto">
          {!clienteData ? (
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-800 p-10">
              <div className="text-center mb-8">
                <User className="mx-auto text-emerald-600 mb-4" size={52} />
                <div className="text-3xl font-black text-slate-900">Portal Cliente</div>
                <div className="text-slate-500 mt-2">Ingresá con tu DNI para ver tu seguro y descargar tu póliza.</div>
              </div>

              <div className="max-w-md mx-auto space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700">DNI</label>
                  <input
                    value={clienteDni}
                    onChange={(e) => setClienteDni(e.target.value)}
                    placeholder="Ej: 12345678"
                    className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={clienteLogin}
                  disabled={clienteLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {clienteLoading ? <Loader2 className="animate-spin" /> : <Search size={18} />}
                  Ingresar
                </button>

                <button
                  type="button"
                  onClick={openSupport}
                  className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-2xl shadow flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} /> Contactar soporte
                </button>

                <div className="text-xs text-slate-400 text-center mt-3">
                  Si tu DNI no aparece, pedile a tu aseguradora que te cargue en la cartera.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="text-2xl font-black text-slate-900">
                    {clienteData.nombre} {clienteData.apellido}
                  </div>
                  <div className="text-sm text-slate-500">
                    DNI: <span className="font-black">{clienteData.documento}</span> — Tel:{" "}
                    <span className="font-black">{clienteData.telefono}</span>
                    {clienteData.monto ? (
                      <>
                        {" "}
                        — Cuota: <span className="font-black">{clienteData.monto}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => triggerDownloadPdf(clienteData.polizas, clienteData.documento || "cliente")}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 flex items-center gap-2"
                    disabled={!clienteData.polizas}
                  >
                    <Download size={16} /> Descargar póliza
                  </button>

                  <button
                    onClick={() => openPdfNewTab(clienteData.polizas)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 flex items-center gap-2"
                    disabled={!clienteData.polizas}
                  >
                    <Eye size={16} /> Ver póliza
                  </button>

                  <button
                    onClick={clienteLogout}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
                  >
                    <LogOut size={16} /> Salir
                  </button>
                </div>
              </div>

              {/* Data cards */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <Clock size={18} /> Vigencia
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    <div>
                      Inicio: <span className="font-black">{formatDateDisplay(clienteData.fecha_inicio_str)}</span>
                    </div>
                    <div className="mt-1">
                      Fin: <span className="font-black">{formatDateDisplay(clienteData.fecha_fin_str)}</span>
                    </div>
                    <div className="mt-3">
                      {typeof clienteData.dias_left === "number" ? (
                        <Pill tone={clienteData.dias_left <= 7 ? "amber" : "blue"}>
                          Quedan {clienteData.dias_left} día(s)
                        </Pill>
                      ) : (
                        <Pill>Sin fecha fin cargada</Pill>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <Phone size={18} /> Grúa
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    <div>
                      Empresa: <span className="font-black">{clienteData.grua_nombre || "-"}</span>
                    </div>
                    <div className="mt-1">
                      Tel: <span className="font-black">{clienteData.grua_telefono || "-"}</span>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        onClick={() =>
                          openWhatsAppManual(
                            clienteData.grua_telefono,
                            `Hola, necesito asistencia de grúa. Soy ${clienteData.nombre} ${clienteData.apellido}.`
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 flex items-center gap-2"
                        disabled={!clienteData.grua_telefono}
                      >
                        <MessageCircle size={16} /> WhatsApp grúa
                      </button>

                      {/* ✅ NUEVO: COPIAR NÚMERO (se pidió) */}
                      <button
                        onClick={() => copyToClipboard(clienteData.grua_telefono)}
                        className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-black flex items-center gap-2"
                        disabled={!clienteData.grua_telefono}
                      >
                        <Copy size={16} /> Copiar número
                      </button>

                      {/* ✅ NUEVO: LLAMAR GRÚA (abre discador telefónico) */}
                      <a
                        href={`tel:${clienteData.grua_telefono || '59892064193'}`}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-black flex items-center gap-2"
                        style={{ textDecoration: "none" }}
                      >
                        <Phone size={16} /> Llamar grúa
                      </a>

                      {/* ❌ Eliminado botón LLAMAR */}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <FileText size={18} /> Cobertura
                  </div>
                  <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {clienteData.descripcion_seguro || "Sin detalle cargado."}
                  </div>
                </div>

                {/* Ficha técnica aseguradora (portal cliente) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <Building2 size={18} /> Aseguradora
                  </div>

                  <div className="mt-3 text-sm text-slate-700">
                    {asegPerfil ? (
                      <>
                        {asegPerfil.logo_dataurl ? (
                          <div className="mb-3">
                            <img
                              src={asegPerfil.logo_dataurl}
                              alt="Logo"
                              className="h-14 w-14 object-contain rounded-xl"
                            />
                          </div>
                        ) : null}

                        <div>
                          Nombre: <span className="font-black">{asegPerfil.nombre_comercial || "-"}</span>
                        </div>
                        <div className="mt-1">
                          Tel: <span className="font-black">{asegPerfil.telefono || "-"}</span>
                        </div>
                        <div className="mt-1">
                          Mail: <span className="font-black">{asegPerfil.email || "-"}</span>
                        </div>
                        <div className="mt-1">
                          Dirección: <span className="font-black">{asegPerfil.direccion || "-"}</span>
                        </div>
                        <div className="mt-1">
                          Horarios: <span className="font-black">{asegPerfil.horarios || "-"}</span>
                        </div>

                        <div className="mt-4 flex gap-2 flex-wrap">
                          {/* ❌ Eliminado botón LLAMAR */}
                          <button
                            onClick={() =>
                              openWhatsAppManual(asegPerfil.telefono, "Hola, necesito ayuda con mi póliza.")
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 flex items-center gap-2"
                            disabled={!asegPerfil.telefono}
                          >
                            <MessageCircle size={16} /> WhatsApp
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-slate-500">Sin datos de aseguradora cargados.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Assistant */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <Sparkles size={18} /> Asistente IA (OpenAI)
                    </div>
                    <div className="text-sm text-slate-500">Responde como agente real y usa tus datos primero.</div>
                  </div>

                  <div className="flex gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => setVoiceOn((v) => !v)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black flex items-center gap-2"
                      title="Voz"
                    >
                      {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                      Voz
                    </button>

                    <button
                      onClick={openSupport}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
                    >
                      <MessageCircle size={16} /> Soporte
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <div
                    ref={chatBoxRef}
                    className="h-[360px] sm:h-[420px] overflow-y-auto border-t border-slate-100 bg-slate-50 p-4"
                    style={{ paddingBottom: "92px" }}
                  >
                    <div className="space-y-3">
                      {clienteChat.map((m, idx) => (
                        <div
                          key={idx}
                          className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                            m.role === "user"
                              ? "ml-auto bg-blue-600 text-white"
                              : "mr-auto bg-white border border-slate-200 text-slate-700"
                          }`}
                        >
                          {m.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3">
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={startDictation}
                        className={`px-3 py-3 rounded-2xl border font-black text-xs flex items-center gap-2 ${
                          listening
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                        title="Dictado"
                        type="button"
                      >
                        <Mic size={16} />
                      </button>

                      <input
                        value={clienteMsg}
                        onChange={(e) => setClienteMsg(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            clienteSend();
                          }
                        }}
                        placeholder="Escribí tu consulta..."
                        className="flex-1 px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                      />

                      <button
                        onClick={clienteSend}
                        className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 flex items-center gap-2"
                        type="button"
                      >
                        <Send size={16} /> Enviar
                      </button>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-500">
                      Conectado a OpenAI por backend. Si falta un dato de tu póliza, te lo va a decir.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ================== ASEGURADORAS AUTH ================== */
  if (rootView === "aseguradoras" && mode === "auth") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        {Toast}
        <BackButton show onClick={() => setRootView("home")} dark />

        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 border border-slate-800">
          <div className="text-center mb-8">
            <Shield className="mx-auto text-blue-600 mb-4" size={52} />
            <h1 className="text-3xl font-black text-slate-900">SegurosPro</h1>
            <p className="text-slate-500 text-sm mt-1">Panel Aseguradora</p>
          </div>

          <div className="flex p-1 bg-slate-100 rounded-xl mb-8">
            <button
              onClick={() => setAuthView("login")}
              className={`flex-1 py-3 text-sm font-black rounded-lg ${
                authView === "login" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setAuthView("register")}
              className={`flex-1 py-3 text-sm font-black rounded-lg ${
                authView === "register" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
              }`}
            >
              Registrarse
            </button>
          </div>

          <form ref={authFormRef} onSubmit={handleAuth} className="space-y-5">
            {authView === "register" && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-700">Empresa</label>
                <input
                  name="nombre"
                  required
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700">Email</label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700">Contraseña</label>
              <input
                name="password"
                type="password"
                required
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg mt-2 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" /> : null}
              {authView === "login" ? "Ingresar" : "Crear cuenta"}
            </button>

            <button
              type="button"
              onClick={openSupport}
              className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-2xl shadow flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} /> Contactar soporte
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ================== ASEGURADORAS DASHBOARD ================== */
  if (rootView === "aseguradoras" && mode === "dashboard") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        {Toast}
        <BackButton
          show
          onClick={() => {
            logout();
            setRootView("home");
          }}
        />

        {/* TOP BAR */}
        <div className="bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-xl">
                <Shield size={22} />
              </div>
              <div>
                <div className="font-black leading-none">SegurosPro</div>
                <div className="text-xs text-slate-400">Panel Aseguradora</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-black">{user?.nombre}</div>
                <div className="text-[11px] text-slate-400">{user?.email}</div>
              </div>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-black flex items-center gap-2"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black flex items-center gap-2"
              >
                <LogOut size={16} /> Salir
              </button>
            </div>
          </div>
        </div>

        {/* MENU */}
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <div className="grid grid-cols-2 sm:flex gap-3">
            <MenuBtn
              active={menu === "cartera"}
              icon={<Users size={16} />}
              label="Cartera"
              onClick={() => setMenu("cartera")}
            />
            <MenuBtn
              active={menu === "vencimientos"}
              icon={<Clock size={16} />}
              label="Vencimientos"
              onClick={() => setMenu("vencimientos")}
              badge={vencimientos.length ? String(vencimientos.length) : ""}
            />
            {/* ✅ NUEVO: PAGOS */}
            <MenuBtn
              active={menu === "pagos"}
              icon={<DollarSign size={16} />}
              label="Pagos"
              onClick={() => setMenu("pagos")}
              badge={pagosCountVencida ? String(pagosCountVencida) : ""}
            />
            <MenuBtn
              active={menu === "config"}
              icon={<Settings size={16} />}
              label="Config WhatsApp"
              onClick={() => setMenu("config")}
            />
            <MenuBtn
              active={menu === "marketing"}
              icon={<Sparkles size={16} />}
              label="Marketing IA"
              onClick={() => setMenu("marketing")}
            />
            <MenuBtn
              active={menu === "perfil"}
              icon={<Building2 size={16} />}
              label="Perfil"
              onClick={() => setMenu("perfil")}
            />

            <button
              onClick={openSupport}
              className="col-span-2 sm:col-span-1 px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-black hover:bg-slate-50 flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> Soporte
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <main className="max-w-7xl mx-auto p-6">
          {/* CARTERA */}
          {menu === "cartera" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2">
                  <Users size={22} /> Cartera (tabla completa)
                </h2>

                <div className="flex gap-3 flex-wrap justify-end">
                  <button
                    onClick={() => loadClients(user.id)}
                    className="px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-black hover:bg-slate-50 flex items-center gap-2"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                    Actualizar
                  </button>

                  <button
                    onClick={openNewClient}
                    className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black shadow-lg hover:bg-black flex items-center gap-2"
                  >
                    <Plus size={16} /> Nuevo cliente
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Pill>Tip: en móvil podés scrollear horizontal la tabla</Pill>
                <Pill tone="blue">Se muestran TODOS los campos</Pill>
                <Pill tone="green">Incluye Monto</Pill>
              </div>

              <ClientsTableFull
                clients={clients}
                loading={loading}
                showWhatsApp={false}
                showMonto
                onEdit={openEditClient}
                onDelete={openDeleteModal}
              />
            </>
          )}

          {/* VENCIMIENTOS */}
          {menu === "vencimientos" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2">
                  <Clock size={22} /> Vencimientos (≤ 7 días)
                </h2>

                <button
                  onClick={() => loadClients(user.id)}
                  className="px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-black hover:bg-slate-50 flex items-center gap-2"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                  Actualizar
                </button>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Pill tone="blue">Auto: WhatsApp Cloud (backend)</Pill>
                <Pill>Manual: wa.me</Pill>
                <Pill tone="green">Incluye Monto</Pill>
              </div>

              <ClientsTableFull
                clients={vencimientos}
                loading={loading}
                showWhatsApp
                showMonto
                onWhatsAppAuto={sendWhatsAppAuto}
                onWhatsAppManual={sendWhatsAppManual}
                onEdit={openEditClient}
                onDelete={openDeleteModal}
              />
            </>
          )}

          {/* ✅ NUEVO: PAGOS */}
          {menu === "pagos" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2">
                  <DollarSign size={22} /> Pagos (cartera + filtros)
                </h2>

                <button
                  onClick={() => loadClients(user.id)}
                  className="px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-black hover:bg-slate-50 flex items-center gap-2"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                  Actualizar
                </button>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="flex items-center gap-2">
                    <Pill tone="blue">Alias fijo: {PAGO_ALIAS}</Pill>
                    <Pill tone="amber">Vencidos: {pagosCountVencida}</Pill>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        value={pagosSearch}
                        onChange={(e) => setPagosSearch(e.target.value)}
                        placeholder="Buscar por nombre, DNI, tel, email..."
                        className="pl-10 pr-4 py-3 border border-slate-300 rounded-2xl outline-none w-full sm:w-[320px]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="px-3 py-3 border border-slate-300 rounded-2xl bg-white flex items-center gap-2">
                        <Filter size={16} className="text-slate-500" />
                        <select
                          value={pagosFilter}
                          onChange={(e) => setPagosFilter(e.target.value)}
                          className="outline-none text-sm font-black text-slate-800 bg-transparent"
                        >
                          <option value="ALL">Todos</option>
                          <option value="AL_DIA">Cuota al día</option>
                          <option value="VENCIDA">No pagó / vencida</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-slate-500">
                  Nota: el estado “al día / vencida” depende del campo que manda el backend (no se inventa).
                </div>
              </div>

              <ClientsTableFull
                clients={pagosList}
                loading={loading}
                showMonto
                showPagoStatus
                showPagoWhatsApp
                pagoAlias={PAGO_ALIAS}
                onPagoWhatsAppAuto={sendWhatsAppPagoAuto}
                onPagoWhatsAppManual={sendWhatsAppPagoManual}
                onEdit={openEditClient}
                onDelete={openDeleteModal}
              />
            </>
          )}

          {/* PERFIL */}
          {menu === "perfil" && (
            <div className="space-y-6">
              <AseguradoraProfileCard
                perfil={perfil}
                onWhatsApp={() => openWhatsAppManual(perfil.telefono, "Hola, necesito ayuda con mi póliza.")}
              />

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xl font-black text-slate-900">Editar datos</div>
                    <div className="text-sm text-slate-500">Guardá para que se refleje en Portal Cliente.</div>
                  </div>

                  <button
                    onClick={openSupport}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
                  >
                    <MessageCircle size={16} /> Contactar soporte
                  </button>
                </div>

                <div className="p-6">
                  <form onSubmit={savePerfil} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-700">Nombre comercial</label>
                      <input
                        value={perfil.nombre_comercial}
                        onChange={(e) => setPerfil((p) => ({ ...p, nombre_comercial: e.target.value }))}
                        className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-700">Teléfono</label>
                      <input
                        value={perfil.telefono}
                        onChange={(e) => setPerfil((p) => ({ ...p, telefono: e.target.value }))}
                        className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-700">Email</label>
                      <input
                        type="email"
                        value={perfil.email}
                        onChange={(e) => setPerfil((p) => ({ ...p, email: e.target.value }))}
                        className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-700">Horarios</label>
                      <input
                        value={perfil.horarios}
                        onChange={(e) => setPerfil((p) => ({ ...p, horarios: e.target.value }))}
                        className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-2">
                      <label className="text-xs font-black text-slate-700">Dirección</label>
                      <input
                        value={perfil.direccion}
                        onChange={(e) => setPerfil((p) => ({ ...p, direccion: e.target.value }))}
                        className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-2">
                      <label className="text-xs font-black text-slate-700">Logo (PNG/JPG)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPerfilLogoFile(e.target.files?.[0] || null)}
                        className="w-full text-sm"
                      />
                      {perfil.logo_dataurl ? (
                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 inline-block">
                          <img src={perfil.logo_dataurl} alt="Logo" className="h-16 w-16 object-contain rounded-xl" />
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">Sin logo cargado.</div>
                      )}
                    </div>

                    <div className="sm:col-span-2 flex gap-3 mt-2">
                      <button
                        type="submit"
                        disabled={perfilLoading}
                        className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60"
                      >
                        {perfilLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                        Guardar
                      </button>

                      <button
                        type="button"
                        onClick={loadPerfil}
                        disabled={perfilLoading}
                        className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60"
                      >
                        {perfilLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                        Recargar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* CONFIG */}
          {menu === "config" && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xl font-black text-slate-900">WhatsApp Cloud API</div>
                  <div className="text-sm text-slate-500">
                    Configuración por aseguradora (ID: <span className="font-black">{user?.id}</span>)
                  </div>
                </div>

                <button
                  onClick={openSupport}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
                >
                  <MessageCircle size={16} /> Contactar soporte
                </button>
              </div>

              <div className="p-6">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Pill tone={cfgHasPhone && cfgHasToken ? "green" : "amber"}>
                    {cfgHasPhone && cfgHasToken
                      ? "Credenciales detectadas (ocultas por seguridad)"
                      : "Si dejás vacío, usa Script Properties de prueba"}
                  </Pill>
                </div>

                <form onSubmit={saveConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-700">WhatsApp Phone Number ID</label>
                    <input
                      value={cfgPhoneId}
                      onChange={(e) => setCfgPhoneId(e.target.value)}
                      placeholder="Pegá el ID o dejá masked"
                      className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-700">WhatsApp Access Token</label>
                    <input
                      value={cfgToken}
                      onChange={(e) => setCfgToken(e.target.value)}
                      placeholder="Pegá el token o dejá masked"
                      className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3 mt-2">
                    <button
                      type="submit"
                      disabled={cfgLoading}
                      className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60"
                    >
                      {cfgLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                      Guardar configuración
                    </button>

                    <button
                      type="button"
                      onClick={loadConfig}
                      disabled={cfgLoading}
                      className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60"
                    >
                      {cfgLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                      Recargar
                    </button>

                    {cfgSaved ? <Pill tone="green">Guardado</Pill> : null}
                  </div>
                </form>

                <div className="mt-8 border border-slate-200 rounded-3xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCfgSecretOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100"
                  >
                    <div className="font-black text-slate-800 text-sm flex items-center gap-2">
                      <Settings size={16} /> Cajón de secretos (modo prueba)
                    </div>
                    <span className="text-xs font-black text-slate-500">{cfgSecretOpen ? "Cerrar" : "Abrir"}</span>
                  </button>

                  {cfgSecretOpen && (
                    <div className="p-5 bg-white">
                      <div className="text-sm text-slate-700">En el backend ya existen Script Properties de prueba.</div>
                      <button
                        type="button"
                        onClick={openSupport}
                        className="mt-4 px-5 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
                      >
                        <MessageCircle size={16} /> Contactar soporte (config real)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MARKETING IA */}
          {menu === "marketing" && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Sparkles size={18} /> Marketing IA
                  </div>
                  <div className="text-sm text-slate-500">Copy (OpenAI vía backend) + Imagen (OpenAI vía backend).</div>
                </div>
                <button
                  onClick={openSupport}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2"
                >
                  <MessageCircle size={16} /> Soporte
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-slate-200 rounded-3xl p-5">
                  <div className="font-black text-slate-900 mb-2">Idea base del anuncio</div>
                  <textarea
                    value={mkPrompt}
                    onChange={(e) => setMkPrompt(e.target.value)}
                    placeholder="Ej: Seguro de auto con asistencia 24/7..."
                    className="w-full h-40 px-4 py-3 border border-slate-300 rounded-2xl outline-none resize-none"
                  />

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={generateCopy}
                      disabled={mkCopyLoading}
                      className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60"
                    >
                      {mkCopyLoading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      Generar copy
                    </button>

                    <button
                      type="button"
                      onClick={generateImage}
                      disabled={mkImgLoading}
                      className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2 disabled:opacity-60"
                    >
                      {mkImgLoading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                      Generar imagen
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-black text-slate-900">Copy final</div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(mkCopy)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black flex items-center gap-2"
                    >
                      <Copy size={14} /> Copiar
                    </button>
                  </div>

                  <textarea
                    value={mkCopy}
                    onChange={(e) => setMkCopy(e.target.value)}
                    placeholder="Acá aparece el copy..."
                    className="w-full h-40 px-4 py-3 border border-slate-300 rounded-2xl outline-none resize-none"
                  />

                  <div className="mt-5">
                    <div className="font-black text-slate-900 mb-2">Imagen</div>

                    {mkImage ? (
                      <div className="space-y-3">
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                          <img src={mkImage} alt="Marketing" className="w-full rounded-xl" />
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(mkImage)}
                          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black flex items-center gap-2"
                        >
                          <Copy size={14} /> Copiar DataURL
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">Generá una imagen para verla acá.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* MODAL ABM CLIENTE */}
        {showClientModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
              <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between rounded-t-3xl">
                <h3 className="text-lg sm:text-xl font-black text-slate-800">
                  {editingClient ? "Editar cliente" : "Nuevo cliente"}
                </h3>
                <button
                  onClick={() => setShowClientModal(false)}
                  className="p-2 rounded-xl hover:bg-slate-200"
                  title="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
                <form
                  ref={clientFormRef}
                  onSubmit={handleSaveClient}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  id="clientForm"
                >
                  <FieldInput label="Nombre *" name="nombre" required defaultValue={editingClient?.nombre || ""} />
                  <FieldInput
                    label="Apellido *"
                    name="apellido"
                    required
                    defaultValue={editingClient?.apellido || ""}
                  />

                  <FieldInput label="DNI *" name="documento" required defaultValue={editingClient?.documento || ""} />
                  <FieldInput label="Teléfono *" name="telefono" required defaultValue={editingClient?.telefono || ""} />

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-black text-slate-600">Email * (acceso Portal Cliente)</label>
                    <input
                      name="mail"
                      type="email"
                      required
                      defaultValue={editingClient?.mail || ""}
                      className="w-full px-4 py-2.5 border rounded-2xl outline-none"
                    />
                    <div className="text-[11px] text-slate-500">
                      Importante: este email se usa para enviar el código de ingreso del cliente.
                    </div>
                  </div>

                  {/* ✅ NUEVO: MONTO */}
                  <div className="sm:col-span-2 bg-emerald-50 border border-emerald-100 rounded-3xl p-4">
                    <div className="font-black text-emerald-800 text-[11px] uppercase flex items-center gap-2 mb-3">
                      <DollarSign size={16} /> Pago / Cuota
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldInput
                        label="Monto de la cuota"
                        name="monto"
                        type="text"
                        defaultValue={editingClient?.monto || ""}
                      />
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-emerald-700">Alias</label>
                        <input
                          value={PAGO_ALIAS}
                          readOnly
                          className="w-full px-4 py-2.5 border rounded-2xl bg-white outline-none"
                        />
                        <div className="text-[11px] text-slate-500">Fijo para mensajes de pago.</div>
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-2 bg-blue-50 border border-blue-100 rounded-3xl p-4">
                    <div className="font-black text-blue-800 text-[11px] uppercase flex items-center gap-2 mb-3">
                      <Clock size={16} /> Vigencia del seguro
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-blue-700">Fecha inicio</label>
                        <input
                          type="date"
                          name="fecha_inicio"
                          defaultValue={formatDateForInput(editingClient?.fecha_inicio_str)}
                          className="w-full px-4 py-2.5 border rounded-2xl bg-white outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-black text-blue-700">Fecha fin</label>
                        <input
                          type="date"
                          name="fecha_fin"
                          defaultValue={formatDateForInput(editingClient?.fecha_fin_str)}
                          className="w-full px-4 py-2.5 border rounded-2xl bg-white outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-4">
                    <div className="font-black text-slate-800 text-[11px] uppercase flex items-center gap-2 mb-3">
                      Servicio de grúa
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldInput
                        label="Empresa / Nombre"
                        name="grua_nombre"
                        defaultValue={editingClient?.grua_nombre || ""}
                      />
                      <FieldInput
                        label="Teléfono WhatsApp"
                        name="grua_telefono"
                        defaultValue={editingClient?.grua_telefono || ""}
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-black text-slate-600">Detalle de cobertura</label>
                    <textarea
                      name="descripcion_seguro"
                      defaultValue={editingClient?.descripcion_seguro || ""}
                      className="w-full px-4 py-2.5 border rounded-2xl outline-none h-24 resize-none"
                    />
                  </div>

                  <div className="sm:col-span-2 bg-emerald-50 border border-emerald-100 rounded-3xl p-4">
                    <div className="font-black text-emerald-800 text-[11px] uppercase mb-3">Póliza (PDF)</div>

                    {editingClient?.polizas ? (
                      <div className="flex flex-wrap gap-2 items-center mb-3">
                        <span className="text-[11px] font-black px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-700">
                          PDF cargado
                        </span>

                        <button
                          type="button"
                          onClick={() => openPdfNewTab(editingClient.polizas)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-black hover:bg-emerald-700 flex items-center gap-2"
                        >
                          <Eye size={14} /> Ver póliza
                        </button>

                        <button
                          type="button"
                          onClick={() => triggerDownloadPdf(editingClient.polizas, editingClient.documento || "cliente")}
                          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-black hover:bg-blue-700 flex items-center gap-2"
                        >
                          <Download size={14} /> Descargar
                        </button>

                        <button
                          type="button"
                          onClick={handleRemovePdf}
                          className="px-4 py-2 rounded-xl bg-red-600 text-white text-[11px] font-black hover:bg-red-700 flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Eliminar PDF
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 mb-3">No hay PDF cargado. Podés subirlo abajo.</div>
                    )}

                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="w-full text-sm"
                    />

                    <p className="text-[11px] text-slate-500 mt-2">
                      Si estás editando y no subís un PDF nuevo, se mantiene el anterior.
                    </p>
                  </div>
                </form>
              </div>

              <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur px-5 sm:px-6 py-4 border-t border-slate-200 rounded-b-3xl">
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeClientModal}
                    className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-black hover:bg-slate-50"
                  >
                    Cancelar
                  </button>

                  <button
                    form="clientForm"
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black hover:bg-black flex items-center gap-2 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL ELIMINAR */}
        {deleteModalOpen && clientToDelete && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[92vh]">
              <div className="bg-red-50 border-b border-red-100 px-5 sm:px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-red-800">Confirmar eliminación</div>
                  <div className="text-[11px] text-red-700">Vas a borrar este cliente (detalle completo).</div>
                </div>
                <button onClick={closeDeleteModal} className="p-2 rounded-xl hover:bg-red-100" title="Cerrar">
                  <X size={18} className="text-red-700" />
                </button>
              </div>

              <div className="px-5 sm:px-6 py-5 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4">
                    <div className="text-[11px] font-black text-slate-500 uppercase mb-2">Identidad</div>
                    <DataLine label="Nombre" value={clientToDelete.nombre} />
                    <DataLine label="Apellido" value={clientToDelete.apellido} />
                    <DataLine label="DNI" value={clientToDelete.documento} />
                    <DataLine label="Email" value={clientToDelete.mail} />
                    <DataLine label="Teléfono" value={clientToDelete.telefono} />
                    <DataLine label="Monto" value={clientToDelete.monto || "-"} />
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4">
                    <div className="text-[11px] font-black text-slate-500 uppercase mb-2">Seguro</div>
                    <DataLine label="Inicio" value={formatDateDisplay(clientToDelete.fecha_inicio_str)} />
                    <DataLine label="Fin" value={formatDateDisplay(clientToDelete.fecha_fin_str)} />
                    <DataLine
                      label="Días restantes"
                      value={typeof clientToDelete.dias_left === "number" ? String(clientToDelete.dias_left) : "-"}
                    />
                    <DataLine label="Cobertura" value={clientToDelete.descripcion_seguro || "-"} />
                  </div>

                  <div className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-4">
                    <div className="text-[11px] font-black text-slate-500 uppercase mb-2">Grúa</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <DataLine label="Empresa" value={clientToDelete.grua_nombre || "-"} />
                      </div>
                      <div>
                        <DataLine label="Teléfono" value={clientToDelete.grua_telefono || "-"} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openWhatsAppManual(
                            clientToDelete.grua_telefono,
                            `Hola, necesito asistencia de grúa. Soy ${clientToDelete.nombre} ${clientToDelete.apellido}.`
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-black hover:bg-emerald-700 flex items-center gap-2"
                        disabled={!clientToDelete.grua_telefono}
                      >
                        <MessageCircle size={14} /> WhatsApp grúa
                      </button>

                      {/* ❌ Eliminado botón LLAMAR */}

                      {clientToDelete.polizas ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openPdfNewTab(clientToDelete.polizas)}
                            className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-black flex items-center gap-2"
                          >
                            <Eye size={14} /> Ver póliza
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerDownloadPdf(clientToDelete.polizas, clientToDelete.documento || "cliente")}
                            className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-black flex items-center gap-2"
                          >
                            <Download size={14} /> Descargar póliza
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 self-center">Sin PDF</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-red-700 font-black">
                  ¿Confirmás que querés eliminar definitivamente este cliente?
                </div>
              </div>

              <div className="border-t border-slate-200 px-5 sm:px-6 py-4 bg-white flex justify-end gap-3">
                <button
                  onClick={closeDeleteModal}
                  className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-black hover:bg-slate-50"
                >
                  No, cancelar
                </button>

                <button
                  onClick={confirmDelete}
                  disabled={loading}
                  className="px-6 py-3 rounded-2xl bg-red-600 text-white text-xs font-black hover:bg-red-700 flex items-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/* ================== TABLE FULL ================== */
function ClientsTableFull({
  clients,
  loading,
  onEdit,
  onDelete,
  showWhatsApp,
  onWhatsAppAuto,
  onWhatsAppManual,

  // ✅ NUEVO
  showMonto = false,
  showPagoStatus = false,
  showPagoWhatsApp = false,
  onPagoWhatsAppAuto,
  onPagoWhatsAppManual,
  pagoAlias = PAGO_ALIAS,
}) {
  const colsBase = 13;
  const colsWhats = showWhatsApp ? 1 : 0;
  const colsMonto = showMonto ? 1 : 0;
  const colsPagoStatus = showPagoStatus ? 1 : 0;
  const colsPagoWhats = showPagoWhatsApp ? 1 : 0;
  const totalCols = colsBase + colsWhats + colsMonto + colsPagoStatus + colsPagoWhats;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[1350px] w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Nombre</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Apellido</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">DNI</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Tel</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Email</th>

              {showMonto ? (
                <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Monto</th>
              ) : null}

              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Inicio</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Fin</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Días</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Grúa</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Tel. Grúa</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Cobertura</th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Póliza</th>

              {showPagoStatus ? (
                <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Estado cuota</th>
              ) : null}

              {showWhatsApp ? (
                <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">WhatsApp</th>
              ) : null}

              {showPagoWhatsApp ? (
                <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">Pago WhatsApp</th>
              ) : null}

              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase text-right">Acciones</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {clients.map((c) => {
              const pagoStatus = showPagoStatus ? getPagoStatus(c) : null;

              return (
                <tr key={c.id} className="hover:bg-slate-50 align-top">
                  <td className="px-5 py-4 text-sm font-black text-slate-900">{c.nombre}</td>
                  <td className="px-5 py-4 text-sm text-slate-900">{c.apellido}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{c.documento}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{c.telefono}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{c.mail}</td>

                  {showMonto ? (
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {c.monto ? (
                        <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                          {c.monto}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  ) : null}

                  <td className="px-5 py-4 text-sm text-slate-700">{formatDateDisplay(c.fecha_inicio_str)}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{formatDateDisplay(c.fecha_fin_str)}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">
                    {typeof c.dias_left === "number" ? (
                      <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                        {c.dias_left}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-700">{c.grua_nombre || "-"}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{c.grua_telefono || "-"}</td>
                  <td className="px-5 py-4 text-sm text-slate-700 max-w-[320px]">
                    <div className="whitespace-pre-wrap line-clamp-4">{c.descripcion_seguro || "-"}</div>
                  </td>
                  <td className="px-5 py-4">
                    {c.polizas ? (
                      <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                        PDF
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin PDF</span>
                    )}
                  </td>

                  {showPagoStatus ? (
                    <td className="px-5 py-4">
                      {pagoStatus === "AL_DIA" ? (
                        <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                          Al día
                        </span>
                      ) : pagoStatus === "VENCIDA" ? (
                        <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700">
                          Vencida
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Sin dato</span>
                      )}
                    </td>
                  ) : null}

                  {showWhatsApp ? (
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => onWhatsAppAuto && onWhatsAppAuto(c)}
                          className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-black flex items-center gap-2"
                          title="Enviar automático (Cloud API)"
                        >
                          <MessageCircle size={14} /> Auto
                        </button>

                        <button
                          onClick={() => onWhatsAppManual && onWhatsAppManual(c)}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px] font-black flex items-center gap-2"
                          title="Abrir WhatsApp manual"
                        >
                          <MessageCircle size={14} /> Manual
                        </button>
                      </div>
                    </td>
                  ) : null}

                  {showPagoWhatsApp ? (
                    <td className="px-5 py-4">
                      <div className="space-y-2">
                        <div className="text-[11px] text-slate-500">
                          Alias: <span className="font-black text-slate-800">{pagoAlias}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => onPagoWhatsAppAuto && onPagoWhatsAppAuto(c)}
                            className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-black flex items-center gap-2"
                            title="Enviar automático (Cloud API)"
                          >
                            <MessageCircle size={14} /> Auto
                          </button>
                          <button
                            onClick={() => onPagoWhatsAppManual && onPagoWhatsAppManual(c)}
                            className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px] font-black flex items-center gap-2"
                            title="Abrir WhatsApp manual"
                          >
                            <MessageCircle size={14} /> Manual
                          </button>
                        </div>
                      </div>
                    </td>
                  ) : null}

                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEdit(c)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                        title="Editar"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(c)}
                        className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {clients.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-6 py-10 text-center text-slate-400">
                  {loading ? "Cargando..." : "No hay registros para mostrar."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-slate-200 bg-white text-[11px] text-slate-500">
        Si no ves alguna columna en tu pantalla, scrolleá horizontal.
      </div>
    </div>
  );
}
