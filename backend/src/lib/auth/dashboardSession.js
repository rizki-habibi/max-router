import { SignJWT, jwtVerify } from "jose";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../../lib/dataDir.js";

function loadJwtSecret() {
  const configured = String(process.env.JWT_SECRET || "").trim();
  if (configured) return configured;

  const isProduction = process.env.NODE_ENV === "production";
  const file = path.join(DATA_DIR, "jwt-secret");

  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {}

  // Production must use a persistent secret from the environment.
  // Generating one in an ephemeral container invalidates every existing session
  // after a restart/redeploy and makes the dashboard appear logged out.
  if (isProduction) {
    throw new Error(
      "[AUTH] JWT_SECRET wajib dikonfigurasi di production. Sesi tidak dibuat dengan secret ephemeral."
    );
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const SECRET = new TextEncoder().encode(loadJwtSecret());

export function shouldUseSecureCookie(request) {
  const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
  const forwardedProto =
    request?.headers?.["x-forwarded-proto"] ??
    request?.headers?.get?.("x-forwarded-proto");
  return forceSecureCookie || forwardedProto === "https";
}

export async function createDashboardAuthToken(claims = {}) {
  return new SignJWT({ authenticated: true, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

export async function verifyDashboardAuthToken(token) {
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function getDashboardAuthSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function setDashboardAuthCookie(res, request, claims = {}) {
  const token = await createDashboardAuthToken(claims);
  res.cookie("9r_session", token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearDashboardAuthCookie(res) {
  res.clearCookie("9r_session", { path: "/" });
}
