// Ensure proxyFetch is loaded to patch globalThis.fetch
import "open-sse/index.js";

import { getProviderConnectionById, updateProviderConnection } from "../../../lib/localDb.js";
import { getUsageForProvider } from "../../../../open-sse/services/usage.js"; // Watcher trigger comment
import { getExecutor } from "../../../../open-sse/executors/index.js";
import { resolveConnectionProxyConfig } from "../../../lib/network/connectionProxy.js";
import { USAGE_APIKEY_PROVIDERS } from "../../../shared/constants/providers.js";


function getCompatibleBaseUrl(connection) {
  const raw = connection?.providerSpecificData?.baseUrl;
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.origin + (u.pathname || "");
  } catch { return String(raw).replace(/\/+$/, ""); }
}
function isXkiroBaseUrl(connection) {
  try {
    const u = new URL(getCompatibleBaseUrl(connection));
    return /(^|\.)xkiro\.com$/i.test(u.hostname);
  } catch { return false; }
}
async function getXkiroUsage(connection) {
  const base = getCompatibleBaseUrl(connection);
  if (!base) return null;
  const origin = new URL(base).origin;
  const url = origin + "/v1/usage";
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": "Bearer " + connection.apiKey, "x-api-key": connection.apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) return { error: "HTTP " + response.status + ": " + raw.slice(0, 300), source: "upstream", endpoint: url };
    return data && typeof data === "object"
      ? { ...data, source: "upstream", endpoint: url, fetchedAt: new Date().toISOString() }
      : { error: "Respons usage bukan JSON.", source: "upstream", endpoint: url };
  } catch (error) {
    return { error: error?.message || "Gagal membaca usage", source: "upstream", endpoint: url };
  }
}
async function getLocalTokenUsage(connectionId) {
  try {
    const db = await getAdapter();
    const rows = await db.all("SELECT model, tokens, promptTokens, completionTokens, status, timestamp FROM usageHistory WHERE connectionId = ? ORDER BY id DESC LIMIT 500", [connectionId]);
    const totals = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 };
    const byModel = {};
    for (const row of rows) {
      const t = parseJson(row.tokens, {}) || {};
      const input = Number(t.prompt_tokens ?? t.input_tokens ?? row.promptTokens ?? 0) || 0;
      const output = Number(t.completion_tokens ?? t.output_tokens ?? row.completionTokens ?? 0) || 0;
      const cacheRead = Number(t.cached_tokens ?? t.cache_read_input_tokens ?? 0) || 0;
      const cacheCreation = Number(t.cache_creation_input_tokens ?? 0) || 0;
      const reasoning = Number(t.reasoning_tokens ?? 0) || 0;
      totals.requests++; totals.inputTokens += input; totals.outputTokens += output;
      totals.cacheReadTokens += cacheRead; totals.cacheCreationTokens += cacheCreation; totals.reasoningTokens += reasoning;
      const model = row.model || "unknown";
      if (!byModel[model]) byModel[model] = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, lastUsed: row.timestamp };
      byModel[model].requests++; byModel[model].inputTokens += input; byModel[model].outputTokens += output;
      byModel[model].cacheReadTokens += cacheRead; byModel[model].cacheCreationTokens += cacheCreation; byModel[model].reasoningTokens += reasoning;
      if (row.timestamp && new Date(row.timestamp) > new Date(byModel[model].lastUsed || 0)) byModel[model].lastUsed = row.timestamp;
    }
    return { ...totals, byModel };
  } catch {
    return { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, byModel: {} };
  }
}

