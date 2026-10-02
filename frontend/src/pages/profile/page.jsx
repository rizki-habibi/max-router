import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input } from "@/shared/components";

const DEFAULT_REPO = "https://github.com/rizki-habibi/kuro-vtuber-bot";

function normalizeList(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

async function readJson(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

export default function ProfilPage() {
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [message, setMessage] = useState("");
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [repoResult, setRepoResult] = useState(null);

  const scanIntegrasi = useCallback(async () => {
    setScanning(true);
    setMessage("");
    const result = {
      server: { status: "memeriksa", detail: "Menghubungi layanan Max Router..." },
      penyedia: { status: "memeriksa", jumlah: 0, detail: "Memeriksa penyedia AI..." },
      mcp: { status: "memeriksa", jumlah: 0, detail: "Memeriksa sumber MCP..." },
      github: { status: "memeriksa", detail: "Memeriksa akses GitHub..." },
    };

    try {
      const [providers, mcp] = await Promise.allSettled([
        readJson("/api/providers"),
        readJson("/api/cli-tools/cowork-mcp-registry"),
      ]);

      if (providers.status === "fulfilled") {
        const list = normalizeList(providers.value, ["providers", "data"]);
        result.penyedia = {
          status: "terhubung",
          jumlah: list.length,
          detail: list.length ? `${list.length} penyedia terdeteksi` : "Belum ada penyedia tersimpan",
        };
      } else {
        result.penyedia = { status: "gagal", jumlah: 0, detail: providers.reason?.message || "Penyedia tidak dapat dibaca" };
      }

      if (mcp.status === "fulfilled") {
        const list = normalizeList(mcp.value, ["servers", "data"]);
        result.mcp = {
          status: "tersedia",
          jumlah: list.length,
          detail: list.length ? `${list.length} layanan MCP ditemukan` : "Sumber MCP dapat dijangkau",
        };
      } else {
        result.mcp = { status: "gagal", jumlah: 0, detail: mcp.reason?.message || "Sumber MCP tidak dapat dibaca" };
      }

      try {
        const health = await readJson("/api/health");
        result.server = {
          status: "online",
          detail: health?.status ? `Server online: ${health.status}` : "Server Max Router merespons",
        };
      } catch {
        result.server = { status: "online", detail: "Server merespons melalui aplikasi" };
      }

      try {
        const github = await readJson("https://api.github.com/repos/rizki-habibi/max-router");
        result.github = {
          status: "terhubung",
          detail: `GitHub dapat membaca ${github.full_name}`,
        };
      } catch {
        result.github = { status: "terbatas", detail: "GitHub tidak dapat diverifikasi dari sesi ini" };
      }
    } catch (error) {
      setMessage(error.message || "Pemeriksaan integrasi gagal.");
    } finally {
      setLastScan(result);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    scanIntegrasi();
  }, [scanIntegrasi]);

  const cekRepo = async () => {
    setRepoResult({ status: "memeriksa", detail: "Memeriksa repositori..." });
    try {
      const url = repoUrl.trim();
      const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/i);
      if (!match) {
        throw new Error("Masukkan URL repositori GitHub yang valid.");
      }
      const owner = match[1];
      const repo = match[2].replace(/\.git$/i, "");
      const data = await readJson(`https://api.github.com/repos/${owner}/${repo}`);
      const contents = await readJson(`https://api.github.com/repos/${owner}/${repo}/contents`);
      const names = Array.isArray(contents) ? contents.map((item) => item.name.toLowerCase()) : [];
      const petunjuk = [];
      if (names.includes("package.json")) petunjuk.push("Node.js");
      if (names.includes("requirements.txt") || names.includes("pyproject.toml")) petunjuk.push("Python");
      if (names.some((name) => name.includes("docker"))) petunjuk.push("Docker");
      if (names.some((name) => name.includes("mcp"))) petunjuk.push("MCP");
      if (names.some((name) => name.includes("discord"))) petunjuk.push("Discord");
      setRepoResult({
        status: "ditemukan",
        detail: data.description || "Repositori dapat dibaca",
        nama: data.full_name,
        bahasa: data.language || "Tidak terdeteksi",
        teknologi: petunjuk.length ? petunjuk.join(", ") : "Perlu analisis berkas lebih lanjut",
        url: data.html_url,
      });
    } catch (error) {
      setRepoResult({ status: "gagal", detail: error.message || "Repositori tidak dapat dibaca" });
    }
  };

  const badge = (status) => {
    const map = {
      online: "bg-green-500/10 text-green-600",
      terhubung: "bg-green-500/10 text-green-600",
      tersedia: "bg-blue-500/10 text-blue-600",
      memeriksa: "bg-amber-500/10 text-amber-600",
      terbatas: "bg-amber-500/10 text-amber-600",
      gagal: "bg-red-500/10 text-red-600",
      ditemukan: "bg-green-500/10 text-green-600",
    };
    return map[status] || "bg-surface-2 text-text-muted";
  };

  const items = lastScan ? [
    { icon: "dns", title: "Penyedia AI", desc: lastScan.penyedia.detail, status: lastScan.penyedia.status, count: lastScan.penyedia.jumlah },
    { icon: "hub", title: "MCP", desc: lastScan.mcp.detail, status: lastScan.mcp.status, count: lastScan.mcp.jumlah },
    { icon: "code", title: "GitHub & repositori AI", desc: lastScan.github.detail, status: lastScan.github.status },
    { icon: "cloud_done", title: "Server Max Router", desc: lastScan.server.detail, status: lastScan.server.status },
  ] : [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <span className="material-symbols-outlined">hub</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Deteksi Integrasi</h2>
                <p className="text-sm text-text-muted">Membaca layanan yang tersedia secara langsung dari server online.</p>
              </div>
            </div>
          </div>
          <Button variant="primary" icon="radar" loading={scanning} onClick={scanIntegrasi}>
            {scanning ? "Memindai..." : "Pindai Sekarang"}
          </Button>
        </div>

        {message && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{message}</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="rounded-xl border border-border-subtle bg-surface/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">{item.icon}</span>
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-text-muted">{item.desc}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${badge(item.status)}`}>
                  {item.status}
                </span>
              </div>
              {typeof item.count === "number" && (
                <p className="mt-3 text-2xl font-bold">{item.count}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <span className="material-symbols-outlined">account_tree</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Pemeriksa Repositori AI</h2>
            <p className="text-sm text-text-muted">Masukkan repositori GitHub publik untuk melihat tanda teknologi dan struktur awalnya.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/pemilik/nama-repo" />
          <Button variant="secondary" icon="search" onClick={cekRepo}>Periksa Repo</Button>
        </div>

        {repoResult && (
          <div className="mt-4 rounded-xl border border-border-subtle bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{repoResult.nama || "Repositori"}</p>
                <p className="text-sm text-text-muted">{repoResult.detail}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${badge(repoResult.status)}`}>{repoResult.status}</span>
            </div>
            {repoResult.status === "ditemukan" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                <p><span className="text-text-muted">Bahasa:</span> {repoResult.bahasa}</p>
                <p><span className="text-text-muted">Teknologi:</span> {repoResult.teknologi}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-primary">cloud</span>
          <div>
            <h3 className="font-semibold">Mode online</h3>
            <p className="mt-1 text-sm text-text-muted">
              Halaman ini tidak menyimpan pengaturan integrasi di penyimpanan lokal browser. Status dibaca ulang dari server setiap kali dipindai.
            </p>
          </div>
        </div>
        {lastScan && <p className="mt-3 text-xs text-text-muted">Pemeriksaan terakhir selesai tanpa membuat salinan konfigurasi lokal.</p>}
      </Card>
    </div>
  );
}
