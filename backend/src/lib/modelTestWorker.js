import crypto from "node:crypto";
import { pingModelByKind } from "../routes/models/test/ping.js";
import {
  createModelTestJob,
  getModelTestJob,
  listRunningModelTestJobs,
  recordModelTestJobResult,
  updateModelTestJob,
} from "./db/repos/modelTestJobsRepo.js";
import { disableModels } from "./db/repos/disabledModelsRepo.js";

const activeWorkers = new Set();

function normalizeModelId(value) {
  return String(value || "").trim();
}

export async function createAndRunModelTestJob({ providerAlias, models, kind = "llm" }) {
  const cleanModels = [...new Set((Array.isArray(models) ? models : []).map(normalizeModelId).filter(Boolean))];
  if (!providerAlias) throw new Error("providerAlias wajib diisi");
  if (cleanModels.length === 0) throw new Error("Tidak ada model untuk diuji");

  const existing = (await listRunningModelTestJobs()).find((job) => job.providerAlias === providerAlias);
  if (existing) return existing;

  const job = await createModelTestJob({
    id: crypto.randomUUID(),
    providerAlias,
    models: cleanModels,
    kind,
    progress: 0,
  });

  runModelTestJob(job.id).catch((error) => {
    console.error("[model-test-worker] job gagal:", job.id, error);
  });

  return job;
}

export async function runModelTestJob(jobId) {
  if (activeWorkers.has(jobId)) return;
  activeWorkers.add(jobId);

  try {
    let job = await getModelTestJob(jobId);
    if (!job || job.status !== "running") return;

    const alreadyDone = new Set(
      Object.entries(job.results || {})
        .filter(([, result]) => result?.status === "ok" || result?.status === "error")
        .map(([modelId]) => modelId)
    );

    for (const modelId of job.models || []) {
      if (alreadyDone.has(modelId)) continue;

      let result;
      try {
        const response = await pingModelByKind(job.providerAlias + "/" + modelId, job.kind || "llm");
        const ok = !!response?.ok;
        result = {
          status: ok ? "ok" : "error",
          ok,
          checkedAt: new Date().toISOString(),
          error: ok ? null : (response?.error || "Model gagal diuji"),
          details: response || null,
        };
      } catch (error) {
        result = {
          status: "error",
          ok: false,
          checkedAt: new Date().toISOString(),
          error: error?.message || "Tes model gagal",
          details: null,
        };
      }

      await recordModelTestJobResult(jobId, modelId, result);

      if (result.status === "error") {
        try {
          await disableModels(job.providerAlias, [modelId]);
        } catch (disableError) {
          console.error("[model-test-worker] gagal menonaktifkan model:", modelId, disableError);
        }
      }
    }

    job = await getModelTestJob(jobId);
    const finished = !job?.models?.some((modelId) => {
      const result = job.results?.[modelId];
      return result?.status !== "ok" && result?.status !== "error";
    });

    if (finished) {
      await updateModelTestJob(jobId, {
        status: "completed",
        finishedAt: new Date().toISOString(),
        progress: 100,
      });
    }
  } finally {
    activeWorkers.delete(jobId);
  }
}

export async function resumeModelTestJobs() {
  const jobs = await listRunningModelTestJobs();
  for (const job of jobs) {
    runModelTestJob(job.id).catch((error) => {
      console.error("[model-test-worker] resume gagal:", job.id, error);
    });
  }
  if (jobs.length) console.log(`[model-test-worker] ${jobs.length} pekerjaan tes model dilanjutkan.`);
  return jobs.length;
}
