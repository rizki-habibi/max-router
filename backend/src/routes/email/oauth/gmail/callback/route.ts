import { getAdapter } from "../../../../../lib/db/driver.js";
import { upsertEmailAccount } from "../../../../../lib/db/repos/emailRepo.js";
import { v4 as uuidv4 } from "uuid";

async function jsonFetch(url, options) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) {
    const err = new Error(data.error_description || data.error || text || `HTTP ${r.status}`);
    err.status = r.status;
    err.code = data.error || "oauth_error";
    throw err;
  }
  return data;
}

export async function GET_handler(req, res) {
  try {
    const url = new URL("http://localhost" + req.originalUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      const description = url.searchParams.get("error_description") || oauthError;
      return res.redirect("/dashboard/automation?email_error=" + encodeURIComponent(description));
    }

    if (!code || !state) {
      return res.redirect("/dashboard/automation?email_error=" + encodeURIComponent("Kode OAuth Gmail tidak lengkap."));
    }

    const db = await getAdapter();
    const stateRow = await db.get(
      "SELECT value FROM kv WHERE scope=? AND key=?",
      ["emailOAuth", state]
    );

    if (!stateRow) {
      return res.redirect("/dashboard/automation?email_error=" + encodeURIComponent("Sesi OAuth Gmail tidak valid atau sudah kedaluwarsa. Silakan coba lagi."));
    }

    await db.run("DELETE FROM kv WHERE scope=? AND key=?", ["emailOAuth", state]);
    const stateData = JSON.parse(stateRow.value);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect("/dashboard/automation?email_error=" + encodeURIComponent("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET belum dikonfigurasi di Railway."));
    }

    const token = await jsonFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: stateData.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const info = await jsonFetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!info.email) throw new Error("Google tidak mengembalikan alamat Gmail.");

    await upsertEmailAccount({
      id: uuidv4(),
      provider: "gmail",
      email: info.email,
      name: info.name || info.email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
      scope: token.scope || "",
      isActive: true,
      lastError: null,
    });

    return res.redirect(
      "/dashboard/automation?email_connected=" + encodeURIComponent(info.email)
    );
  } catch (e) {
    console.error("[email/gmail/callback]", e);
    const message = e?.message || "Gagal menghubungkan Gmail.";
    return res.redirect("/dashboard/automation?email_error=" + encodeURIComponent(message));
  }
}
