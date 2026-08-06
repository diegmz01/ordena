import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.SMTP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("[crypto-secrets] Falta SMTP_ENCRYPTION_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "[crypto-secrets] SMTP_ENCRYPTION_KEY debe decodificar a 32 bytes (base64 de `openssl rand -base64 32`)",
    );
  }
  return key;
}

/** Cifra un secreto (ej. contraseña SMTP) para guardarlo en la base de datos. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(":");
}

/** Descifra un valor producido por `encryptSecret`. */
export function decryptSecret(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("[crypto-secrets] Formato de secreto cifrado inválido");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
