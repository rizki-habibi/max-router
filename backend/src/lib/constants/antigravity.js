/**
 * Canonical Antigravity / Google Cloud Code Assist endpoint configuration.
 *
 * The public Gemini CLI source uses this Cloud Code endpoint:
 * https://cloudcode-pa.googleapis.com
 *
 * ANTIGRAVITY_BASE_URL may override it for controlled testing, but production
 * defaults to the official endpoint so individual modules cannot drift.
 */
const configuredBaseUrl = process.env.ANTIGRAVITY_BASE_URL?.trim();

export const ANTIGRAVITY_BASE_URL = (
  configuredBaseUrl || "https://cloudcode-pa.googleapis.com"
).replace(/\/+$/, "");

export const ANTIGRAVITY_API_VERSION = "v1internal";

// The onboarding control-plane uses the daily Cloud Code endpoint.
export const ANTIGRAVITY_DAILY_BASE_URL = (
  process.env.ANTIGRAVITY_DAILY_BASE_URL?.trim() || "https://daily-cloudcode-pa.googleapis.com"
).replace(/\/+$/, "");

export const ANTIGRAVITY_ENDPOINTS = Object.freeze({
  loadCodeAssist: `${ANTIGRAVITY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:loadCodeAssist`,
  onboardUser: `${ANTIGRAVITY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:onboardUser`,
  dailyOnboardUser: `${ANTIGRAVITY_DAILY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:onboardUser`,
  fetchAvailableModels: `${ANTIGRAVITY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:fetchAvailableModels`,
  generateContent: `${ANTIGRAVITY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:generateContent`,
  streamGenerateContent: `${ANTIGRAVITY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:streamGenerateContent`,
  retrieveUserQuota: `${ANTIGRAVITY_BASE_URL}/${ANTIGRAVITY_API_VERSION}:retrieveUserQuota`,
});
