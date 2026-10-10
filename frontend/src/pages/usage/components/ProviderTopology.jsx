import PropTypes from "prop-types";

const STATUS_STYLES = {
  exhausted: {
    label: "Habis",
    light: "bg-red-500 shadow-[0_0_9px_rgba(239,68,68,0.85)]",
    text: "text-red-600",
    ring: "border-red-500/30 bg-red-500/5",
  },
  waiting: {
    label: "Menunggu",
    light: "bg-amber-400 shadow-[0_0_9px_rgba(251,191,36,0.85)]",
    text: "text-amber-600",
    ring: "border-amber-400/40 bg-amber-400/5",
  },
  running: {
    label: "Jalan",
    light: "bg-emerald-500 shadow-[0_0_9px_rgba(16,185,129,0.85)]",
    text: "text-emerald-600",
    ring: "border-emerald-500/30 bg-emerald-500/5",
  },
  inactive: {
    label: "Mati",
    light: "bg-gray-400",
    text: "text-text-muted",
    ring: "border-border bg-bg-subtle/50",
  },
};

function resolveStatus(provider, isRunning) {
  const message = [
    provider?.status,
    provider?.state,
    provider?.error,
    provider?.errorMessage,
    provider?.lastError,
    provider?.errorCode,
  ].filter((value) => value !== undefined && value !== null).join(" ").toLowerCase();

  const code = Number(provider?.errorCode ?? provider?.lastStatusCode ?? provider?.statusCode);
  const waitingUntil = provider?.cooldownUntil ?? provider?.retryAfter ?? provider?.nextRetryAt;
  const waitingInFuture = waitingUntil && Number.isFinite(new Date(waitingUntil).getTime())
    && new Date(waitingUntil).getTime() > Date.now();

  if (
    code === 429 ||
    /exhaust(ed|ion)|quota.{0,20}(exceed|limit|empty|habis)|limit.{0,20}(reached|exceed)|insufficient quota|credits? (depleted|exhausted)/i.test(message)
  ) return "exhausted";

  if (
    waitingInFuture ||
    /cooldown|backoff|rate.?limit|retry.?after|waiting|queued|menunggu|pending/i.test(message)
  ) return "waiting";

  if (isRunning) return "running";
  if (provider?.isActive === false || provider?.enabled === false || provider?.disabled === true) return "inactive";

  // Connected but not currently handling a request: not active, so show gray.
  return "inactive";
}

/**
 * Status ringkas penyedia untuk halaman Penggunaan & Analitik.
 * Lampu menunjukkan status yang diketahui dari data koneksi dan permintaan aktif.
 */
export default function ProviderTopology({ providers = [], activeRequests = [] }) {
  const requests = Array.isArray(activeRequests) ? activeRequests : [];
  const runningIds = new Set(
    requests.map((request) => String(request?.provider || "").toLowerCase()).filter(Boolean)
  );

  const entries = providers.map((provider, index) => {
    const id = String(provider?.provider || provider?.id || "");
    const name = provider?.name || id || "Penyedia tidak dikenal";
    const isRunning = runningIds.has(id.toLowerCase()) ||
      (id.toLowerCase() === "codebuddy" && runningIds.has("cb"));
    const status = resolveStatus(provider, isRunning);
    return { provider, id, name, status, key: provider?.id || id || name + index };
  });

  const counts = entries.reduce((result, entry) => {
    result[entry.status] += 1;
    return result;
  }, { exhausted: 0, waiting: 0, running: 0, inactive: 0 });

  if (!providers.length) {
    return (
      <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Penyedia AI</h2>
        <p className="mt-3 text-sm text-text-muted">Belum ada penyedia yang terhubung.</p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Penyedia AI</h2>
          <p className="mt-1 text-xs text-text-muted">{providers.length} penyedia tersedia</p>
        </div>
        <span className="text-xs font-semibold text-text-muted">{counts.running} berjalan</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Keterangan lampu status">
        {Object.entries(STATUS_STYLES).map(([key, style]) => (
          <span key={key} className={`inline-flex items-center gap-1.5 text-xs ${style.text}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${style.light}`} aria-hidden="true" />
            {style.label}
          </span>
        ))}
      </div>

      <ul className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map(({ provider, id, name, status, key }) => {
          const style = STATUS_STYLES[status];
          const detail = provider?.errorMessage || provider?.lastError || provider?.statusMessage;
          return (
            <li
              key={key}
              title={detail ? String(detail) : `${name}: ${style.label}`}
              className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${style.ring}`}
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
      </ul>
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
