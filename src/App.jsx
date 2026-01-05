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
import AdminDashboard from "./components/AdminDashboard.jsx";
import DeveloperAdmin from "./components/DeveloperAdmin.jsx";
import * as XLSX from "xlsx";
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
  AlertTriangle,
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

// ✅ NUEVO: alias de pago (default)
const DEFAULT_PAGO_ALIAS = "PAGO.MP";

/* ================== HELPERS ================== */
const safeUpper = (v) => String(v || "").toUpperCase().trim();
const safeLower = (v) => String(v || "").toLowerCase().trim();
const normalizePhoneDigits = (p) => String(p || "").replace(/[^\d]/g, "");
const normalizeDigits = (v) => String(v || "").replace(/[^\d]/g, "");

// ✅ NUEVO: Persistencia (para sobrevivir refresh por permisos de mic)
const STORAGE_KEY = "segurospro_front_state_v1";
const MIC_KEY = "segurospro_mic_granted_v1";

const safeJsonParse = (s) => {
  try {
      if (!rawRows.length) throw new Error("El archivo Excel está vacío.");
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

const normalizeExcelDateToIso = (v) => {
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yy = m[3];
    return `${yy}-${mm}-${dd}`;
  }
  return "";
};

const getRowValueCI = (row, candidates) => {
  if (!row) return "";
  const entries = Object.entries(row);
  const map = new Map(entries.map(([k, v]) => [String(k).toLowerCase().trim(), v]));
  for (const c of candidates) {
    const key = String(c).toLowerCase().trim();
    if (map.has(key)) return map.get(key);
  }
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
  const { action, ...rest } = payload;
  
  // Mapeo de acciones a endpoints
  const endpointMap = {
    login: { url: "/api/auth/login", body: { email: rest.email, password: rest.password } },
    register: { url: "/api/auth/register", body: { nombre: rest.nombre, email: rest.email, password: rest.password } },
    getClients: { url: "/api/clientes/get", body: { aseguradora_id: rest.aseguradora_id } },
    getClientByDni: { url: "/api/cliente/by-dni", body: { aseguradora_id: rest.aseguradora_id, dni: rest.dni } },
    lookupClientAseguradoras: { url: "/api/cliente/lookup", body: { dni: rest.dni, email: rest.email } },
    sendClientLoginCode: { url: "/api/cliente/send-code", body: { aseguradora_id: rest.aseguradora_id, dni: rest.dni } },
    verifyClientLoginCode: {
      url: "/api/cliente/verify-code",
      body: { aseguradora_id: rest.aseguradora_id, dni: rest.dni, code: rest.code },
    },
    addClient: { url: "/api/clientes/add", body: rest },
    updateClient: { url: "/api/clientes/update", body: rest },
    deleteClient: { url: "/api/clientes/delete", body: { id: rest.id } },
    getConfig: { url: "/api/config/get", body: rest },
    saveConfig: { url: "/api/config/save", body: rest },
    getAseguradoraPerfil: { url: "/api/perfil/get", body: { aseguradora_id: rest.aseguradora_id } },
    saveAseguradoraPerfil: { url: "/api/perfil/save", body: rest },
    sendWhatsAppVencimiento: { url: "/api/whatsapp/send", body: { tipo: "vencimiento", ...rest } },
    sendWhatsAppPago: { url: "/api/whatsapp/send", body: { tipo: "pago", ...rest } },
    wppListConversations: { url: "/api/whatsapp/conversations/list", body: { aseguradora_id: rest.aseguradora_id } },
    wppListMessages: {
      url: "/api/whatsapp/messages/list",
      body: { aseguradora_id: rest.aseguradora_id, conversation_id: rest.conversation_id },
    },
    generateAdCopy: { url: "/api/marketing/copy", body: { aseguradora_id: rest.aseguradora_id, prompt: rest.prompt } },
    generateAdImageOpenAI: { url: "/api/marketing/image", body: rest },
    setUserPais: { url: "/api/usuarios/set-pais", body: { aseguradora_id: rest.aseguradora_id, pais: rest.pais } },
  };
  
  const endpoint = endpointMap[action];
  if (!endpoint) throw new Error(`Acción no soportada: ${action}`);
  
  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(endpoint.body),
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
      className={`fixed top-6 left-6 z-[9999] flex items-center gap-2 text-sm font-black px-3 py-2 rounded-xl border shadow-lg shadow-black/30 ${
        dark
          ? "bg-[var(--panel)] text-[var(--text)] border-[rgba(63,209,255,.45)] hover:bg-[rgba(255,255,255,.04)]"
          : "bg-[var(--panel)] text-[var(--text)] border-[rgba(63,209,255,.45)] hover:bg-[rgba(255,255,255,.04)]"
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
      className={`px-4 py-3 rounded-2xl border shadow-sm text-xs font-black flex items-center justify-center gap-2 transition-colors ${
        active
          ? "bg-gradient-to-r from-[var(--c1)] to-[var(--c2)] text-slate-900 border-transparent"
          : "bg-[rgba(255,255,255,.04)] text-[var(--text)] border-[rgba(255,255,255,.10)] hover:bg-[rgba(255,255,255,.06)]"
      }`}
    >
      {icon} {label}
      {badge ? (
        <span
          className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${
            active
              ? "bg-white/35 text-slate-900"
              : "bg-[rgba(255,255,255,.10)] text-[var(--text)]"
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
  // Intro video + brand
  const [introDone, setIntroDone] = useState(false);
  const introVideoRef = useRef(null);
  const [introNeedsClick, setIntroNeedsClick] = useState(false);
  const [introMuted, setIntroMuted] = useState(true);
  const [brandLogoOk, setBrandLogoOk] = useState(true);

  const [rootView, setRootView] = useState("home"); // home | aseguradoras | clientes

  // Aseguradoras
  const [mode, setMode] = useState("auth"); // auth | dashboard
  const [authView, setAuthView] = useState("login"); // login | register
  const [authPais, setAuthPais] = useState("AR");
  // ✅ NUEVO: pagos
  const [menu, setMenu] = useState("cartera"); // cartera | vencimientos | pagos | mensajes | config | marketing | perfil

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
        : "bg-[var(--c2)]";
    return (
      <div className={`fixed top-0 left-0 w-full z-[9999] text-center py-2 font-black text-white ${cls}`}>
        {statusMsg.message}
      </div>
    );
  }, [statusMsg]);

  // Auth
  const [user, setUser] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [emailStep, setEmailStep] = useState(null); // null | "email" | "code"
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""]);
  const authFormRef = useRef(null);

  // Data
  const [clients, setClients] = useState([]);

  // ✅ NUEVO: filtros pagos
  const [pagosFilter, setPagosFilter] = useState("ALL"); // ALL | AL_DIA | VENCIDA
  const [pagosSearch, setPagosSearch] = useState("");
  const [pagoAlias, setPagoAlias] = useState(DEFAULT_PAGO_ALIAS);
  const [pagoAliasDraft, setPagoAliasDraft] = useState(DEFAULT_PAGO_ALIAS);

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
  const [cfgOpenAIKey, setCfgOpenAIKey] = useState("");
  const [cfgHasOpenAI, setCfgHasOpenAI] = useState(false);
  const [cfgSecretOpen, setCfgSecretOpen] = useState(false);

  // ✅ NUEVO: WhatsApp Inbox (Mensajes)
  const [wppConversations, setWppConversations] = useState([]);
  const [wppActiveConvId, setWppActiveConvId] = useState(null);
  const [wppMessages, setWppMessages] = useState([]);
  const [wppComposer, setWppComposer] = useState("");
  const [wppLoading, setWppLoading] = useState(false);
  const [wppSseState, setWppSseState] = useState("disconnected"); // disconnected | connecting | connected | error
  const [wppSseLastEventAt, setWppSseLastEventAt] = useState(null);
  const [wppSseLastErrorAt, setWppSseLastErrorAt] = useState(null);
  const [wppDebugStatus, setWppDebugStatus] = useState(null);
  const [wppDebugLoading, setWppDebugLoading] = useState(false);
  const wppEsRef = useRef(null);
  const wppMsgsEndRef = useRef(null);

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
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteMatches, setClienteMatches] = useState([]); // [{aseguradora_id, aseguradora_nombre}]
  const [clienteSelectedAsegId, setClienteSelectedAsegId] = useState("");
  const [clienteDocLabel, setClienteDocLabel] = useState("Documento");

  // ✅ Excel (import/export clientes)
  const excelInputRef = useRef(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelImportContext, setExcelImportContext] = useState("cartera");
  const perfilFotoInputRef = useRef(null);
  const [clienteMaskedEmail, setClienteMaskedEmail] = useState("");
  const [clienteCodeDigits, setClienteCodeDigits] = useState(["", "", "", "", "", ""]);
  const [clienteToken, setClienteToken] = useState("");
  // loading por acción para que solo spinee el botón tocado
  const [clienteAction, setClienteAction] = useState(null); // null | 'lookup' | 'send' | 'verify'
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

  const lastAutoVerifyRef = useRef("");
  const lastClientAutoVerifyRef = useRef("");

  const resetClientPortalState = () => {
    setClienteDni("");
    setClienteEmail("");
    setClienteMatches([]);
    setClienteSelectedAsegId("");
    setClienteDocLabel("Documento");
    setClienteMaskedEmail("");
    setClienteCodeDigits(["", "", "", "", "", ""]);
    setClienteToken("");
    setClienteAction(null);
    setClienteData(null);
    setAsegPerfil(null);
    setClienteChat([]);
    setClienteMsg("");
    lastClientAutoVerifyRef.current = "";
  };

  const resetSession = () => {
    setMode("auth");
    setAuthView("login");
    setMenu("cartera");
    setUser(null);
    setClients([]);

    // JWT para endpoints admin
    try {
      localStorage.removeItem("token");
    } catch {
      // ignore
    }
  };

  const logout = () => {
    resetSession();
    clearPersistedState(); // ✅ NUEVO: si salen, limpiamos la persistencia general
    showMessage("Sesión cerrada.", "info");
  };

  const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
      reader.readAsDataURL(file);
    });
  };

  const loadImageFromDataURL = (dataUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = dataUrl;
    });
  };

  const makeCenteredSquareDataUrl = async ({ file, size = 512, mime = "image/webp", quality = 0.86 }) => {
    const srcDataUrl = await readFileAsDataURL(file);
    const img = await loadImageFromDataURL(srcDataUrl);

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("Imagen inválida");

    const side = Math.min(w, h);
    const sx = Math.floor((w - side) / 2);
    const sy = Math.floor((h - side) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    // toDataURL no soporta quality para PNG, sí para JPEG/WEBP
    const outMime = mime === "image/jpeg" || mime === "image/webp" ? mime : "image/webp";
    const outQuality = outMime === "image/png" ? undefined : quality;
    return canvas.toDataURL(outMime, outQuality);
  };

  const uploadPerfilFoto = async (file) => {
    if (!file) return;
    if (!user?.id) return showMessage("Iniciá sesión para cargar tu foto.", "error");

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(String(file.type || "").toLowerCase())) {
      return showMessage("Formato no permitido. Usá PNG/JPG/WEBP.", "error");
    }

    // Permitimos fotos grandes, pero las normalizamos a cuadrado (center-crop) y comprimimos.
    // Así se ven grandes/limpias en UI pero quedan livianas y guardables.
    if (file.size > 10 * 1024 * 1024) {
      return showMessage("La foto es demasiado grande (máx 10MB).", "error");
    }

    let token = "";
    try {
      token = String(localStorage.getItem("token") || "");
    } catch {
      token = "";
    }

    if (!token) {
      return showMessage("No se encontró el token de sesión.", "error");
    }

    let dataUrl;
    try {
      dataUrl = await makeCenteredSquareDataUrl({ file, size: 512, mime: "image/webp", quality: 0.86 });
    } catch (e) {
      return showMessage(e.message || "No se pudo procesar la imagen", "error");
    }

    try {
      const res = await fetch("/api/user/profile-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataUrl }),
      });
      const raw = await res.text();
      const out = raw ? JSON.parse(raw) : { status: "error", message: "Respuesta vacía" };
      if (!res.ok || out.status !== "success") {
        throw new Error(out.message || "No se pudo guardar la foto");
      }

      setUser((prev) => (prev ? { ...prev, profile_photo_dataurl: out.profile_photo_dataurl } : prev));
      showMessage("Foto de perfil actualizada.", "success");
    } catch (e) {
      showMessage(e.message || "No se pudo guardar la foto", "error");
    }
  };

  const makeDateStamp = () => {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return { y, m, d, hh, mm };
  };

  const getPaisNorm = () => {
    const p = String(user?.pais || "AR").toUpperCase();
    return p === "UY" ? "UY" : "AR";
  };

  const normalizePaisCode = (pais) => {
    const p = String(pais || "").toUpperCase();
    return p === "UY" ? "UY" : "AR";
  };

  const filterByPais = (list, pais) => {
    const target = normalizePaisCode(pais);
    const arr = Array.isArray(list) ? list : [];
    return arr.filter((c) => normalizePaisCode(c?.pais || target) === target);
  };

  // Vista = lo que se muestra (no solo labels/colores).
  const filterByPaisVista = (list) => {
    const view = getPaisNorm();
    const arr = Array.isArray(list) ? list : [];
    return arr.filter((c) => {
      const p = normalizePaisCode(c?.pais || view);
      return p === view;
    });
  };

  const getPaisMeta = () => {
    const p = getPaisNorm();
    return p === "UY"
      ? { code: "UY", name: "Uruguay", flag: "🇺🇾", docLabel: "Cédula", docHeaderXlsx: "Cedula" }
      : { code: "AR", name: "Argentina", flag: "🇦🇷", docLabel: "DNI", docHeaderXlsx: "DNI" };
  };

  const getPaisesHabilitados = () => {
    const raw = String(user?.paises || user?.pais || "AR");
    const parts = raw
      .split(/[,;\s]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    const uniq = Array.from(new Set(parts));
    const normalized = uniq.filter((x) => x === "AR" || x === "UY");
    return normalized.length ? normalized : [getPaisNorm()];
  };

  const canSwitchPais = () => {
    const allowed = getPaisesHabilitados();
    return allowed.includes("AR") && allowed.includes("UY");
  };

  const changePaisVista = async (nextPais) => {
    if (!user?.id) return;
    const next = String(nextPais || "").toUpperCase();
    if (next !== "AR" && next !== "UY") return;
    if (next === getPaisNorm()) return;
    try {
      const res = await request({ action: "setUserPais", aseguradora_id: user.id, pais: next });
      if (res?.user) {
        // Importante: /api/usuarios/set-pais devuelve un user reducido (sin profile_photo_dataurl).
        // Si reemplazamos el objeto completo, se pierde la foto al cambiar de vista.
        setUser((prev) => {
          if (!prev) return res.user;
          const merged = { ...prev, ...res.user };
          if (!res.user?.profile_photo_dataurl && prev?.profile_photo_dataurl) {
            merged.profile_photo_dataurl = prev.profile_photo_dataurl;
          }
          return merged;
        });
        showMessage(`Vista cambiada a ${next === "UY" ? "Uruguay" : "Argentina"}.`, "success");
        await loadClients(res.user.id);
      } else {
        setUser((prev) => (prev ? { ...prev, pais: next } : prev));
        await loadClients(user.id);
      }
    } catch (e) {
      showMessage(e.message || "No se pudo cambiar el país.", "error");
    }
  };

  const writeSingleSheetXlsx = ({ headers, rows, sheetName, fileName }) => {
    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
  };

  const isValidEmail = (value) => {
    const s = String(value || "").trim();
    if (!s) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };

  const normalizeMontoFromExcel = (value) => {
    if (value === null || value === undefined) return "";
    const s0 = String(value).trim();
    if (!s0) return "";
    const s1 = s0
      .replace(/\s/g, "")
      .replace(/\$/g, "")
      .replace(/UYU/gi, "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^0-9.\-]/g, "");

    if (!s1) return "";
    const n = Number(s1);
    if (!Number.isFinite(n)) return null;
    return String(n);
  };

  const exportClientesExcel = ({ fileName, silent } = {}) => {
    try {
      const meta = getPaisMeta();
      const headers = [
        "Nombre",
        "Apellido",
        meta.docHeaderXlsx,
        "Telefono",
        "Email",
        "Monto",
        "Inicio",
        "Fin",
        "Grua",
        "TelGrua",
        "Cobertura",
        "FechasCuota",
        "CuotaPaga",
        "TienePoliza",
      ];

      const rows = (clients || []).map((c) => [
        c.nombre || "",
        c.apellido || "",
        c.documento || "",
        c.telefono || "",
        c.mail || "",
        c.monto || "",
        formatDateForInput(c.fecha_inicio_str) || "",
        formatDateForInput(c.fecha_fin_str) || "",
        c.grua_nombre || "",
        c.grua_telefono || "",
        c.descripcion_seguro || "",
        c.fechas_de_cuota || "",
        c.cuota_paga || "",
        c.polizas ? "SI" : "NO",
      ]);

      const stamp = makeDateStamp();
      writeSingleSheetXlsx({
        headers,
        rows,
        sheetName: "Clientes",
        fileName: fileName || `clientes_${stamp.y}-${stamp.m}-${stamp.d}.xlsx`,
      });
    } catch (e) {
      if (!silent) showMessage(e?.message || "No se pudo exportar el Excel.", "error");
    }
  };

  const exportVencimientosExcel = async () => {
    if (excelBusy) return;
    setExcelBusy(true);
    try {
      const meta = getPaisMeta();
      const headers = [
        "Nombre",
        "Apellido",
        meta.docHeaderXlsx,
        "Telefono",
        "Email",
        "Monto",
        "Inicio",
        "Fin",
        "Dias",
        "Grua",
        "TelGrua",
        "Cobertura",
        "FechasCuota",
        "CuotaPaga",
      ];

      const rows = (vencimientos || []).map((c) => [
        c.nombre || "",
        c.apellido || "",
        c.documento || "",
        c.telefono || "",
        c.mail || "",
        c.monto || "",
        formatDateForInput(c.fecha_inicio_str) || "",
        formatDateForInput(c.fecha_fin_str) || "",
        typeof c.dias_left === "number" ? c.dias_left : "",
        c.grua_nombre || "",
        c.grua_telefono || "",
        c.descripcion_seguro || "",
        c.fechas_de_cuota || "",
        c.cuota_paga || "",
      ]);

      const stamp = makeDateStamp();
      writeSingleSheetXlsx({
        headers,
        rows,
        sheetName: "Vencimientos",
        fileName: `vencimientos_${stamp.y}-${stamp.m}-${stamp.d}.xlsx`,
      });
    } catch (e) {
      showMessage(e?.message || "No se pudo exportar el Excel de vencimientos.", "error");
    } finally {
      setExcelBusy(false);
    }
  };

  const exportPagosExcel = async () => {
    if (excelBusy) return;
    setExcelBusy(true);
    try {
      const meta = getPaisMeta();
      const headers = [
        "Nombre",
        "Apellido",
        meta.docHeaderXlsx,
        "Telefono",
        "Email",
        "Monto",
        "EstadoCuota",
        "Inicio",
        "Fin",
        "Grua",
        "TelGrua",
        "Cobertura",
        "FechasCuota",
        "CuotaPaga",
      ];

      const rows = (pagosList || []).map((c) => {
        const st = getPagoStatus(c);
        return [
          c.nombre || "",
          c.apellido || "",
          c.documento || "",
          c.telefono || "",
          c.mail || "",
          c.monto || "",
          st === "AL_DIA" ? "AL_DIA" : st === "VENCIDA" ? "VENCIDA" : "SIN_DATO",
          formatDateForInput(c.fecha_inicio_str) || "",
          formatDateForInput(c.fecha_fin_str) || "",
          c.grua_nombre || "",
          c.grua_telefono || "",
          c.descripcion_seguro || "",
          c.fechas_de_cuota || "",
          c.cuota_paga || "",
        ];
      });

      const stamp = makeDateStamp();
      writeSingleSheetXlsx({
        headers,
        rows,
        sheetName: "Pagos",
        fileName: `pagos_${stamp.y}-${stamp.m}-${stamp.d}.xlsx`,
      });
    } catch (e) {
      showMessage(e?.message || "No se pudo exportar el Excel de pagos.", "error");
    } finally {
      setExcelBusy(false);
    }
  };

  const downloadClientesExcelTemplate = async () => {
    try {
      const meta = getPaisMeta();
      const headers = [
        "Nombre",
        "Apellido",
        meta.docHeaderXlsx,
        "Telefono",
        "Email",
        "Monto",
        "Inicio",
        "Fin",
        "Grua",
        "TelGrua",
        "Cobertura",
        "FechasCuota",
        "CuotaPaga",
        "TienePoliza",
      ];

      const exampleRow = [
        "Juan",
        "Pérez",
        "12345678",
        "59892000000",
        "juan@example.com",
        "1500",
        "2026-01-01",
        "2026-12-31",
        "Grua 24hs",
        "59891111111",
        "Seguro auto - cobertura total",
        "",
        "NO",
        "",
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      XLSX.writeFile(wb, "plantilla_clientes.xlsx");
    } catch (e) {
      showMessage(e?.message || "No se pudo descargar la plantilla.", "error");
    }
  };

  const openImportExcel = (context) => {
    if (excelBusy) return;
    if (!excelInputRef.current) return;
    if (context) setExcelImportContext(String(context));
    excelInputRef.current.value = "";
    excelInputRef.current.click();
  };

  const importClientesExcelFile = async (file) => {
    if (!file) return;
    if (!user?.id) return showMessage("Tenés que iniciar sesión como aseguradora.", "error");

    // ✅ C) Importación segura: backup antes de aplicar cambios
    try {
      const stamp = makeDateStamp();
      exportClientesExcel({
        fileName: `backup_${excelImportContext}_clientes_${stamp.y}-${stamp.m}-${stamp.d}_${stamp.hh}${stamp.mm}.xlsx`,
        silent: true,
      });
    } catch {
      // ignore (si el navegador bloquea descarga no frenamos import)
    }

    setExcelBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error("El Excel no tiene hojas.");
      const ws = wb.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

      if (!rawRows.length) throw new Error("El Excel está vacío.");

      const meta = getPaisMeta();
      const existingByDni = new Map(
        (clients || [])
          .map((c) => ({ dni: normalizeDigits(c.documento), c }))
          .filter((x) => x.dni)
          .map((x) => [x.dni, x.c])
      );

      let ok = 0;
      let skipped = 0;
      let failed = 0;

      const errors = [];
      const seenDniInFile = new Set();

      for (let idx = 0; idx < rawRows.length; idx += 1) {
        const r = rawRows[idx];
        const filaExcel = idx + 2; // header en fila 1
        const nombre = String(getRowValueCI(r, ["Nombre", "nombre"]) || "").trim();
        const apellido = String(getRowValueCI(r, ["Apellido", "apellido"]) || "").trim();
        const documentoRaw = getRowValueCI(r, ["DNI", "Documento", "documento", "Cedula", "cédula", "cedula"]);
        const documento = normalizeDigits(documentoRaw);
        const telefono = String(getRowValueCI(r, ["Telefono", "Teléfono", "telefono", "tel", "cel", "celular"]) || "").trim();
        const mail = String(getRowValueCI(r, ["Email", "E-mail", "Mail", "mail", "correo"]) || "").trim();
        const montoRaw = getRowValueCI(r, ["Monto", "monto"]);
        const grua_nombre = String(getRowValueCI(r, ["Grua", "Grúa", "grua", "grua_nombre"]) || "").trim();
        const grua_telefono = String(getRowValueCI(r, ["TelGrua", "Tel Grúa", "tel_grua", "grua_telefono"]) || "").trim();
        const descripcion_seguro = String(getRowValueCI(r, ["Cobertura", "cobertura", "descripcion_seguro"]) || "").trim();
        const fechas_de_cuota = String(getRowValueCI(r, ["FechasCuota", "fechas_de_cuota", "Fechas de cuota"]) || "").trim();
        const cuota_paga = String(getRowValueCI(r, ["CuotaPaga", "cuota_paga", "Cuota paga", "cuota_paga?"]) || "").trim();
        const inicioRaw = getRowValueCI(r, ["Inicio", "inicio", "fecha_inicio", "fecha_inicio_str"]);
        const finRaw = getRowValueCI(r, ["Fin", "fin", "fecha_fin", "fecha_fin_str"]);
        const fecha_inicio_str = normalizeExcelDateToIso(inicioRaw);
        const fecha_fin_str = normalizeExcelDateToIso(finRaw);

        // fila completamente vacía
        if (!nombre && !apellido && !documento && !telefono && !mail && !String(montoRaw || "").trim()) {
          skipped += 1;
          continue;
        }

        // ✅ B) Validaciones
        const rowErrors = [];
        if (!nombre) rowErrors.push("Nombre requerido");
        if (!documento || documento.length < 6) rowErrors.push(`${meta.docLabel} requerido (solo números)`);
        if (documento) {
          if (seenDniInFile.has(documento)) rowErrors.push(`${meta.docLabel} duplicado dentro del Excel`);
          seenDniInFile.add(documento);
        }
        if (!isValidEmail(mail)) rowErrors.push("Email inválido");

        const montoNorm = normalizeMontoFromExcel(montoRaw);
        if (montoNorm === null) rowErrors.push("Monto inválido (usar número)");

        const inicioTxt = String(inicioRaw || "").trim();
        if (inicioTxt && !fecha_inicio_str) rowErrors.push("Inicio inválido (usar YYYY-MM-DD o DD/MM/YYYY)");
        const finTxt = String(finRaw || "").trim();
        if (finTxt && !fecha_fin_str) rowErrors.push("Fin inválido (usar YYYY-MM-DD o DD/MM/YYYY)");

        if (rowErrors.length) {
          failed += 1;
          errors.push({
            Fila: filaExcel,
            DNI: documento || "",
            Nombre: nombre || "",
            Error: rowErrors.join(" | "),
          });
          continue;
        }

        const payloadBase = {
          aseguradora_id: user.id,
          nombre,
          apellido,
          mail,
          telefono,
          documento,
          grua_nombre,
          grua_telefono,
          descripcion_seguro,
          fechas_de_cuota,
          cuota_paga,
          fecha_inicio_str,
          fecha_fin_str,
          monto: montoNorm || null,
        };

        try {
          const existing = documento ? existingByDni.get(documento) : null;
          if (existing?.id) {
            await request({ action: "updateClient", id: existing.id, ...payloadBase });
          } else {
            await request({ action: "addClient", ...payloadBase });
          }
          ok += 1;
        } catch {
          failed += 1;
          errors.push({
            Fila: filaExcel,
            DNI: documento || "",
            Nombre: nombre || "",
            Error: "Falló el guardado (backend)",
          });
        }
      }

      await loadClients(user.id);

      // ✅ B) Reporte descargable de errores
      if (errors.length) {
        try {
          const stamp = makeDateStamp();
          const headers = ["Fila", meta.docHeaderXlsx, "Nombre", "Error"];
          const rows = errors.map((e) => [e.Fila, e.DNI, e.Nombre, e.Error]);
          writeSingleSheetXlsx({
            headers,
            rows,
            sheetName: "Errores",
            fileName: `reporte_import_${excelImportContext}_clientes_${stamp.y}-${stamp.m}-${stamp.d}_${stamp.hh}${stamp.mm}.xlsx`,
          });
        } catch {
          // ignore
        }
      }

      showMessage(
        `Excel importado. OK: ${ok} | Omitidos: ${skipped} | Fallidos: ${failed}`,
        failed ? "error" : "success"
      );
    } catch (e) {
      showMessage(e?.message || "No se pudo importar el Excel.", "error");
    } finally {
      setExcelBusy(false);
    }
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
      const paisForDoc = String(editingClient?.pais || getPaisNorm() || "AR").toUpperCase() === "UY" ? "UY" : "AR";
      const docLabel = paisForDoc === "UY" ? "Cédula" : "DNI";
      showMessage(`Faltan campos obligatorios: nombre, apellido, email, teléfono, ${docLabel}.`, "error");
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
      `Alias: ${pagoAlias}. ` +
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
        alias: pagoAlias,
      });
      showMessage("WhatsApp de pago enviado.", "success");
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const savePagoAlias = () => {
    const next = safeUpper(pagoAliasDraft);
    if (!next) {
      showMessage("Alias requerido.", "error");
      return;
    }
    setPagoAlias(next);
    setPagoAliasDraft(next);
    showMessage("Alias de pago actualizado.", "success");
  };

  // Config WhatsApp (safe)
  const loadConfig = async () => {
    if (!user?.id) return;
    setCfgLoading(true);
    setCfgSaved(false);
    try {
      const res = await request({
        action: "getConfig",
        aseguradora_id: user.id,
        scope: "ASEGURADORA",
        scope_id: user.id,
      });
      const cfg = res.data || {};
      setCfgPhoneId(cfg.wpp_phone_number_id_masked || "");
      setCfgToken(cfg.wpp_access_token_masked || "");
      setCfgHasPhone(!!cfg.wpp_has_phone_number_id);
      setCfgHasToken(!!cfg.wpp_has_access_token);
      setCfgOpenAIKey(cfg.openai_api_key_masked || "");
      setCfgHasOpenAI(!!cfg.openai_has_api_key);
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
    const openaiToSend = looksMasked(cfgOpenAIKey) ? "" : String(cfgOpenAIKey || "").trim();

    setCfgLoading(true);
    try {
      const payload = {
        action: "saveConfig",
        aseguradora_id: user.id,
        scope: "ASEGURADORA",
        scope_id: user.id,
      };

      // Evita pisar secretos si el usuario está viendo valores enmascarados
      if (!looksMasked(cfgPhoneId) && phoneToSend) payload.wpp_phone_number_id = phoneToSend;
      if (!looksMasked(cfgToken) && tokenToSend) payload.wpp_access_token = tokenToSend;
      if (!looksMasked(cfgOpenAIKey) && openaiToSend) payload.openai_api_key = openaiToSend;

      await request(payload);
      setCfgSaved(true);
      showMessage("Configuración guardada.", "success");
      await loadConfig();
    } catch (e2) {
      showMessage(e2.message, "error");
    } finally {
      setCfgLoading(false);
    }
  };

  // WhatsApp Inbox (Mensajes)
  const loadWppConversations = async () => {
    if (!user?.id) return;
    setWppLoading(true);
    try {
      const res = await request({ action: "wppListConversations", aseguradora_id: user.id });
      setWppConversations(res.data || []);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setWppLoading(false);
    }
  };

  const loadWppMessages = async (conversationId) => {
    if (!user?.id || !conversationId) return;
    setWppLoading(true);
    try {
      const res = await request({
        action: "wppListMessages",
        aseguradora_id: user.id,
        conversation_id: conversationId,
      });
      setWppMessages(res.data || []);
      // scroll al final
      setTimeout(() => wppMsgsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setWppLoading(false);
    }
  };

  const sendWppInboxMessage = async () => {
    if (!user?.id || !wppActiveConvId) return;
    const conv = (wppConversations || []).find((c) => Number(c.id) === Number(wppActiveConvId));
    const to = conv?.wa_contact || conv?.phone;
    const msg = String(wppComposer || "").trim();
    if (!to) return showMessage("No se detecta destinatario.", "error");
    if (!msg) return;

    setWppComposer("");
    setWppLoading(true);
    try {
      // Reutilizamos /api/whatsapp/send (compat) y guardamos en inbox del backend
      await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aseguradora_id: user.id, to, message: msg }),
      }).then(async (r) => {
        const d = await r.json();
        if (d?.status === "error") throw new Error(d.message || "Error");
        return d;
      });

      // El SSE debería traer la confirmación; refrescamos por seguridad.
      await loadWppMessages(wppActiveConvId);
      await loadWppConversations();
    } catch (e) {
      showMessage(e.message, "error");
      // Reponer en el input por si falló
      setWppComposer(msg);
    } finally {
      setWppLoading(false);
    }
  };

  const loadWppDebugStatus = async () => {
    if (!user?.id) return;
    setWppDebugLoading(true);
    try {
      const r = await fetch(`/api/whatsapp/debug/status?aseguradora_id=${encodeURIComponent(String(user.id))}`, {
        method: "GET",
      });
      const d = await r.json();
      if (d?.status === "error") throw new Error(d.message || "Error");
      setWppDebugStatus(d?.data || null);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setWppDebugLoading(false);
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

      const res = await request({ action: "generateAdCopy", aseguradora_id: user.id, prompt: promptFinal });
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
    const baseIdea = String(mkPrompt || "").trim();
    const baseCopy = String(mkCopy || "").trim();
    const brief = baseCopy || baseIdea;
    if (!brief) return showMessage("Escribí la idea del anuncio antes de generar imagen.", "error");
    setMkImgLoading(true);
    try {
      const res = await request({
        action: "generateAdImageOpenAI",
        aseguradora_id: user.id,
        // Nota: usamos el copy generado si existe para que la imagen sea coherente con lo que se va a publicar.
        prompt:
          `Objetivo: crear una imagen publicitaria para seguros, profesional y ultra realista. ` +
          `Idioma: español por defecto (solo usar otro idioma si se pide explícitamente). ` +
          `Si hay texto en la imagen, debe ser en español y mínimo; preferir sin texto salvo que se pida. ` +
          (baseCopy
            ? `Copy aprobado (usar como guía principal): ${baseCopy}. `
            : "") +
          (baseIdea ? `Idea base: ${baseIdea}. ` : "") +
          `Entregar una estética corporativa, premium, creíble y acorde al brief.`,
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
  const clienteLookupAseguradoras = async () => {
    const dni = String(clienteDni || "").trim();
    const email = String(clienteEmail || "").trim();
    if (!dni) return showMessage("Ingresá tu documento.", "error");

    if (clienteAction) return;
    setClienteAction("lookup");
    try {
      const res = await request({ action: "lookupClientAseguradoras", dni, email });
      const matches = Array.isArray(res.matches) ? res.matches : [];
      setClienteMatches(matches);

      if (matches.length === 0) {
        setClienteSelectedAsegId("");
        showMessage("No encontramos ese documento.", "error");
        return;
      }

      // Si hay una sola, seleccionamos directo.
      if (matches.length === 1) {
        setClienteSelectedAsegId(String(matches[0].aseguradora_id));
        setClienteDocLabel(String(matches[0].pais || "").toUpperCase() === "UY" ? "Cédula" : "DNI");
      } else if (!email) {
        // Backend puede pedir email para desambiguar.
        showMessage("Encontramos más de una coincidencia. Ingresá tu email para identificar la correcta.", "info");
      }
    } catch (e) {
      // si el backend devolvió needs_email, nos llega como success igualmente; acá caen errores.
      showMessage(e.message, "error");
    } finally {
      setClienteAction(null);
    }
  };

  const clienteSendCode = async () => {
    const dni = String(clienteDni || "").trim();
    const asegId = String(clienteSelectedAsegId || "").trim();
    if (!dni) return showMessage("Ingresá tu documento.", "error");
    if (!asegId) return showMessage("Elegí tu aseguradora.", "error");

    if (clienteAction) return;
    setClienteAction("send");
    try {
      setClienteCodeDigits(["", "", "", "", "", ""]);
      lastClientAutoVerifyRef.current = "";
      const res = await request({ action: "sendClientLoginCode", aseguradora_id: asegId, dni });
      setClienteMaskedEmail(res.masked_email || "");
      showMessage(`Te enviamos un código a ${res.masked_email || "tu email"}.`, "success");

      setTimeout(() => {
        try {
          document.getElementById("cliente-digit-0")?.focus();
        } catch {
          // ignore
        }
      }, 0);
    } catch (e) {
      showMessage(e.message, "error");
    } finally {
      setClienteAction(null);
    }
  };

  const clienteVerifyAndLogin = async () => {
    const dni = String(clienteDni || "").trim();
    const asegId = String(clienteSelectedAsegId || "").trim();
    const code = clienteCodeDigits.join("").trim();
    if (!dni) return showMessage("Ingresá tu documento.", "error");
    if (!asegId) return showMessage("Elegí tu aseguradora.", "error");
    if (!code) return showMessage("Ingresá el código.", "error");

    if (clienteAction) return;
    setClienteAction("verify");
    try {
      const vr = await request({ action: "verifyClientLoginCode", aseguradora_id: asegId, dni, code });
      const token = String(vr.token || "");
      if (!token) throw new Error("No se recibió token");
      setClienteToken(token);

      // Opción C: el DNI se busca dentro de la DB del tenant (aseguradora)
      const res = await fetch("/api/cliente/by-dni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aseguradora_id: asegId, dni, client_token: token }),
      });
      const data = await res.json().catch(() => null);
      if (!data || data?.status === "error") throw new Error(data?.message || "Error");

      const found = data.data;
      if (!found) {
        setClienteData(null);
        setAsegPerfil(null);
        showMessage("No encontramos un cliente con ese documento.", "error");
        return;
      }

      const full = {
        ...found,
        dias_left: calcDaysLeft(found.fecha_fin_str),
        monto: normalizeMonto(found.monto),
      };
      setClienteData({
        ...full,
        grua_telefono: full.grua_telefono || SUPPORT_PHONE,
      });

      // Perfil aseguradora
      try {
        const pr = await request({
          action: "getAseguradoraPerfil",
          aseguradora_id: String(asegId),
        });
        setAsegPerfil(pr.data || null);
      } catch (e) {
        setAsegPerfil(null);
        showMessage(e.message, "error");
      }

      setClienteChat([
        {
          role: "assistant",
          text: `Hola ${full.nombre}. ¿Cómo estás? Soy tu asistente. Decime en qué puedo ayudarte con tu póliza o cobertura.`,
        },
      ]);
      setClienteMsg("");
      showMessage(`Bienvenido ${full.nombre} ${full.apellido}`, "success");
    } catch (e) {
      showMessage(e.message, "error");

      // UX: limpiar para reintentar fácil
      setClienteCodeDigits(["", "", "", "", "", ""]);
      lastClientAutoVerifyRef.current = "";
      setTimeout(() => {
        try {
          document.getElementById("cliente-digit-0")?.focus();
        } catch {
          // ignore
        }
      }, 0);
    } finally {
      setClienteAction(null);
    }
  };

  const verifyAseguradoraEmailCode = async ({ email, code }) => {
    if (!email) return;
    if (!code || String(code).length !== 6) return;
    if (loading) return;

    setLoading(true);
    try {
      const res = await fetch("/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, pais: authPais }),
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : { status: "error", message: "Respuesta vacía del servidor" };
      if (data.status === "success") {
        // Guardar JWT (lo usa el AdminDashboard)
        if (data.token) {
          try {
            localStorage.setItem("token", String(data.token));
          } catch {
            // ignore
          }
        }

        setUser(data.user);
        setMode("dashboard");
        if (data.user?.rol === "admin") {
          setMenu("admin");
        } else {
          setMenu("cartera");
          loadClients(data.user.id);
        }
        showMessage(`Bienvenido ${data.user.nombre}`, "success");
      } else {
        showMessage(data.message, "error");

        // UX: si se equivoca, limpiar para reintentar fácil
        setCodeDigits(["", "", "", "", "", ""]);
        lastAutoVerifyRef.current = "";
        setTimeout(() => {
          try {
            document.getElementById("digit-0")?.focus();
          } catch {
            // ignore
          }
        }, 0);
      }
    } catch (e) {
      showMessage(e.message, "error");

      // UX: limpiar también en error de red/servidor
      setCodeDigits(["", "", "", "", "", ""]);
      lastAutoVerifyRef.current = "";
      setTimeout(() => {
        try {
          document.getElementById("digit-0")?.focus();
        } catch {
          // ignore
        }
      }, 0);
    } finally {
      setLoading(false);
    }
  };

  const clienteLogout = () => {
    resetClientPortalState();
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
      // Preferir voz en español (Argentina) si existe en el SO/navegador.
      u.lang = "es-AR";
      try {
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferred =
          voices.find((v) => String(v.lang || "").toLowerCase() === "es-ar") ||
          voices.find((v) => String(v.lang || "").toLowerCase().startsWith("es-ar")) ||
          voices.find((v) => String(v.lang || "").toLowerCase().startsWith("es-")) ||
          null;
        if (preferred) {
          u.voice = preferred;
          u.lang = preferred.lang || u.lang;
        }
      } catch {}
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

    // Tenant: el portal cliente depende de la aseguradora seleccionada.
    const tenantAsegId = String(clienteSelectedAsegId || "").trim();
    if (!tenantAsegId) {
      showMessage("Falta la aseguradora. Volvé y seleccionála.", "error");
      return;
    }

    setClienteChat((prev) => [...prev, { role: "user", text: q }]);
    setClienteMsg("");
    scrollChatToBottom();

    // ✅ NUEVO: simular mensaje entrante hacia bandeja "Mensajes" (tenant aseguradora)
    try {
      await fetch("/api/whatsapp/simulate-incoming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aseguradora_id: tenantAsegId,
          from_phone: clienteData.telefono,
          name: `${clienteData.nombre || ""} ${clienteData.apellido || ""}`.trim(),
          body: q,
        }),
      });
    } catch {
      // best-effort: no interrumpir al cliente
    }

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

      const r = await request({ action: "generateAdCopy", aseguradora_id: tenantAsegId, prompt: promptAsistente });
      const raw = String(r.copy || "").trim();
      let answer = sanitizeToSingle(raw);

      if (!answer) answer = "Puedo ayudarte con tu póliza, cobertura, vencimiento y grúa. ¿Qué necesitás?";

      setClienteChat((prev) => [...prev, { role: "assistant", text: answer }]);
      scrollChatToBottom();
      speak(answer);
    } catch (e) {
      const m = String(e?.message || "").trim();
      const friendly =
        /OpenAI no configurado/i.test(m)
          ? "El asistente no está disponible en este momento. Pedile a tu aseguradora que active OpenAI en Configuración."
          : m
          ? `No pude procesar tu consulta ahora. (${m})`
          : "No pude procesar tu consulta ahora.";
      setClienteChat((prev) => [...prev, { role: "assistant", text: friendly }]);
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
        rec.lang = "es-AR";
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

      // ✅ NUEVO: filtros pagos
      if (typeof st.pagosFilter === "string") setPagosFilter(st.pagosFilter);
      if (typeof st.pagosSearch === "string") setPagosSearch(st.pagosSearch);
      if (typeof st.pagoAlias === "string") {
        setPagoAlias(st.pagoAlias);
        setPagoAliasDraft(st.pagoAlias);
      }
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

      // ✅ NUEVO: pagos
      pagosFilter,
      pagosSearch,
      pagoAlias,
    });
  }, [
    rootView,
    mode,
    authView,
    menu,
    voiceOn,
    pagosFilter,
    pagosSearch,
    pagoAlias,
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

  useEffect(() => {
    if (mode === "dashboard" && menu === "mensajes") {
      loadWppConversations();
      loadWppDebugStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, mode]);

  useEffect(() => {
    // Realtime WhatsApp inbox only when Mensajes is open
    if (!(rootView === "aseguradoras" && mode === "dashboard" && menu === "mensajes")) {
      try {
        wppEsRef.current?.close?.();
      } catch {
        // ignore
      }
      wppEsRef.current = null;
      setWppSseState("disconnected");
      return;
    }

    if (!user?.id) return;

    try {
      wppEsRef.current?.close?.();
    } catch {
      // ignore
    }

    setWppSseState("connecting");
    const es = new EventSource(`/api/whatsapp/stream?aseguradora_id=${encodeURIComponent(String(user.id))}`);
    wppEsRef.current = es;

    es.onopen = () => {
      setWppSseState("connected");
      setWppSseLastErrorAt(null);
    };

    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload?.type !== "wpp_message") return;

        setWppSseLastEventAt(new Date().toISOString());

        setWppConversations((prev) => {
          const list = Array.isArray(prev) ? [...prev] : [];
          const idx = list.findIndex((c) => Number(c.id) === Number(payload.conversation_id));
          if (idx >= 0) {
            const cur = { ...list[idx] };
            cur.last_body = payload.body;
            cur.last_direction = payload.direction;
            cur.last_created_at = payload.created_at;
            list.splice(idx, 1);
            list.unshift(cur);
            return list;
          }
          // unknown conversation -> refresh
          loadWppConversations();
          return list;
        });

        if (Number(wppActiveConvId) === Number(payload.conversation_id)) {
          setWppMessages((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            list.push({
              id: `tmp_${Date.now()}`,
              conversation_id: payload.conversation_id,
              direction: payload.direction,
              body: payload.body,
              created_at: payload.created_at,
            });
            return list;
          });
          setTimeout(() => wppMsgsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects, pero mostramos estado para debug visual
      setWppSseState("error");
      setWppSseLastErrorAt(new Date().toISOString());
    };

    return () => {
      try {
        es.close();
      } catch {
        // ignore
      }
      setWppSseState("disconnected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootView, mode, menu, user?.id, wppActiveConvId]);

  useEffect(() => {
    if (introDone) return;
    const v = introVideoRef.current;
    if (!v) return;
    v.muted = introMuted;
    const p = v.play?.();
    if (p && typeof p.catch === "function") {
      p.catch(() => setIntroNeedsClick(true));
    }
  }, [introDone, introMuted]);

  const startIntroWithSound = async () => {
    const v = introVideoRef.current;
    setIntroNeedsClick(false);
    setIntroMuted(false);
    if (!v) return;
    try {
      v.muted = false;
      await v.play();
    } catch {
      // si el navegador igual bloquea, dejamos el botón "Entrar"
      setIntroNeedsClick(true);
    }
  };

  if (!introDone) {
    return (
      <div className="fixed inset-0 z-[10000] bg-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-sm">
            <video
              ref={introVideoRef}
              src="/intro.mp4"
              autoPlay
              muted={introMuted}
              playsInline
              controls
              className="w-full max-h-[80vh] object-contain bg-slate-900"
              onEnded={() => setIntroDone(true)}
              onError={() => setIntroDone(true)}
            />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="text-xs text-slate-300">
              {introMuted ? "El video arranca en silencio por política del navegador." : "Sonido activado."}
            </div>

            <div className="flex gap-3 justify-end flex-wrap">
              {introMuted ? (
                <button
                  type="button"
                  onClick={startIntroWithSound}
                  className="px-5 py-3 rounded-2xl bg-white text-slate-900 text-xs font-black border border-slate-200 shadow-sm hover:bg-slate-50"
                >
                  Activar sonido
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setIntroDone(true)}
                className="px-5 py-3 rounded-2xl bg-slate-800 text-white text-xs font-black border border-slate-700 hover:bg-slate-700"
              >
                Entrar
              </button>
            </div>
          </div>

          {introNeedsClick ? (
            <div className="mt-3 text-[11px] text-slate-400">
              Tip: si no reproduce, tocá “Activar sonido” o usá los controles del video.
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  /* ================== HOME ================== */
  if (rootView === "home") {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center p-6 font-sans">
        {Toast}
        <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-800 p-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="bg-white h-[38px] w-[38px] rounded-full border border-slate-200 overflow-hidden shadow-sm flex items-center justify-center">
              {brandLogoOk ? (
                <img
                  src="/cogniseguros-logo.png"
                  alt="Cogniseguros"
                  className="h-full w-full object-cover rounded-full"
                  onError={() => setBrandLogoOk(false)}
                />
              ) : (
                <div className="bg-[var(--c2)] h-full w-full flex items-center justify-center">
                  <Shield size={22} className="text-white" />
                </div>
              )}
            </div>
            <div className="text-3xl font-black text-slate-900">COGNISEGUROS</div>
          </div>

          <div className="text-center text-slate-500 mb-10">Seguros inteligentes</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button
              onClick={() => setRootView("aseguradoras")}
              className="p-8 rounded-3xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Building2 className="text-[var(--c1)]" />
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
                <User className="text-[var(--c3)]" />
                <div className="text-xl font-black text-slate-900">Clientes</div>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Ingreso por DNI, ver datos completos, grúa, póliza y asistente IA.
              </div>
            </button>

            <button
              onClick={() => setRootView("devadmin")}
              className="p-8 rounded-3xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Shield className="text-[var(--c1)]" />
                <div className="text-xl font-black text-slate-900">Admin (Desarrollador)</div>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Gestioná licencias y accesos (invitaciones/usuarios) con ADMIN_KEY.
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

  /* ================== ADMIN DESARROLLADOR ================== */
  if (rootView === "devadmin") {
    return (
      <DeveloperAdmin
        onExit={() => {
          setRootView("home");
        }}
      />
    );
  }

  /* ================== CLIENTES PORTAL ================== */
  if (rootView === "clientes") {
    return (
      <div className="min-h-screen bg-slate-900 p-6 font-sans">
        {Toast}
        <BackButton
          show
          onClick={() => {
            resetClientPortalState();
            setRootView("home");
          }}
          dark
        />

        <div className="max-w-5xl mx-auto">
          {!clienteData ? (
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-800 p-10">
              <div className="text-center mb-8">
                <User className="mx-auto text-emerald-600 mb-4" size={52} />
                <div className="text-3xl font-black text-slate-900">Portal Cliente</div>
                <div className="text-slate-500 mt-2">
                  Ingresá con tu {String(clienteDocLabel || "Documento").toLowerCase()} para ver tu seguro y descargar tu póliza.
                </div>
              </div>

              <div className="max-w-md mx-auto space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700">{clienteDocLabel}</label>
                  <input
                    value={clienteDni}
                    onChange={(e) => setClienteDni(e.target.value)}
                    placeholder="Ej: 12345678"
                    className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700">Email (opcional, recomendado)</label>
                  <input
                    value={clienteEmail}
                    onChange={(e) => setClienteEmail(e.target.value)}
                    placeholder="El email con el que estás registrado"
                    className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                  />
                  <div className="text-[11px] text-slate-400">
                    Esto ayuda a identificar tu aseguradora si hay coincidencias.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={clienteLookupAseguradoras}
                  disabled={!!clienteAction}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {clienteAction === "lookup" ? <Loader2 className="animate-spin" /> : <Search size={18} />}
                  Buscar mi aseguradora
                </button>

                {clienteMatches?.length ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="text-xs font-black text-slate-700">Aseguradora</div>

                    {clienteMatches.length === 1 ? (
                      <div className="text-sm text-slate-700">
                        {clienteMatches[0].aseguradora_nombre}
                      </div>
                    ) : (
                      <select
                        value={clienteSelectedAsegId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setClienteSelectedAsegId(nextId);
                          const m = (clienteMatches || []).find(
                            (x) => String(x.aseguradora_id) === String(nextId)
                          );
                          if (m) {
                            setClienteDocLabel(String(m.pais || "").toUpperCase() === "UY" ? "Cédula" : "DNI");
                          }
                        }}
                        className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none bg-white"
                      >
                        <option value="">Elegí tu aseguradora...</option>
                        {clienteMatches.map((m) => (
                          <option key={String(m.aseguradora_id)} value={String(m.aseguradora_id)}>
                            {m.aseguradora_nombre}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={clienteSendCode}
                      disabled={!!clienteAction || !String(clienteSelectedAsegId || "").trim()}
                      className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-2xl shadow flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {clienteAction === "send" ? <Loader2 className="animate-spin" /> : <Mail size={18} />}
                      Enviar código
                    </button>

                    {clienteMaskedEmail ? (
                      <div className="text-xs text-slate-500">
                        Te lo mandamos a: <span className="font-black">{clienteMaskedEmail}</span>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-700">Código</label>
                      <div className="flex gap-2 justify-center">
                        {clienteCodeDigits.map((digit, idx) => (
                          <input
                            key={idx}
                            id={`cliente-digit-${idx}`}
                            type="text"
                            maxLength="1"
                            value={digit}
                            onChange={(e) => {
                              const v = String(e.target.value || "").slice(0, 1);
                              const next = [...clienteCodeDigits];
                              next[idx] = v;
                              setClienteCodeDigits(next);

                              if (v && idx < 5) {
                                document.getElementById(`cliente-digit-${idx + 1}`)?.focus();
                              }

                              // Auto-ingresar al completar el 6º dígito (sin quitar el botón)
                              if (idx === 5 && v) {
                                const code = next.join("");
                                const dni = String(clienteDni || "").trim();
                                const asegId = String(clienteSelectedAsegId || "").trim();
                                if (dni && asegId && code.length === 6) {
                                  const key = `${asegId}:${dni}:${code}`;
                                  if (lastClientAutoVerifyRef.current !== key) {
                                    lastClientAutoVerifyRef.current = key;
                                    clienteVerifyAndLogin();
                                  }
                                }
                              }
                            }}
                            className="w-12 h-12 px-0 py-0 bg-white border-2 border-slate-300 rounded-xl outline-none text-center text-lg font-black text-slate-900"
                          />
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 text-center">
                        Ingresá los 6 dígitos.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={clienteVerifyAndLogin}
                      disabled={!!clienteAction || clienteCodeDigits.join("").trim().length !== 6}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {clienteAction === "verify" ? <Loader2 className="animate-spin" /> : <Shield size={18} />}
                      Verificar e ingresar
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={openSupport}
                  className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-2xl shadow flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} /> Contactar soporte
                </button>

                <div className="text-xs text-slate-400 text-center mt-3">
                  Si tu {String(clienteDocLabel || "documento").toLowerCase()} no aparece, pedile a tu aseguradora que te cargue en la cartera.
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
                    <span
                      className={
                        String(clienteData.pais || "").toUpperCase() === "UY"
                          ? "text-sky-700 font-black"
                          : "font-black"
                      }
                    >
                      {String(clienteDocLabel || "Documento")}:
                    </span>{" "}
                    <span className="font-black">{clienteData.documento}</span> — Tel:{" "}
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
              type="button"
              onClick={() => setAuthView("login")}
              className="flex-1 py-3 text-sm font-black rounded-lg bg-white text-blue-600 shadow-sm"
            >
              Iniciar sesión
            </button>
          </div>

          <form ref={authFormRef} className="space-y-5">
            {/* STEP 1: EMAIL */}
            {!emailStep && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700">Email</label>
                  <input
                    id="emailInput"
                    type="email"
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
                    placeholder="tu@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-700">País</label>
                  <select
                    value={authPais}
                    onChange={(e) => setAuthPais(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none"
                  >
                    <option value="AR">🇦🇷 Argentina</option>
                    <option value="UY">🇺🇾 Uruguay</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const email = document.getElementById("emailInput").value;
                    if (!email) return showMessage("Ingresá tu email", "error");
                    setLoading(true);
                    try {
                      const res = await fetch("/send-code", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email }),
                      });
                      const raw = await res.text();
                      const data = raw ? JSON.parse(raw) : { status: "error", message: "Respuesta vacía del servidor" };
                      if (data.status === "success") {
                        setEmailStep(email);
                        showMessage("Código enviado a tu email", "success");
                      } else {
                        showMessage(data.message, "error");
                      }
                    } catch (e) {
                      showMessage(e.message, "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                  Enviar código
                </button>
              </>
            )}

            {/* STEP 2: CÓDIGO */}
            {emailStep && (
              <>
                <div className="text-center mb-4">
                  <p className="text-sm font-black text-slate-700">Ingresa el código de {emailStep}</p>
                </div>

                <div className="flex gap-2 justify-center mb-4">
                  {codeDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength="1"
                      value={digit}
                      onChange={(e) => {
                        const newDigits = [...codeDigits];
                        newDigits[idx] = e.target.value.slice(0, 1);
                        setCodeDigits(newDigits);
                        if (e.target.value && idx < 5) {
                          document.getElementById(`digit-${idx + 1}`).focus();
                        }

                        // Auto-verificar al completar el 6º dígito (sin quitar el botón)
                        if (idx === 5 && e.target.value) {
                          const code = newDigits.join("");
                          if (code.length === 6 && emailStep) {
                            const key = `${emailStep}:${code}`;
                            if (lastAutoVerifyRef.current !== key) {
                              lastAutoVerifyRef.current = key;
                              verifyAseguradoraEmailCode({ email: emailStep, code });
                            }
                          }
                        }
                      }}
                      id={`digit-${idx}`}
                      className="w-12 h-12 px-0 py-0 bg-white border-2 border-slate-300 rounded-xl outline-none text-center text-lg font-black text-slate-900"
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const code = codeDigits.join("");
                    if (code.length !== 6) return showMessage("Completa los 6 dígitos", "error");
                    verifyAseguradoraEmailCode({ email: emailStep, code });
                  }}
                  disabled={loading || codeDigits.join("").length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                  Verificar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmailStep(null);
                    setCodeDigits(["", "", "", "", "", ""]);
                  }}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-2 rounded-2xl text-sm"
                >
                  Volver
                </button>
              </>
            )}

            {!emailStep && (
              <button
                type="button"
                onClick={openSupport}
                className="w-full bg-slate-900 hover:bg-black text-white font-black py-3 rounded-2xl shadow flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} /> Contactar soporte
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  /* ================== ASEGURADORAS DASHBOARD ================== */
  if (rootView === "aseguradoras" && mode === "dashboard") {
    if (user?.rol === "admin") {
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
          <AdminDashboard />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-transparent font-sans">
        {Toast}

        {/* TOP BAR */}
        <div className="sticky top-0 z-50 bg-[var(--panel)] text-[var(--text)] border-b border-[var(--line)]">
          <div className="max-w-7xl mx-auto px-6 py-3 grid grid-cols-3 items-center">
            <div className="justify-self-start">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setRootView("home");
                  }}
                  className="flex items-center gap-2 text-sm font-black px-3 py-2 rounded-xl border shadow-lg shadow-black/30 bg-[var(--panel)] text-[var(--text)] border-[rgba(63,209,255,.45)] hover:bg-[rgba(255,255,255,.04)]"
                >
                  <ChevronLeft size={18} />
                  Volver
                </button>

                <div className="hidden sm:block text-left leading-tight min-w-0 max-w-[260px]">
                  <div className="text-xs font-black truncate">{user?.nombre}</div>
                  <div className="text-[11px] text-[var(--muted)] truncate">{user?.email}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <div className="bg-[rgba(255,255,255,.04)] h-[54px] w-[54px] shrink-0 rounded-full border border-[rgba(255,255,255,.10)] overflow-hidden shadow-sm flex items-center justify-center">
                {brandLogoOk ? (
                  <img
                    src="/cogniseguros-logo.png"
                    alt="Cogniseguros"
                    className="h-full w-full object-cover rounded-full"
                    onError={() => setBrandLogoOk(false)}
                  />
                ) : (
                  <Shield size={22} />
                )}
              </div>
              <div className="text-center">
                <div className="font-black leading-none">COGNISEGUROS</div>
                <div className="text-xs text-[var(--muted)]">Panel Aseguradora</div>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-self-end">
              {canSwitchPais() ? (
                <div className="flex items-center gap-2">
                  <img
                    src={getPaisNorm() === "UY" ? "/flags/uy.svg" : "/flags/ar.svg"}
                    alt={getPaisMeta().name}
                    className="h-5 w-5 rounded-full border border-[rgba(255,255,255,.20)]"
                    loading="lazy"
                  />
                  <select
                    value={getPaisNorm()}
                    onChange={(e) => changePaisVista(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[rgba(63,209,255,.10)] hover:bg-[rgba(63,209,255,.16)] text-xs font-black text-[var(--c1)] border border-[rgba(63,209,255,.35)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--c1)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]"
                    title="Cambiar país de vista"
                  >
                    <option value="AR">Argentina</option>
                    <option value="UY">Uruguay</option>
                  </select>
                </div>
              ) : (
                <div
                  className="px-3 py-2 rounded-xl bg-[rgba(63,209,255,.10)] text-xs font-black text-[var(--c1)] border border-[rgba(63,209,255,.35)] flex items-center gap-2"
                  title="País de vista"
                >
                  <img
                    src={getPaisNorm() === "UY" ? "/flags/uy.svg" : "/flags/ar.svg"}
                    alt={getPaisMeta().name}
                    className="h-5 w-5 rounded-full border border-[rgba(255,255,255,.20)]"
                    loading="lazy"
                  />
                  <span>{getPaisMeta().name}</span>
                </div>
              )}

              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--c1)] to-[var(--c2)] text-slate-900 text-xs font-black flex items-center gap-2 hover:opacity-95"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 rounded-xl bg-[rgba(255,255,255,.04)] hover:bg-[rgba(255,255,255,.06)] text-xs font-black flex items-center gap-2 border border-[rgba(255,255,255,.10)]"
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
              active={menu === "mensajes"}
              icon={<MessageCircle size={16} />}
              label="Mensajes"
              onClick={() => setMenu("mensajes")}
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
              className="col-span-2 sm:col-span-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-[var(--c3)] to-[var(--c1)] text-slate-900 border border-transparent shadow-lg shadow-black/30 text-xs font-black hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c3)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)] flex items-center justify-center gap-2"
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
                <h2 className="text-2xl sm:text-3xl font-black text-[var(--text)] flex flex-wrap items-center gap-x-3 gap-y-2">
                  <input
                    ref={perfilFotoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadPerfilFoto(f);
                      // permitir re-seleccionar el mismo archivo
                      try {
                        e.target.value = "";
                      } catch {
                        // ignore
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => perfilFotoInputRef.current?.click()}
                    title={user?.profile_photo_dataurl ? "Cambiar foto" : "Cargar foto"}
                    className="h-16 w-16 rounded-full border border-[rgba(108,255,185,.55)] bg-[rgba(108,255,185,.14)] text-[10px] font-black text-[var(--c3)] flex items-center justify-center overflow-hidden hover:bg-[rgba(108,255,185,.20)] shadow-lg shadow-black/25"
                  >
                    {user?.profile_photo_dataurl ? (
                      <img
                        src={user.profile_photo_dataurl}
                        alt="Perfil"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="leading-none text-center">+ FOTO</span>
                    )}
                  </button>

                  <span className="text-sm sm:text-base font-black text-[var(--muted)]">
                    {user?.nombre || user?.email || ""}
                  </span>

                  <span className="text-[var(--text)]">Cartera de clientes</span>

                  <span className="text-[var(--muted)]">—</span>

                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-[rgba(63,209,255,.10)] text-[var(--c1)] border border-[rgba(63,209,255,.35)]">
                    <img
                      src={getPaisNorm() === "UY" ? "/flags/uy.svg" : "/flags/ar.svg"}
                      alt={getPaisMeta().name}
                      className="h-5 w-5 rounded-full border border-[rgba(255,255,255,.20)]"
                      loading="lazy"
                    />
                    <span>{getPaisMeta().name}</span>
                  </span>
                </h2>

                <div className="flex gap-3 flex-wrap justify-end">
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => importClientesExcelFile(e.target.files?.[0])}
                  />

                  <button
                    onClick={exportClientesExcel}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Exporta la cartera a un archivo .xlsx"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <Download size={16} className="text-[var(--c3)]" />
                    )}
                    Exportar Excel
                  </button>

                  <button
                    onClick={downloadClientesExcelTemplate}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Descarga una plantilla vacía (.xlsx) con las columnas esperadas"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <FileText size={16} className="text-[var(--c3)]" />
                    )}
                    Plantilla Excel
                  </button>

                  <button
                    onClick={() => openImportExcel("cartera")}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Importa clientes desde un archivo .xlsx"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <FileText size={16} className="text-[var(--c3)]" />
                    )}
                    Importar Excel
                  </button>

                  <button
                    onClick={() => loadClients(user.id)}
                    className="px-4 py-3 rounded-2xl bg-[rgba(63,209,255,.14)] border border-[rgba(63,209,255,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(63,209,255,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin text-[var(--c1)]" size={16} />
                    ) : (
                      <RefreshCcw size={16} className="text-[var(--c1)]" />
                    )}
                    Actualizar
                  </button>

                  <button
                    onClick={openNewClient}
                    className="px-5 py-3 rounded-2xl bg-[var(--panel)] text-[var(--text)] text-xs font-black shadow-lg flex items-center gap-2 border border-[rgba(63,209,255,.35)] hover:border-[rgba(166,108,255,.40)] hover:bg-[rgba(255,255,255,.04)] focus:outline-none focus:ring-2 focus:ring-[rgba(63,209,255,.35)]"
                  >
                    <Plus size={16} /> Nuevo cliente
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Pill>Tip: en móvil podés scrollear horizontal la tabla</Pill>
              </div>

              <ClientsTableFull
                clients={filterByPaisVista(clients)}
                loading={loading}
                paisVista={getPaisNorm()}
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
                <h2 className="text-2xl sm:text-3xl font-black text-[var(--text)] flex items-center gap-2">
                  <Clock size={22} className="text-[var(--c1)]" /> Vencimientos (≤ 7 días) — {getPaisMeta().flag} {getPaisMeta().name}
                </h2>

                <div className="flex gap-3 flex-wrap justify-end">
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => importClientesExcelFile(e.target.files?.[0])}
                  />

                  <button
                    onClick={exportVencimientosExcel}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Exporta los vencimientos a un archivo .xlsx"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <Download size={16} className="text-[var(--c3)]" />
                    )}
                    Exportar Excel
                  </button>

                  <button
                    onClick={downloadClientesExcelTemplate}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Descarga una plantilla (.xlsx) con las columnas esperadas"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <FileText size={16} className="text-[var(--c3)]" />
                    )}
                    Plantilla Excel
                  </button>

                  <button
                    onClick={() => openImportExcel("vencimientos")}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Importa clientes desde un archivo .xlsx"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <FileText size={16} className="text-[var(--c3)]" />
                    )}
                    Importar Excel
                  </button>

                  <button
                    onClick={() => loadClients(user.id)}
                    className="px-4 py-3 rounded-2xl bg-[rgba(63,209,255,.14)] border border-[rgba(63,209,255,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(63,209,255,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin text-[var(--c1)]" size={16} />
                    ) : (
                      <RefreshCcw size={16} className="text-[var(--c1)]" />
                    )}
                    Actualizar
                  </button>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Pill tone="blue">Auto: WhatsApp Cloud (backend)</Pill>
                <Pill>Manual: wa.me</Pill>
                <Pill tone="green">Incluye Monto</Pill>
              </div>

              <ClientsTableFull
                clients={filterByPaisVista(vencimientos)}
                loading={loading}
                paisVista={getPaisNorm()}
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
                <h2 className="text-2xl sm:text-3xl font-black text-[var(--text)] flex items-center gap-2">
                  <DollarSign size={22} className="text-[var(--c1)]" /> Pagos (cartera + filtros) — {getPaisMeta().flag} {getPaisMeta().name}
                </h2>

                <div className="flex gap-3 flex-wrap justify-end">
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => importClientesExcelFile(e.target.files?.[0])}
                  />

                  <button
                    onClick={exportPagosExcel}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Exporta la lista de pagos a un archivo .xlsx"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <Download size={16} className="text-[var(--c3)]" />
                    )}
                    Exportar Excel
                  </button>

                  <button
                    onClick={downloadClientesExcelTemplate}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Descarga una plantilla (.xlsx) con las columnas esperadas"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <FileText size={16} className="text-[var(--c3)]" />
                    )}
                    Plantilla Excel
                  </button>

                  <button
                    onClick={() => openImportExcel("pagos")}
                    className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading || excelBusy}
                    title="Importa clientes desde un archivo .xlsx"
                  >
                    {excelBusy ? (
                      <Loader2 className="animate-spin text-[var(--c3)]" size={16} />
                    ) : (
                      <FileText size={16} className="text-[var(--c3)]" />
                    )}
                    Importar Excel
                  </button>

                  <button
                    onClick={() => loadClients(user.id)}
                    className="px-4 py-3 rounded-2xl bg-[rgba(63,209,255,.14)] border border-[rgba(63,209,255,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(63,209,255,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin text-[var(--c1)]" size={16} />
                    ) : (
                      <RefreshCcw size={16} className="text-[var(--c1)]" />
                    )}
                    Actualizar
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-5">
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="flex items-center gap-2">
                    <Pill tone="blue">Alias: {pagoAlias}</Pill>
                    <Pill tone="amber">Vencidos: {pagosCountVencida}</Pill>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="flex items-center gap-2">
                      <input
                        value={pagoAliasDraft}
                        onChange={(e) => setPagoAliasDraft(e.target.value)}
                        placeholder={DEFAULT_PAGO_ALIAS}
                        className="px-4 py-3 border border-slate-300 rounded-2xl outline-none w-full sm:w-[180px]"
                        title="Alias de pago para mensajes de cuota"
                      />
                      <button
                        type="button"
                        onClick={savePagoAlias}
                        className="px-4 py-3 rounded-2xl bg-[rgba(108,255,185,.14)] border border-[rgba(108,255,185,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(108,255,185,.20)]"
                        title="Guardar alias"
                      >
                        Guardar
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        value={pagosSearch}
                        onChange={(e) => setPagosSearch(e.target.value)}
                        placeholder="Buscar por nombre, documento, tel, email..."
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
                clients={filterByPaisVista(pagosList)}
                loading={loading}
                paisVista={getPaisNorm()}
                showMonto
                showPagoStatus
                showPagoWhatsApp
                pagoAlias={pagoAlias}
                onPagoWhatsAppAuto={sendWhatsAppPagoAuto}
                onPagoWhatsAppManual={sendWhatsAppPagoManual}
                onEdit={openEditClient}
                onDelete={openDeleteModal}
              />
            </>
          )}

          {/* ✅ NUEVO: MENSAJES (WhatsApp Inbox) */}
          {menu === "mensajes" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-2xl sm:text-3xl font-black text-[var(--text)] flex items-center gap-2">
                  <MessageCircle size={22} className="text-[var(--c1)]" /> Mensajes — {getPaisMeta().flag} {getPaisMeta().name}
                </h2>

                <div className="flex gap-3 flex-wrap justify-end">
                  <button
                    onClick={loadWppDebugStatus}
                    className="px-4 py-3 rounded-2xl bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.12)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(255,255,255,.06)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={wppDebugLoading || !user?.id}
                    title="Ver diagnóstico del backend (webhook y envíos)"
                  >
                    {wppDebugLoading ? (
                      <Loader2 className="animate-spin text-[var(--text)]" size={16} />
                    ) : (
                      <AlertTriangle size={16} className="text-[var(--text)]" />
                    )}
                    Diagnóstico
                  </button>
                  <button
                    onClick={loadWppConversations}
                    className="px-4 py-3 rounded-2xl bg-[rgba(63,209,255,.14)] border border-[rgba(63,209,255,.32)] shadow-sm text-xs font-black text-[var(--text)] hover:bg-[rgba(63,209,255,.20)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={wppLoading}
                  >
                    {wppLoading ? (
                      <Loader2 className="animate-spin text-[var(--c1)]" size={16} />
                    ) : (
                      <RefreshCcw size={16} className="text-[var(--c1)]" />
                    )}
                    Actualizar
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <div className="bg-[rgba(255,255,255,.03)] border border-[rgba(255,255,255,.10)] rounded-2xl px-4 py-3 text-[12px] text-[var(--muted)]">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-[var(--text)] font-black">
                      Estado tiempo real: {wppSseState === "connected" ? "Conectado" : wppSseState === "connecting" ? "Conectando…" : wppSseState === "error" ? "Con error (reintenta)" : "Desconectado"}
                    </div>
                    <div className="text-[11px]">
                      Último evento: {wppSseLastEventAt ? new Date(wppSseLastEventAt).toLocaleString() : "—"} · Último error: {wppSseLastErrorAt ? new Date(wppSseLastErrorAt).toLocaleString() : "—"}
                    </div>
                  </div>
                  {wppDebugStatus ? (
                    <div className="mt-2">
                      {Array.isArray(wppDebugStatus?.debug?.webhook_hits) && wppDebugStatus.debug.webhook_hits.length === 0 ? (
                        <div className="mb-2 text-[11px] text-[var(--muted)]">
                          Si <span className="text-[var(--text)] font-black">webhook_hits</span> está vacío, Meta no está llamando a tu webhook. En local (localhost) NO puede recibir: necesitás una URL pública HTTPS (ngrok o deploy) configurada en Meta.
                        </div>
                      ) : null}
                      <details>
                        <summary className="cursor-pointer select-none text-[var(--text)] font-black">Ver diagnóstico</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-[var(--muted)]">
                          {JSON.stringify(wppDebugStatus, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
                <div className="bg-[var(--panel)] rounded-3xl border border-[var(--line)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--line)]">
                    <div className="text-sm font-black text-[var(--text)]">Chats</div>
                    <div className="text-[11px] text-[var(--muted)]">Entrantes y salientes en tiempo real</div>
                  </div>

                  <div className="max-h-[70vh] overflow-auto">
                    {(wppConversations || []).length === 0 ? (
                      <div className="p-6 text-sm text-[var(--muted)]">Aún no hay conversaciones.</div>
                    ) : (
                      (wppConversations || []).map((c) => {
                        const active = Number(wppActiveConvId) === Number(c.id);
                        const title = (c.name || "").trim() || (c.phone || c.wa_contact || "");
                        const preview = String(c.last_body || "").trim();
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={async () => {
                              setWppActiveConvId(c.id);
                              await loadWppMessages(c.id);
                            }}
                            className={
                              "w-full text-left px-5 py-4 border-b border-[rgba(255,255,255,.06)] hover:bg-[rgba(255,255,255,.04)] transition " +
                              (active
                                ? "bg-[rgba(63,209,255,.10)] border-l-4 border-l-[var(--c1)]"
                                : "bg-transparent border-l-4 border-l-transparent")
                            }
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-black text-sm text-[var(--text)] truncate">{title}</div>
                                <div className="text-[12px] text-[var(--muted)] truncate">{preview || "—"}</div>
                              </div>
                              <div className="text-[10px] text-[var(--muted)] shrink-0">
                                {c.last_created_at ? new Date(c.last_created_at).toLocaleString() : ""}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="bg-[var(--panel)] rounded-3xl border border-[var(--line)] overflow-hidden flex flex-col min-h-[70vh]">
                  <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[var(--text)] truncate">
                        {(() => {
                          const conv = (wppConversations || []).find((x) => Number(x.id) === Number(wppActiveConvId));
                          if (!conv) return "Seleccioná un chat";
                          return (conv.name || "").trim() || (conv.phone || conv.wa_contact || "Chat");
                        })()}
                      </div>
                      <div className="text-[11px] text-[var(--muted)] truncate">
                        {(() => {
                          const conv = (wppConversations || []).find((x) => Number(x.id) === Number(wppActiveConvId));
                          if (!conv) return "";
                          return conv.phone || conv.wa_contact || "";
                        })()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => wppActiveConvId && loadWppMessages(wppActiveConvId)}
                      className="px-4 py-2 rounded-xl bg-[rgba(255,255,255,.04)] hover:bg-[rgba(255,255,255,.06)] text-xs font-black flex items-center gap-2 border border-[rgba(255,255,255,.10)]"
                      disabled={!wppActiveConvId || wppLoading}
                    >
                      <RefreshCcw size={16} /> Recargar
                    </button>
                  </div>

                  <div className="flex-1 p-5 overflow-auto">
                    {!wppActiveConvId ? (
                      <div className="text-sm text-[var(--muted)]">Elegí una conversación para ver los mensajes.</div>
                    ) : (wppMessages || []).length === 0 ? (
                      <div className="text-sm text-[var(--muted)]">Sin mensajes aún.</div>
                    ) : (
                      <div className="space-y-3">
                        {(wppMessages || []).map((m) => {
                          const isOut = String(m.direction) === "out";
                          return (
                            <div key={m.id} className={"flex " + (isOut ? "justify-end" : "justify-start")}
                            >
                              <div
                                className={
                                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed border shadow-sm " +
                                  (isOut
                                    ? "bg-[rgba(166,108,255,.18)] border-[rgba(166,108,255,.35)] text-[var(--text)]"
                                    : "bg-[rgba(63,209,255,.12)] border-[rgba(63,209,255,.30)] text-[var(--text)]")
                                }
                              >
                                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                                <div className="mt-1 text-[10px] text-[var(--muted)] text-right">
                                  {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={wppMsgsEndRef} />
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-[var(--line)]">
                    <div className="flex gap-3">
                      <input
                        value={wppComposer}
                        onChange={(e) => setWppComposer(e.target.value)}
                        placeholder={wppActiveConvId ? "Escribí un mensaje…" : "Seleccioná un chat para responder"}
                        className="flex-1 px-4 py-3 rounded-2xl bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.12)] outline-none text-[var(--text)] placeholder:text-[var(--muted)]"
                        disabled={!wppActiveConvId || wppLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendWppInboxMessage();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={sendWppInboxMessage}
                        disabled={!wppActiveConvId || wppLoading || !String(wppComposer || "").trim()}
                        className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[var(--c1)] to-[var(--c2)] text-slate-900 text-xs font-black flex items-center gap-2 hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Enviar"
                      >
                        {wppLoading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                        Enviar
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-[var(--muted)]">
                      Tip: Enter envía. Shift+Enter hace salto de línea.
                    </div>
                  </div>
                </div>
              </div>
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

                  <Pill tone={cfgHasOpenAI ? "green" : "amber"}>
                    {cfgHasOpenAI ? "OpenAI configurado (oculto)" : "OpenAI no configurado"}
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

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black text-slate-700">OpenAI API Key</label>
                    <input
                      value={cfgOpenAIKey}
                      onChange={(e) => setCfgOpenAIKey(e.target.value)}
                      placeholder="Pegá tu API key (queda oculta al recargar)"
                      className="w-full px-4 py-3 border border-slate-300 rounded-2xl outline-none"
                    />
                    <div className="text-[11px] text-slate-400">
                      Se guarda por aseguradora y el sistema solo muestra una máscara.
                    </div>
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
                {(() => {
                  const paisForDoc =
                    String(editingClient?.pais || getPaisNorm() || "AR").toUpperCase() === "UY" ? "UY" : "AR";
                  const isUY = paisForDoc === "UY";
                  const docLabel = isUY ? "Cédula" : "DNI";

                  return (
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

                  <div className="space-y-1.5">
                    <label
                      className={`text-[11px] font-black ${
                        isUY ? "text-sky-700" : "text-slate-600"
                      }`}
                    >
                      {docLabel} *
                    </label>
                    <input
                      name="documento"
                      required
                      defaultValue={editingClient?.documento || ""}
                      className={`w-full px-4 py-2.5 border rounded-2xl outline-none ${
                        isUY ? "border-sky-200 bg-sky-50" : ""
                      }`}
                    />
                  </div>
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
                          value={pagoAlias}
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
                  );
                })()}
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
                    <DataLine
                      label={String(clientToDelete?.pais || getPaisNorm() || "AR").toUpperCase() === "UY" ? "Cédula" : "DNI"}
                      value={clientToDelete.documento}
                    />
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

  // País seleccionado en el selector de vista (fallback si el cliente no trae `pais`)
  paisVista = "AR",

  // ✅ NUEVO
  showMonto = false,
  showPagoStatus = false,
  showPagoWhatsApp = false,
  onPagoWhatsAppAuto,
  onPagoWhatsAppManual,
  pagoAlias = DEFAULT_PAGO_ALIAS,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  const toggleSort = (key) => {
    if (!key) return;
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  };

  const getSortValue = (c, key) => {
    const s = (v) => String(v ?? "").toLowerCase().trim();
    const n = (v) => {
      const num = Number(v);
      return Number.isFinite(num) ? num : null;
    };
    const dateMs = (v) => {
      const str = String(v || "").trim();
      const iso = str.includes("T") ? str.split("T")[0] : str;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
      const ms = Date.parse(iso + "T00:00:00Z");
      return Number.isFinite(ms) ? ms : null;
    };
    const montoNum = (v) => {
      const raw = String(v ?? "").trim();
      if (!raw) return null;
      const cleaned = raw.replace(/[^0-9,\.\-]/g, "").replace(",", ".");
      const ms = Number(cleaned);
      return Number.isFinite(ms) ? ms : null;
    };

    switch (key) {
      case "nombre":
        return s(c.nombre);
      case "apellido":
        return s(c.apellido);
      case "pais":
        return s(c.pais);
      case "dni":
        return s(c.documento);
      case "tel":
        return s(c.telefono);
      case "email":
        return s(c.mail);
      case "monto":
        return montoNum(c.monto);
      case "inicio":
        return dateMs(c.fecha_inicio_str);
      case "fin":
        return dateMs(c.fecha_fin_str);
      case "dias":
        return n(c.dias_left);
      case "grua":
        return s(c.grua_nombre);
      case "tel_grua":
        return s(c.grua_telefono);
      case "cobertura":
        return s(c.descripcion_seguro);
      case "poliza":
        return c.polizas ? 1 : 0;
      case "estado_cuota": {
        const st = getPagoStatus(c);
        // orden lógico: VENCIDA primero, luego AL_DIA, luego SIN_DATO
        if (st === "VENCIDA") return 0;
        if (st === "AL_DIA") return 1;
        return 2;
      }
      default:
        return null;
    }
  };

  const sortedClients = useMemo(() => {
    if (!sortKey) return clients;

    const dir = sortDir === "asc" ? 1 : -1;
    const withIndex = (clients || []).map((c, idx) => ({ c, idx }));

    withIndex.sort((a, b) => {
      const av = getSortValue(a.c, sortKey);
      const bv = getSortValue(b.c, sortKey);

      // nulls al final
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return a.idx - b.idx;
      if (aNull) return 1;
      if (bNull) return -1;

      if (typeof av === "number" && typeof bv === "number") {
        if (av === bv) return a.idx - b.idx;
        return (av - bv) * dir;
      }

      const as = String(av);
      const bs = String(bv);
      const cmp = as.localeCompare(bs, undefined, { sensitivity: "base" });
      if (cmp === 0) return a.idx - b.idx;
      return cmp * dir;
    });

    return withIndex.map((x) => x.c);
  }, [clients, sortKey, sortDir]);

  const colsBase = 14;
  const colsWhats = showWhatsApp ? 1 : 0;
  const colsMonto = showMonto ? 1 : 0;
  const colsPagoStatus = showPagoStatus ? 1 : 0;
  const colsPagoWhats = showPagoWhatsApp ? 1 : 0;
  const totalCols = colsBase + colsWhats + colsMonto + colsPagoStatus + colsPagoWhats;

  const ThBtn = ({ label, k, className = "" }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`w-full text-left hover:text-slate-700 ${className}`}
      title="Ordenar"
    >
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[1350px] w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Nombre" k="nombre" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Apellido" k="apellido" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="País" k="pais" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Documento" k="dni" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Tel" k="tel" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Email" k="email" />
              </th>

              {showMonto ? (
                <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                  <ThBtn label="Monto" k="monto" />
                </th>
              ) : null}

              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Inicio" k="inicio" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Fin" k="fin" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Días" k="dias" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Grúa" k="grua" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Tel. Grúa" k="tel_grua" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Cobertura" k="cobertura" />
              </th>
              <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                <ThBtn label="Póliza" k="poliza" />
              </th>

              {showPagoStatus ? (
                <th className="px-5 py-4 text-[11px] font-black text-slate-500 uppercase">
                  <ThBtn label="Estado cuota" k="estado_cuota" />
                </th>
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
            {sortedClients.map((c) => {
              const pagoStatus = showPagoStatus ? getPagoStatus(c) : null;
              const pais = String(c.pais || paisVista || "AR").toUpperCase() === "UY" ? "UY" : "AR";
              const isUY = pais === "UY";
              const docLabel = isUY ? "Cédula" : "DNI";

              return (
                <tr key={c.id} className={`${isUY ? "bg-sky-50" : ""} hover:bg-slate-50 align-top`}>
                  <td className="px-5 py-4 text-sm font-black text-slate-900">{c.nombre}</td>
                  <td className="px-5 py-4 text-sm text-slate-900">{c.apellido}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`text-[11px] font-black px-2 py-1 rounded-lg border ${
                        isUY ? "bg-sky-100 border-sky-200 text-sky-800" : "bg-slate-50 border-slate-200 text-slate-700"
                      }`}
                      title={isUY ? "Uruguay" : "Argentina"}
                    >
                      {pais}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black px-2 py-1 rounded-lg border ${
                          isUY ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {docLabel}
                      </span>
                      <span>{c.documento}</span>
                    </div>
                  </td>
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
