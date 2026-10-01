import { useEffect, useMemo, useState } from "react";

export default function CompatibleChatPage() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/v1/models")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        setModels(list);
        if (list[0]?.id) setModel(list[0].id);
      })
      .catch(() => {});
  }, []);

  const canSend = useMemo(() => Boolean(input.trim() && model && !busy), [input, model, busy]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ model, messages: next, stream: false }),
      });
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch {}
      if (!response.ok) {
        setMessages((current) => [...current, { role: "error", content: data?.error?.message || raw || "Request gagal" }]);
        return;
      }
      const answer = data?.choices?.[0]?.message?.content ?? data?.output_text ?? raw;
      setMessages((current) => [...current, { role: "assistant", content: String(answer || "(tidak ada respons)") }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "error", content: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold">Compatible Chat</h1>
          <p className="text-xs text-text-muted">Chat langsung melalui provider kompatibel dan key yang sudah terdaftar.</p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="max-w-[48%] rounded-lg border border-border bg-bg px-3 py-2 text-xs"
          disabled={!models.length || busy}
        >
          {!models.length && <option value="">Belum ada model</option>}
          {models.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
        </select>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {!messages.length && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <span className="material-symbols-outlined mb-3 text-4xl text-primary">chat</span>
              <h2 className="font-semibold">Mulai percakapan</h2>
              <p className="mt-1 text-sm text-text-muted">Tambahkan provider kompatibel terlebih dahulu jika daftar model masih kosong.</p>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-white" : "max-w-[85%] rounded-2xl bg-bg px-4 py-3 text-sm"}>
            <div className="mb-1 text-[10px] font-semibold uppercase opacity-60">{message.role === "error" ? "Error" : message.role}</div>
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
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
            placeholder={model ? "Tulis pesan..." : "Tambahkan provider kompatibel terlebih dahulu..."}
            className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
            disabled={!model || busy}
          />
          <button type="submit" disabled={!canSend} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {busy ? "..." : "Kirim"}
          </button>
        </div>
      </form>
    </div>
  );
}
