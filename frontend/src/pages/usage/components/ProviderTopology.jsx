import { useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";

const STATUS_STYLES = {
  exhausted: {
    label: "Habis",
    light: "bg-red-500 shadow-[0_0_9px_rgba(239,68,68,0.85)]",
    text: "text-red-600",
    ring: "border-red-500/50 bg-[#FFE1E1] text-[#7F1D1D]",
  },
  waiting: {
    label: "Menunggu",
    light: "bg-amber-400 shadow-[0_0_9px_rgba(251,191,36,0.85)]",
    text: "text-amber-600",
    ring: "border-amber-500/50 bg-[#FFF0BD] text-[#78350F]",
  },
  running: {
    label: "Jalan",
    light: "bg-emerald-500 shadow-[0_0_9px_rgba(16,185,129,0.85)]",
    text: "text-emerald-600",
    ring: "border-emerald-500/50 bg-[#D8F8D8] text-[#14532D]",
  },
  inactive: {
    label: "Mati",
    light: "bg-gray-400",
    text: "text-text-muted",
    ring: "border-[#A9A3C7] bg-[#EAE6FF] text-[#332B55]",
  },
};

function resolveStatus(provider, isRunning) {
  const message = [
    provider?.status, provider?.state, provider?.error,
    provider?.errorMessage, provider?.lastError, provider?.errorCode,
  ].filter((value) => value !== undefined && value !== null).join(" ").toLowerCase();

  const code = Number(provider?.errorCode ?? provider?.lastStatusCode ?? provider?.statusCode);
  const waitingUntil = provider?.cooldownUntil ?? provider?.retryAfter ?? provider?.nextRetryAt;
  const waitingInFuture = waitingUntil && Number.isFinite(new Date(waitingUntil).getTime())
    && new Date(waitingUntil).getTime() > Date.now();

  if (code === 429 || /exhaust(ed|ion)|quota.{0,20}(exceed|limit|empty|habis)|limit.{0,20}(reached|exceed)|insufficient quota|credits? (depleted|exhausted)/i.test(message)) return "exhausted";
  if (waitingInFuture || /cooldown|backoff|rate.?limit|retry.?after|waiting|queued|menunggu|pending/i.test(message)) return "waiting";
  if (isRunning) return "running";
  if (provider?.isActive === false || provider?.enabled === false || provider?.disabled === true) return "inactive";
  return "inactive";
}

const EMPTY_TIPS = [
  {
    title: "Tambah provider baru",
    description: "Buka menu Penyedia untuk menambahkan layanan AI. Provider baru akan muncul di sini.",
    className: "border-[#F0B54A] bg-[#FFF0BD] text-[#78350F]",
    icon: "＋",
  },
  {
    title: "Kenali lampu status",
    description: "Merah: limit habis · Kuning: menunggu · Hijau: request aktif · Abu-abu: idle/nonaktif.",
    className: "border-[#78B8E8] bg-[#DDF1FF] text-[#17436B]",
    icon: "●",
  },
  {
    title: "Kelola pilihan provider",
    description: "Tambahkan beberapa provider agar pilihan layanan lebih fleksibel saat mengirim request.",
    className: "border-[#B6A1F5] bg-[#EEE6FF] text-[#4C347F]",
    icon: "↗",
  },
];

function EmptySlot({ tip }) {
  return (
    <li className={`flex min-h-[82px] min-w-[190px] flex-col justify-center gap-1.5 rounded-lg border-2 px-3 py-2.5 shadow-[2px_3px_0_rgba(45,35,70,0.12)] ${tip.className}`}>
      <span className="flex items-center gap-2 text-xs font-bold">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-current/30 bg-white/60 text-sm" aria-hidden="true">{tip.icon}</span>
        {tip.title}
      </span>
      <span className="text-[11px] leading-snug opacity-90">{tip.description}</span>
    </li>
  );
}

export default function ProviderTopology({ providers = [], activeRequests = [] }) {
  const [filter, setFilter] = useState("all");
  const scrollRef = useRef(null);
  const requests = Array.isArray(activeRequests) ? activeRequests : [];
  const runningIds = new Set(requests.map((request) => String(request?.provider || "").toLowerCase()).filter(Boolean));

  const entries = providers.map((provider, index) => {
    const id = String(provider?.provider || provider?.id || "");
    const name = provider?.name || id || "Penyedia tidak dikenal";
    const isRunning = runningIds.has(id.toLowerCase()) || (id.toLowerCase() === "codebuddy" && runningIds.has("cb"));
    const status = resolveStatus(provider, isRunning);
    return { provider, id, name, status, key: provider?.id || id || name + index };
  });

  const counts = entries.reduce((result, entry) => {
    result[entry.status] += 1;
    return result;
  }, { exhausted: 0, waiting: 0, running: 0, inactive: 0 });

  const filteredEntries = useMemo(
    () => filter === "all" ? entries : entries.filter((entry) => entry.status === filter),
    [filter, providers, activeRequests]
  );

  const slotCount = Math.max(0, 6 - filteredEntries.length);
  const scroll = (direction) => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: direction * 420, behavior: "smooth" });
  };

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Penyedia AI</h2>
          <p className="mt-1 text-xs text-text-muted">{providers.length} penyedia tersedia</p>
        </div>
        <span className="text-xs font-semibold text-text-muted">{counts.running} berjalan</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Keterangan lampu status">
          {Object.entries(STATUS_STYLES).map(([key, style]) => (
            <span key={key} className={`inline-flex items-center gap-1.5 text-xs ${style.text}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${style.light}`} aria-hidden="true" />
              {style.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="provider-status-filter" className="text-xs text-text-muted">Filter:</label>
          <select
            id="provider-status-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="max-w-[150px] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-primary"
          >
            <option value="all">Semua status</option>
            <option value="running">Jalan</option>
            <option value="waiting">Menunggu</option>
            <option value="exhausted">Habis</option>
            <option value="inactive">Mati</option>
          </select>
        </div>
      </div>

      <div className="relative mt-4 min-w-0">
        <div
          ref={scrollRef}
          className="overflow-x-auto overscroll-x-contain scroll-smooth pb-1"
          style={{ scrollbarWidth: "thin" }}
        >
          <ul className="grid w-max min-w-full auto-cols-[minmax(190px,1fr)] grid-flow-col grid-rows-2 gap-2">
            {filteredEntries.map(({ provider, name, status, key }) => {
              const style = STATUS_STYLES[status];
              const detail = provider?.errorMessage || provider?.lastError || provider?.statusMessage;
              return (
                <li
                  key={key}
                  title={detail ? String(detail) : `${name}: ${style.label}`}
                  className={`flex min-w-0 min-h-[62px] items-center justify-between gap-3 rounded-lg border-2 px-3 py-2.5 shadow-[2px_3px_0_rgba(45,35,70,0.12)] ${style.ring}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-surface ${style.light} ${status === "exhausted" ? "ring-red-500/20" : status === "waiting" ? "ring-amber-400/20" : status === "running" ? "ring-emerald-500/20" : "ring-gray-400/20"}`}
                      role="img"
                      aria-label={style.label}
                    />
                    <span className="truncate text-sm font-medium text-text">{name}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${style.text}`}>{style.label}</span>
                </li>
              );
            })}
            {Array.from({ length: slotCount }, (_, index) => <EmptySlot key={`empty-${index}`} tip={EMPTY_TIPS[index % EMPTY_TIPS.length]} />)}
          </ul>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 text-[11px] leading-snug text-text-muted">Tips: tambah provider lewat menu <strong>Penyedia</strong> · kartu status akan terisi otomatis</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label="Geser penyedia ke kiri"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text transition hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label="Geser penyedia ke kanan"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text transition hover:bg-bg-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

ProviderTopology.propTypes = {
  providers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    provider: PropTypes.string,
    name: PropTypes.string,
    isActive: PropTypes.bool,
    status: PropTypes.string,
    errorCode: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    errorMessage: PropTypes.string,
    cooldownUntil: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  })),
  activeRequests: PropTypes.arrayOf(PropTypes.shape({
    provider: PropTypes.string,
    model: PropTypes.string,
    account: PropTypes.string,
  })),
  lastProvider: PropTypes.string,
  errorProvider: PropTypes.string,
};
