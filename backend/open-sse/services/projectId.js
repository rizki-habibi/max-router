/**
 * Project ID Service - Fetch and cache real Project IDs from Google Cloud Code API
 *
 *
 * Instead of generating random project IDs (e.g. "useful-spark-a1b2c"),
 * this service fetches the real Project ID bound to the authenticated user's account.
 * This significantly reduces the risk of being flagged by Google's anti-abuse systems.
 */

import { CLOUD_CODE_API, LOAD_CODE_ASSIST_HEADERS, LOAD_CODE_ASSIST_METADATA } from "../config/appConstants.js";
import { ANTIGRAVITY_ENDPOINTS, ANTIGRAVITY_LOAD_ENDPOINTS } from "../../src/lib/constants/antigravity.js";

// ─── Cache ────────────────────────────────────────────────────────────────────
// connectionId -> { projectId: string, fetchedAt: number }
const projectIdCache = new Map();

/** How long a cached project ID is considered fresh (1 hour). */
const CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Pending-fetch deduplication ─────────────────────────────────────────────
// connectionId -> { promise: Promise<string|null>, controller: AbortController, startedAt: number }
const pendingFetches = new Map();

/** Abort and evict a pending fetch that has been running longer than this (2 min). */
const PENDING_TTL_MS = 2 * 60 * 1000;

// ─── Periodic cleanup ────────────────────────────────────────────────────────
/** How often the background sweep runs (10 min). */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let _cleanupTimer = null;

/** Run one sweep immediately: evict stale cache entries and abort orphaned pending fetches. */
export function cleanupNow() {
    const now = Date.now();

    for (const [id, entry] of projectIdCache) {
        if (!entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
            projectIdCache.delete(id);
        }
    }

    for (const [id, item] of pendingFetches) {
        if (!item || typeof item.startedAt !== "number") {
            pendingFetches.delete(id);
            continue;
        }
        if (now - item.startedAt > PENDING_TTL_MS) {
            try { item.controller.abort(); } catch (_) { /* ignore */ }
            pendingFetches.delete(id);
        }
    }
}

/** Start the periodic background cleanup (idempotent). Called automatically on module load. */
export function startCacheCleanup() {
    if (_cleanupTimer) return;
    _cleanupTimer = setInterval(() => {
        try { cleanupNow(); } catch (e) {
            console.warn("[ProjectId] cleanup sweep error:", e?.message ?? e);
        }
    }, CLEANUP_INTERVAL_MS);
    // Unref so the timer doesn't prevent Node from exiting when it is otherwise idle
    _cleanupTimer?.unref?.();
}

/** Stop the periodic background cleanup (e.g. during graceful shutdown). */
export function stopCacheCleanup() {
    if (!_cleanupTimer) return;
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
}

// Start automatically when the module is first imported
startCacheCleanup();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the Project ID for a connection, with caching.
 * Returns null on failure (callers should fall back to random generation).
 *
 * @param {string} connectionId - The connection identifier for cache keying
 * @param {string} accessToken  - Valid OAuth access token
 * @returns {Promise<string|null>} Real project ID or null
 */
export async function getProjectIdForConnection(connectionId, accessToken) {
    if (!connectionId || !accessToken) return null;

    // Return cached value if still fresh
    const cached = projectIdCache.get(connectionId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.projectId;
    }

    // Deduplicate concurrent fetches for the same connection
    if (pendingFetches.has(connectionId)) {
        return pendingFetches.get(connectionId).promise;
    }

    // Each fetch gets its own AbortController so it can be canceled via removeConnection()
    const controller = new AbortController();

    const promise = (async () => {
        try {
            const projectId = await fetchProjectId(accessToken, controller.signal);
            if (projectId) {
                projectIdCache.set(connectionId, {projectId, fetchedAt: Date.now()});
                return projectId;
            }
            console.warn("[ProjectId] could not fetch projectId for connection", connectionId.slice(0, 8));
            return null;
        } catch (error) {
            console.warn(`[ProjectId] Error fetching project ID: ${error.message}`);
            return null;
        } finally {
            pendingFetches.delete(connectionId);
        }
    })();

    pendingFetches.set(connectionId, {promise, controller, startedAt: Date.now()});
    return promise;
}

/**
 * Invalidate the cached project ID for a connection.
 * Call this when a connection's credentials are fully revoked or refreshed.
 */
export function invalidateProjectId(connectionId) {
    projectIdCache.delete(connectionId);
}

/**
 * Fully remove a connection: abort any in-flight fetch and delete its cached project ID.
 * Wire this into your connection close / disconnect lifecycle events to prevent memory leaks.
 *
 * @param {string} connectionId
 */
