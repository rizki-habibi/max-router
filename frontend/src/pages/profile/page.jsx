import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/shared/components";
import { AlertTriangle, CheckCircle2, CircleHelp, Copy, Info, LoaderCircle, Radar, ShieldCheck } from "lucide-react";

const readJson = async (url, signal) => {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || ("Permintaan gagal (HTTP " + response.status + ")."));
  return data;
};

const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "medium"
  }).format(date) : "Belum tersedia";
};

const formatIssue = (item) => [
  "[" + (item.id || "TANPA-ID") + "] " + String(item.severity || "info").toUpperCase(),
  "Bagian: " + (item.area || "Umum"),
  "Masalah: " + (item.title || "Tanpa judul"),
  "Rincian: " + (item.detail || "Tidak ada rincian"),
  item.evidence ? "Bukti: " + item.evidence : "",
  item.fix ? "Solusi: " + item.fix : ""
].filter(Boolean).join("\n");

const severityName = (severity) => ({
  error: "Kesalahan", warning: "Peringatan", info: "Informasi"
}[severity] || "Informasi");

export default function ProfilPage() {
  const [data, setData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [message, setMessage] = useState("");

  const scan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setMessage("");
    try {
      const result = await readJson("/api/diagnostics");
      if (!result || !Array.isArray(result.findings)) {
        throw new Error("Format laporan diagnostik tidak sesuai. Silakan periksa log server.");
      }
      setData(result);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessage(error?.message || "Pemeriksaan gagal. Silakan coba lagi.");
      }
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const run = async () => {
      setScanning(true);
      setMessage("");
      try {
        const result = await readJson("/api/diagnostics", controller.signal);
        if (!result || !Array.isArray(result.findings)) {
          throw new Error("Format laporan diagnostik tidak sesuai.");
        }
        if (active) setData(result);
      } catch (error) {
        if (active && error?.name !== "AbortError") {
          setMessage(error?.message || "Pemeriksaan gagal. Silakan coba lagi.");
        }
      } finally {
        if (active) setScanning(false);
      }
    };
    run();
    return () => { active = false; controller.abort(); };
  }, []);

  const findings = Array.isArray(data?.findings) ? data.findings : [];
  const filtered = useMemo(
    () => findings.filter((item) =>
      (filter === "all" || item.area === filter) &&
      (severityFilter === "all" || item.severity === severityFilter)
    ),
    [findings, filter, severityFilter]
  );

  const copyText = async (text, key) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Papan klip tidak tersedia.");
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1800);
    } catch {
      setMessage("Tidak dapat menyalin. Periksa izin papan klip pada peramban.");
    }
  };

  const copyAll = () => {
    const header = [
      "MAX ROUTER — LAPORAN DIAGNOSTIK",
      "Waktu pemeriksaan: " + formatDate(data?.scannedAt),
      "Durasi: " + (Number.isFinite(Number(data?.durationMs)) ? Number(data.durationMs) + " milidetik" : "Tidak tersedia"),
      "Kesalahan: " + (data?.summary?.error ?? 0),
      "Peringatan: " + (data?.summary?.warning ?? 0),
      "Informasi: " + (data?.summary?.info ?? 0),
      ""
    ].join("\n");
    copyText(header + findings.map(formatIssue).join("\n\n"), "all");
  };

  const categories = ["all", ...new Set(findings.map((item) => item.area).filter(Boolean))];
  const errorCount = data?.summary?.error ?? findings.filter((item) => item.severity === "error").length;
  const warningCount = data?.summary?.warning ?? findings.filter((item) => item.severity === "warning").length;
  const infoCount = data?.summary?.info ?? findings.filter((item) => item.severity === "info").length;
  const duration = Number(data?.durationMs);
  const durationLabel = Number.isFinite(duration) && duration >= 0 ? duration + " milidetik" : "Tidak tersedia";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={25} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold">Pusat Diagnostik</h2>
              <p className="text-sm text-text-muted">Periksa konfigurasi, server, antarmuka, basis data, lingkungan, rute, dan kesehatan aplikasi.</p>
            </div>
          </div>
          <button type="button" onClick={scan} disabled={scanning} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60">{scanning ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Radar size={17} aria-hidden="true" />}{scanning ? "Sedang memeriksa…" : "Periksa Semua Sistem"}</button>
        </div>

        {message && (
          <div role="alert" className="mt-4 flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{message}</span>
            <button type="button" onClick={scan} disabled={scanning} className="shrink-0 rounded-lg border border-current px-3 py-1.5 font-semibold disabled:opacity-50">Coba Lagi</button>
          </div>
        )}

        {scanning && !data ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Memuat ringkasan pemeriksaan" aria-busy="true">
            {[1, 2, 3].map((item) => (
              <div key={item} className="animate-pulse rounded-xl border border-border-subtle p-4">
                <div className="h-4 w-28 rounded bg-surface-2" />
                <div className="mt-4 h-8 w-12 rounded bg-surface-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Kesalahan" value={errorCount} icon="error" tone="red" />
            <Stat label="Peringatan" value={warningCount} icon="warning" tone="amber" />
            <Stat label="Informasi" value={infoCount} icon="info" tone="blue" />
          </div>
        )}
      </Card>

      {!data && scanning && (
        <Card>
          <div className="flex items-center gap-3 py-6" role="status" aria-live="polite">
            <LoaderCircle className="shrink-0 animate-spin text-primary" size={22} aria-hidden="true" />
            <div>
              <h3 className="font-semibold">Pemeriksaan sedang berjalan</h3>
              <p className="text-sm text-text-muted">Mengumpulkan status layanan dan konfigurasi. Bagian ini akan diperbarui setelah pemeriksaan selesai.</p>
            </div>
          </div>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Status pemeriksaan</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Terakhir diperiksa: {formatDate(data.scannedAt)} · Durasi: {durationLabel}
                </p>
                {scanning && <p className="mt-1 text-xs text-primary" role="status">Pemeriksaan baru sedang berjalan…</p>}
              </div>
              <button type="button" onClick={copyAll} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-2">
                <Copy className="mr-1 inline-block align-middle" size={16} aria-hidden="true" />
                {copied === "all" ? "Laporan berhasil disalin" : "Salin Semua Temuan"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="diagnostic-area-filter" className="text-xs font-semibold text-text-muted">Saring berdasarkan bagian</label>
                <select id="diagnostic-area-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
                  {categories.map((category) => <option key={category} value={category}>{category === "all" ? "Semua Bagian" : category}</option>)}
                </select>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="diagnostic-severity-filter" className="text-xs font-semibold text-text-muted">Saring berdasarkan tingkat</label>
                <select id="diagnostic-severity-filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
                  <option value="all">Semua Tingkat</option>
                  <option value="error">Kesalahan</option>
                  <option value="warning">Peringatan</option>
                  <option value="info">Informasi</option>
                </select>
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto text-green-500" size={38} aria-hidden="true" />
                <h3 className="mt-3 font-semibold">Tidak ada temuan pada saringan ini</h3>
                <p className="mt-1 text-sm text-text-muted">Coba pilih bagian atau tingkat lain untuk melihat temuan yang tersedia.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, index) => (
                <DiagnosticCard key={(item.id || "temuan") + "-" + index} item={item} copied={copied} onCopy={copyText} />
              ))}
            </div>
          )}

          <Card>
            <h3 className="mb-3 font-semibold">Komponen yang diperiksa</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Capability label="Alur kerja dan YML" ok={data.capabilities?.yml} />
              <Capability label="Basis data" ok={data.capabilities?.database} />
              <Capability label="Server aplikasi" ok={data.capabilities?.backend} />
              <Capability label="Aset antarmuka" ok={data.capabilities?.uiAssets} />
            </div>
          </Card>
        </>
      )}
    </main>
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
  const id = item.id || "temuan";

  return (
    <Card className={"border " + tone}>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="shrink-0">{item.severity === "error" ? <AlertTriangle size={20} aria-hidden="true" /> : item.severity === "warning" ? <AlertTriangle size={20} aria-hidden="true" /> : <Info size={20} aria-hidden="true" />}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-surface-2 px-2 py-1 text-xs">{id}</code>
              <span className="text-xs text-text-muted">{item.area || "Umum"}</span>
              <span className="text-xs font-semibold">{severityName(item.severity)}</span>
            </div>
            <h3 className="mt-2 break-words font-semibold">{item.title || "Temuan tanpa judul"}</h3>
            <p className="mt-1 break-words text-sm text-text-muted">{item.detail || "Tidak ada rincian tambahan."}</p>
            {item.evidence && <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.05] p-3 text-xs">{item.evidence}</pre>}
            {item.fix && <p className="mt-3 break-words text-sm"><strong>Saran perbaikan:</strong> {item.fix}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => onCopy(report, id)} className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold hover:bg-surface-2">
            <Copy className="mr-1 inline-block align-middle" size={15} aria-hidden="true" />
            {copied === id ? "Berhasil disalin" : "Salin Temuan"}
          </button>
          <button type="button" onClick={() => onCopy(JSON.stringify(item, null, 2), id + "-json")} className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold hover:bg-surface-2">
            {copied === id + "-json" ? "JSON berhasil disalin" : "Salin JSON"}
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
        <span className={"rounded-lg p-1.5 " + classes} aria-hidden="true">{icon === "error" ? <AlertTriangle size={19} /> : icon === "warning" ? <AlertTriangle size={19} /> : <Info size={19} />}</span>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Capability({ label, ok }) {
  const known = typeof ok === "boolean";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-2 p-3">
      <span className={"material-symbols-outlined text-[20px] " + (ok === true ? "text-green-600" : ok === false ? "text-amber-600" : "text-text-muted")} aria-hidden="true">
        {ok === true ? "check_circle" : ok === false ? "warning" : "help"}
      </span>
      <span className="min-w-0 text-sm font-medium">{label}</span>
      <span className="ml-auto text-xs text-text-muted">{known ? (ok ? "Tersedia" : "Perlu diperiksa") : "Belum diketahui"}</span>
    </div>
  );
}
