import { Activity, Bot, Layers, MessageSquare, Search, Server, BarChart3, SlidersHorizontal, Network, Settings, ArrowUpRight, Zap } from "lucide-react";
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

export default function DashboardPage() {
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
