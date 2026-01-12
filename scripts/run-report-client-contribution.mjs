import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const aseguradoraId = String(process.argv[2] || "").trim();
if (!aseguradoraId) {
  console.error("Usage: node scripts/run-report-client-contribution.mjs <aseguradora_id>");
  process.exit(1);
}

const env = process.env;

const cfg = {
  user: env.DB_USER ? env.DB_USER : "postgres",
  host: env.DB_HOST ? env.DB_HOST : "localhost",
  password: env.DB_PASSWORD ? env.DB_PASSWORD : "postgres",
  port: Number(env.DB_PORT ? env.DB_PORT : 5432),
};

const masterDb = env.DB_NAME ? env.DB_NAME : "cogniseguros";
const prefix = env.TENANT_DB_PREFIX ? env.TENANT_DB_PREFIX : "cogniseguros_tenant_";

const toJson = (x) => JSON.stringify(x, null, 2);

const main = async () => {
  const master = new Pool({ ...cfg, database: masterDb });
  try {
    const u = await master.query("SELECT id, tenant_db FROM usuarios WHERE id::text = $1 LIMIT 1", [aseguradoraId]);
    if (u.rows.length === 0) {
      throw new Error(`Usuario no encontrado para aseguradora_id=${aseguradoraId}`);
    }

    const row = u.rows[0];
    const tenantDb = row.tenant_db && String(row.tenant_db).trim() ? String(row.tenant_db).trim() : prefix + String(row.id);

    console.log("MASTER:", toJson({ database: masterDb, host: cfg.host, port: cfg.port, user: cfg.user }));
    console.log("TENANT DB:", tenantDb);

    const tenant = new Pool({ ...cfg, database: tenantDb });
    try {
      const dbInfo = await tenant.query(
        "SELECT current_database() AS db, current_schema() AS schema, current_user AS user, to_regclass('public.clientes')::text AS public_clientes_reg, to_regclass('clientes')::text AS unqualified_clientes_reg"
      );
      console.log("TENANT db info:", toJson(dbInfo.rows[0] || {}));

      // Evidencia: columnas exactas
      const cols = await tenant.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes' ORDER BY ordinal_position"
      );
      console.log("TENANT public.clientes columns:", toJson(cols.rows));

      // Sanity: seleccionar monto directo
      try {
        const sanityMonto = await tenant.query("SELECT monto FROM public.clientes LIMIT 1");
        console.log("SANITY SELECT monto ok (first row):", toJson(sanityMonto.rows[0] || {}));
      } catch (e) {
        console.log(
          "SANITY SELECT monto FAILED:",
          toJson({ message: e?.message || String(e), code: e?.code, schema: e?.schema, table: e?.table, column: e?.column })
        );
      }

      // Sanity: COALESCE(monto)
      try {
        const sanityCoalesce = await tenant.query("SELECT COALESCE(monto, 0)::numeric(14,2) AS monto FROM public.clientes LIMIT 1");
        console.log("SANITY COALESCE(monto) ok (first row):", toJson(sanityCoalesce.rows[0] || {}));
      } catch (e) {
        console.log(
          "SANITY COALESCE(monto) FAILED:",
          toJson({ message: e?.message || String(e), code: e?.code, schema: e?.schema, table: e?.table, column: e?.column })
        );
      }

      // Sanity: CTE with monto
      try {
        const sanityCte = await tenant.query(
          "WITH base AS (SELECT COALESCE(monto, 0)::numeric(14,2) AS monto FROM public.clientes) SELECT * FROM base LIMIT 1"
        );
        console.log("SANITY CTE monto ok (first row):", toJson(sanityCte.rows[0] || {}));
      } catch (e) {
        console.log(
          "SANITY CTE monto FAILED:",
          toJson({ message: e?.message || String(e), code: e?.code, schema: e?.schema, table: e?.table, column: e?.column })
        );
      }

      // Evidencia: volumen de datos
      const stats = await tenant.query(
        "SELECT COUNT(*)::int AS n, MIN(fecha_alta) AS min_fecha, MAX(fecha_alta) AS max_fecha, COALESCE(SUM(COALESCE(monto,0)),0)::numeric AS sum_monto FROM public.clientes"
      );
      console.log("TENANT clientes stats:", toJson(stats.rows[0]));

      const paisesR = await tenant.query(
        "SELECT ARRAY_AGG(DISTINCT pais ORDER BY pais) AS paises FROM public.clientes WHERE pais IS NOT NULL AND TRIM(pais) <> ''"
      );
      const allowedPaises = (paisesR.rows[0]?.paises || []).filter(Boolean);
      console.log("TENANT allowedPaises(from data):", toJson(allowedPaises));

      // Parámetros
      const includeAll = true; // para evitar filtrar por fecha si hay NULL/antiguo
      const paidOnly = false;
      const order = "desc";
      const limit = 30;
      const fromIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const toIso = new Date().toISOString();

      // SQL EXACTO (mismo que server.js) + schema-qualified
      const lineaExpr = `'OTRO'`;

      const queryText = `
        WITH base AS (
          SELECT
            id,
            pais,
            COALESCE(nombre,'') AS nombre,
            COALESCE(apellido,'') AS apellido,
            COALESCE(documento,'') AS documento,
            COALESCE(telefono,'') AS telefono,
            COALESCE(mail,'') AS mail,
            ${lineaExpr} AS linea,
            COALESCE(NULLIF(TRIM(cuota_paga), ''), '') AS cuota_paga,
            COALESCE(monto, 0)::numeric(14,2) AS monto
          FROM public.clientes
          WHERE pais = ANY($1::text[])
            AND ($6::bool = false OR UPPER(TRIM(COALESCE(cuota_paga,''))) IN ('SI','SÍ'))
            AND (
              $5::bool = true
              OR (fecha_alta IS NOT NULL AND fecha_alta >= $2::timestamptz AND fecha_alta < $3::timestamptz)
            )
        ),
        grouped AS (
          SELECT
            MIN(id::text) AS id,
            MAX(pais) AS pais,
            MAX(nombre) AS nombre,
            MAX(apellido) AS apellido,
            doc_key AS documento,
            MAX(telefono) AS telefono,
            MAX(mail) AS mail,
            MAX(linea) AS linea,
            MAX(cuota_paga) AS cuota_paga,
            COUNT(*)::int AS items,
            COALESCE(SUM(monto), 0)::numeric(14,2) AS ingreso_mensual,
            COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(cuota_paga,''))) IN ('SI','SÍ') THEN monto ELSE 0 END), 0)::numeric(14,2) AS ingreso_mensual_cobrado
          FROM (
            SELECT *, COALESCE(NULLIF(TRIM(documento), ''), id::text) AS doc_key
            FROM base
          ) t
          GROUP BY doc_key
        )
        SELECT
          *,
          (ingreso_mensual * 12)::numeric(14,2) AS ingreso_anual,
          (ingreso_mensual_cobrado * 12)::numeric(14,2) AS ingreso_anual_cobrado,
          CASE WHEN SUM(ingreso_mensual) OVER() = 0 THEN 0
            ELSE (ingreso_mensual / SUM(ingreso_mensual) OVER() * 100)
          END::numeric(10,2) AS pct_cartera_mensual,
          CASE WHEN SUM(ingreso_mensual) OVER() = 0 THEN 0
            ELSE (ingreso_mensual / SUM(ingreso_mensual) OVER() * 100)
          END::numeric(10,2) AS pct_cartera_anual
        FROM grouped
        ORDER BY ingreso_mensual ${order}, id ASC
        LIMIT $4::int
      `;

      const totalsText = `
        WITH base AS (
          SELECT
            COALESCE(NULLIF(TRIM(cuota_paga), ''), '') AS cuota_paga,
            COALESCE(monto, 0)::numeric(14,2) AS monto
          FROM public.clientes
          WHERE pais = ANY($1::text[])
            AND ($4::int >= 0)
            AND ($6::bool = false OR UPPER(TRIM(COALESCE(cuota_paga,''))) IN ('SI','SÍ'))
            AND (
              $5::bool = true
              OR (fecha_alta IS NOT NULL AND fecha_alta >= $2::timestamptz AND fecha_alta < $3::timestamptz)
            )
        )
        SELECT
          COALESCE(SUM(monto), 0)::numeric(14,2) AS ingreso_mensual_total,
          (COALESCE(SUM(monto), 0) * 12)::numeric(14,2) AS ingreso_anual_total,
          COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(cuota_paga,''))) IN ('SI','SÍ') THEN monto ELSE 0 END), 0)::numeric(14,2) AS ingreso_mensual_cobrado,
          (COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(cuota_paga,''))) IN ('SI','SÍ') THEN monto ELSE 0 END), 0) * 12)::numeric(14,2) AS ingreso_anual_cobrado
        FROM base
      `;

      const rowsParams = [allowedPaises, fromIso, toIso, limit, includeAll, paidOnly];
      const totalsParams = [allowedPaises, fromIso, toIso, 0, includeAll, paidOnly];

      console.log("REPORT params:", toJson({ allowedPaises, fromIso, toIso, limit, includeAll, paidOnly }));

      const formatErr = (sql, e) => {
        const pos = Number(e?.position);
        const posInfo = Number.isFinite(pos)
          ? {
              position: pos,
              sql_snippet: sql.slice(Math.max(0, pos - 60), Math.min(sql.length, pos + 60)),
            }
          : {};
        return {
          message: e?.message || String(e),
          code: e?.code,
          detail: e?.detail,
          hint: e?.hint,
          where: e?.where,
          schema: e?.schema,
          table: e?.table,
          column: e?.column,
          constraint: e?.constraint,
          ...posInfo,
        };
      };

      let rowsR;
      try {
        rowsR = await tenant.query(queryText, rowsParams);
      } catch (e) {
        console.error("REPORT ROWS SQL ERROR:", toJson(formatErr(queryText, e)));
        console.log("REPORT SQL(queryText):\n" + queryText);
        process.exitCode = 2;
        return;
      }

      let totalsR;
      try {
        totalsR = await tenant.query(totalsText, totalsParams);
      } catch (e) {
        console.error("REPORT TOTALS SQL ERROR:", toJson(formatErr(totalsText, e)));
        console.log("REPORT SQL(totalsText):\n" + totalsText);
        process.exitCode = 2;
        return;
      }

      console.log("REPORT totals:", toJson(totalsR.rows[0] || {}));
      console.log("REPORT rows count:", rowsR.rows.length);
      console.log("REPORT rows preview (first 5):", toJson(rowsR.rows.slice(0, 5)));
    } finally {
      await tenant.end();
    }
  } finally {
    await master.end();
  }
};

main().catch((e) => {
  console.error("FATAL:", e?.message || String(e));
  process.exit(1);
});
