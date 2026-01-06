import nodemailer from "nodemailer";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Almacenar códigos temporalmente (en producción usar Redis)
const verificationCodes = new Map();

// Configurar transporte de email
const buildTransporter = () => {
  const user = String(process.env.EMAIL_USER || "").trim();
  const pass = String(process.env.EMAIL_PASS || "").trim();

  // Soporte SMTP genérico (recomendado en producción). Si no está, caemos a Gmail.
  const host = String(process.env.EMAIL_HOST || "").trim();
  const portRaw = String(process.env.EMAIL_PORT || "").trim();
  const secureRaw = String(process.env.EMAIL_SECURE || "").trim().toLowerCase();
  const debug = String(process.env.EMAIL_DEBUG || "").trim().toLowerCase() === "true";

  if (host) {
    const port = portRaw ? Number(portRaw) : 587;
    const secure = secureRaw ? secureRaw === "true" || secureRaw === "1" : port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: debug,
      debug,
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    logger: debug,
    debug,
  });
};

const transporter = buildTransporter();

const sanitizeEmailError = (err) => {
  try {
    if (!err) return { summary: "unknown" };
    const code = err.code || null;
    const command = err.command || null;
    const responseCode = err.responseCode || null;
    const message = err.message ? String(err.message) : String(err);
    const response = err.response ? String(err.response) : null;
    const summaryParts = [];
    if (code) summaryParts.push(`code=${code}`);
    if (responseCode) summaryParts.push(`responseCode=${responseCode}`);
    if (command) summaryParts.push(`command=${command}`);
    summaryParts.push(`message=${message}`);
    if (response) summaryParts.push(`response=${response}`);

    return {
      summary: summaryParts.join(" | "),
      code,
      command,
      responseCode,
      message,
      response,
    };
  } catch {
    return { summary: "unknown" };
  }
};

// Generar código de 6 dígitos
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

export async function sendCodeEmail(email, code) {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Código de acceso - Cogniseguros",
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e293b; color: white; padding: 20px; border-radius: 8px; text-align: center;">
            <h2>Código de Acceso</h2>
            <p style="font-size: 14px; opacity: 0.9;">Usa este código para acceder a Cogniseguros</p>
          </div>
          <div style="padding: 20px; text-align: center;">
            <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 0; color: #1e293b;">
                ${String(code || "").trim()}
              </p>
            </div>
            <p style="color: #64748b; font-size: 12px;">Este código expira en 10 minutos</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px;">
              Si no solicitaste este código, ignora este email.
            </p>
          </div>
        </div>
      `,
  });
}

// Enviar código por email
export async function sendVerificationCode(email) {
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Guardar en memoria
    verificationCodes.set(email, { code, expiresAt });

    await sendCodeEmail(email, code);

    return { success: true, message: "Código enviado a tu email" };
  } catch (error) {
    const info = sanitizeEmailError(error);
    console.error("[EMAIL_SEND_FAIL]", info);
    return {
      success: false,
      message: `EMAIL_SEND_FAIL: ${info.summary}`,
      error: {
        code: info.code || null,
        command: info.command || null,
        responseCode: info.responseCode || null,
        response: info.response || null,
      },
    };
  }
}

// Verificar código
export function verifyCode(email, code) {
  const stored = verificationCodes.get(email);

  if (!stored) {
    return { valid: false, message: "Código expirado o no existe" };
  }

  if (new Date() > stored.expiresAt) {
    verificationCodes.delete(email);
    return { valid: false, message: "Código expirado" };
  }

  if (stored.code !== code) {
    return { valid: false, message: "Código incorrecto" };
  }

  // Código válido, eliminar
  verificationCodes.delete(email);
  return { valid: true, message: "Código verificado" };
}
