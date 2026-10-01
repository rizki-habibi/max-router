/** Antigravity / Google Cloud Code Assist endpoint configuration. */
const trimBase = (value) => String(value || "").trim().replace(/\/+$/, "");

export const ANTIGRAVITY_API_VERSION = "v1internal";
export const ANTIGRAVITY_BASE_URL = trimBase(process.env.ANTIGRAVITY_BASE_URL || "https://daily-cloudcode-pa.googleapis.com");

const parseEndpoints = (value, fallback) => (value || fallback.join(",")).split(",").map(trimBase).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
export const ANTIGRAVITY_ENDPOINT_FALLBACKS = Object.freeze(parseEndpoints(process.env.ANTIGRAVITY_ENDPOINTS, [
  "https://daily-cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
]));

export const ANTIGRAVITY_LOAD_ENDPOINTS = Object.freeze(parseEndpoints(process.env.ANTIGRAVITY_LOAD_ENDPOINTS, [
  "https://cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
]));

const endpoint = (base, method) => base + "/" + ANTIGRAVITY_API_VERSION + ":" + method;
export const ANTIGRAVITY_ENDPOINTS = Object.freeze({
  loadCodeAssist: endpoint(ANTIGRAVITY_BASE_URL, "loadCodeAssist"),
  onboardUser: endpoint(ANTIGRAVITY_BASE_URL, "onboardUser"),
  dailyOnboardUser: endpoint("https://daily-cloudcode-pa.googleapis.com", "onboardUser"),
  fetchAvailableModels: endpoint(ANTIGRAVITY_BASE_URL, "fetchAvailableModels"),
  generateContent: endpoint(ANTIGRAVITY_BASE_URL, "generateContent"),
  streamGenerateContent: endpoint(ANTIGRAVITY_BASE_URL, "streamGenerateContent"),
  retrieveUserQuota: endpoint(ANTIGRAVITY_BASE_URL, "retrieveUserQuota"),
  endpoint,
});
