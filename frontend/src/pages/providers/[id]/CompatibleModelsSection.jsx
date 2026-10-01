
import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
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
              {copied === `model-${modelId}` ? "Copied!" : "Copy"}
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
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onDeleteAlias}
        className="p-1 hover:bg-red-50 rounded text-red-500"
        title="Remove model"
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
  const [autoDisableFailed, setAutoDisableFailed] = useState(true);

  const handleTestModel = async (modelId, fromAll = false) => {
    if (testingModelId || (testingAll && !fromAll)) return false;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: providerStorageAlias + "/" + modelId }) });
      const data = await res.json();
      const ok = !!data.ok;
      setModelTestResults((prev) => ({ ...prev, [modelId]: ok ? "ok" : "error" }));
      if (!ok && autoDisableFailed) await fetch("/api/models/disabled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerAlias: providerStorageAlias, ids: [modelId] }) }).catch(() => {});
      return ok;
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      if (autoDisableFailed) await fetch("/api/models/disabled", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerAlias: providerStorageAlias, ids: [modelId] }) }).catch(() => {});
      return false;
    } finally { setTestingModelId(null); }
  };

  const handleTestAll = async () => {
    if (testingAll || testingModelId || allModels.length === 0) return;
    setTestingAll(true);
    for (const item of allModels) await handleTestModel(item.modelId, true);
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
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to import models");
        return;
      }
      const models = data.models || [];
      setImportedModels(models);
      setUsageInfo(data.usage || null);
      if (models.length === 0) {
        alert("No models returned from /models.");
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
        alert("No new models were added.");
      }
    } catch (error) {
      console.log("Error importing models:", error);
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Add {isAnthropic ? "Anthropic" : "OpenAI"}-compatible models manually or import them from the /models endpoint.
      </p>

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
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" icon="download" onClick={handleImport} disabled={!canImport || importing}>
          {importing ? "Importing..." : "Import from /models"}
        </Button>
        <Button size="sm" variant="secondary" icon="science" onClick={handleTestAll} disabled={testingAll || !!testingModelId || allModels.length === 0}>{testingAll ? "Menguji semua..." : "Tes Semua Model"}</Button>
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
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"><div><div className="font-medium">Nonaktifkan otomatis jika tes gagal</div><div className="text-text-muted">Model gagal akan dinonaktifkan.</div></div><input type="checkbox" checked={autoDisableFailed} onChange={(e) => setAutoDisableFailed(e.target.checked)} /></div>


      {importedModels.length > 0 && (
        <div className="rounded-lg border border-border bg-bg/50 p-3">
          <div className="mb-2 text-xs font-medium text-text-muted">Deteksi Model & Parameter</div>
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
          {allModels.map(({ modelId, fullModel, alias }) => (
            <CompatibleModelRow
              key={fullModel}
              modelId={modelId}
              fullModel={`${providerDisplayAlias}/${modelId}`}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => onDeleteAlias(alias)}
              onTest={connections.length > 0 ? () => handleTestModel(modelId) : undefined}
              testStatus={modelTestResults[modelId]}
              isTesting={testingModelId === modelId}
            />
          ))}
        </div>
      )}
    </div>
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