// Detect auth-expired messages returned by usage providers instead of throwing
const AUTH_EXPIRED_PATTERNS = ["expired", "authentication", "unauthorized", "401", "re-authorize"];
function isAuthExpiredMessage(usage) {
  if (!usage?.message) return false;
  const msg = usage.message.toLowerCase();
  return AUTH_EXPIRED_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Refresh credentials using executor and update database
 * @param {boolean} force - Skip needsRefresh check and always attempt refresh
 * @returns Promise<{ connection, refreshed }>
 */
async function refreshAndUpdateCredentials(connection, force = false, proxyOptions = null) {
  const executor = getExecutor(connection.provider);

  // Build credentials object from connection
  const credentials = {
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    idToken: connection.idToken,
    expiresAt: connection.expiresAt || connection.tokenExpiresAt,
    lastRefreshAt: connection.lastRefreshAt,
    connectionId: connection.id,
    providerSpecificData: connection.providerSpecificData,
    // For GitHub
    copilotToken: connection.providerSpecificData?.copilotToken,
    copilotTokenExpiresAt: connection.providerSpecificData?.copilotTokenExpiresAt,
    apiKey: connection.apiKey,
    cookie: connection.apiKey || connection.cookie || connection.providerSpecificData?.cookie,
  };

  // Check if refresh is needed (skip when force=true)
  const needsRefresh = force || executor.needsRefresh(credentials);

  if (!needsRefresh) {
    return { connection, refreshed: false };
  }

  // Use executor's refreshCredentials method (with optional proxy)
  const refreshResult = await executor.refreshCredentials(credentials, console, proxyOptions);

  if (!refreshResult) {
    // Refresh failed but we still have an accessToken — try with existing token
    if (connection.accessToken) {
      return { connection, refreshed: false };
    }
    throw new Error("Failed to refresh credentials. Please re-authorize the connection.");
  }

  // Build update object
  const now = new Date().toISOString();
  const updateData = {
    updatedAt: now,
  };

  // Update accessToken if present
  if (refreshResult.accessToken) {
    updateData.accessToken = refreshResult.accessToken;
  }

  // Update refreshToken if present
  if (refreshResult.refreshToken) {
    updateData.refreshToken = refreshResult.refreshToken;
  }

  if (refreshResult.idToken) {
    updateData.idToken = refreshResult.idToken;
  }

  if (refreshResult.lastRefreshAt) {
    updateData.lastRefreshAt = refreshResult.lastRefreshAt;
  }

  // Update token expiry
  if (refreshResult.expiresIn) {
    updateData.expiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString();
    updateData.expiresIn = refreshResult.expiresIn;
  } else if (refreshResult.expiresAt) {
    updateData.expiresAt = refreshResult.expiresAt;
  }

  // Handle provider-specific data (copilotToken for GitHub, etc.)
  const providerSpecificUpdates = {
    ...(refreshResult.providerSpecificData || {}),
    ...(refreshResult.copilotToken ? { copilotToken: refreshResult.copilotToken } : {}),
    ...(refreshResult.copilotTokenExpiresAt ? { copilotTokenExpiresAt: refreshResult.copilotTokenExpiresAt } : {}),
  };
  if (Object.keys(providerSpecificUpdates).length > 0) {
    updateData.providerSpecificData = {
      ...(connection.providerSpecificData || {}),
      ...providerSpecificUpdates,
    };
  }

  // Update database
  await updateProviderConnection(connection.id, updateData);

  // Return updated connection
  const updatedConnection = {
    ...connection,
    ...updateData,
    providerSpecificData: updateData.providerSpecificData || connection.providerSpecificData,
  };

  return {
    connection: updatedConnection,
    refreshed: true,
  };
}

/**
 * GET /api/usage/[connectionId] - Get usage data for a specific connection
 */
export async function GET_handler(req, res, { params }) {
  let connection;
  try {
    const { connectionId } = await params;


    // Get connection from database
    connection = await getProviderConnectionById(connectionId);
    if (!connection) {
      return Response.json({ error: "Connection not found" }, { status: 404 });
    }

    // Allow OAuth/cookie connections, plus whitelisted apikey providers (glm/minimax/...)
    const isOAuth = connection.authType === "oauth";
    const isCookie = connection.authType === "cookie";
    const isApikeyEligible =
      connection.authType === "apikey" &&
      USAGE_APIKEY_PROVIDERS.includes(connection.provider);

    const xkiroCompatible = isXkiroBaseUrl(connection);
    if (!isOAuth && !isCookie && !isApikeyEligible && !xkiroCompatible) {
      return Response.json({ message: "Usage not available for this connection" });
    }

    // Resolve connection proxy config; force strictProxy=false so quota/refresh fall back to direct on failure
    const proxyConfig = await resolveConnectionProxyConfig(connection.providerSpecificData);
    const proxyOptions = {
      connectionProxyEnabled: proxyConfig.connectionProxyEnabled === true,
      connectionProxyUrl: proxyConfig.connectionProxyUrl || "",
      connectionNoProxy: proxyConfig.connectionNoProxy || "",
      vercelRelayUrl: proxyConfig.vercelRelayUrl || "",
      strictProxy: false,
    };

    // Refresh credentials for OAuth or cookie-based connections (since they have token refresh)
    if (isOAuth || isCookie) {
      try {
        const result = await refreshAndUpdateCredentials(connection, false, proxyOptions);
        connection = result.connection;
      } catch (refreshError) {
        console.error("[Usage API] Credential refresh failed:", refreshError);
        return Response.json({
          error: `Credential refresh failed: ${refreshError.message}`
        }, { status: 401 });
      }
    }

    // Usage mengikuti Base URL provider yang dikonfigurasi.
    let usage = isXkiroBaseUrl(connection) ? await getXkiroUsage(connection) : await getUsageForProvider(connection, proxyOptions);
    const localTokenUsage = await getLocalTokenUsage(connection.id);
    if (usage && typeof usage === "object") usage.local = { ...localTokenUsage, note: "Token lokal dihitung dari request yang melewati Max Router." };

    // If provider returned an auth-expired message instead of throwing,
    // force-refresh token and retry once (OAuth or cookie)
    if ((isOAuth && connection.refreshToken || isCookie) && isAuthExpiredMessage(usage)) {
      try {
        const retryResult = await refreshAndUpdateCredentials(connection, true, proxyOptions);
        connection = retryResult.connection;
        usage = await getUsageForProvider(connection, proxyOptions);
      } catch (retryError) {
        console.warn(`[Usage] ${connection.provider}: force refresh failed: ${retryError.message}`);
      }
    }

    return Response.json(usage);
  } catch (error) {
    const provider = connection?.provider ?? "unknown";
    console.warn(`[Usage] ${provider}: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
