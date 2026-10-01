import crypto from "crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { machineIdSync } = require("node-machine-id");

const ENCRYPT_ALGO = "aes-256-gcm";
const ENCRYPT_SALT = "9router-mitm-pwd";

let _getSettings = null;
let _updateSettings = null;

function deriveKey() {
  let machineId = "";
  try {
    machineId = machineIdSync();
  } catch {
    machineId = process.env.HOSTNAME || process.env.COMPUTERNAME || "9router";
  }
  return crypto.createHash("sha256").update(machineId + ENCRYPT_SALT).digest();
}

function decryptPassword(stored) {
  if (typeof stored !== "string" || !stored) return null;
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv(
      ENCRYPT_ALGO,
      deriveKey(),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return (
      decipher.update(Buffer.from(dataHex, "hex"), undefined, "utf8") +
      decipher.final("utf8")
    );
  } catch {
    return null;
  }
}

/**
 * Returns the in-memory MITM sudo password, when one has been explicitly
 * cached by the MITM setup flow. Kept as a named function export so the
 * generated runtime route modules can import it reliably.
 */
export function getCachedPassword() {
  const password = globalThis.__mitmSudoPassword;
  return typeof password === "string" && password.length > 0 ? password : null;
}

export function setCachedPassword(password) {
  if (password) globalThis.__mitmSudoPassword = password;
  else delete globalThis.__mitmSudoPassword;
}

export function initDbHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

export async function loadEncryptedPassword() {
  if (!_getSettings) return null;
  try {
    const settings = await _getSettings();
    return decryptPassword(settings?.mitmSudoEncrypted);
  } catch {
    return null;
  }
}

export async function saveMitmSettings(enabled, encryptedPassword = null) {
  if (!_updateSettings) return;
  try {
    const updates = { mitmEnabled: enabled };
    if (encryptedPassword) updates.mitmSudoEncrypted = encryptedPassword;
    await _updateSettings(updates);
  } catch (error) {
    console.warn("[MITM] Failed to save settings:", error);
  }
}
