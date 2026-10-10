import PropTypes from "prop-types";

/**
 * Ringkasan penyedia pengganti diagram topology.
 * Diagram React Flow sengaja dihapus karena menghasilkan kanvas kosong/terpotong
 * pada halaman Penggunaan & Analitik. Komponen ini hanya menampilkan status
 * penyedia secara ringkas tanpa canvas, zoom, atau dependensi grafik.
 */
export default function ProviderTopology({ providers = [], activeRequests = [] }) {
  const active = new Set(
    (Array.isArray(activeRequests) ? activeRequests : [])
      .map((request) => String(request?.provider || "").toLowerCase())
      .filter(Boolean)
  );

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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Penyedia AI</h2>
          <p className="mt-1 text-xs text-text-muted">
            {providers.length} penyedia tersedia
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {active.size} aktif
        </span>
      </div>
      <ul className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {providers.map((provider) => {
          const id = String(provider?.provider || "");
          const isActive = active.has(id.toLowerCase()) ||
            (id.toLowerCase() === "codebuddy" && active.has("cb"));
          return (
            <li
              key={id || provider?.name}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="truncate text-sm font-medium text-text">
                {provider?.name || id || "Penyedia tidak dikenal"}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-success/10 text-success" : "bg-bg-subtle text-text-muted"}`}>
                {isActive ? "Memproses" : "Siap"}
              </span>
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
  })),
  activeRequests: PropTypes.arrayOf(PropTypes.shape({
    provider: PropTypes.string,
    model: PropTypes.string,
    account: PropTypes.string,
  })),
  lastProvider: PropTypes.string,
  errorProvider: PropTypes.string,
};
