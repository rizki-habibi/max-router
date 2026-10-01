
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";

function extractHtmlTitle(text) {
  const match = String(text || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || "";
}

async function readApiResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* handled below */ }
  }

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    url: res.url,
    contentType,
    data,
    raw: text,
    isHtml: /text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text),
  };
}

function ModelApiErrorDialog({ error, onClose, onRetry }) {
  if (!error) return null;

  const copyDetails = async () => {
    const details = [
      `Status: ${error.status} ${error.statusText || ""}`.trim(),
      `URL: ${error.url}`,
      `Content-Type: ${error.contentType || "unknown"}`,
      error.htmlTitle ? `HTML title: ${error.htmlTitle}` : "",
      error.message ? `Pesan: ${error.message}` : "",
      error.raw ? `Respons server:\n${error.raw.slice(0, 4000)}` : "",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(details);
    } catch {
      window.prompt("Salin detail error berikut:", details);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/30 bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">error</span>
              <h2 className="text-base font-semibold">Gagal mengambil model</h2>
            </div>
            <p className="mt-1 text-xs text-text-muted">Respons endpoint tidak sesuai format yang diharapkan.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-sidebar hover:text-text">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase tracking-wide text-text-muted">HTTP</div>
              <div className="mt-1 font-mono text-sm">{error.status || "—"} {error.statusText || ""}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase tracking-wide text-text-muted">Format respons</div>
              <div className="mt-1 font-mono text-sm">{error.isHtml ? "HTML" : error.contentType || "unknown"}</div>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">Endpoint</div>
            <div className="mt-1 break-all font-mono text-xs">{error.url}</div>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <div className="text-xs font-medium text-red-500">
              {error.isHtml
                ? "Server mengembalikan HTML. Kemungkinan route API/rewrite/proxy salah atau deployment mengirim halaman frontend."
                : error.message || "Server mengembalikan respons yang tidak dapat diproses sebagai JSON."}
            </div>
            {error.htmlTitle && <div className="mt-1 text-xs text-text-muted">Judul halaman: {error.htmlTitle}</div>}
          </div>
          {error.raw && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Lihat respons mentah</summary>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border p-3 text-[11px] text-text-muted">{error.raw.slice(0, 8000)}</pre>
            </details>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          <Button size="sm" variant="secondary" icon="content_copy" onClick={copyDetails}>Salin detail</Button>
          <Button size="sm" variant="secondary" icon="open_in_new" onClick={() => window.open(error.url, "_blank", "noopener,noreferrer")}>Buka endpoint</Button>
          {onRetry && <Button size="sm" icon="refresh" onClick={onRetry}>Coba lagi</Button>}
          <Button size="sm" variant="secondary" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </div>
  );
}

function CompatibleModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting }) {
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <span
        className="material-symbols-outlined text-base text-text-muted"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>
        <div className="flex items-center gap-1 mt-1">
          <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{fullModel}</code>
          <div className="relative group/btn">
            <button
              onClick={() => onCopy(fullModel, `model-${modelId}`)}
              className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
            >
              <span className="material-symbols-outlined text-sm">
                {copied === `model-${modelId}` ? "check" : "content_copy"}
              </span>
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${modelId}` ? "Tersalin" : "Copy"}
            </span>
          </div>
          {onTest && (
            <div className="relative group/btn">
              <button
                onClick={onTest}
                disabled={isTesting}
                className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                  {isTesting ? "progress_activity" : "science"}
                </span>
              </button>
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Menguji..." : "Test"}
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onDeleteAlias}
        className="p-1 hover:bg-red-50 rounded text-red-500"
        title="Hapus model"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, copied, onCopy, onSetAlias, onDeleteAlias, connections, isAnthropic }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});
  const [importedModels, setImportedModels] = useState([]);
  const [usageInfo, setUsageInfo] = useState(null);
  const [testingAll, setTestingAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [disabledModelIds, setDisabledModelIds] = useState([]);

  const handleTestModel = async (modelId, fromAll = false) => {
    if (testingModelId || (testingAll && !fromAll)) return false;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: providerStorageAlias + "/" + modelId }) });
      const response = await readApiResponse(res);
      if (!response.ok || !response.data || typeof response.data !== "object") {
        throw new Error(response.data?.error || `HTTP ${response.status}: respons tes model tidak valid`);
      }
      const data = response.data;
      const ok = !!data.ok;
      setModelTestResults((prev) => ({ ...prev, [modelId]: ok ? "ok" : "error" }));
      return ok;
    } catch (error) {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      return false;
    } finally { setTestingModelId(null); }
  };

  const handleLoadDisabled = async () => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { cache: "no-store" });
      const data = await res.json();
      setDisabledModelIds(Array.isArray(data.ids) ? data.ids : []);
    } catch { setDisabledModelIds([]); }
  };

  const handleTestAll = async () => {
    if (testingAll || testingModelId || activeModels.length === 0) return;
    setTestingAll(true);
    for (const item of activeModels) await handleTestModel(item.modelId, true);
    setTestingAll(false);
  };

  const providerAliases = Object.entries(modelAliases).filter(
    ([, model]) => model.startsWith(`${providerStorageAlias}/`)
  );

  const allModels = providerAliases.map(([alias, fullModel]) => ({
    modelId: fullModel.replace(`${providerStorageAlias}/`, ""),
    fullModel,
    alias,
  }));

  const activeModels = allModels.filter(({ modelId }) => !disabledModelIds.includes(modelId));
  const disabledModels = allModels.filter(({ modelId }) => disabledModelIds.includes(modelId));
  const errorModels = activeModels.filter(({ modelId }) => modelTestResults[modelId] === "error");

  const handleBulkAction = async () => {
    if (!bulkAction || errorModels.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      if (bulkAction === "delete") {
        for (const item of errorModels) await onDeleteAlias(item.alias);
        setModelTestResults((prev) => {
          const next = { ...prev };
          errorModels.forEach(({ modelId }) => delete next[modelId]);
          return next;
        });
      } else if (bulkAction === "disable") {
        const ids = errorModels.map(({ modelId }) => modelId);
        const res = await fetch("/api/models/disabled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAlias: providerStorageAlias, ids }),
        });
        if (!res.ok) throw new Error("Gagal menonaktifkan model error.");
        setDisabledModelIds((prev) => [...new Set([...prev, ...ids])]);
      }
      setBulkAction(null);
    } catch (error) {
      setApiError({ status: 0, statusText: "", url: "/api/models/disabled", contentType: "", raw: "", isHtml: false, message: error?.message || "Aksi model gagal." });
    } finally { setBulkBusy(false); }
  };

  useEffect(() => { handleLoadDisabled(); }, [providerStorageAlias]);

  const generateDefaultAlias = (modelId) => {
    const parts = modelId.split("/");
    return parts[parts.length - 1];
  };

  const resolveAlias = (modelId) => {
    const fullModel = `${providerStorageAlias}/${modelId}`;
    // Skip if this exact model already has an alias
    if (Object.values(modelAliases).includes(fullModel)) return null;
    const baseAlias = generateDefaultAlias(modelId);
    if (!modelAliases[baseAlias]) return baseAlias;
    const prefixedAlias = `${providerDisplayAlias}-${baseAlias}`;
    if (!modelAliases[prefixedAlias]) return prefixedAlias;
    return null;
  };

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    const resolvedAlias = resolveAlias(modelId);
    if (!resolvedAlias) {
      alert("All suggested aliases already exist. Please choose a different model or remove conflicting aliases.");
      return;
    }

    setAdding(true);
    try {
      await onSetAlias(modelId, resolvedAlias, providerStorageAlias);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`, {
        headers: { Accept: "application/json" },
      });
      const response = await readApiResponse(res);
      const data = response.data || {};
      if (!response.ok || !response.data || typeof response.data !== "object") {
        const detail = [
          data.error,
          data.upstreamError ? "Upstream: " + data.upstreamError : "",
          Array.isArray(data.candidates) ? "Dicoba: " + data.candidates.join(" | ") : "",
        ].filter(Boolean).join("\n");
        const parseError = new Error(
          response.isHtml
            ? "Server mengembalikan HTML, bukan JSON."
            : detail || "Gagal mengambil model."
        );
        parseError.response = {
          ...response,
          htmlTitle: response.isHtml ? extractHtmlTitle(response.raw) : "",
          message: detail || parseError.message,
        };
        throw parseError;
      }
      const models = Array.isArray(data.models) ? data.models : [];
      setImportedModels(models);
      setUsageInfo(data.usage || null);
      if (data.warning) console.warn("[Model Import]", data.warning, data.upstreamError || "");

      if (models.length === 0) {
        setApiError({
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          contentType: response.contentType,
          raw: response.raw,
          isHtml: false,
          message: "Endpoint berhasil merespons, tetapi tidak mengembalikan model.",
        });
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        const resolvedAlias = resolveAlias(modelId);
        if (!resolvedAlias) continue;
        await onSetAlias(modelId, resolvedAlias, providerStorageAlias);
        importedCount += 1;
      }
      if (importedCount === 0) {
        setApiError({
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          contentType: response.contentType,
          raw: "",
          isHtml: false,
          message: "Model berhasil dideteksi, tetapi tidak ada model baru yang bisa ditambahkan.",
        });
      }
    } catch (error) {
      console.log("Error importing models:", error);
      const response = error?.response;
      setApiError({
        status: response?.status || 0,
        statusText: response?.statusText || "",
        url: response?.url || `/api/providers/${activeConnection.id}/models`,
        contentType: response?.contentType || "",
        raw: response?.raw || "",
        isHtml: response?.isHtml || false,
        htmlTitle: response?.htmlTitle || "",
        message: error?.message || "Terjadi kesalahan saat mengambil model.",
      });
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/30 p-4">
        <div>
          <h3 className="text-lg font-semibold">Model Tersedia</h3>
          <p className="mt-1 text-sm text-text-muted">Tambahkan model {isAnthropic ? "Anthropic" : "OpenAI"} secara manual atau ambil otomatis dari endpoint /models.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">Aktif: {activeModels.length}</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">Error: {errorModels.length}</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">Nonaktif: {disabledModels.length}</span>
          {errorModels.length > 0 && <>
            <Button size="sm" variant="secondary" icon="block" onClick={() => setBulkAction("disable")}>Nonaktifkan model error ({errorModels.length})</Button>
            <Button size="sm" variant="secondary" icon="delete_sweep" onClick={() => setBulkAction("delete")}>Hapus model error ({errorModels.length})</Button>
          </>}
          {disabledModels.length > 0 && <Button size="sm" variant="secondary" icon="restart_alt" onClick={async () => {
            const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { method: "DELETE" });
            if (res.ok) setDisabledModelIds([]);
          }}>Aktifkan semua nonaktif</Button>}
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="new-compatible-model-input" className="text-xs text-text-muted mb-1 block">Model ID</label>
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? "Menambahkan..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" icon="download" onClick={handleImport} disabled={!canImport || importing}>
          {importing ? "Mengambil..." : "Ambil model dari /models"}
        </Button>
        <Button size="sm" variant="secondary" icon="science" onClick={handleTestAll} disabled={testingAll || !!testingModelId || activeModels.length === 0}>{testingAll ? "Menguji semua..." : "Tes Semua Model"}</Button>
        {errorModels.length > 0 && <>
          <Button size="sm" variant="secondary" icon="block" onClick={() => setBulkAction("disable")}>Nonaktifkan Error ({errorModels.length})</Button>
          <Button size="sm" variant="secondary" icon="delete_sweep" onClick={() => setBulkAction("delete")}>Hapus Error ({errorModels.length})</Button>
        </>}
      </div>

      {!canImport && (
        <p className="text-xs text-text-muted">
          Add a connection to enable importing models.
        </p>
      )}
      {usageInfo && (
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">Penggunaan & Batas</span>{usageInfo.plan && <span className="text-xs text-text-muted">Paket: {usageInfo.plan}</span>}</div>
          {usageInfo.free_tokens && <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2"><div className="text-[11px] text-text-muted">Token gratis terpakai</div><div className="font-semibold">{Number(usageInfo.free_tokens.used_today || 0).toLocaleString("id-ID")}</div></div>
            <div className="rounded-lg bg-sky-500/10 px-3 py-2"><div className="text-[11px] text-text-muted">Batas token gratis</div><div className="font-semibold">{usageInfo.free_tokens.limit_per_day == null ? "Tidak terbatas" : Number(usageInfo.free_tokens.limit_per_day).toLocaleString("id-ID")}</div></div>
            <div className="rounded-lg bg-primary/10 px-3 py-2"><div className="text-[11px] text-text-muted">Sisa token gratis</div><div className="font-semibold text-primary">{usageInfo.free_tokens.remaining == null ? "—" : Number(usageInfo.free_tokens.remaining).toLocaleString("id-ID")}</div></div>
          </div>}
          {Array.isArray(usageInfo.windows) && usageInfo.windows.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{usageInfo.windows.map((item, index) => <div key={item.kind || item.window_sec || index} className="rounded-lg border border-border px-3 py-2 text-xs"><div className="font-medium">{item.kind || "Batas"}</div><div className="text-text-muted">Terpakai: ${item.spent_usd ?? "0"} · Sisa: ${item.remaining_usd ?? "—"}</div>{item.resets_in_sec != null && <div className="text-text-muted">Reset sekitar {Math.ceil(Number(item.resets_in_sec) / 3600)} jam</div>}</div>)}</div>}
          {usageInfo.wallet && <div className="mt-2 text-xs text-text-muted">Saldo: ${usageInfo.wallet.balance_usd ?? "—"}</div>}
        </div>
      )}
      {importedModels.length > 0 && (
        <div className="rounded-lg border border-border bg-bg/50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-text-muted">Deteksi Model & Parameter</div>
            <span className="text-[10px] rounded-full px-2 py-0.5 border border-border">
              {importedModels.length} model terdeteksi
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {importedModels.map((model) => (
              <div key={model.id || model.name} className="rounded-lg border border-border px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-mono">{model.id || model.name}</span><span className={model.accessTier === "free" ? "text-emerald-500" : model.accessTier === "paid" || model.accessTier === "premium" ? "text-amber-500" : "text-text-muted"}>{model.accessTier || "Harga tidak diketahui"}</span></div>
                <div className="mt-1 text-text-muted">{model.contextWindow ? "Konteks: " + Number(model.contextWindow).toLocaleString("id-ID") : ""}{model.maxOutput ? " · Output: " + Number(model.maxOutput).toLocaleString("id-ID") : ""}</div>
                {Array.isArray(model.supportedParameters) && model.supportedParameters.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{model.supportedParameters.map((p) => <span key={p} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{p}</span>)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {activeModels.map(({ modelId, fullModel, alias }) => (
            <CompatibleModelRow
              key={fullModel}
              modelId={modelId}
              fullModel={`${providerDisplayAlias}/${modelId}`}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => setDeleteTarget({ alias, modelId, fullModel: `${providerDisplayAlias}/${modelId}` })}
              onTest={connections.length > 0 ? () => handleTestModel(modelId) : undefined}
              testStatus={modelTestResults[modelId]}
              isTesting={testingModelId === modelId}
            />
          ))}
        </div>
      )}
    </div>
    {bulkAction && (
      <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="material-symbols-outlined text-amber-500">{bulkAction === "delete" ? "delete_sweep" : "block"}</span>
            <div>
              <h2 className="text-base font-semibold">{bulkAction === "delete" ? "Hapus semua model error?" : "Nonaktifkan semua model error?"}</h2>
              <p className="mt-1 text-xs text-text-muted">{errorModels.length} model yang hasil tesnya gagal akan {bulkAction === "delete" ? "dihapus dari daftar." : "disembunyikan dari pemilihan model aktif."}</p>
            </div>
          </div>
          <div className="px-5 py-4 max-h-48 overflow-auto space-y-1">
            {errorModels.map(({ modelId }) => <div key={modelId} className="rounded-lg border border-border px-3 py-2 text-xs font-mono break-all">{modelId}</div>)}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button size="sm" variant="secondary" onClick={() => setBulkAction(null)} disabled={bulkBusy}>Batal</Button>
            <Button size="sm" icon={bulkAction === "delete" ? "delete_sweep" : "block"} onClick={handleBulkAction} disabled={bulkBusy}>{bulkBusy ? "Memproses..." : bulkAction === "delete" ? "Hapus semua" : "Nonaktifkan semua"}</Button>
          </div>
        </div>
      </div>
    )}
    {deleteTarget && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-model-title">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="material-symbols-outlined text-red-500">delete</span>
            <div>
              <h2 id="delete-model-title" className="text-base font-semibold">Hapus model?</h2>
              <p className="mt-1 text-xs text-text-muted">Model ini akan dihapus dari daftar alias Max Router.</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="rounded-lg border border-border bg-sidebar/50 px-3 py-2">
              <div className="text-sm font-medium break-all">{deleteTarget.fullModel}</div>
              <div className="mt-1 text-xs text-text-muted">Tindakan ini tidak dilakukan sebelum Anda menekan “Hapus model”.</div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button size="sm" icon="delete" onClick={async () => { const target = deleteTarget; setDeleteTarget(null); await onDeleteAlias(target.alias); }}>Hapus model</Button>
          </div>
        </div>
      </div>
    )}
    <ModelApiErrorDialog
      error={apiError}
      onClose={() => setApiError(null)}
      onRetry={() => {
        setApiError(null);
        handleImport();
      }}
    />
    </>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    isActive: PropTypes.bool,
  })).isRequired,
  isAnthropic: PropTypes.bool,
};
