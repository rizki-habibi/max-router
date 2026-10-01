import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Button, Input } from "@/shared/components";

const inferCapabilities = (model) => {
  const id = String(model?.id || "").toLowerCase();
  const text = JSON.stringify(model || {}).toLowerCase();
  const caps = new Set();
  if (/vision|image[_ -]?input|multimodal/.test(text) || /vision|vl|4o|gemini|claude-3|claude-4/.test(id)) caps.add("Vision");
  if (/video/.test(text) || /video|veo|sora|kling|seedance/.test(id)) caps.add("Video");
  if (/function|tool/.test(text) || /tool|function/.test(id)) caps.add("Function calling");
  if (/json/.test(text) || /json/.test(id)) caps.add("JSON mode");
  if (/stream/.test(text)) caps.add("Streaming");
  if (/context|long/.test(text) || /1m|128k|200k|256k|512k|1000k/.test(id)) caps.add("Long context (>100k)");
  if (/code|coder|coding|program/.test(text) || /coder|code|dev/.test(id)) caps.add("Code");
  if (/reason/.test(text) || /reason|thinking|r1|o1|o3|o4/.test(id)) caps.add("Reasoning");
  return [...caps];
};

const enrich = (model) => {
  const meta = model?.metadata || model?.capabilities || model;
  return {
    ...model,
    contextWindow: meta?.context_window ?? meta?.contextWindow ?? meta?.context_length ?? meta?.max_context ?? null,
    maxOutput: meta?.max_output ?? meta?.maxOutput ?? meta?.max_tokens ?? null,
    releaseDate: meta?.release_date ?? meta?.releaseDate ?? null,
    input: meta?.input ?? meta?.modalities?.input ?? null,
    pricing: meta?.pricing ?? null,
    capabilities: Array.isArray(meta?.capabilities) ? meta.capabilities : inferCapabilities(model),
    parameters: meta?.supported_parameters ?? meta?.supportedParameters ?? [],
    description: meta?.description || meta?.description_text || "",
  };
};

export default function ModelDetectionPage() {
  const [models, setModels] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/v1/models");
      if (!res.ok) throw new Error("Gagal mengambil daftar model.");
      const data = await res.json();
      setModels((data.data || []).map(enrich));
    } catch (e) { setError(e.message || "Gagal mendeteksi model."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => !q || String(m.id).toLowerCase().includes(q) || String(m.owned_by || "").toLowerCase().includes(q));
  }, [models, query]);

  return <div className="mx-auto w-full max-w-6xl p-6">
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Deteksi Model</h1>
        <p className="mt-1 text-sm text-text-muted">Mendeteksi metadata dan kemampuan model yang tersedia dari provider compatible.</p>
      </div>
      <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Mendeteksi..." : "Perbarui"}</Button>
    </div>
    <div className="mb-5"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari model..." /></div>
    {error && <Card className="mb-5 p-4"><span className="text-red-500">{error}</span></Card>}
    {!loading && !error && filtered.length === 0 && <Card className="p-6"><span className="text-text-muted">Belum ada model compatible yang terdeteksi.</span></Card>}
    <div className="grid gap-4">
      {filtered.map((model) => <Card key={model.id} className="p-5">
        <button className="w-full text-left" onClick={() => setSelected(selected?.id === model.id ? null : model)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold">{model.id}</h2><p className="mt-1 text-xs text-text-muted">{model.owned_by || "compatible provider"}</p></div>
            <div className="flex flex-wrap gap-1.5">{model.capabilities.map((cap) => <Badge key={cap} size="sm" variant="success">{cap}</Badge>)}</div>
          </div>
        </button>
        {selected?.id === model.id && <div className="mt-5 grid gap-4 border-t border-border-subtle pt-4 md:grid-cols-2">
          <Info label="Deskripsi" value={model.description || "Tidak diberikan provider"} wide />
          <Info label="Context window" value={model.contextWindow ?? "Tidak diberikan provider"} />
          <Info label="Max output" value={model.maxOutput ?? "Tidak diberikan provider"} />
          <Info label="Release date" value={model.releaseDate || "Tidak diberikan provider"} />
          <Info label="Input" value={Array.isArray(model.input) ? model.input.join(", ") : model.input || "Tidak diberikan provider"} />
          <Info label="Pricing" value={format(model.pricing) || "Tidak diberikan provider"} />
          <Info label="Capabilities" value={model.capabilities.join(", ") || "Belum dapat dideteksi"} wide />
          <Info label="Supported parameters" value={Array.isArray(model.parameters) ? model.parameters.join(" · ") : format(model.parameters) || "Tidak diberikan provider"} wide />
        </div>}
      </Card>)}
    </div>
  </div>;
}

function Info({ label, value, wide }) {
  return <div className={wide ? "md:col-span-2" : ""}><div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-sm font-medium break-words">{String(value)}</div></div></div>;
}
function format(value) { return value == null ? "" : typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value); }
