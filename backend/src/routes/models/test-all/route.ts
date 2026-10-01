import {
  createAndRunModelTestJob,
} from "../../../lib/modelTestWorker.js";
import {
  getLatestModelTestJob,
  getModelTestJob,
} from "../../../lib/db/repos/modelTestJobsRepo.js";

export const dynamic = "force-dynamic";

// POST /api/models/test-all
export async function POST_handler(req, res) {
  try {
    const { providerAlias, models, kind } = req.body || {};
    const job = await createAndRunModelTestJob({ providerAlias, models, kind });
    return res.status(202).json({ ok: true, job });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "Gagal memulai tes semua model" });
  }
}

// GET /api/models/test-all?providerAlias=xxx
// GET /api/models/test-all?jobId=xxx
export async function GET_handler(req, res) {
  try {
    const { searchParams } = new URL("http://localhost" + req.originalUrl);
    const jobId = searchParams.get("jobId");
    const providerAlias = searchParams.get("providerAlias");
    const job = jobId
      ? await getModelTestJob(jobId)
      : providerAlias
        ? await getLatestModelTestJob(providerAlias)
        : null;

    return res.json({ ok: true, job });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || "Gagal membaca status tes model" });
  }
}
