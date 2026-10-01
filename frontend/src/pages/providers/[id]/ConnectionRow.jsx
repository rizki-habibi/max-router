
import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Badge, Toggle } from "@/shared/components";
import CooldownTimer from "./CooldownTimer";

export default function ConnectionRow({ connection, proxyPools, isOAuth, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onUpdateProxy, onEdit, onDelete, oneByOneStatus = null, isSelected, onSelect }) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const proxyDropdownRef = useRef(null);

  const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const hasLegacyProxy = connection.providerSpecificData?.connectionProxyEnabled === true && !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;
  const proxyDisplayText = boundProxyPool
    ? `Pool: ${boundProxyPool.name}`
    : boundProxyPoolId
      ? `Pool: ${boundProxyPoolId} (inactive/missing)`
      : hasLegacyProxy
        ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`
        : "";

  let maskedProxyUrl = "";
  if (boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";

  let proxyBadgeVariant = "default";
  if (boundProxyPool?.isActive === true) {
    proxyBadgeVariant = "success";
  } else if (boundProxyPoolId || hasLegacyProxy) {
    proxyBadgeVariant = "error";
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) {
        setShowProxyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try {
      await onUpdateProxy(poolId === "__none__" ? null : poolId);
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
  const isOAuthConnection = rowAuthType === "oauth";
  const isCookieConnection = rowAuthType === "cookie";
  const authIcon = isCookieConnection ? "cookie" : isOAuthConnection ? "lock" : "key";
  const authLabel = isOAuthConnection ? "OAuth" : isCookieConnection ? "Cookie" : "API Key";
  const isEmail = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const displayName = isOAuthConnection
    ? (isEmail(connection.email) ? connection.email : (isEmail(connection.name) ? connection.name : (connection.name || connection.email || connection.displayName || "OAuth Account")))
    : (connection.name || connection.email || connection.displayName || "API Key");

  // Use useState + useEffect for impure Date.now() to avoid calling during render
  const [isCooldown, setIsCooldown] = useState(false);

  // Get earliest model lock timestamp (useEffect handles the Date.now() comparison)
  const modelLockUntil = Object.entries(connection)
    .filter(([k]) => k.startsWith("modelLock_"))
    .map(([, v]) => v)
    .filter(v => !!v)
    .sort()[0] || null;

  useEffect(() => {
    const checkCooldown = () => {
      const until = Object.entries(connection)
        .filter(([k]) => k.startsWith("modelLock_"))
        .map(([, v]) => v)
        .filter(v => v && new Date(v).getTime() > Date.now())
        .sort()[0] || null;
      setIsCooldown(!!until);
    };

    checkCooldown();
    const interval = modelLockUntil ? setInterval(checkCooldown, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [modelLockUntil]);

  // Determine effective status (override unavailable if cooldown expired)
  const effectiveStatus = (connection.testStatus === "unavailable" && !isCooldown)
    ? "active"  // Cooldown expired u2192 treat as active
    : connection.testStatus;

  const getStatusVariant = () => {
    if (connection.isActive === false) return "default";
    if (effectiveStatus === "active" || effectiveStatus === "success") return "success";
    if (effectiveStatus === "error" || effectiveStatus === "expired" || effectiveStatus === "unavailable") return "error";
    return "default";
  };


  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  useEffect(() => {
    let stopped = false; let timer = null;
    const loadUsage = async () => {
      if (!connection.id) return;
      setUsageLoading(true);
      try {
        const res = await fetch("/api/usage/" + encodeURIComponent(connection.id), { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!stopped && res.ok && data && !data.error) setUsage(data);
      } catch {} finally { if (!stopped) setUsageLoading(false); }
      if (!stopped) timer = window.setTimeout(loadUsage, 60000);
    };
    loadUsage();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [connection.id]);
  const formatCount = (value) => value === null || value === undefined ? "—" : Number(value).toLocaleString("id-ID");
  const formatReset = (seconds) => {
    if (seconds === null || seconds === undefined) return "—";
    const s = Math.max(0, Number(seconds));
    if (s < 60) return Math.ceil(s) + " dtk";
    if (s < 3600) return Math.floor(s / 60) + " mnt";
    return Math.floor(s / 3600) + " jam " + Math.floor((s % 3600) / 60) + " mnt";
  };
  const localUsage = usage?.local || {};
  const modelUsage = localUsage.byModel || {};
  const modelCatalog = Array.isArray(usage?.models) ? usage.models : [];
  const modelMap = new Map(modelCatalog.map((m) => [m.id, m]));
  const usedModels = Object.keys(modelUsage).slice(0, 8);
  const freeTokens = usage?.free_tokens || {};
  const shortWindow = Array.isArray(usage?.windows) ? usage.windows.find((w) => w.kind === "short") : null;
  const longWindow = Array.isArray(usage?.windows) ? usage.windows.find((w) => w.kind === "long") : null;
  const maskedKey = connection.apiKey ? "••••" + String(connection.apiKey).slice(-4) : null;

  const getOneByOneVariant = () => {
    if (!oneByOneStatus) return "default";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return "error";
    if (oneByOneStatus.state === "testing") return "primary";
    return "default";
  };

  const getOneByOneLabel = () => {
    if (!oneByOneStatus) return null;
    if (oneByOneStatus.state === "queued") return "queued";
    if (oneByOneStatus.state === "testing") return "testing";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return oneByOneStatus.error ? `failed: ${oneByOneStatus.error}` : "failed";
    return null;
  };

  return (
    <div className={`group flex min-w-0 flex-col gap-3 rounded-lg p-2 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between ${connection.isActive === false ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
        {/* Checkbox */}
        {onSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="mt-1 sm:mt-0 h-4 w-4 shrink-0 rounded border-black/20 text-primary focus:ring-primary dark:border-white/20 dark:bg-black"
          />
        )}
        {/* Priority arrows */}
        <div className="flex shrink-0 flex-col">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className={`p-0.5 rounded ${isFirst ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-sidebar text-text-muted hover:text-primary"}`}
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className={`p-0.5 rounded ${isLast ? "text-text-muted/30 cursor-not-allowed" : "hover:bg-sidebar text-text-muted hover:text-primary"}`}
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>
        </div>
        <span className="material-symbols-outlined shrink-0 text-base text-text-muted">
          {authIcon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge variant={getStatusVariant()} size="sm" dot>
              {connection.isActive === false ? "Nonaktif" : (effectiveStatus === "active" || effectiveStatus === "success" ? "Aktif" : (effectiveStatus || "Belum diuji"))}
            </Badge>
            <Badge variant="default" size="sm">
              {authLabel}
            </Badge>
            {maskedKey && !isOAuthConnection && <span className="font-mono text-xs text-text-muted">Key {maskedKey}</span>}
            {usage && (
            <div className="mt-2 rounded-lg border border-border bg-sidebar/30 p-2.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold">Pemakaian & sisa key</span>
                <span className="text-[10px] text-text-muted">{usageLoading ? "Memuat..." : "Diperbarui otomatis 1 menit"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div><div className="text-[10px] text-text-muted">Paket</div><div className="text-xs font-medium">{usage.plan || "Tanpa paket"}</div></div>
                <div><div className="text-[10px] text-text-muted">Token gratis sisa</div><div className="text-xs font-medium">{formatCount(freeTokens.remaining)}{freeTokens.limit_per_day ? " / " + formatCount(freeTokens.limit_per_day) : ""}</div></div>
                <div><div className="text-[10px] text-text-muted">Request lokal</div><div className="text-xs font-medium">{formatCount(localUsage.requests)}</div></div>
                <div><div className="text-[10px] text-text-muted">Token masuk/keluar</div><div className="text-xs font-medium">{formatCount(localUsage.inputTokens)} / {formatCount(localUsage.outputTokens)}</div></div>
                <div><div className="text-[10px] text-text-muted">Saldo</div><div className="text-xs font-medium">{usage.wallet?.balance_usd != null ? "$" + usage.wallet.balance_usd : "—"}</div></div>
              </div>
              {(shortWindow || longWindow) && (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-text-muted">
                  {shortWindow && <span>Jangka pendek: ${shortWindow.remaining_usd} sisa · reset {formatReset(shortWindow.resets_in_sec)}</span>}
                  {longWindow && <span>Jangka panjang: ${longWindow.remaining_usd} sisa · reset {formatReset(longWindow.resets_in_sec)}</span>}
                </div>
              )}
              {usedModels.length > 0 && (
                <div className="mt-2 border-t border-border pt-2">
                  <div className="mb-1 text-[10px] text-text-muted">Model yang benar-benar dipakai key ini</div>
                  <div className="flex flex-wrap gap-1.5">
                    {usedModels.map((modelId) => {
                      const meta = modelMap.get(modelId);
                      const tier = meta?.accessTier || "unknown";
                      const tierLabel = tier === "free" ? "Gratis" : tier === "paid" ? "Berbayar" : tier === "premium" ? "Premium" : "Tidak diketahui";
                      const caps = meta?.capabilities && typeof meta.capabilities === "object" ? Object.entries(meta.capabilities).filter(([, value]) => value === true).map(([key]) => key) : [];
                      const row = modelUsage[modelId];
                      return (
                        <div key={modelId} className="rounded-md border border-border bg-background px-2 py-1">
                          <div className="flex items-center gap-1.5"><span className="max-w-[190px] truncate font-mono text-[10px]">{modelId}</span><Badge size="sm" variant={tier === "free" ? "success" : tier === "premium" ? "error" : "default"}>{tierLabel}</Badge></div>
                          <div className="mt-0.5 text-[9px] text-text-muted">Req {formatCount(row.requests)} · In {formatCount(row.inputTokens)} · Out {formatCount(row.outputTokens)} · Cache {formatCount(row.cacheReadTokens)}{caps.length > 0 ? " · " + caps.join(", ") : ""}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {modelCatalog.length > 0 && usedModels.length === 0 && <div className="mt-2 text-[10px] text-text-muted">{modelCatalog.length} model terdeteksi dari Base URL; belum ada pemakaian lokal untuk key ini.</div>}
            </div>
          )}
          {hasAnyProxy && (
              <Badge variant={proxyBadgeVariant} size="sm">
                Proxy
              </Badge>
            )}
            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.lastError && connection.isActive !== false && (
              <span className="max-w-full truncate text-xs text-red-500 sm:max-w-[300px]" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
            <span className="text-xs text-text-muted">#{connection.priority}</span>
            {connection.globalPriority && (
              <span className="text-xs text-text-muted">Auto: {connection.globalPriority}</span>
            )}
            {getOneByOneLabel() && (
              <Badge variant={getOneByOneVariant()} size="sm">
                {getOneByOneLabel()}
              </Badge>
            )}
          </div>
          {hasAnyProxy && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[420px]" title={proxyDisplayText}>
                {proxyDisplayText}
              </span>
              {maskedProxyUrl && (
                <code className="max-w-full truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/5 sm:max-w-[260px]">
                  {maskedProxyUrl}
                </code>
              )}
              {noProxyText && (
                <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[320px]" title={noProxyText}>
                  no_proxy: {noProxyText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <div className="grid flex-1 grid-cols-3 gap-1 sm:flex sm:flex-none">
          {/* Proxy button with inline dropdown */}
          {(proxyPools || []).length > 0 && (
            <div className="relative" ref={proxyDropdownRef}>
              <button
                onClick={() => setShowProxyDropdown((v) => !v)}
                className={`flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${hasAnyProxy ? "text-primary" : "text-text-muted hover:text-primary"}`}
                disabled={updatingProxy}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {updatingProxy ? "progress_activity" : "lan"}
                </span>
                <span className="text-[10px] leading-tight">Proxy</span>
              </button>
              {showProxyDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1 max-w-[78vw] min-w-[160px] rounded-lg border border-border bg-bg py-1 shadow-lg">
                  <button
                    onClick={() => handleSelectProxy("__none__")}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${!boundProxyPoolId ? "text-primary font-medium" : "text-text-main"}`}
                  >
                    None
                  </button>
                  {(proxyPools || []).map((pool) => (
                    <button
                      key={pool.id}
                      onClick={() => handleSelectProxy(pool.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${boundProxyPoolId === pool.id ? "text-primary font-medium" : "text-text-main"}`}
                    >
                      {pool.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={onEdit} className="flex flex-col items-center rounded px-2 py-1 text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5">
            <span className="material-symbols-outlined text-[18px]">edit</span>
            <span className="text-[10px] leading-tight">Edit</span>
          </button>
          <button onClick={onDelete} className="flex flex-col items-center rounded px-2 py-1 text-red-500 hover:bg-red-500/10">
            <span className="material-symbols-outlined text-[18px]">delete</span>
            <span className="text-[10px] leading-tight">Delete</span>
          </button>
        </div>
        <Toggle
          size="sm"
          checked={connection.isActive ?? true}
          onChange={onToggleActive}
          title={(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
        />
      </div>
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    displayName: PropTypes.string,
    modelLockUntil: PropTypes.string,
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    lastError: PropTypes.string,
    priority: PropTypes.number,
    globalPriority: PropTypes.number,
  }).isRequired,
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    proxyUrl: PropTypes.string,
    noProxy: PropTypes.string,
    isActive: PropTypes.bool,
  })),
  isOAuth: PropTypes.bool.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  oneByOneStatus: PropTypes.shape({
    state: PropTypes.string,
    error: PropTypes.string,
  }),
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func,
};
