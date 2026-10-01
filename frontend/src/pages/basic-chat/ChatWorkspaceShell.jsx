import { useEffect, useMemo, useState } from "react";

const STORAGE_KEYS = {
  sessions: "basic-chat.sessions",
  activeSessionId: "basic-chat.activeSessionId",
  activeProviderId: "basic-chat.activeProviderId",
  draft: "basic-chat.draft",
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readSessions() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") return value.message || value.error || JSON.stringify(value);
  return String(value);
}

export default function ChatWorkspaceShell({ children }) {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [automationOpen, setAutomationOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [providerModels, setProviderModels] = useState([]);

  useEffect(() => {
    setSessions(readSessions());
    setActiveId(localStorage.getItem(STORAGE_KEYS.activeSessionId) || "");
  }, []);

  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    [sessions]
  );

  const syncFromStorage = () => {
    setSessions(readSessions());
    setActiveId(localStorage.getItem(STORAGE_KEYS.activeSessionId) || "");
  };

  const newChat = () => {
    const current = sessions.find((item) => item.id === activeId);
    const modelId = current?.modelId || "";
    const providerId = current?.providerId || "";
    const session = {
      id: createId(),
      title: "Chat baru",
      providerId,
      providerName: current?.providerName || "",
      modelId,
      modelName: current?.modelName || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    const next = [session, ...sessions];
    saveSessions(next);
    localStorage.setItem(STORAGE_KEYS.activeSessionId, session.id);
    localStorage.removeItem(STORAGE_KEYS.draft);
    setSessions(next);
    setActiveId(session.id);
    window.location.reload();
  };

  const selectChat = (id) => {
    localStorage.setItem(STORAGE_KEYS.activeSessionId, id);
    setActiveId(id);
    window.location.reload();
  };

  const runAntigravitySweep = async () => {
    setAutomationOpen(true);
    setRunning(true);
    setResults([]);

    try {
      const providersResponse = await fetch("/api/providers", { cache: "no-store" });
      const providers = await providersResponse.json().catch(() => ({}));
      const connection = (providers.connections || []).find((item) => item.provider === "antigravity");

      if (!connection) {
        setResults([{ model: "Antigravity", status: "error", message: "Koneksi Antigravity tidak ditemukan." }]);
        return;
      }

      const modelsResponse = await fetch(`/api/providers/${connection.id}/models`, { cache: "no-store" });
      const modelData = await modelsResponse.json().catch(() => ({}));
      if (!modelsResponse.ok) {
        setResults([{ model: "Antigravity", status: "error", message: textValue(modelData.error) || `HTTP ${modelsResponse.status}` }]);
        return;
      }

      const models = Array.isArray(modelData.models) ? modelData.models : [];
      const normalized = models.map((model) => ({
        id: typeof model === "string" ? model : model.id || model.model || model.name,
        name: typeof model === "string" ? model : model.name || model.displayName || model.id,
      })).filter((model) => model.id);

      setProviderModels(normalized);
      setResults(normalized.map((model) => ({ ...model, status: "waiting", message: "Menunggu..." })));

      for (let index = 0; index < normalized.length; index += 1) {
        const model = normalized[index];
        setResults((current) => current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, status: "running", message: "Menguji..." } : item
        ));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const started = Date.now();

        try {
          const response = await fetch("/api/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model: `antigravity/${model.id}`,
              messages: [{ role: "user", content: "Reply with exactly: OK" }],
              stream: false,
              temperature: 0,
            }),
          });
          const raw = await response.text();
          let payload = null;
          try { payload = raw ? JSON.parse(raw) : null; } catch {}
          const message = textValue(payload?.choices?.[0]?.message?.content || payload?.error?.message || payload?.error || raw).slice(0, 300);

          setResults((current) => current.map((item, itemIndex) =>
            itemIndex === index ? {
              ...item,
              status: response.ok ? "success" : "error",
              durationMs: Date.now() - started,
              message: message || (response.ok ? "Model merespons." : `HTTP ${response.status}`),
            } : item
          ));
        } catch (error) {
          setResults((current) => current.map((item, itemIndex) =>
            itemIndex === index ? {
              ...item,
              status: "error",
              durationMs: Date.now() - started,
              message: error?.name === "AbortError" ? "Timeout 30 detik." : textValue(error?.message || error),
            } : item
          ));
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full bg-[#212121] text-white">
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-white/10 bg-[#171717] md:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-semibold">Chats</p>
            <p className="text-[10px] text-white/35">Max Router</p>
          </div>
          <button type="button" onClick={newChat} className="flex size-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/15" title="Chat baru">
            <span className="material-symbols-outlined text-[19px]">edit_square</span>
          </button>
        </div>

        <button type="button" onClick={newChat} className="mx-3 mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/10">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Chat baru
        </button>

        <div className="flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar">
          {orderedSessions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-white/35">Belum ada percakapan.</p>
          ) : orderedSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => selectChat(session.id)}
              className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left transition ${session.id === activeId ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              <p className="truncate text-sm text-white/90">{session.title || "Chat baru"}</p>
              <p className="mt-1 truncate text-[10px] text-white/35">{session.modelName || "Pilih model"}</p>
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={runAntigravitySweep}
            disabled={running}
            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs text-white/75 hover:bg-white/10 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">fact_check</span>
            <span><span className="block font-medium text-white">Uji semua Antigravity</span><span className="block text-[10px] text-white/35">Tes setiap model otomatis</span></span>
          </button>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">{children}</main>

      {automationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#202020] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Uji semua model Antigravity</h2>
                <p className="mt-1 text-xs text-white/40">{providerModels.length} model terdeteksi</p>
              </div>
              <button type="button" onClick={() => setAutomationOpen(false)} className="flex size-8 items-center justify-center rounded-lg bg-white/5 text-white/55 hover:bg-white/10">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-4 custom-scrollbar">
              {results.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">Tekan tombol uji untuk menjalankan pemeriksaan.</p>
              ) : results.map((result) => (
                <div key={result.id || result.model} className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/90">{result.name || result.model}</p>
                    <p className="truncate text-[11px] text-white/35">{result.message}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${result.status === "success" ? "bg-emerald-500/15 text-emerald-300" : result.status === "error" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>
                    {result.status === "success" ? "LULUS" : result.status === "error" ? "GAGAL" : "UJI"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button type="button" onClick={() => setAutomationOpen(false)} className="rounded-xl bg-white/5 px-4 py-2 text-xs text-white/70">Tutup</button>
              <button type="button" onClick={runAntigravitySweep} disabled={running} className="rounded-xl bg-white px-4 py-2 text-xs font-medium text-black disabled:opacity-40">{running ? "Menguji..." : "Uji ulang"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
