
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button } from "@/shared/components";

const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || ("HTTP " + response.status));
  return data;
};

const formatIssue = (item) => [
  "[" + item.id + "] " + String(item.severity || "").toUpperCase(),
  "Bagian: " + item.area,
  "Masalah: " + item.title,
  "Rincian: " + item.detail,
  item.evidence ? "Bukti: " + item.evidence : "",
  item.fix ? "Solusi: " + item.fix : ""
].filter(Boolean).join("\n");

export default function ProfilPage() {
  const [data, setData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [message, setMessage] = useState("");

  const scan = useCallback(async () => {
    setScanning(true);
    setMessage("");
    try {
      setData(await readJson("/api/diagnostics"));
    } catch (error) {
      setMessage(error.message || "Diagnostic gagal dijalankan.");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const findings = data?.findings || [];
  const filtered = useMemo(
    () => findings.filter((x) => (filter === "all" || x.area === filter) && (severityFilter === "all" || x.severity === severityFilter)),
    [findings, filter, severityFilter]
  );

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setMessage("Fitur papan klip browser tidak tersedia.");
    }
  };

  const copyAll = () => {
    const header = [
      "MAX ROUTER — LAPORAN DIAGNOSTIK LENGKAP",
      "Waktu: " + (data?.scannedAt || "-"),
      "Durasi: " + (data?.durationMs || 0) + " ms",
      "Kesalahan: " + (data?.summary?.error || 0),
      "Peringatan: " + (data?.summary?.warning || 0),
      "Informasi: " + (data?.summary?.info || 0),
      ""
    ].join("\n");
    copyText(header + findings.map(formatIssue).join("\n\n"), "all");
  };

  const categories = ["all", ...new Set(findings.map(x => x.area))];
  const errorCount = data?.summary?.error || 0;
  const warningCount = data?.summary?.warning || 0;
  const infoCount = data?.summary?.info || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <span className="material-symbols-outlined">health_and_safety</span>
              </div>
              <div>
                <h2 className="text-xl font-bold">Pusat Diagnostik</h2>
                <p className="text-sm text-text-muted">Periksa konfigurasi YML, server, antarmuka, basis data, lingkungan, rute, dan kesehatan aplikasi.</p>
              </div>
            </div>
          </div>
          <Button variant="primary" icon="radar" loading={scanning} onClick={scan}>
            {scanning ? "Memindai..." : "Scan Semua Sistem"}
          </Button>
        </div>

        {message && <div className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{message}</div>}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Error" value={errorCount} icon="error" tone="red" />
          <Stat label="Peringatan" value={warningCount} icon="warning" tone="amber" />
          <Stat label="Info" value={infoCount} icon="info" tone="blue" />
        </div>
      </Card>

      {data && (
        <>
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Status pemeriksaan</h3>
                <p className="text-xs text-text-muted">
                  Terakhir: {new Date(data.scannedAt).toLocaleString("id-ID")} · {data.durationMs} ms
                </p>
              </div>
              <button
                type="button"
                onClick={copyAll}
                className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-2"
              >
                <span className="material-symbols-outlined mr-1 align-middle text-[18px]">content_copy</span>
                {copied === "all" ? "Semua tersalin" : "Salin Semua Temuan"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="diagnostic-area-filter" className="text-xs font-semibold text-text-muted">Saring berdasarkan bagian</label>
                <select id="diagnostic-area-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
                  {categories.map((category) => <option key={category} value={category}>{category === "all" ? "Semua Bagian" : category}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="diagnostic-severity-filter" className="text-xs font-semibold text-text-muted">Saring berdasarkan tingkat</label>
                <select id="diagnostic-severity-filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
                  <option value="all">Semua Tingkat</option><option value="error">Kesalahan</option><option value="warning">Peringatan</option><option value="info">Informasi</option>
                </select>
              </div>
            </div>      </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <div className="py-10 text-center">
                <span className="material-symbols-outlined text-4xl text-green-500">check_circle</span>
                <h3 className="mt-3 font-semibold">Tidak ada masalah pada kategori ini</h3>
                <p className="mt-1 text-sm text-text-muted">Pemeriksaan selesai dan tidak menemukan error yang tercatat.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, index) => (
                <DiagnosticCard
                  key={item.id + "-" + index}
                  item={item}
                  copied={copied}
                  onCopy={copyText}
                />
              ))}
            </div>
          )}

          <Card>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Capability label="YML / CI" ok={data.capabilities?.yml} />
              <Capability label="Database" ok={data.capabilities?.database} />
              <Capability label="Backend" ok={data.capabilities?.backend} />
              <Capability label="UI Assets" ok={data.capabilities?.uiAssets} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function DiagnosticCard({ item, copied, onCopy }) {
  const tone = item.severity === "error"
    ? "border-red-500/30 bg-red-500/[0.04]"
    : item.severity === "warning"
      ? "border-amber-500/30 bg-amber-500/[0.04]"
      : "border-border-subtle bg-surface";

  const icon = item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "info";
  const report = formatIssue(item);

  return (
    <Card className={"border " + tone}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3 min-w-0">
          <span className="material-symbols-outlined shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface-2 px-2 py-1 text-xs">{item.id}</code>
              <span className="text-xs text-text-muted">{item.area}</span>
              <span className="text-xs font-semibold uppercase">{item.severity}</span>
            </div>
            <h3 className="mt-2 font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-text-muted break-words">{item.detail}</p>
            {item.evidence && (
              <pre className="mt-3 max-h-36 overflow-auto rounded-lg bg-black/[0.05] p-3 text-xs whitespace-pre-wrap">{item.evidence}</pre>
            )}
            {item.fix && <p className="mt-3 text-sm"><strong>Solusi:</strong> {item.fix}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onCopy(report, item.id)}
            className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold hover:bg-surface-2"
          >
            <span className="material-symbols-outlined mr-1 align-middle text-[16px]">content_copy</span>
            {copied === item.id ? "Tersalin" : "Salin Error"}
          </button>
          <button
            type="button"
            onClick={() => onCopy(JSON.stringify(item, null, 2), item.id + "-json")}
            className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold hover:bg-surface-2"
          >
            Salin JSON
          </button>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, icon, tone }) {
  const classes = tone === "red" ? "text-red-600 bg-red-500/10" : tone === "amber" ? "text-amber-600 bg-amber-500/10" : "text-blue-600 bg-blue-500/10";
  return (
    <div className="rounded-xl border border-border-subtle p-4">
      <div className="flex items-center gap-2">
        <span className={"material-symbols-outlined rounded-lg p-1.5 " + classes}>{icon}</span>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function Capability({ label, ok }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3">
      <span className={"material-symbols-outlined text-[20px] " + (ok ? "text-green-600" : "text-amber-600")}>
        {ok ? "check_circle" : "help"}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