export function removeConnection(connectionId) {
    if (!connectionId) return;
    projectIdCache.delete(connectionId);
    const pending = pendingFetches.get(connectionId);
    if (pending) {
        try { pending.controller.abort(); } catch (_) { /* ignore */ }
        pendingFetches.delete(connectionId);
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch project ID via loadCodeAssist endpoint.
 * Falls back to onboardUser when loadCodeAssist returns no project.
 *
 * @param {string}      accessToken
 * @param {AbortSignal} signal
 * @returns {Promise<string|null>}
 */
async function fetchProjectId(accessToken, signal) {
    let lastError = null;
    let initialData = null;

    // Try production first, then daily/sandbox. Different Antigravity
    // versions/accounts can be pinned to different Cloud Code backends.
    for (const baseUrl of ANTIGRAVITY_LOAD_ENDPOINTS) {
        if (signal?.aborted) return null;
        const url = `${baseUrl}/${"v1internal"}:loadCodeAssist`;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { ...LOAD_CODE_ASSIST_HEADERS, Authorization: `Bearer ${accessToken}`, Accept: "*/*" },
                body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA, mode: 1 }),
                signal
            });
            const text = await response.text().catch(() => "");
            if (!response.ok) {
                lastError = `HTTP ${response.status} ${text.slice(0, 180)}`;
                continue;
            }
            let data;
            try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
            initialData = data;
            const projectId = extractProjectId(data);
            if (projectId) return projectId;

            // The account can be authenticated but not provisioned yet.
            let tierID = "legacy-tier";
            if (Array.isArray(data.allowedTiers)) {
                const preferred = data.allowedTiers.find((tier) => tier?.isDefault === true && typeof tier.id === "string" && tier.id.trim());
                if (preferred) tierID = preferred.id.trim();
            }

            const onboarded = await onboardUser(accessToken, tierID, signal);
            if (onboarded) return onboarded;

            // onboardUser may report done without a project binding. Re-load
            // the control plane before trying the next backend.
            const reloaded = await reloadProjectId(accessToken, signal);
            if (reloaded) return reloaded;
            lastError = "authenticated but no cloudaicompanionProject was provisioned";
        } catch (error) {
            if (error?.name === "AbortError") return null;
            lastError = error?.message || String(error);
        }
    }

    console.warn(`[ProjectId] Antigravity project discovery failed: ${lastError || "unknown error"}`, initialData ? "provisioning response received" : "no loadCodeAssist response");
    return null;
}

async function reloadProjectId(accessToken, signal) {
    for (const baseUrl of ANTIGRAVITY_LOAD_ENDPOINTS) {
        if (signal?.aborted) return null;
        try {
            const response = await fetch(`${baseUrl}/v1internal:loadCodeAssist`, {
                method: "POST",
                headers: { ...LOAD_CODE_ASSIST_HEADERS, Authorization: `Bearer ${accessToken}`, Accept: "*/*" },
                body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA }),
                signal
            });
            if (!response.ok) continue;
            const data = await response.json();
            const projectId = extractProjectId(data);
            if (projectId) return projectId;
        } catch (error) {
            if (error?.name === "AbortError") return null;
        }
    }
    return null;
}

async function onboardUser(accessToken, tierID, externalSignal) {
    console.log(`[ProjectId] Onboarding Antigravity account with tier: ${tierID}`);
    const reqBody = {
        tierId: tierID,
        metadata: {
            ide_type: "ANTIGRAVITY",
            ide_version: "1.107.0",
            plugin_version: "",
            platform: 0,
            update_channel: "",
            duet_project: "",
            plugin_type: 0,
            ide_name: "antigravity"
        }
    };
    const MAX_ATTEMPTS = 6;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (externalSignal?.aborted) return null;
        for (const baseUrl of [
            "https://daily-cloudcode-pa.googleapis.com",
            ...ANTIGRAVITY_LOAD_ENDPOINTS
        ].filter((v, i, a) => a.indexOf(v) === i)) {
            try {
                const response = await fetch(`${baseUrl}/v1internal:onboardUser`, {
                    method: "POST",
                    headers: { ...LOAD_CODE_ASSIST_HEADERS, Authorization: `Bearer ${accessToken}`, Accept: "*/*" },
                    body: JSON.stringify(reqBody),
                    signal: externalSignal
                });
                const text = await response.text().catch(() => "");
                if (!response.ok) continue;
                let data;
                try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
                const projectId = extractProjectIdFromOnboard(data);
                if (projectId) return projectId;
                if (data.done === true) {
                    // done:true without a project is a real server-side provisioning
                    // failure; do not invent a project ID.
                    console.warn("[ProjectId] onboardUser returned done=true without project binding");
                    continue;
                }
            } catch (error) {
                if (error?.name === "AbortError") return null;
            }
        }
        if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
}
/**
 * Extract project ID from loadCodeAssist response.
 */
function extractProjectId(data) {
    if (!data) return null;

    if (typeof data.cloudaicompanionProject === "string") {
        const id = data.cloudaicompanionProject.trim();
        if (id) return id;
    }

    if (data.cloudaicompanionProject && typeof data.cloudaicompanionProject === "object") {
        const id = data.cloudaicompanionProject.id;
        if (typeof id === "string" && id.trim()) return id.trim();
    }

    return null;
}

/**
 * Extract project ID from onboardUser response.
 */
function extractProjectIdFromOnboard(data) {
    if (!data?.response) return null;

    const project = data.response.cloudaicompanionProject;

    if (typeof project === "string") {
        const id = project.trim();
        if (id) return id;
    }

    if (project && typeof project === "object") {
        const id = project.id;
        if (typeof id === "string" && id.trim()) return id.trim();
    }

    return null;
}
