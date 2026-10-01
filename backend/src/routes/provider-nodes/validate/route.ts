

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
      const normalizePrice = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const classifyPrice = (item) => {
        if (item?.free === true || item?.is_free === true || item?.isFree === true) return "free";
        const tier = String(item?.tier || item?.pricing?.tier || "").toLowerCase();
        if (tier === "free") return "free";
        if (tier === "paid" || tier === "pro") return "paid";
        const pricing = item?.pricing;
        if (pricing && typeof pricing === "object") {
          const values = [
            pricing.input, pricing.output, pricing.prompt, pricing.completion,
            pricing.input_token, pricing.output_token, pricing.prompt_token, pricing.completion_token,
          ].map(normalizePrice).filter((v) => v !== null);
          if (values.length) return values.every((v) => v === 0) ? "free" : "paid";
        }
        return "unknown";
      };
      const seen = new Set();
      return models.map((item) => {
        const id = item?.id || item?.name || item?.model;
        if (typeof id !== "string" || !id.trim() || seen.has(id.trim())) return null;
        seen.add(id.trim());
        return {
          id: id.trim(),
          pricing: item?.pricing ?? null,
          priceClass: classifyPrice(item),
          free: classifyPrice(item) === "free",
          paid: classifyPrice(item) === "paid",
          description: item?.description || item?.description_text || null,
          contextWindow: item?.context_window ?? item?.contextWindow ?? item?.context_length ?? null,
          maxOutput: item?.max_output ?? item?.maxOutput ?? item?.max_tokens ?? null,
          capabilities: Array.isArray(item?.capabilities) ? item.capabilities : null,
          supportedParameters: item?.supported_parameters ?? item?.supportedParameters ?? null,
        };
      }).filter(Boolean);
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
          if (response.status === 404) {
            lastFailure = { valid: false, error: "Endpoint /models tidak ditemukan", status: response.status, version: candidate.version };
            continue;
          }
          if (!response.ok) {
            lastFailure = { valid: false, error: "Endpoint mengembalikan HTTP " + response.status, status: response.status, version: candidate.version };
            continue;
          }
          const data = await response.json().catch(() => null);
          const models = classifyModels(data);
          const firstModel = Array.isArray(data?.data) ? data.data[0] : null;
          const looksAnthropic = firstModel?.type === "model" || Boolean(firstModel?.display_name);
          return { valid: true, detectedVersion: candidate.version, detectedType: looksAnthropic ? "anthropic-compatible" : "openai-compatible", baseUrl: candidate.url, models, modelCount: models.length, method: "models" };
        } catch (error) {
          lastFailure = { valid: false, error: getErrorMessage(error), version: candidate.version };
        }
      }

      // Anthropic Messages-compatible APIs often do not expose GET /models.
      // Probe /messages so a valid key is not rejected only because model listing is unavailable.
      for (const candidate of candidates) {
        try {
          const response = await fetchWithTimeout(candidate.url + "/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              Authorization: "Bearer " + apiKey,
              "anthropic-version": "2023-06-01",
              Accept: "application/json",
            },
            body: JSON.stringify({
              model: "model-detection-probe",
              max_tokens: 1,
              messages: [{ role: "user", content: "ping" }],
            }),
          }, 8000);
          if (response.status === 401 || response.status === 403) {
            lastFailure = { valid: false, error: "API key tidak valid / tidak berwenang", status: response.status, version: candidate.version };
            continue;
          }
          if (response.status === 404) {
            continue;
          }
          if (response.status === 429) {
            return {
              valid: true,
              status: 429,
              warning: "API key dikenali, tetapi endpoint sedang rate limit.",
              detectedVersion: candidate.version,
              detectedType: "anthropic-compatible",
              baseUrl: candidate.url,
              models: [],
              modelCount: 0,
              freeModelCount: 0,
              paidModelCount: 0,
              unknownPricingModelCount: 0,
              method: "messages-probe",
            };
          }
          if (response.status === 400 || (response.status >= 200 && response.status < 300)) {
            return {
              valid: true,
              detectedVersion: candidate.version,
              detectedType: "anthropic-compatible",
              baseUrl: candidate.url,
              models: [],
              modelCount: 0,
              freeModelCount: 0,
              paidModelCount: 0,
              unknownPricingModelCount: 0,
              method: "messages-probe",
              warning: "Key valid, tetapi provider tidak menyediakan daftar model melalui /models.",
            };
          }
        } catch (error) {
          lastFailure = { valid: false, error: getErrorMessage(error), version: candidate.version };
        }
      }

      return lastFailure;
    };

    const results = [];
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
      const apiKey = apiKeys[keyIndex];
      const result = await testKey(apiKey);
      results.push({ keyIndex, ...result, keyPreview: apiKey.length > 8 ? apiKey.slice(0, 4) + "…" + apiKey.slice(-4) : "••••" });
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