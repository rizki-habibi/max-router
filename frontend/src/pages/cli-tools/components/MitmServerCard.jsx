
import { useState, useEffect, useCallback } from "react";
import { Card, Button, Badge, Input } from "@/shared/components";
import { getServerBaseUrl } from "@/shared/constants/config";

const DEFAULT_MITM_ROUTER_BASE = getServerBaseUrl();

/**
 * Shared MITM infrastructure card — manages SSL cert + server start/stop.
 * Cloud Kiro launcher: v3.0.1.
 * DNS per-tool is handled separately in MitmToolCard.
 */
export default function MitmServerCard({ apiKeys, cloudEnabled, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState(() => apiKeys?.[0]?.key || "");
  const [pendingAction, setPendingAction] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [kiroConnecting, setKiroConnecting] = useState(false);
  const [mitmRouterBaseUrl, setMitmRouterBaseUrl] = useState(DEFAULT_MITM_ROUTER_BASE);
  const [port443Conflict, setPort443Conflict] = useState(null);
  const [localBridge, setLocalBridge] = useState(null);

  const probeLocalBridge = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:3001/api/health", {
        cache: "no-store",
        credentials: "omit",
      });
      if (!res.ok) throw new Error("local bridge unavailable");
      const data = await res.json();
      setLocalBridge(data?.kiroBridge || null);
    } catch {
      setLocalBridge(null);
    }
  }, []);

  const serverIsWindows = status?.isWin === true;
  const canRunWithoutPassword = serverIsWindows || status?.hasCachedPassword || status?.needsSudoPassword === false;
  const isAdmin = status?.isAdmin !== false;
  // No privilege: not admin/root AND (Win OR no cached sudo password)
  const noPrivilege = !isAdmin && (serverIsWindows || (!status?.hasCachedPassword && status?.needsSudoPassword !== false));

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.mitmRouterBaseUrl) {
          setMitmRouterBaseUrl(data.mitmRouterBaseUrl);
        }
        onStatusChange?.(data);
      }
    } catch {
      setStatus({ running: false, certExists: false, dnsStatus: {} });
    }
  }, [onStatusChange]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchStatus();
      probeLocalBridge();
    });
    const timer = setInterval(probeLocalBridge, 5000);
    return () => clearInterval(timer);
  }, [fetchStatus, probeLocalBridge]);

  const handleAction = (action) => {
    setActionError(null);
    // Wait for status to load before deciding whether to show sudo modal
    if (!status) return;
    if (canRunWithoutPassword) {
      doAction(action, "");
    } else {
      setPendingAction(action);
      setShowPasswordModal(true);
      setModalError(null);
    }
  };

  const doAction = async (action, password, forceKillPort443 = false) => {
    setLoading(true);
    setActionError(null);
    try {
      let res;
      if (action === "trust-cert") {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trust-cert", sudoPassword: password }),
        });
      } else if (action === "connect-kiro") {
        setKiroConnecting(true);
        const keyToUse = selectedApiKey?.trim()
          || (apiKeys?.length > 0 ? apiKeys[0].key : null)
          || (!cloudEnabled ? "sk_9router" : null);
        if (!keyToUse) {
          throw new Error("API Key diperlukan untuk menghubungkan Kiro");
        }
        if (isRunning) {
          res = await fetch("/api/cli-tools/antigravity-mitm", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "kiro", action: "enable", sudoPassword: password }),
          });
        } else {
          res = await fetch("/api/cli-tools/antigravity-mitm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey: keyToUse,
              sudoPassword: password,
              mitmRouterBaseUrl: mitmRouterBaseUrl.trim() || DEFAULT_MITM_ROUTER_BASE,
              forceKillPort443,
              connectKiro: true,
            }),
          });
        }
      } else if (action === "start") {
        const keyToUse = selectedApiKey?.trim()
          || (apiKeys?.length > 0 ? apiKeys[0].key : null)
          || (!cloudEnabled ? "sk_9router" : null);
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: keyToUse,
            sudoPassword: password,
            mitmRouterBaseUrl: mitmRouterBaseUrl.trim() || DEFAULT_MITM_ROUTER_BASE,
            forceKillPort443,
          }),
        });
      } else {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sudoPassword: password }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "PORT_443_BUSY" && data.portOwner) {
          setShowPasswordModal(false);
          setPort443Conflict({ owner: data.portOwner, password });
          return;
        }
        setActionError(data.error || `Failed to ${action} MITM server`);
        return;
      }
      setShowPasswordModal(false);
      setSudoPassword("");
      setPort443Conflict(null);
      await fetchStatus();
    } catch (e) {
      setActionError(e.message || "Network error");
    } finally {
      setLoading(false);
      setKiroConnecting(false);
      setPendingAction(null);
    }
  };

  const handleKillAndStart = () => {
    const pwd = port443Conflict?.password || "";
    doAction("start", pwd, true);
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setModalError("Sudo password is required");
      return;
    }
    doAction(pendingAction, sudoPassword);
  };

  const isRunning = status?.running;
  const remoteMitmInstance = status && status.isWin === false;
  const localKiroConnected =
    localBridge?.localOnly === true &&
    localBridge?.kiroInstalled === true &&
    localBridge?.kiroRunning === true &&
    localBridge?.kiroDnsActive === true &&
    localBridge?.certTrusted === true &&
    localBridge?.mitmPort443 === true;

  return (
    <>
      <Card padding="sm" className="border-primary/20 bg-primary/5">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">security</span>
              <span className="font-semibold text-sm text-text-main">MITM Server</span>
              {isRunning ? (
                <Badge variant="success" size="sm">Running</Badge>
              ) : (
                <Badge variant="default" size="sm">Stopped</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted" data-i18n-skip="true">
              {[
                { label: "Cert", ok: status?.certExists },
                { label: "Trusted", ok: status?.certTrusted },
                { label: "Server", ok: isRunning },
              ].map(({ label, ok }) => (
                <span key={label} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${ok ? "text-green-600" : "text-text-muted"}`}>
                  <span className="material-symbols-outlined text-[12px]">
                    {ok ? "check_circle" : "cancel"}
                  </span>
                  {label}
                </span>
              ))}
              {localBridge && (
                <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${localKiroConnected ? "text-green-600" : "text-orange-600"}`}>
                  <span className="material-symbols-outlined text-[12px]">{localKiroConnected ? "link" : "link_off"}</span>
                  {localKiroConnected ? "Kiro PC" : "Bridge PC"}
                </span>
              )}
            </div>
          </div>

          {remoteMitmInstance && (
            <div className="px-2 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
              Max Router sedang berjalan di Railway. Sertifikat dan DNS MITM di instance Railway tidak mengubah Windows/Kiro kamu. Untuk Kiro asli, jalankan <span className="font-mono">scripts/kiro-connect.ps1</span> di PC Windows; bridge lokal akan terdeteksi otomatis di halaman ini.
            </div>
          )}

          {localKiroConnected && (
            <div className="px-2 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-[11px] text-green-700 dark:text-green-300 leading-relaxed">
              Kiro terdeteksi di PC ini dan MITM lokal aktif: sertifikat dipercaya, DNS Kiro aktif, dan port 443 terhubung.
            </div>
          )}

          {/* Purpose & How it works */}
          <div className="px-2 py-2 rounded-lg bg-surface/50 border border-border/50 flex flex-col gap-2">
            <p className="text-[11px] text-text-muted leading-relaxed">
              <span className="font-medium text-text-main">Purpose:</span> Use Antigravity IDE & GitHub Copilot → with ANY provider/model from 9Router
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              <span className="font-medium text-text-main">How it works:</span> Kiro → DNS lokal → MITM di PC → Max Router → provider → respons kembali ke Kiro
            </p>
          </div>

          {/* Base URL + API Key — same row pattern as Claude Code / cli-tools */}
          <div className="flex flex-col gap-2">
            <div className="grid gap-1 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
              <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">9Router Base URL</span>
              <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">arrow_forward</span>
              <input
                type="text"
                value={mitmRouterBaseUrl}
                onChange={(e) => setMitmRouterBaseUrl(e.target.value)}
                placeholder={DEFAULT_MITM_ROUTER_BASE}
                disabled={isRunning}
                className="flex-1 min-w-0 px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            {!isRunning && (
              <div className="grid gap-1 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
                <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">API Key</span>
                <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">arrow_forward</span>
                <input
                  type="text"
                  list="mitm-api-keys"
                  value={selectedApiKey}
                  onChange={(e) => setSelectedApiKey(e.target.value)}
                  placeholder={cloudEnabled ? "Enter or pick API key" : "sk_9router (default)"}
                  className="flex-1 min-w-0 px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                {apiKeys?.length > 0 && (
                  <datalist id="mitm-api-keys">
                    {apiKeys.map((key) => (
                      <option key={key.id} value={key.key}>{key.name || key.key}</option>
                    ))}
                  </datalist>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-i18n-skip="true">
            {!status?.dnsStatus?.kiro && !remoteMitmInstance && !localKiroConnected && (
              <button
                onClick={() => handleAction("connect-kiro")}
                disabled={loading || !status || remoteMitmInstance || (serverIsWindows && !isAdmin)}
                title={serverIsWindows && !isAdmin ? "Administrator required" : "Start MITM, trust certificate, and enable Kiro DNS"}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">link</span>
                {kiroConnecting ? "Menghubungkan Kiro..." : "Hubungkan Kiro"}
              </button>
            )}
            {remoteMitmInstance && (
              <button
                onClick={async () => {
                  setActionError(null);
                  setKiroConnecting(true);
                  try {
                    const res = await fetch("http://127.0.0.1:3001/api/local/launch-kiro", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      throw new Error(data.error || "Bridge lokal belum berjalan");
                    }
                    setActionError(null);
                    await probeLocalBridge();
                  } catch (e) {
                    setActionError("Bridge lokal belum aktif. Jalankan Max Router/bridge di PC ini terlebih dahulu.");
                  } finally {
                    setKiroConnecting(false);
                  }
                }}
                disabled={kiroConnecting}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">code</span>
                {kiroConnecting ? "Menjalankan Kiro..." : "Jalankan Aplikasi Kiro"}
              </button>
            )}
            {localKiroConnected && (
              <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-600 sm:w-auto sm:py-1.5">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Kiro Terkoneksi
              </span>
            )}
            {status?.certExists && !status?.certTrusted && !remoteMitmInstance && (
              <button
                onClick={() => handleAction("trust-cert")}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-medium text-yellow-600 transition-colors hover:bg-yellow-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">verified_user</span>
                Trust Cert
              </button>
            )}
            {isRunning ? (
              <button
                onClick={() => handleAction("stop")}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                Stop Server
              </button>
            ) : (
              <button
                onClick={() => handleAction("start")}
                disabled={loading || !status || (serverIsWindows && !isAdmin)}
                title={serverIsWindows && !isAdmin ? "Administrator required" : undefined}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                Start Server
              </button>
            )}
            {isRunning && (
              <p className="text-xs text-text-muted">Enable DNS per tool below to activate interception</p>
            )}
          </div>

          {/* Action error */}
          {actionError && (
            <div className="flex items-start gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">error</span>
              <span>{actionError}</span>
            </div>
          )}

          {/* Windows admin warning */}
          {serverIsWindows && !isAdmin && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600 border border-red-500/20">
              <span className="material-symbols-outlined text-[14px]">shield_lock</span>
              <span>Administrator required — restart 9Router as Administrator to use MITM</span>
            </div>
          )}
        </div>
      </Card>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Sudo Password Required</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
              <p className="text-xs text-text-muted">Required for SSL certificate and server startup</p>
            </div>
            <Input
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Port 443 Conflict Modal */}
      {port443Conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Port 443 Already In Use</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <p>Port 443 is currently used by another process:</p>
                <p className="font-mono text-text-main" data-i18n-skip="true">
                  {port443Conflict.owner.name} (PID {port443Conflict.owner.pid})
                </p>
                <p>Kill this process to start MITM Server?</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPort443Conflict(null); setLoading(false); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleKillAndStart} loading={loading}>
                Kill & Start
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
