import { useEffect, useMemo, useState } from "react";

const FILTERS = [
  { id: "all", label: "Semua Pesan", icon: "mail" },
  { id: "unread", label: "Belum Dibaca", icon: "mark_email_unread" },
  { id: "starred", label: "Berbintang", icon: "star" },
  { id: "attachment", label: "Ada Lampiran", icon: "attach_file" },
];

const PROVIDERS = [
  { id: "all", label: "Semua Akun" },
  { id: "gmail", label: "Gmail" },
  { id: "proton", label: "Proton Mail" },
  { id: "outlook", label: "Outlook" },
  { id: "yahoo", label: "Yahoo Mail" },
  { id: "icloud", label: "iCloud" },
  { id: "zoho", label: "Zoho Mail" },
  { id: "imap", label: "IMAP / Email Lainnya" },
];

const EMAIL_PROVIDERS = [
  { id: "gmail", name: "Google / Gmail", detail: "OAuth Google", icon: "mail", tone: "Terhubung", action: "oauth", href: "/api/email/oauth/gmail/start" },
  { id: "outlook", name: "Microsoft Outlook", detail: "Outlook, Hotmail, Microsoft 365", icon: "business_center", tone: "OAuth", action: "soon" },
  { id: "yahoo", name: "Yahoo Mail", detail: "Akun Yahoo pribadi", icon: "alternate_email", tone: "OAuth", action: "soon" },
  { id: "proton", name: "Proton Mail", detail: "Proton Mail Bridge diperlukan untuk IMAP cloud", icon: "shield_lock", tone: "Bridge", action: "soon" },
  { id: "icloud", name: "iCloud Mail", detail: "Apple Mail dengan app-specific password", icon: "cloud", tone: "IMAP", action: "soon" },
  { id: "zoho", name: "Zoho Mail", detail: "Akun Zoho Mail", icon: "mark_email_read", tone: "OAuth / IMAP", action: "soon" },
  { id: "imap", name: "Email Lainnya", detail: "Email sekolah, kampus, perusahaan, atau domain sendiri", icon: "dns", tone: "IMAP / SMTP", action: "imap" },
];

