import { Activity, Bot, Layers, MessageSquare, Search, Server, BarChart3, SlidersHorizontal, Network, Settings, ArrowUpRight, Zap, X, Filter, CircleAlert, CircleDollarSign, CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const shortcuts = [
  { title: "Penyedia AI", description: "Tambah dan kelola koneksi penyedia model AI.", href: "/dashboard/providers", icon: Server, tone: "cyan" },
  { title: "Endpoint API", description: "Lihat alamat API untuk menghubungkan aplikasi.", href: "/dashboard/endpoint", icon: Activity, tone: "coral" },
  { title: "Obrolan Kompatibel", description: "Buka antarmuka obrolan yang kompatibel dengan API.", href: "/dashboard/compatible-chat", icon: MessageSquare, tone: "pink" },
  { title: "Deteksi Model", description: "Periksa model yang tersedia dari penyedia.", href: "/dashboard/model-detection", icon: Search, tone: "yellow" },
  { title: "Gabungan Model", description: "Atur urutan model dan strategi cadangan.", href: "/dashboard/combos", icon: Layers, tone: "purple" },
  { title: "Penggunaan", description: "Pantau statistik penggunaan dan permintaan API.", href: "/dashboard/usage", icon: BarChart3, tone: "green" },
  { title: "Parameter", description: "Sesuaikan parameter dan perilaku router.", href: "/dashboard/parameters", icon: SlidersHorizontal, tone: "orange" },
  { title: "Kumpulan Proksi", description: "Kelola kumpulan koneksi proksi.", href: "/dashboard/proxy-pools", icon: Network, tone: "blue" },
  { title: "Otomatisasi", description: "Kelola tugas otomatisasi yang tersedia.", href: "/dashboard/automation", icon: Bot, tone: "lavender" },
];

const tones = {
  cyan: "bg-[#d9f5f8] text-[#176d78]",
  coral: "bg-[#ffe1d9] text-[#a84432]",
  pink: "bg-[#ffe0ef] text-[#a73570]",
  yellow: "bg-[#fff0bd] text-[#89621b]",
  purple: "bg-[#e8ddff] text-[#6947a6]",
  green: "bg-[#d9f8e8] text-[#20744d]",
  orange: "bg-[#ffe7cc] text-[#94551c]",
  blue: "bg-[#dce9ff] text-[#345da8]",
  lavender: "bg-[#f4dcff] text-[#86469a]",
};

function isErrorItem(item) {
  const status = String(item?.testStatus || item?.status || "").toLowerCase();
  return ["error", "expired", "unavailable", "failed", "failure"].includes(status)
    || Boolean(item?.lastError || item?.error || item?.lastErrorType);
}
function isFreeItem(item) {
  if (item?.isFree === true || item?.free === true || item?.pricing?.free === true) return true;
  const price = Number(item?.inputPrice ?? item?.input_price ?? item?.pricing?.input ?? item?.price);
  if (Number.isFinite(price) && price === 0) return true;
  return /\b(free|gratis)\b/i.test([item?.name, item?.id, item?.provider, item?.model].filter(Boolean).join(" "));
}
function getItemName(item, index) {
  return item?.name || item?.displayName || item?.model || item?.providerName || item?.provider || item?.id || `Layanan ${index + 1}`;
}

export default function DashboardPage() {
  const [connections, setConnections] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeMetric, setActiveMetric] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const refreshMetrics = async () => {
    setLoadingMetrics(true);
    setLoadError("");
    try {
      const [connectionsRes, nodesRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
      ]);
      if (!connectionsRes.ok || !nodesRes.ok) throw new Error("Data layanan belum bisa dimuat.");
      const [connectionsData, nodesData] = await Promise.all([connectionsRes.json(), nodesRes.json()]);
      setConnections(Array.isArray(connectionsData.connections) ? connectionsData.connections : []);
      setNodes(Array.isArray(nodesData.nodes) ? nodesData.nodes : []);
    } catch (error) {
      setLoadError(error?.message || "Gagal memuat ringkasan layanan.");
    } finally {
      setLoadingMetrics(false);
    }
  };
  useEffect(() => { refreshMetrics(); }, []);

  const metrics = useMemo(() => {
    const all = [
      ...nodes.map((item) => ({ ...item, _kind: "node" })),
      ...connections.map((item) => ({ ...item, _kind: "connection" })),
    ];
    const unique = new Map();
    nodes.forEach((item, i) => unique.set(String(item.id || item.name || `node-${i}`), item));
    connections.forEach((item, i) => unique.set(String(item.id || `connection-${i}`), item));
    return { all, services: unique.size, errors: all.filter(isErrorItem), free: all.filter(isFreeItem), paid: all.filter((item) => !isFreeItem(item)) };
  }, [connections, nodes]);

  const modalItems = useMemo(() => {
    if (!activeMetric) return [];
    const items = activeMetric === "errors" ? metrics.errors : activeMetric === "free" ? metrics.free : activeMetric === "paid" ? metrics.paid : metrics.all;
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const name = getItemName(item, 0).toLowerCase();
      const provider = String(item?.provider || item?.providerName || "").toLowerCase();
      const status = String(item?.testStatus || item?.status || "").toLowerCase();
      const matchesSearch = !q || name.includes(q) || provider.includes(q) || String(item?.id || "").toLowerCase().includes(q);
      const matchesFilter = filter === "all"
        || (filter === "error" && isErrorItem(item))
        || (filter === "free" && isFreeItem(item))
        || (filter === "paid" && !isFreeItem(item))
        || (filter === "active" && ["active", "success", "connected", "available"].includes(status))
        || (filter === "inactive" && ["inactive", "disabled", "expired", "unavailable", "error", "failed"].includes(status));
      return matchesSearch && matchesFilter;
    });
  }, [activeMetric, metrics, search, filter]);
  const openMetric = (metric) => { setActiveMetric(metric); setSearch(""); setFilter("all"); };

  return (
    <div className="space-y-5 pb-5">
      <section className="relative overflow-hidden rounded-2xl border-2 border-[#332746] bg-[#fff0f7] p-5 sm:p-7 shadow-[4px_4px_0_rgba(51,39,70,.12)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[#ffb0d0]/50" />
        <div className="pointer-events-none absolute right-24 -bottom-16 h-32 w-32 rounded-full bg-[#e8ddff]/70" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e8a0c0] bg-white/80 px-3 py-1 text-xs font-bold text-[#6e3b65]">
              <Zap size={14} /> PUSAT KENDALI 9ROUTER
            </span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-black text-[#302344]">Selamat datang di Beranda</h2>
            <p className="mt-2 max-w-xl text-sm text-[#5c4b68]">Kelola penyedia AI, endpoint, model, dan aktivitas router dari satu tempat.</p>
          </div>
          <Link to="/dashboard/providers" className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border-2 border-[#332746] bg-[#ff9fc9] px-4 py-3 text-sm font-bold text-[#302344] shadow-[3px_3px_0_#332746] transition hover:-translate-y-0.5">
            <Server size={17} /> Kelola Penyedia <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-extrabold text-[#302344]">Ringkasan Layanan</h2><p className="text-xs text-[#766780]">Klik kartu untuk mencari dan memfilter detail.</p></div>
          <button type="button" onClick={refreshMetrics} disabled={loadingMetrics} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbbbd6] bg-white px-3 py-2 text-xs font-bold text-[#554261] hover:bg-[#fff0f7]"><RefreshCw size={14} className={loadingMetrics ? "animate-spin" : ""}/> Perbarui</button>
        </div>
        {loadError && <div className="mb-3 rounded-xl border border-[#f2aaa0] bg-[#fff0ed] px-3 py-2 text-xs text-[#9b3d32]">{loadError} Pastikan backend API aktif.</div>}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { id: "services", title: "Jumlah Layanan", value: metrics.services, icon: Server, tone: "bg-[#d9f5f8] text-[#176d78]", desc: "Layanan dan koneksi terdaftar" },
            { id: "errors", title: "Jumlah Error", value: metrics.errors.length, icon: CircleAlert, tone: "bg-[#ffe1d9] text-[#a84432]", desc: "Koneksi dengan status bermasalah" },
            { id: "free", title: "Layanan Gratis", value: metrics.free.length, icon: CheckCircle2, tone: "bg-[#d9f8e8] text-[#20744d]", desc: "Teridentifikasi gratis dari data" },
            { id: "paid", title: "Berbayar / Lainnya", value: metrics.paid.length, icon: CircleDollarSign, tone: "bg-[#e8ddff] text-[#6947a6]", desc: "Tidak ditandai sebagai gratis" },
          ].map((metric) => {
            const Icon = metric.icon;
            return <button key={metric.id} type="button" onClick={() => openMetric(metric.id)} className="group rounded-xl border-2 border-[#3b2c4b] bg-[#fffdf8] p-3 text-left shadow-[3px_3px_0_rgba(51,39,70,.10)] transition hover:-translate-y-0.5 hover:bg-[#fff5fa] sm:p-4">
              <span className="flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${metric.tone}`}><Icon size={19}/></span><ArrowUpRight size={16} className="text-[#8b7a96] group-hover:text-[#302344]"/></span>
              <span className="mt-3 block text-xs font-semibold text-[#74667e]">{metric.title}</span>
              <span className="mt-0.5 block text-2xl font-black text-[#302344]">{loadingMetrics ? "…" : metric.value}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-[#8a7c92]">{metric.desc}</span>
            </button>;
          })}
        </div>
      </section>

      {activeMetric && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#21182e]/60 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveMetric(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="service-modal-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-[#332746] bg-[#fffdf8] shadow-[6px_6px_0_rgba(24,15,35,.25)]">
          <header className="flex items-start justify-between gap-3 border-b border-[#e5d8e8] bg-[#fff0f7] p-4 sm:p-5">
            <div><h2 id="service-modal-title" className="text-lg font-black text-[#302344]">{({services:"Semua Layanan",errors:"Layanan Error",free:"Layanan Gratis",paid:"Layanan Berbayar / Lainnya"})[activeMetric]}</h2><p className="mt-1 text-xs text-[#74667e]">{modalItems.length} data cocok dengan pencarian dan filter.</p></div>
            <button type="button" onClick={() => setActiveMetric(null)} aria-label="Tutup popup" className="rounded-lg border border-[#cbbbd6] bg-white p-2 text-[#493656] hover:bg-[#ffe0ef]"><X size={18}/></button>
          </header>
          <div className="space-y-3 border-b border-[#e5d8e8] p-4">
            <label className="flex items-center gap-2 rounded-xl border border-[#cbbbd6] bg-white px-3"><Search size={17} className="shrink-0 text-[#887691]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama layanan, provider, atau ID..." className="w-full bg-transparent py-2.5 text-sm text-[#302344] outline-none placeholder:text-[#a397ac]"/></label>
            <div className="flex items-center gap-2"><Filter size={16} className="text-[#766780]"/><select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-full rounded-lg border border-[#cbbbd6] bg-white px-3 py-2 text-sm text-[#302344] outline-none"><option value="all">Semua status</option><option value="active">Aktif / tersambung</option><option value="error">Error</option><option value="inactive">Nonaktif / bermasalah</option><option value="free">Gratis</option><option value="paid">Berbayar / lainnya</option></select></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {loadingMetrics ? <p className="py-8 text-center text-sm text-[#766780]">Memuat layanan…</p> : modalItems.length === 0 ? <div className="py-10 text-center"><Search size={24} className="mx-auto mb-2 text-[#b5a5bf]"/><p className="text-sm font-bold text-[#493656]">Tidak ada layanan ditemukan</p><p className="mt-1 text-xs text-[#8a7c92]">Ubah kata pencarian atau filter.</p></div> : <div className="space-y-2">{modalItems.map((item, index) => {
              const name = getItemName(item, index);
              const error = isErrorItem(item);
              const status = item?.testStatus || item?.status || (error ? "error" : item?.isActive === false ? "nonaktif" : "terdaftar");
              return <div key={String(item?.id || item?.name || index)} className="flex items-start gap-3 rounded-xl border border-[#e2d5e7] bg-white p-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${error ? "bg-[#ffe1d9] text-[#a84432]" : isFreeItem(item) ? "bg-[#d9f8e8] text-[#20744d]" : "bg-[#e8ddff] text-[#6947a6]"}`}>{error ? <CircleAlert size={18}/> : isFreeItem(item) ? <CheckCircle2 size={18}/> : <Server size={18}/>}</span>
                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-[#302344]">{name}</span><span className="mt-0.5 block break-all text-[11px] text-[#82748d]">{item?.provider || item?.providerName || item?._kind || "Layanan"}{item?.id ? ` · ${item.id}` : ""}</span>{(item?.lastError || item?.error) && <span className="mt-1 block break-words text-xs text-[#a84432]">{String(item.lastError || item.error)}</span>}</span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${error ? "bg-[#ffe1d9] text-[#a84432]" : isFreeItem(item) ? "bg-[#d9f8e8] text-[#20744d]" : "bg-[#e8ddff] text-[#6947a6]"}`}>{String(status).slice(0, 24)}</span>
              </div>;
            })}</div>}
          </div>
          <footer className="flex items-center justify-between border-t border-[#e5d8e8] bg-[#fff9fc] px-4 py-3"><span className="text-xs text-[#82748d]">Total cocok: {modalItems.length}</span><button type="button" onClick={() => setActiveMetric(null)} className="rounded-lg border-2 border-[#332746] bg-[#ffb0d0] px-4 py-2 text-xs font-bold text-[#302344]">Selesai</button></footer>
        </section>
      </div>}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#302344]">Akses Cepat</h2>
            <p className="text-xs text-[#766780]">Pilih menu untuk membuka fitur.</p>
          </div>
          <span className="rounded-full bg-[#e8ddff] px-3 py-1 text-[11px] font-bold text-[#6947a6]">9 fitur</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} to={item.href} className="group flex min-w-0 items-start gap-3 rounded-xl border-2 border-[#3b2c4b] bg-[#fffdf8] p-4 shadow-[3px_3px_0_rgba(51,39,70,.10)] transition duration-150 hover:-translate-y-0.5 hover:bg-[#fff5fa] hover:shadow-[4px_4px_0_rgba(51,39,70,.15)]">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[item.tone]}`}>
                  <Icon size={21} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-extrabold text-[#302344]">
                    <span>{item.title}</span><ArrowUpRight size={15} className="shrink-0 opacity-45 transition group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#74667e]">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link to="/dashboard/console-log" className="flex items-center gap-3 rounded-xl border-2 border-[#3b2c4b] bg-[#e7f4ff] p-4 transition hover:bg-[#d9edff]">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#c3e3ff] text-[#315f9b]"><Activity size={20}/></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[#302344]">Log Konsol</span><span className="block text-xs text-[#5d6880]">Lihat keluaran dan informasi diagnostik.</span></span>
          <ArrowUpRight size={17}/>
        </Link>
        <Link to="/dashboard/profile" className="flex items-center gap-3 rounded-xl border-2 border-[#3b2c4b] bg-[#f5e8ff] p-4 transition hover:bg-[#efdcff]">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e5caff] text-[#75449a]"><Settings size={20}/></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[#302344]">Pengaturan & Integrasi</span><span className="block text-xs text-[#766280]">Periksa koneksi dan konfigurasi aplikasi.</span></span>
          <ArrowUpRight size={17}/>
        </Link>
      </section>
    </div>
  );
}
