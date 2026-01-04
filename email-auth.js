import nodemailer from "nodemailer";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Almacenar códigos temporalmente (en producción usar Redis)
const verificationCodes = new Map();

// Configurar transporte de email
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generar código de 6 dígitos
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// Enviar código por email
export async function sendVerificationCode(email) {
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Guardar en memoria
    verificationCodes.set(email, { code, expiresAt });

    // Enviar email
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
                ${code}
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

    return { success: true, message: "Código enviado a tu email" };
  } catch (error) {
    console.error("Error enviando email:", error);
    return { success: false, message: "Error al enviar email" };
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
