#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";

console.log("\n🔍 VERIFICADOR DE SETUP - CogniSeguros\n");
console.log("=".repeat(50));

const checks = [];

// Check 1: Node.js
try {
  const nodeVersion = execSync("node --version", { encoding: "utf8" }).trim();
  checks.push({ name: "Node.js", status: "✅", value: nodeVersion });
} catch {
  checks.push({ name: "Node.js", status: "❌", value: "No instalado" });
}

// Check 2: npm
try {
  const npmVersion = execSync("npm --version", { encoding: "utf8" }).trim();
  checks.push({ name: "npm", status: "✅", value: npmVersion });
} catch {
  checks.push({ name: "npm", status: "❌", value: "No instalado" });
}

// Check 3: PostgreSQL
try {
  const psqlVersion = execSync("psql --version", { encoding: "utf8" }).trim();
  checks.push({ name: "PostgreSQL", status: "✅", value: psqlVersion });
} catch {
  checks.push({ name: "PostgreSQL", status: "❌", value: "No en PATH (instala o agrega a variables)" });
}

// Check 4: .env
const envExists = fs.existsSync(".env");
checks.push({ name: ".env", status: envExists ? "✅" : "❌", value: envExists ? "Presente" : "Falta" });

// Check 5: package.json
const pkgExists = fs.existsSync("package.json");
checks.push({ name: "package.json", status: pkgExists ? "✅" : "❌", value: pkgExists ? "Presente" : "Falta" });

// Check 6: node_modules
const nmExists = fs.existsSync("node_modules");
checks.push({ name: "node_modules", status: nmExists ? "✅" : "⚠️", value: nmExists ? "Instalado" : "No instalado (ejecuta npm install)" });

// Check 7: server.js
const serverExists = fs.existsSync("server.js");
checks.push({ name: "server.js", status: serverExists ? "✅" : "❌", value: serverExists ? "Backend configurado" : "Falta" });

// Check 8: src/App.jsx (frontend)
const frontExists = fs.existsSync("src/App.jsx");
checks.push({ name: "src/App.jsx", status: frontExists ? "✅" : "❌", value: frontExists ? "Frontend configurado" : "Falta" });

// Check 9: schema.sql
const schemaExists = fs.existsSync("schema.sql");
checks.push({ name: "schema.sql", status: schemaExists ? "✅" : "❌", value: schemaExists ? "Tablas definidas" : "Falta" });

// Check 10: setup-db.js
const setupExists = fs.existsSync("setup-db.js");
checks.push({ name: "setup-db.js", status: setupExists ? "✅" : "❌", value: setupExists ? "Script listo" : "Falta" });

// Print results
checks.forEach(check => {
  const padding = " ".repeat(25 - check.name.length);
  console.log(`${check.name}${padding}${check.status}  ${check.value}`);
});

console.log("=".repeat(50));

// Summary
const allOk = checks.every(c => c.status === "✅");
const warnings = checks.filter(c => c.status === "⚠️").length;
const errors = checks.filter(c => c.status === "❌").length;

if (allOk) {
  console.log("\n🎉 ¡Todo está configurado correctamente!");
  console.log("Ejecuta: npm run dev-both");
  console.log("Frontend: http://localhost:3000  (o http://127.0.0.1:3000)");
  console.log("Backend:  http://localhost:5000\n");
  console.log("Si en Windows dev-both se corta, usa 2 terminales:");
  console.log("  - npm run server");
  console.log("  - npm run dev\n");
} else {
  console.log(`\n⚠️  Errores: ${errors}, Advertencias: ${warnings}\n`);
  console.log("Pasos pendientes:\n");
  
  if (checks[2].status === "❌") {
    console.log("1️⃣  Instala PostgreSQL:");
    console.log("   → https://www.postgresql.org/download/windows/");
    console.log("   → Después agrega a PATH y reinicia PowerShell\n");
  }
  
  if (checks[6].status === "⚠️") {
    console.log("2️⃣  Instala dependencias:");
    console.log("   → npm install\n");
  }
  
  console.log("3️⃣  Crea la BD:");
  console.log("   → npm run setup-db\n");
  
  console.log("4️⃣  Inicia el proyecto:");
  console.log("   → npm run dev-both\n");
}

console.log("📖 Ver guía completa: SETUP_COMPLETO.md\n");