export default function AutomationDashboard() {
  const [messages, setMessages] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [provider, setProvider] = useState("all");
  const [account, setAccount] = useState("all");
  const [folder, setFolder] = useState("inbox");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [imapForm, setImapForm] = useState({ email: "", name: "", host: "", port: "993", username: "", password: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("email_connected");
    const error = params.get("email_error");
    if (connected) setNotice({ type: "success", text: `Gmail ${connected} berhasil terhubung.` });
    if (error) setNotice({ type: "error", text: error });
    if (connected || error) window.history.replaceState({}, "", "/dashboard/automation");

    let cancelled = false;

    async function loadEmailData() {
      setLoading(true);
      try {
        const [statusRes, accountsRes, messagesRes] = await Promise.all([
          fetch("/api/auth/status", { credentials: "same-origin" }),
          fetch("/api/email/accounts", { credentials: "same-origin" }),
          fetch(`/api/email/messages?folder=${encodeURIComponent(folder)}`, { credentials: "same-origin" }),
        ]);

        if (accountsRes.ok) {
          const data = await accountsRes.json();
          if (!cancelled) setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        } else if (accountsRes.status === 401) {
          const data = await accountsRes.json().catch(() => ({}));
          const reason = data.reason === "session_invalid"
            ? "Cookie sesi ada tetapi tidak valid. Kemungkinan sesi dibuat dengan secret lama."
            : data.reason === "session_missing"
              ? "Cookie 9r_session tidak diterima server."
              : "Sesi Max Router diperlukan untuk memuat akun email.";
          if (!cancelled) setNotice({ type: "error", text: reason });
        } else {
          const data = await accountsRes.json().catch(() => ({}));
          if (!cancelled) setNotice({ type: "error", text: data.error || `Gagal memuat akun email (HTTP ${accountsRes.status}).` });
        }

        if (messagesRes.ok) {
          const data = await messagesRes.json();
          if (!cancelled) setMessages(Array.isArray(data.messages) ? data.messages : []);
        }

        if (statusRes.ok && !cancelled) {
          const status = await statusRes.json();
          if (status.sessionState === "invalid") {
            setNotice({ type: "error", text: "Sesi Max Router tidak valid. Silakan masuk kembali." });
          }
        }
      } catch (error) {
        if (!cancelled) setNotice({ type: "error", text: error?.message || "Gagal menghubungi server Max Router." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEmailData();
    return () => { cancelled = true; };
  }, [folder]);

  const accountOptions = useMemo(() => accounts.filter((item) =>
    provider === "all" || String(item.provider || "").toLowerCase() === provider
  ), [accounts, provider]);

  const visibleMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((item) => {
      const itemProvider = String(item.provider || "").toLowerCase();
      const itemAccount = String(item.account_id || item.email_address || "");
      const text = [item.from_name, item.from_address, item.to_address, item.subject, item.snippet, item.body]
        .filter(Boolean).join(" ").toLowerCase();
      if (provider !== "all" && itemProvider !== provider) return false;
      if (account !== "all" && itemAccount !== account && String(item.email_address || "").toLowerCase() !== String(account).toLowerCase()) return false;
      if (filter === "unread" && item.is_read) return false;
      if (filter === "starred" && !item.is_starred) return false;
      if (filter === "attachment" && !item.has_attachment) return false;
      return !q || text.includes(q);
    });
  }, [messages, query, filter, provider, account]);

  const unreadCount = messages.filter((item) => !item.is_read).length;
  const providerLabel = (value) => PROVIDERS.find((item) => item.id === String(value).toLowerCase())?.label || value || "Email";
  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  };

  return (
    <div className="min-h-full space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {notice && <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${notice.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-red-500/30 bg-red-500/10 text-red-700"}`}>{notice.text}</div>}
          <div className="flex items-center gap-2 mb-1"><span className="material-symbols-outlined text-primary">mail</span><h1 className="text-xl font-bold text-text-main">Pusat Email</h1></div>
          <p className="text-sm text-text-muted">Kelola banyak akun email dari satu tempat, dengan pencarian, filter, dan sinkronisasi terpusat.</p>
        </div>
        <button type="button" onClick={() => setShowAddAccount(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"><span className="material-symbols-outlined text-[18px]">add</span>Tambah Akun Email</button>
      </div>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} imapForm={imapForm} setImapForm={setImapForm} onNotice={(value) => setNotice(value)} />}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={syncing} onClick={async () => { setSyncing(true); try { const r=await fetch("/api/email/sync",{method:"POST",credentials:"same-origin"}); if (r.ok) window.location.reload(); else { const d=await r.json().catch(()=>({})); setNotice({type:"error",text:d.error||`Sinkronisasi gagal (HTTP ${r.status}).`}); } } finally { setSyncing(false); } }} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2.5 text-sm font-semibold text-text-main hover:bg-background disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">sync</span>{syncing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}</button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="mail" label="Total Pesan" value={messages.length} />
        <StatCard icon="mark_email_unread" label="Belum Dibaca" value={unreadCount} />
        <StatCard icon="account_circle" label="Akun Terhubung" value={accounts.length} />
        <StatCard icon="sync" label="Status Sinkronisasi" value={loading ? "Memuat..." : "Siap"} />
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
        <div className="p-4 border-b border-border-subtle space-y-3">
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[19px]">search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari pengirim, subjek, isi pesan..." className="w-full rounded-xl border border-border-subtle bg-background pl-10 pr-10 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary" />
              {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"><span className="material-symbols-outlined text-[18px]">close</span></button>}
            </div>
            <Select value={provider} onChange={(e) => { setProvider(e.target.value); setAccount("all"); }} ariaLabel="Filter penyedia email">{PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
            <Select value={account} onChange={(e) => setAccount(e.target.value)} ariaLabel="Filter akun email"><option value="all">Semua alamat email</option>{accountOptions.map((item) => <option key={item.id || item.email_address} value={item.id || item.email_address}>{item.email_address || item.email || item.name}</option>)}</Select>
            <Select value={folder} onChange={(e) => setFolder(e.target.value)} ariaLabel="Pilih folder email"><option value="inbox">Kotak Masuk</option><option value="sent">Terkirim</option><option value="starred">Berbintang</option><option value="archive">Arsip</option><option value="spam">Spam</option><option value="trash">Sampah</option></Select>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${filter === item.id ? "bg-primary text-white" : "bg-background text-text-muted hover:text-text-main border border-border-subtle"}`}><span className="material-symbols-outlined text-[16px]">{item.icon}</span>{item.label}</button>)}
            <span className="ml-auto shrink-0 text-xs text-text-muted">{visibleMessages.length} pesan</span>
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          {visibleMessages.length > 0 ? visibleMessages.map((item) => <EmailRow key={item.id || item.provider_message_id} item={item} providerLabel={providerLabel} formatDate={formatDate} />) : <div className="px-6 py-16 text-center"><span className="material-symbols-outlined text-5xl text-text-muted/50">inbox</span><h2 className="mt-3 text-base font-semibold text-text-main">{loading ? "Memuat pesan..." : "Belum ada pesan"}</h2><p className="mt-1 max-w-md mx-auto text-sm text-text-muted">{loading ? "Sedang mengambil pesan dari akun email yang terhubung." : accounts.length ? "Belum ada pesan pada folder atau filter ini. Coba ubah folder, filter, atau pencarian." : "Hubungkan akun email melalui tombol Tambah Akun Email. Gmail yang sudah terhubung tetap dipakai dan akun lain dapat ditambahkan dari popup ini."}</p></div>}
        </div>
      </div>
    </div>
  );
}

