
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import ThemeToggle from "@/shared/components/ThemeToggle";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { useNotificationStore } from "@/store/notificationStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  // Media provider detail: /dashboard/media-providers/[kind]/[id]
  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      breadcrumbs: [
        { label: "Penyedia Media", href: `/dashboard/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: providerId === "codebuddy" || providerId === "cb" ? "/providers/codebuddy.svg" : `/providers/${providerId}.png` },
      ],
    };
  }

  // Media provider kind: /dashboard/media-providers/[kind]
  const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Kelola ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [],
    };
  }

  // Provider detail page: /dashboard/providers/[id]
  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo = AI_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Penyedia", href: "/dashboard/providers" },
          {
            label: providerInfo.name,
            image: providerInfo.id === "codebuddy" || providerInfo.id === "cb" ? "/providers/codebuddy.svg" : `/providers/${providerInfo.id}.png`,
          },
        ],
      };
    }
  }

  if (pathname.includes("/providers") && !pathname.includes("/media-providers"))
    return {
      title: "Penyedia",
      description: "Kelola koneksi penyedia AI",
      icon: "dns",
      breadcrumbs: [],
    };
  if (pathname.includes("/combos"))
    return {
      title: "Gabungan",
      description: "Gabungan model dengan cadangan",
      icon: "layers",
      breadcrumbs: [],
    };
  if (pathname.includes("/usage"))
    return {
      title: "Penggunaan & Analitik",
      description:
        "Pantau penggunaan API, konsumsi token, dan log permintaan",
      icon: "bar_chart",
      breadcrumbs: [],
    };
  if (pathname.includes("/auth-files"))
    return {
      title: "Berkas Autentikasi",
      description: "Kelola kredensial penyedia yang tersimpan di basis data lokal",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  if (pathname.includes("/quota"))
    return {
      title: "Pelacak Kuota",
      description: "Pantau dan kelola batas kuota API",
      icon: "data_usage",
      breadcrumbs: [],
    };
  if (pathname.includes("/proxy-pools"))
    return {
      title: "Kumpulan Proksi",
      description: "Kelola konfigurasi kumpulan proksi",
      icon: "lan",
      breadcrumbs: [],
    };
  if (pathname.includes("/endpoint"))
    return {
      title: "Endpoint",
      description: "Konfigurasi endpoint API",
      icon: "api",
      breadcrumbs: [],
    };
  if (pathname.includes("/profile"))
    return {
      title: "Deteksi Integrasi",
      description: "Periksa koneksi AI, MCP, GitHub, dan repositori secara online",
      icon: "settings",
      breadcrumbs: [],
    };
  if (pathname.includes("/translator"))
    return {
      title: "Penerjemah",
      description: "Debug alur konversi antarformat",
      icon: "translate",
      breadcrumbs: [],
    };
  if (pathname.includes("/console-log"))
    return {
      title: "Log Konsol",
      description: "Keluaran konsol server secara langsung",
      icon: "monitor",
      breadcrumbs: [],
    };
  if (pathname === "/dashboard")
    return {
      title: "Endpoint",
      description: "Konfigurasi endpoint API",
      icon: "api",
      breadcrumbs: [],
    };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, onToggleCollapse, sidebarCollapsed = false, showMenuButton = true }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const clearNotifications = useNotificationStore((state) => state.clearAll);
 
  // Memoize page info to prevent unnecessary recalculations
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, description, icon, breadcrumbs } = pageInfo;
 
  useEffect(() => {
    let cancelled = false;
 
    async function loadAuthStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDisplayName(data?.displayName || data?.oidcName || data?.oidcEmail || "");
          setLoginMethod(data?.loginMethod || "");
          setIsLoggedIn(data?.isLoggedIn !== false);
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setLoginMethod("");
          setIsLoggedIn(false);
        }
      }
    }

    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        localStorage.removeItem("9r_authed");
        navigate("/login?force=true");
        navigate(0);
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <header className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 lg:px-8 pt-2 sm:pt-3 pb-2 border-b border-border-subtle bg-surface/60 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none z-20">
      {/* Mobile menu button */}
      <div className="flex items-center gap-3 lg:hidden shrink-0">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="text-text-main hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        )}
      </div>

      {/* Desktop sidebar toggle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="mr-comic-toggle hidden lg:flex items-center justify-center size-10 shrink-0"
        title={sidebarCollapsed ? "Buka panel" : "Tutup panel"}
        aria-label={sidebarCollapsed ? "Buka panel" : "Tutup panel"}
      >
        <span className="mr-comic-toggle-icon material-symbols-outlined text-[19px]">
          {sidebarCollapsed ? "chevron_right" : "chevron_left"}
        </span>
      </button>

      {/* Page title with breadcrumbs */}
      <div className="flex flex-col min-w-0 flex-1">
        {breadcrumbs.length > 0 ? (
          <div className="flex items-center gap-2">
            {breadcrumbs.map((crumb, index) => (
              <div
                key={`${crumb.label}-${crumb.href || "current"}`}
                className="flex items-center gap-2"
              >
                {index > 0 && (
                  <span className="material-symbols-outlined text-text-muted text-base">
                    chevron_right
                  </span>
                )}
                {crumb.href ? (
                  <Link
                    to={crumb.href}
                    className="text-text-muted hover:text-primary transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    {crumb.image && (
                      <ProviderIcon
                        src={crumb.image}
                        alt={crumb.label}
                        size={28}
                        className="object-contain rounded max-w-[28px] max-h-[28px]"
                        fallbackText={crumb.label.slice(0, 2).toUpperCase()}
                      />
                    )}
                    <h1 className="text-base lg:text-2xl font-semibold text-text-main tracking-tight truncate">
                      {translate(crumb.label)}
                    </h1>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : title ? (
          <div>
            <div className="flex items-center gap-2">
              {icon && (
                <span className="material-symbols-outlined text-primary text-xl lg:text-2xl">
                  {icon}
                </span>
              )}
              <h1 className="text-base lg:text-2xl font-semibold tracking-tight truncate">
                {translate(title)}
              </h1>
            </div>
            {description && (
              <p className="hidden lg:block text-sm text-text-muted truncate">
                {translate(description)}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {displayName && loginMethod === "OIDC" && (
          <div className="hidden sm:flex items-center max-w-[220px] px-3 py-1.5 rounded-full border border-border bg-surface/70 text-xs text-text-muted truncate">
            <span className="material-symbols-outlined text-[14px] mr-1.5 text-primary">person</span>
            <span className="truncate">{displayName}</span>
            <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              OIDC
            </span>
          </div>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((value) => !value)}
            className="relative flex size-9 items-center justify-center rounded-xl border border-transparent text-text-muted transition-all hover:border-primary/20 hover:bg-primary/10 hover:text-primary"
            aria-label="Notifikasi"
            title="Notifikasi"
          >
            <span className="material-symbols-outlined text-[21px]">notifications</span>
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {notifications.length > 99 ? "99+" : notifications.length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-11 z-[90] w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-primary/15 bg-surface/95 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Notifikasi</p>
                  <p className="text-[10px] text-text-muted">{notifications.length} pemberitahuan aktif</p>
                </div>
                {notifications.length > 0 && (
                  <button type="button" onClick={clearNotifications} className="text-[11px] text-primary hover:underline">Bersihkan</button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <span className="material-symbols-outlined text-3xl text-text-muted/60">notifications_none</span>
                    <p className="mt-2 text-xs text-text-muted">Belum ada notifikasi</p>
                  </div>
                ) : notifications.slice().reverse().map((n) => (
                  <div key={n.id} className="flex gap-2 rounded-xl px-3 py-2.5 hover:bg-primary/5">
                    <span className="material-symbols-outlined mt-0.5 text-[17px] text-primary">{n.type === "error" ? "error" : n.type === "warning" ? "warning" : n.type === "success" ? "check_circle" : "info"}</span>
                    <div className="min-w-0 flex-1">
                      {n.title && <p className="text-xs font-semibold">{n.title}</p>}
                      <p className="text-xs text-text-muted">{n.message}</p>
                    </div>
                    {n.dismissible && <button type="button" onClick={() => removeNotification(n.id)} className="text-text-muted hover:text-text-main"><span className="material-symbols-outlined text-[15px]">close</span></button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <HeaderSearch />
        <ThemeToggle />
        <HeaderMenu onLogout={handleLogout} isLoggedIn={isLoggedIn} />
      </div>
    </header>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative w-[160px] sm:w-[220px]">
      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-[16px] pointer-events-none">
        search
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 pl-7 pr-7 rounded-lg border border-border bg-surface/60 text-sm focus:outline-none focus:border-primary/50 transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded"
          aria-label="Clear search"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
  sidebarCollapsed: PropTypes.bool,
};
