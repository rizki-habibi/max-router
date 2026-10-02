import { useCallback, useEffect, useMemo, useState } from "react";

export default function CompatibleChatPage() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError("");

    try {
      const response = await fetch("/api/v1/models", {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        // Keep the raw body for a useful diagnostic below.
      }

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
          data?.error ||
          raw ||
          `Gagal mengambil model (HTTP ${response.status})`,
        );
      }

      const list = Array.isArray(data?.data)
        ? data.data.filter((item) => item?.id)
        : [];

      setModels(list);
      setModel((current) =>
        current && list.some((item) => item.id === current)
          ? current
          : list[0]?.id || "",
      );

      if (!list.length) {
        setModelsError(
          "Belum ada model aktif. Tambahkan provider kompatibel terlebih dahulu.",
        );
      }
    } catch (error) {
      setModels([]);
      setModel("");
      setModelsError(
        error instanceof Error
          ? error.message
          : "Daftar model gagal dimuat.",
      );
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const canSend = useMemo(
    () => Boolean(input.trim() && model && !busy),
    [input, model, busy],
  );

  async function sendMessage(event) {
    event.preventDefault();
    if (!canSend) return;

    const text = input.trim();
    const next = [...messages, { role: "user", content: text }];
    const history = next
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map(({ role, content }) => ({ role, content }));

    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ model, messages: history, stream: false }),
      });

      const raw = await response.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        // Non-JSON upstream errors are shown as raw text.
      }

      if (!response.ok) {
        setMessages((current) => [
          ...current,
          {
            role: "error",
            content:
              data?.error?.message ||
              data?.error ||
              raw ||
              `Request gagal (HTTP ${response.status})`,
          },
        ]);
        return;
      }

      const answer =
        data?.choices?.[0]?.message?.content ??
        data?.output_text ??
        raw;

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: String(answer || "(tidak ada respons)"),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "error",
          content:
            error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Chat Kompatibel</h1>
          <p className="text-xs text-text-muted">
            Chat langsung melalui provider kompatibel dan kunci yang sudah terdaftar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadModels}
            disabled={modelsLoading}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-bg disabled:opacity-50"
            title="Muat ulang daftar model"
          >
            <span className="material-symbols-outlined align-middle text-[16px]">
              refresh
            </span>
          </button>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-[48vw] rounded-lg border border-border bg-bg px-3 py-2 text-xs"
            disabled={!models.length || busy || modelsLoading}
            aria-label="Pilih model"
          >
            {!models.length && (
              <option value="">
                {modelsLoading ? "Memuat model..." : "Belum ada model"}
              </option>
            )}
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {!messages.length && (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-md">
              {modelsError && !modelsLoading ? (
                <>
                  <span className="material-symbols-outlined mb-3 text-4xl text-danger">
                    error
                  </span>
                  <h2 className="font-semibold">Model gagal dimuat</h2>
                  <p className="mt-1 text-sm text-text-muted">{modelsError}</p>
                  <button
                    type="button"
                    onClick={loadModels}
                    disabled={modelsLoading}
                    className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
                  >
                    {modelsLoading ? "Memuat..." : "Coba lagi"}
                  </button>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined mb-3 text-4xl text-primary">
                    chat
                  </span>
                  <h2 className="font-semibold">
                    {modelsLoading ? "Memuat model..." : "Mulai percakapan"}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {modelsLoading
                      ? "Sedang mengambil daftar model dari router."
                      : "Pilih model lalu mulai percakapan."}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-white"
                : message.role === "error"
                  ? "max-w-[85%] rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm"
                  : "max-w-[85%] rounded-2xl bg-bg px-4 py-3 text-sm"
            }
          >
            <div className="mb-1 text-[10px] font-semibold uppercase opacity-60">
              {message.role === "error"
                ? "Kesalahan"
                : message.role === "assistant"
                  ? "Asisten"
                  : "Anda"}
            </div>
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="border-t border-border p-4">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-bg p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder={
              model
                ? "Tulis pesan..."
                : "Pilih provider/model terlebih dahulu..."
            }
            className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
            disabled={!model || busy || modelsLoading}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Mengirim..." : "Kirim"}
          </button>
        </div>
      </form>
    </div>
  );
}