function Select({ children, ...props }) { return <select {...props} className="rounded-xl border border-border-subtle bg-background px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary xl:w-52" />; }
function StatCard({ icon, label, value }) { return <div className="rounded-xl border border-border-subtle bg-surface p-4"><div className="flex items-center justify-between"><span className="material-symbols-outlined text-primary">{icon}</span><span className="text-lg font-bold text-text-main">{value}</span></div><p className="mt-2 text-xs text-text-muted">{label}</p></div>; }
function EmailRow({ item, providerLabel, formatDate }) { return <button type="button" className={`w-full text-left px-4 py-3.5 hover:bg-background/60 transition-colors ${item.is_read ? "" : "bg-primary/[0.035]"}`}><div className="flex items-start gap-3"><div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{(item.from_name || item.from_address || "?").charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 min-w-0"><span className={`truncate text-sm ${item.is_read ? "font-medium text-text-main" : "font-bold text-text-main"}`}>{item.from_name || item.from_address || "Pengirim tidak dikenal"}</span><span className="shrink-0 rounded-md bg-background border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-muted">{providerLabel(item.provider)}</span></div><span className="shrink-0 text-[11px] text-text-muted">{formatDate(item.received_at || item.created_at)}</span></div><div className="mt-1 flex items-center gap-2"><span className={`truncate text-sm ${item.is_read ? "text-text-main" : "font-semibold text-text-main"}`}>{item.subject || "(Tanpa subjek)"}</span>{item.is_starred && <span className="material-symbols-outlined text-[16px] text-amber-500">star</span>}{item.has_attachment && <span className="material-symbols-outlined text-[16px] text-text-muted">attach_file</span>}</div><p className="mt-1 truncate text-xs text-text-muted">{item.snippet || item.body || ""}</p></div></div></button>; }


function AddAccountModal({ onClose, imapForm, setImapForm, onNotice }) {
  const connect = (item) => {
    if (item.action === "oauth" && item.href) {
      window.location.href = item.href;
      return;
    }
    if (item.action === "imap") return;
    onNotice({
      type: "error",
      text: item.id === "proton"
        ? "Proton Mail tidak menyediakan IMAP cloud biasa. Integrasi Proton memerlukan Proton Mail Bridge pada mesin/server yang dapat dijangkau Max Router."
        : `${item.name} belum memiliki kredensial OAuth di Max Router. Popup ini sudah menyiapkan provider-nya tanpa mengganggu Gmail yang terhubung.`,
    });
  };

  const submitImap = (e) => {
    e.preventDefault();
    onNotice({
      type: "error",
      text: "Form IMAP sudah disiapkan, tetapi endpoint penyimpanan akun IMAP belum aktif. Belum ada kredensial yang dikirim.",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-email-title">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border-subtle bg-surface shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface px-5 py-4">
          <div>
            <h2 id="add-email-title" className="text-lg font-bold text-text-main">Tambah Akun Email</h2>
            <p className="mt-1 text-xs text-text-muted">Gmail utama tetap terhubung. Pilih akun lain yang ingin ditambahkan.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-background hover:text-text-main" aria-label="Tutup">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {EMAIL_PROVIDERS.map((item) => (
            <button key={item.id} type="button" onClick={() => connect(item)} className="group rounded-xl border border-border-subtle bg-background p-4 text-left transition hover:border-primary/50 hover:bg-primary/[0.03]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined">{item.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-text-main">{item.name}</h3>
                    <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-text-muted">{item.tone}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{item.detail}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    {item.action === "oauth" ? "Hubungkan" : item.action === "imap" ? "Atur IMAP" : "Siapkan integrasi"}
                    <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <form onSubmit={submitImap} className="mx-5 mb-5 rounded-xl border border-border-subtle bg-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">dns</span>
            <div>
              <h3 className="text-sm font-semibold text-text-main">Email IMAP / Custom</h3>
              <p className="text-xs text-text-muted">Untuk email domain sekolah, kampus, kantor, atau domain pribadi.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={imapForm.email} onChange={(e) => setImapForm({ ...imapForm, email: e.target.value })} placeholder="Alamat email" className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            <input value={imapForm.name} onChange={(e) => setImapForm({ ...imapForm, name: e.target.value })} placeholder="Nama akun (opsional)" className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            <input value={imapForm.host} onChange={(e) => setImapForm({ ...imapForm, host: e.target.value })} placeholder="Server IMAP, contoh imap.domain.com" className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            <input value={imapForm.port} onChange={(e) => setImapForm({ ...imapForm, port: e.target.value })} placeholder="Port" inputMode="numeric" className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            <input value={imapForm.username} onChange={(e) => setImapForm({ ...imapForm, username: e.target.value })} placeholder="Username IMAP" autoComplete="username" className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
            <input value={imapForm.password} onChange={(e) => setImapForm({ ...imapForm, password: e.target.value })} placeholder="Password / App Password" type="password" autoComplete="new-password" className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-text-muted">Jangan gunakan password utama jika provider menyediakan app password.</p>
            <button type="submit" className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90">Simpan Akun IMAP</button>
          </div>
        </form>
      </div>
    </div>
  );
}
