import { ANTIGRAVITY_CONFIG, getOAuthClientMetadata } from "./constants/oauth.js";

function describeUpstreamError(status, body) {
  const raw = String(body || "").trim();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch {}
  const message =
    parsed?.error_description ||
    parsed?.error?.message ||
    parsed?.error?.status ||
    parsed?.error ||
    raw ||
    `HTTP ${status}`;
  return `Antigravity OAuth token exchange failed (${status}): ${String(message).slice(0, 1200)}`;
}

export function buildAntigravityAuthUrl(redirectUri, state, codeChallenge) {
  if (!redirectUri || !state || !codeChallenge) {
    throw new Error("Antigravity OAuth membutuhkan redirect URI, state, dan PKCE challenge");
  }

  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CONFIG.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: ANTIGRAVITY_CONFIG.scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  return `${ANTIGRAVITY_CONFIG.authorizeUrl}?${params.toString()}`;
}

export async function exchangeAntigravityTokens(code, redirectUri, codeVerifier) {
  if (!code) throw new Error("Antigravity OAuth tidak menerima authorization code");
  if (!codeVerifier) throw new Error("Antigravity OAuth memerlukan PKCE code verifier");

  const response = await fetch(ANTIGRAVITY_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ANTIGRAVITY_CONFIG.clientId,
      client_secret: ANTIGRAVITY_CONFIG.clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(describeUpstreamError(response.status, body));
  }

  const tokens = await response.json();
  if (!tokens.access_token) {
    throw new Error("Antigravity OAuth berhasil di Google tetapi access_token tidak diterima");
  }

  const accessToken = tokens.access_token;
  const metadata = getOAuthClientMetadata();
  const loadHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": ANTIGRAVITY_CONFIG.loadCodeAssistUserAgent,
    "X-Goog-Api-Client": ANTIGRAVITY_CONFIG.loadCodeAssistApiClient,
    "Client-Metadata": ANTIGRAVITY_CONFIG.loadCodeAssistClientMetadata,
    "x-request-source": "local",
  };

  let userInfo = {};
  try {
    const userInfoRes = await fetch(`${ANTIGRAVITY_CONFIG.userInfoUrl}?alt=json`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-request-source": "local",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (userInfoRes.ok) userInfo = await userInfoRes.json();
  } catch {}

  let projectId = "";
  try {
    const loadRes = await fetch(ANTIGRAVITY_CONFIG.loadCodeAssistEndpoint, {
      method: "POST",
      headers: loadHeaders,
      body: JSON.stringify({ metadata }),
      signal: AbortSignal.timeout(15000),
    });
    if (loadRes.ok) {
      const data = await loadRes.json();
      const project = data.cloudaicompanionProject;
      projectId = typeof project === "string" ? project.trim() : (project?.id || "").trim();
    }
  } catch {}

  return {
    accessToken,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
    email: userInfo.email,
    projectId,
  };
}
