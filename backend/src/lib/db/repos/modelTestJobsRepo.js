import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const SCOPE = "modelTestJobs";

function nowIso() {
  return new Date().toISOString();
}

function toJob(row) {
  if (!row) return null;
  return parseJson(row.value, null);
}

export async function createModelTestJob(job) {
  const db = await getAdapter();
  const value = {
    ...job,
    status: "running",
    createdAt: job.createdAt || nowIso(),
    startedAt: job.startedAt || nowIso(),
    finishedAt: null,
    completed: 0,
    success: 0,
    failed: 0,
    results: {},
    error: null,
  };
  await db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, value.id, stringifyJson(value)]
  );
  return value;
}

export async function getModelTestJob(id) {
  if (!id) return null;
  const db = await getAdapter();
  const row = await db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, id]);
  return toJob(row);
}

export async function listRunningModelTestJobs() {
  const db = await getAdapter();
  const rows = await db.all(`SELECT value FROM kv WHERE scope = ?`, [SCOPE]);
  return rows.map(toJob).filter((job) => job?.status === "running");
}

export async function getLatestModelTestJob(providerAlias) {
  const db = await getAdapter();
  const rows = await db.all(`SELECT value FROM kv WHERE scope = ?`, [SCOPE]);
  const jobs = rows.map(toJob).filter((job) => job?.providerAlias === providerAlias);
  jobs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return jobs[0] || null;
}

export async function updateModelTestJob(id, patch) {
  const db = await getAdapter();
  const row = await db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, id]);
  if (!row) return null;
  const current = toJob(row);
  const next = { ...current, ...patch };
  await db.run(
    `UPDATE kv SET value = ? WHERE scope = ? AND key = ?`,
    [stringifyJson(next), SCOPE, id]
  );
  return next;
}

export async function recordModelTestJobResult(id, modelId, result) {
  const db = await getAdapter();
  let next = null;
  await db.transaction(async () => {
    const row = await db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, id]);
    if (!row) return;
    const current = toJob(row);
    const results = { ...(current.results || {}), [modelId]: result };
    const entries = Object.values(results);
    const completed = entries.filter((item) => item?.status === "ok" || item?.status === "error").length;
    const success = entries.filter((item) => item?.status === "ok").length;
    const failed = entries.filter((item) => item?.status === "error").length;
    const total = Array.isArray(current.models) ? current.models.length : 0;
    next = {
      ...current,
      results,
      completed,
      success,
      failed,
      progress: total ? Math.floor((completed / total) * 100) : 100,
    };
    await db.run(`UPDATE kv SET value = ? WHERE scope = ? AND key = ?`, [stringifyJson(next), SCOPE, id]);
  });
  return next;
}
