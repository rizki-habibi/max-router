import { getEmailAccount, listEmailAccounts, updateEmailAccount, upsertEmailMessage } from "../../../lib/db/repos/emailRepo.js";

function header(headers, name) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decode(data) {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractBody(part) {
  if (!part) return "";
  if (part.body?.data) return decode(part.body.data);
  for (const child of part.parts || []) {
    const value = extractBody(child);
    if (value) return value;
  }
  return "";
}

function hasAttachment(part) {
  if (!part) return false;
  if (part.filename) return true;
  return (part.parts || []).some(hasAttachment);
}

async function api(url, token, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const r = await fetch(url, { ...options, headers });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) {
    const error = new Error(data.error?.message || data.error_description || text || `HTTP ${r.status}`);
    error.status = r.status;
    throw error;
  }
  return data;
}

async function tokenFor(account) {
  if (account.expiresAt && Date.parse(account.expiresAt) > Date.now() + 60000) {
    return account.accessToken;
  }

  if (!account.refreshToken) return account.accessToken;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });

  const d = await api("https://oauth2.googleapis.com/token", null, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  await updateEmailAccount(account.id, {
    accessToken: d.access_token,
    expiresAt: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
    lastError: null,
  });

  return d.access_token;
}

function gmailQuery(folder) {
  switch (folder) {
    case "sent": return "in:sent";
    case "starred": return "is:starred";
    case "spam": return "in:spam";
    case "trash": return "in:trash";
    case "archive": return "-in:inbox -in:sent -in:spam -in:trash";
    default: return "in:inbox";
  }
}

export async function POST_handler(req, res) {
  let synced = 0;
  let failed = 0;
  const results = [];

  try {
    const accounts = (await listEmailAccounts()).filter(
      (account) => account.provider === "gmail" && account.isActive
    );

    for (const summary of accounts) {
      try {
        const account = await getEmailAccount(summary.id);
        const token = await tokenFor(account);
        const query = encodeURIComponent(gmailQuery("inbox"));
        const list = await api(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${query}`,
          token
        );

        for (const item of list.messages || []) {
          const full = await api(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
            token
          );
          const headers = full.payload?.headers || [];
          const labels = full.labelIds || [];

          await upsertEmailMessage({
            accountId: account.id,
            providerMessageId: full.id,
            threadId: full.threadId,
            folder: labels.includes("SPAM")
              ? "spam"
              : labels.includes("TRASH")
                ? "trash"
                : labels.includes("SENT")
                  ? "sent"
                  : "inbox",
            fromAddress: header(headers, "From").match(/<([^>]+)>/)?.[1] || header(headers, "From"),
            fromName: header(headers, "From").replace(/<[^>]+>/, "").trim(),
            toAddress: header(headers, "To"),
            subject: header(headers, "Subject"),
            snippet: full.snippet,
            body: extractBody(full.payload),
            isRead: !labels.includes("UNREAD"),
            isStarred: labels.includes("STARRED"),
            hasAttachment: hasAttachment(full.payload),
            receivedAt: full.internalDate
              ? new Date(Number(full.internalDate)).toISOString()
              : new Date().toISOString(),
          });
          synced++;
        }

        await updateEmailAccount(account.id, {
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        });

        results.push({
          email: account.email,
          provider: account.provider,
          status: "ok",
          count: list.messages?.length || 0,
        });
      } catch (e) {
        failed++;
        await updateEmailAccount(summary.id, {
          lastError: e?.message || "Gagal sinkronisasi",
        });
        results.push({
          email: summary.email,
          provider: summary.provider,
          status: "error",
          error: e?.message || "Gagal sinkronisasi",
        });
      }
    }

    return res.json({ ok: true, synced, failed, results });
  } catch (e) {
    console.error("[email/sync]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Gagal sinkronisasi email",
      synced,
      failed,
      results,
    });
  }
}
