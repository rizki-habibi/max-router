

// Fetch with timeout wrapper
const fetchWithTimeout = (url, options, timeout = 10000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Request timeout")), timeout)
    )
  ]);
};

// Validate URL format
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Parse error details for user-friendly messages
const getErrorMessage = (error) => {
  if (error.cause?.code === "ECONNREFUSED") return "Connection refused - provider node offline or unreachable";
  if (error.cause?.code === "ENOTFOUND") return "DNS lookup failed - invalid domain or network issue";
  if (error.cause?.code === "ETIMEDOUT") return "Connection timeout - provider node too slow";
  if (error.message.includes("timeout")) return "Request timeout (>10s) - provider node not responding";
  if (error.cause?.code === "CERT_HAS_EXPIRED") return "SSL certificate expired";
  if (error.cause?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "SSL certificate verification failed";
  if (error.cause?.code) return `Network error: ${error.cause.code}`;
  return "Network connection failed - check URL and network connectivity";
};

// Get status-specific error message for /models endpoint
const getModelsErrorMessage = (status) => {
  if (status === 401 || status === 403) return "API key unauthorized";
  if (status === 404) return "/models endpoint not found - try chat validation with model ID";
  if (status >= 500) return "Server error - try again later";
  return `Unexpected response (${status})`;
};

// Get status-specific error message for /chat/completions endpoint
const getChatErrorMessage = (status) => {
  if (status === 401 || status === 403) return "API key unauthorized";
  if (status === 400) return "Invalid model or bad request";
  if (status === 404) return "Chat endpoint not found";
  if (status >= 500) return "Server error - try again later";
  return `Chat request failed (${status})`;
};

const readErrorBody = async (response) => {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.error || data?.message || data?.msg || text;
  } catch {
    return text;
  }
};

const isAuthFailure = (status) => status === 401 || status === 403;

const isReachableInferenceStatus = (status) => status === 429 || (status >= 200 && status < 300);

const trimBaseUrl = (baseUrl) => baseUrl.trim().replace(/\/$/, "");

// POST /api/provider-nodes/validate - Auto-detect compatible API version/type and validate one or many keys
export async function POST_handler(req, res) {
  try {
    const body = req.body || {};
    const baseUrlInput = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const apiKeys = Array.isArray(body.apiKeys)
      ? body.apiKeys.map((key) => typeof key === "string" ? key.trim() : "").filter(Boolean)
      : (typeof body.apiKey === "string" && body.apiKey.trim() ? [body.apiKey.trim()] : []);
    if (!baseUrlInput || !apiKeys.length) return res.status(400).json({ error: "Base URL dan minimal satu API key diperlukan" });
    if (!isValidUrl(baseUrlInput)) return res.status(400).json({ error: "Base URL tidak valid" });

    const normalizeCandidate = (value) => value.replace(/\/+$/, "");
    const root = normalizeCandidate(baseUrlInput);
    const candidates = [];
    const addCandidate = (url, version) => {
      const normalized = normalizeCandidate(url);
      if (!candidates.some((item) => item.url === normalized)) candidates.push({ url: normalized, version });
    };
    const versionMatch = root.match(/\/(v[0-9]+)$/i);
    if (versionMatch) {
      addCandidate(root, versionMatch[1].toLowerCase());
      addCandidate(root.replace(/\/(v[0-9]+)$/i, ""), "root");
    } else {
      addCandidate(root, "root");
      addCandidate(root + "/v1", "v1");
      addCandidate(root + "/v2", "v2");
    }

    const classifyModels = (data) => {
      const models = Array.isArray(data) ? data : (data?.data || data?.models || data?.results || []);
      return Array.from(new Set(models.map((item) => item?.id || item?.name || item?.model).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())));
    };

    const testKey = async (apiKey) => {
      let lastFailure = { valid: false, error: "Endpoint /models tidak ditemukan" };
      for (const candidate of candidates) {
        try {
          const response = await fetchWithTimeout(candidate.url + "/models", {
            method: "GET",
            headers: { Authorization: "Bearer " + apiKey, "x-api-key": apiKey, "anthropic-version": "2023-06-01", Accept: "application/json" },
          }, 8000);
          if (response.status === 401 || response.status === 403) {
            lastFailure = { valid: false, error: "API key tidak valid / tidak berwenang", status: response.status, version: candidate.version };
            continue;
          }
          if (response.status === 429) {
            return { valid: true, status: 429, warning: "API key dikenali, tetapi endpoint sedang rate limit.", detectedVersion: candidate.version, detectedType: "openai-compatible", baseUrl: candidate.url, models: [] };
          }
          if (!response.ok) {
            lastFailure = { valid: false, error: "Endpoint mengembalikan HTTP " + response.status, status: response.status, version: candidate.version };
            continue;
          }
          const data = await response.json().catch(() => null);
          const models = classifyModels(data);
          const looksAnthropic = Array.isArray(data?.data) && data.data.some((item) => item?.type === "model") && /anthropic/i.test(JSON.stringify(data).slice(0, 5000));
          return { valid: true, detectedVersion: candidate.version, detectedType: looksAnthropic ? "anthropic-compatible" : "openai-compatible", baseUrl: candidate.url, models, modelCount: models.length, method: "models" };
        } catch (error) {
          lastFailure = { valid: false, error: getErrorMessage(error), version: candidate.version };
        }
      }
      return lastFailure;
    };

    const results = [];
    for (const apiKey of apiKeys) {
      const result = await testKey(apiKey);
      results.push({ ...result, keyPreview: apiKey.length > 8 ? apiKey.slice(0, 4) + "…" + apiKey.slice(-4) : "••••" });
    }
    const validResults = results.filter((item) => item.valid);
    const detected = validResults[0] || null;
    return res.json({
      valid: results.length === 1 ? results[0].valid : validResults.length > 0,
      total: results.length, validCount: validResults.length, invalidCount: results.length - validResults.length,
      detectedType: detected?.detectedType || null, detectedVersion: detected?.detectedVersion || null,
      baseUrl: detected?.baseUrl || null, models: Array.from(new Set(validResults.flatMap((item) => item.models || []))), results,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("Error validating provider node:", { message: error.message, cause: error.cause, code: error.cause?.code });
    return res.status(500).json({ valid: false, error: errorMessage });
  }
}