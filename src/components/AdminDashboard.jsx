import React, { useState, useEffect } from "react";
import {
  Users,
  Gift,
  DollarSign,
  FileText,
  Plus,
  Trash2,
  Edit,
  Search,
  Loader2,
  X,
  Check,
} from "lucide-react";

export default function AdminDashboard() {
  const [tab, setTab] = useState("invitaciones"); // invitaciones, usuarios, suscripciones, pagos, planes, auditoria
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({});

  const [userEdits, setUserEdits] = useState({}); // { [userId]: { pais, flags:{AR,UY}, saving } }

  const normalizePais = (p) => (String(p || "AR").trim().toUpperCase() === "UY" ? "UY" : "AR");
  const splitPaises = (raw) =>
    String(raw || "")
      .split(/[,;\s]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
      .filter((x) => x === "AR" || x === "UY");

  const flagsFromPaises = (raw, fallbackPais = "AR") => {
    const parts = splitPaises(raw);
    const fallback = normalizePais(fallbackPais);
    const hasAR = parts.includes("AR");
    const hasUY = parts.includes("UY");
    if (!hasAR && !hasUY) return { AR: fallback === "AR", UY: fallback === "UY" };
    return { AR: hasAR, UY: hasUY };
  };

  const paisesFromFlags = (flags, fallbackPais = "AR") => {
    const out = [];
    if (flags?.AR) out.push("AR");
    if (flags?.UY) out.push("UY");
    if (out.length === 0) out.push(normalizePais(fallbackPais));
    return out.join(",");
  };

  // Cargar datos según la pestaña activa
  useEffect(() => {
    loadData();
  }, [tab]);

  // Inicializa estado de edición de usuarios al cargar datos
  useEffect(() => {
    if (tab !== "usuarios") return;
    setUserEdits((prev) => {
      const next = { ...prev };
      for (const u of Array.isArray(data) ? data : []) {
        if (!u?.id) continue;
        if (next[u.id]) continue;
        const pais = normalizePais(u.pais);
        next[u.id] = {
          pais,
          flags: flagsFromPaises(u.paises, pais),
          saving: false,
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data]);

  const loadData = async () => {
    setLoading(true);
    try {
      let endpoint = "";
      let method = "GET";

      if (tab === "invitaciones") {
        endpoint = "/api/admin/invitaciones/listar";
      } else if (tab === "usuarios") {
        endpoint = "/api/admin/usuarios/listar";
      } else if (tab === "suscripciones") {
        endpoint = "/api/admin/suscripciones/listar";
      } else if (tab === "pagos") {
        endpoint = "/api/admin/pagos/listar";
      } else if (tab === "planes") {
        endpoint = "/api/admin/planes/listar";
      } else if (tab === "auditoria") {
        endpoint = "/api/admin/auditoria/listar";
      }

      if (!endpoint) {
        setData([]);
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        try {
          localStorage.removeItem("token");
        } catch {
          // ignore
        }
        alert("Sesión vencida. Volvé a ingresar al Admin.");
        window.location.reload();
        return;
      }
      const headers = {
        "Content-Type": "application/json",
      };
      headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(endpoint, {
        method,
        headers,
      });

      const result = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403 || result?.message === "Token inválido") {
        try {
          localStorage.removeItem("token");
        } catch {
          // ignore
        }
        alert(result?.message || "No autorizado. Volvé a ingresar al Admin.");
        window.location.reload();
        return;
      }

      if (result.status === "success") {
        setData(result.data);
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUserPaises = async (userId) => {
    const edit = userEdits[userId];
    if (!edit) return;

    const pais = normalizePais(edit.pais);
    const paises = paisesFromFlags(edit.flags, pais);

    setUserEdits((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], saving: true },
    }));

    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/admin/usuarios/set-paises", {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId, pais, paises }),
      });
      const result = await res.json();
      if (result.status !== "success") {
        alert(result.message || "Error al guardar");
        return;
      }

      const updated = result.data;
      setData((prev) =>
        (Array.isArray(prev) ? prev : []).map((u) => (u.id === userId ? { ...u, ...updated } : u))
      );
      setUserEdits((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          pais: normalizePais(updated.pais),
          flags: flagsFromPaises(updated.paises, updated.pais),
          saving: false,
        },
      }));
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUserEdits((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], saving: false },
      }));
    }
  };

  const handleCreateInvitation = async () => {
    const { email, plan_id } = modalData;
    if (!email || !plan_id) {
      alert("Completa todos los campos");
      return;
    }

    const pais = normalizePais(modalData.pais);
    const paises = paisesFromFlags(modalData.paisesFlags, pais);

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        "/api/admin/invitaciones/crear",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ email, plan_id, pais, paises }),
        }
      );

      const result = await res.json();
      if (result.status === "success") {
        setShowModal(false);
        setModalData({});
        loadData();
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvitation = async (id) => {
    if (!window.confirm("¿Estás seguro?")) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        "/api/admin/invitaciones/eliminar",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ id }),
        }
      );

      const result = await res.json();
      if (result.status === "success") {
        loadData();
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (suscripcion_id, nuevo_plan_id) => {
    if (!window.confirm("¿Cambiar plan?")) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        "/api/admin/suscripciones/cambiar-plan",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ suscripcion_id, nuevo_plan_id }),
        }
      );

      const result = await res.json();
      if (result.status === "success") {
        loadData();
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async (suscripcion_id) => {
    if (!window.confirm("¿Cancelar suscripción?")) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        "/api/admin/suscripciones/cancelar",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ suscripcion_id }),
        }
      );

      const result = await res.json();
      if (result.status === "success") {
        loadData();
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = data.filter(
    (item) =>
      JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">👨‍💼 Admin Dashboard</h1>
          <p className="text-gray-600">Gestión de suscripciones y usuarios</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-4">
          <button
            onClick={() => setTab("invitaciones")}
            className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
              tab === "invitaciones"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-600"
            }`}
          >
            <Gift size={18} />
            Invitaciones
          </button>
          <button
            onClick={() => setTab("usuarios")}
            className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
              tab === "usuarios"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-600"
            }`}
          >
            <Users size={18} />
            Usuarios
          </button>
          <button
            onClick={() => setTab("suscripciones")}
            className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
              tab === "suscripciones"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-600"
            }`}
          >
            <Users size={18} />
            Suscripciones
          </button>
          <button
            onClick={() => setTab("pagos")}
            className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
              tab === "pagos"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-600"
            }`}
          >
            <DollarSign size={18} />
            Pagos
          </button>
          <button
            onClick={() => setTab("planes")}
            className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
              tab === "planes"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-600"
            }`}
          >
            <Check size={18} />
            Planes
          </button>
          <button
            onClick={() => setTab("auditoria")}
            className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
              tab === "auditoria"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-gray-600"
            }`}
          >
            <FileText size={18} />
            Auditoría
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search & Add Button */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 p-2 border border-gray-300 rounded"
            />
          </div>

          {tab === "invitaciones" && (
            <button
              onClick={() => {
                setShowModal(true);
                setModalData({
                  pais: "AR",
                  paisesFlags: { AR: true, UY: false },
                });
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={18} />
              Nueva Invitación
            </button>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        )}

        {!loading && (
          <>
            {/* INVITACIONES */}
            {tab === "invitaciones" && (
              <div className="bg-white rounded shadow overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        País
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Países
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Código
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Expira
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">{row.email}</td>
                        <td className="px-4 py-3">{row.plan_nombre}</td>
                        <td className="px-4 py-3">{row.pais || "AR"}</td>
                        <td className="px-4 py-3">{row.paises || row.pais || "AR"}</td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {row.codigo}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(row.expira_en).toLocaleDateString("es-AR")}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteInvitation(row.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredData.length === 0 && (
                  <div className="p-4 text-center text-gray-500">
                    Sin invitaciones
                  </div>
                )}
              </div>
            )}

            {/* USUARIOS */}
            {tab === "usuarios" && (
              <div className="bg-white rounded shadow overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold">ID</th>
                      <th className="px-4 py-3 text-left text-sm font-bold">Nombre</th>
                      <th className="px-4 py-3 text-left text-sm font-bold">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-bold">Rol</th>
                      <th className="px-4 py-3 text-left text-sm font-bold">País activo</th>
                      <th className="px-4 py-3 text-left text-sm font-bold">Países habilitados</th>
                      <th className="px-4 py-3 text-left text-sm font-bold">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row) => {
                      const edit = userEdits[row.id] || {
                        pais: normalizePais(row.pais),
                        flags: flagsFromPaises(row.paises, row.pais),
                        saving: false,
                      };

                      const onToggle = (code) => {
                        setUserEdits((prev) => {
                          const current = prev[row.id] || edit;
                          const nextFlags = { ...current.flags, [code]: !current.flags?.[code] };
                          // nunca dejar los dos apagados
                          if (!nextFlags.AR && !nextFlags.UY) {
                            nextFlags[normalizePais(current.pais)] = true;
                          }
                          // asegurar que el país activo esté dentro de habilitados
                          const active = normalizePais(current.pais);
                          if (active === "AR") nextFlags.AR = true;
                          if (active === "UY") nextFlags.UY = true;

                          return {
                            ...prev,
                            [row.id]: { ...current, flags: nextFlags },
                          };
                        });
                      };

                      const onChangePais = (paisValue) => {
                        setUserEdits((prev) => {
                          const current = prev[row.id] || edit;
                          const pais = normalizePais(paisValue);
                          const flags = { ...current.flags };
                          if (pais === "AR") flags.AR = true;
                          if (pais === "UY") flags.UY = true;
                          return { ...prev, [row.id]: { ...current, pais, flags } };
                        });
                      };

                      return (
                        <tr key={row.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{row.id}</td>
                          <td className="px-4 py-3 text-sm">{row.nombre || ""}</td>
                          <td className="px-4 py-3 text-sm">{row.email}</td>
                          <td className="px-4 py-3 text-sm">{row.rol}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <select
                                value={edit.pais}
                                onChange={(e) => onChangePais(e.target.value)}
                                className="p-2 border border-gray-300 rounded"
                              >
                                <option value="AR">AR</option>
                                <option value="UY">UY</option>
                              </select>

                              <div className="text-xs text-gray-500">
                                Activos: {paisesFromFlags(edit.flags, edit.pais)}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-4 text-sm">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!edit.flags?.AR}
                                  onChange={() => onToggle("AR")}
                                />
                                AR
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!edit.flags?.UY}
                                  onChange={() => onToggle("UY")}
                                />
                                UY
                              </label>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Guardado como: {paisesFromFlags(edit.flags, edit.pais)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleSaveUserPaises(row.id)}
                              disabled={loading || edit.saving}
                              className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
                            >
                              {(loading || edit.saving) && (
                                <Loader2 size={14} className="animate-spin" />
                              )}
                              Guardar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredData.length === 0 && (
                  <div className="p-4 text-center text-gray-500">Sin usuarios</div>
                )}
              </div>
            )}

            {/* SUSCRIPCIONES */}
            {tab === "suscripciones" && (
              <div className="bg-white rounded shadow overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Aseguradora
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Expira
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">{row.aseguradora_nombre}</td>
                        <td className="px-4 py-3">{row.plan_nombre}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              row.estado === "activa"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {row.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(row.fecha_fin).toLocaleDateString("es-AR")}
                        </td>
                        <td className="px-4 py-3 space-x-2">
                          <button
                            onClick={() => {
                              const newPlanId = prompt(
                                "ID del nuevo plan (1=FREE, 2=STARTER, 3=PROFESSIONAL, 4=ENTERPRISE):"
                              );
                              if (newPlanId) {
                                handleChangePlan(row.id, parseInt(newPlanId));
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            <Edit size={14} className="inline" /> Cambiar
                          </button>
                          <button
                            onClick={() =>
                              handleCancelSubscription(row.id)
                            }
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            <Trash2 size={14} className="inline" /> Cancelar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredData.length === 0 && (
                  <div className="p-4 text-center text-gray-500">
                    Sin suscripciones
                  </div>
                )}
              </div>
            )}

            {/* PAGOS */}
            {tab === "pagos" && (
              <div className="bg-white rounded shadow overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Aseguradora
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Monto
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Método
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Fecha
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {row.aseguradora_nombre}
                        </td>
                        <td className="px-4 py-3 font-bold">
                          ${row.monto.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">{row.metodo_pago}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              row.estado === "completado"
                                ? "bg-green-100 text-green-800"
                                : row.estado === "pendiente"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {row.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(row.fecha_creacion).toLocaleDateString(
                            "es-AR"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredData.length === 0 && (
                  <div className="p-4 text-center text-gray-500">
                    Sin pagos
                  </div>
                )}
              </div>
            )}

            {/* PLANES */}
            {tab === "planes" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredData.map((row) => (
                  <div
                    key={row.id}
                    className="bg-white rounded shadow p-4 border-t-4 border-blue-600"
                  >
                    <h3 className="font-bold text-lg">{row.nombre}</h3>
                    <p className="text-gray-600 text-sm mb-4">
                      {row.descripcion}
                    </p>

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span>Precio/mes:</span>
                        <span className="font-bold">
                          ${row.precio_mensual.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Clientes:</span>
                        <span className="font-bold">{row.clientes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Usuarios:</span>
                        <span className="font-bold">{row.usuarios}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>WhatsApp:</span>
                        <span className="font-bold">
                          {row.whatsapp ? "✅" : "❌"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>OpenAI:</span>
                        <span className="font-bold">
                          {row.openai ? "✅" : "❌"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>API:</span>
                        <span className="font-bold">
                          {row.api ? "✅" : "❌"}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Usuarios activos: {row.usuarios_activos || 0}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AUDITORÍA */}
            {tab === "auditoria" && (
              <div className="bg-white rounded shadow overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Usuario
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Acción
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Recurso
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Detalles
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-bold">
                        Timestamp
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{row.usuario_id}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-bold">
                            {row.accion}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{row.recurso}</td>
                        <td className="px-4 py-3 text-xs font-mono">
                          {typeof row.detalles === "string"
                            ? row.detalles
                            : JSON.stringify(row.detalles).substring(0, 50) +
                              "..."}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {new Date(row.timestamp).toLocaleString("es-AR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredData.length === 0 && (
                  <div className="p-4 text-center text-gray-500">
                    Sin eventos
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Nueva Invitación */}
      {showModal && tab === "invitaciones" && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Nueva Invitación</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">Email</label>
                <input
                  type="email"
                  value={modalData.email || ""}
                  onChange={(e) =>
                    setModalData({ ...modalData, email: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">Plan</label>
                <select
                  value={modalData.plan_id || ""}
                  onChange={(e) =>
                    setModalData({ ...modalData, plan_id: e.target.value })
                  }
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="">Selecciona un plan</option>
                  <option value="1">FREE</option>
                  <option value="2">STARTER</option>
                  <option value="3">PROFESSIONAL</option>
                  <option value="4">ENTERPRISE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">País activo</label>
                <select
                  value={normalizePais(modalData.pais)}
                  onChange={(e) => {
                    const pais = normalizePais(e.target.value);
                    const flags = { ...(modalData.paisesFlags || { AR: false, UY: false }) };
                    if (pais === "AR") flags.AR = true;
                    if (pais === "UY") flags.UY = true;
                    setModalData({ ...modalData, pais, paisesFlags: flags });
                  }}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="AR">AR</option>
                  <option value="UY">UY</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">Países habilitados</label>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!modalData.paisesFlags?.AR}
                      onChange={() => {
                        const current = modalData.paisesFlags || { AR: false, UY: false };
                        const next = { ...current, AR: !current.AR };
                        if (!next.AR && !next.UY) next[normalizePais(modalData.pais)] = true;
                        if (normalizePais(modalData.pais) === "AR") next.AR = true;
                        setModalData({ ...modalData, paisesFlags: next });
                      }}
                    />
                    AR
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!modalData.paisesFlags?.UY}
                      onChange={() => {
                        const current = modalData.paisesFlags || { AR: false, UY: false };
                        const next = { ...current, UY: !current.UY };
                        if (!next.AR && !next.UY) next[normalizePais(modalData.pais)] = true;
                        if (normalizePais(modalData.pais) === "UY") next.UY = true;
                        setModalData({ ...modalData, paisesFlags: next });
                      }}
                    />
                    UY
                  </label>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Guardado como: {paisesFromFlags(modalData.paisesFlags, normalizePais(modalData.pais))}
                </div>
              </div>

              <button
                onClick={handleCreateInvitation}
                disabled={loading}
                className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Crear Invitación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
