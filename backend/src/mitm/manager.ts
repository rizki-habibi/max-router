import crypto from "crypto";
import { machineIdSync } from "node-machine-id";

type SettingsGetter = () => Promise<Record<string, any>> | Record<string, any>;
type SettingsUpdater = (updates: Record<string, any>) => Promise<any> | any;

const ENCRYPT_ALGO = "aes-256-gcm";
const ENCRYPT_SALT = "9router-mitm-pwd";

let _getSettings: SettingsGetter | null = null;
let _updateSettings: SettingsUpdater | null = null;

function deriveKey(): Buffer {
  let machineId = "";
  try {
    machineId = machineIdSync();
  } catch {
    machineId = process.env.HOSTNAME || process.env.COMPUTERNAME || "9router";
  }
  return crypto.createHash("sha256").update(machineId + ENCRYPT_SALT).digest();
}

function decryptPassword(stored: unknown): string | null {
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

    return decipher.update(Buffer.from(dataHex, "hex"), undefined, "utf8") +
      decipher.final("utf8");
  } catch {
    return null;
  }
}

export function getCachedPassword(): string | null {
  const password = (globalThis as any).__mitmSudoPassword;
  return typeof password === "string" && password.length > 0 ? password : null;
}

export function setCachedPassword(password: string | null | undefined): void {
  if (password) {
    (globalThis as any).__mitmSudoPassword = password;
  } else {
    delete (globalThis as any).__mitmSudoPassword;
  }
}

export function initDbHooks(
  getSettingsFn: SettingsGetter,
  updateSettingsFn: SettingsUpdater,
): void {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

export async function loadEncryptedPassword(): Promise<string | null> {
  if (!_getSettings) return null;

  try {
    const settings = await _getSettings();
    return decryptPassword(settings?.mitmSudoEncrypted);
  } catch {
    return null;
  }
}

export async function saveMitmSettings(
  enabled: boolean,
  encryptedPassword?: string | null,
): Promise<void> {
  if (!_updateSettings) return;

  try {
    const updates: Record<string, any> = { mitmEnabled: enabled };
    if (encryptedPassword) updates.mitmSudoEncrypted = encryptedPassword;
    await _updateSettings(updates);
  } catch (error) {
    console.warn("[MITM] Failed to save settings:", error);
  }
}
