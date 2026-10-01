import { useMemo, useState, type FormEvent } from "react";

const MODEL = "ag/claude-opus-4-6-thinking";

export default function AntigravityTerminalPage() {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState([
    { type: "system", text: "Max Router Antigravity CLI" },
    { type: "system", text: "Ketik pesan lalu tekan Enter. Provider: Antigravity · Model: " + MODEL.replace("ag/", "") },
  ]);
  const [busy, setBusy] = useState(false);

  const prompt = useMemo(() => input.trim(), [input]);

  async function runCommand(event: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!prompt || busy) return;

    const command = prompt;
    setInput("");
    setLines((current) => [...current, { type: "input", text: "$ antigravity " + command }]);
    setBusy(true);

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: command }],
          stream: false,
        }),
      });

      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }

      if (!response.ok) {
        const message = data?.error?.message || raw || ("HTTP " + response.status);
        setLines((current) => [...current, { type: "error", text: message }]);
        return;
      }

      const answer =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        raw ??
        "(tidak ada respons)";

      setLines((current) => [...current, { type: "output", text: String(answer) }]);
    } catch (error) {
      setLines((current) => [
        ...current,
        { type: "error", text: error instanceof Error ? error.message : String(error) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ag-terminal">
      <div className="ag-terminal__top">
        <div>
          <strong>Antigravity CLI</strong>
          <span> · Max Router</span>
        </div>
        <span className={busy ? "ag-terminal__status busy" : "ag-terminal__status"}>
          {busy ? "MENJALANKAN" : "SIAP"}
        </span>
      </div>

      <div className="ag-terminal__screen" role="log" aria-live="polite">
        {lines.map((line, index) => (
          <div className={"ag-terminal__line ag-terminal__line--" + line.type} key={index}>
            {line.text}
          </div>
        ))}
        {busy && <div className="ag-terminal__line ag-terminal__line--system">Antigravity sedang memproses...</div>}
      </div>

      <form className="ag-terminal__prompt" onSubmit={runCommand}>
        <span>$</span>
        <input
          autoFocus
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="tulis perintah atau pesan..."
          disabled={busy}
          aria-label="Perintah Antigravity"
        />
        <button type="submit" disabled={!prompt || busy}>{busy ? "..." : "Kirim"}</button>
      </form>

      <style>{`
        .ag-terminal { height: calc(100vh - 32px); display:flex; flex-direction:column; margin:16px; border:1px solid rgba(148,163,184,.25); border-radius:14px; overflow:hidden; background:#090b10; color:#d7dde8; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; box-shadow:0 16px 50px rgba(0,0,0,.25); }
        .ag-terminal__top { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:#11151d; border-bottom:1px solid rgba(148,163,184,.18); font-family:Inter,system-ui,sans-serif; }
        .ag-terminal__top span { color:#7f8a9d; }
        .ag-terminal__status { color:#55d187 !important; font-size:11px; letter-spacing:.08em; }
        .ag-terminal__status.busy { color:#f5b94c !important; }
        .ag-terminal__screen { flex:1; overflow:auto; padding:20px; white-space:pre-wrap; line-height:1.65; }
        .ag-terminal__line { margin-bottom:10px; word-break:break-word; }
        .ag-terminal__line--system { color:#7f8a9d; }
        .ag-terminal__line--input { color:#8fc7ff; }
        .ag-terminal__line--output { color:#e4e9f2; }
        .ag-terminal__line--error { color:#ff7b7b; }
        .ag-terminal__prompt { display:flex; align-items:center; gap:10px; padding:14px 18px; background:#0f131a; border-top:1px solid rgba(148,163,184,.18); }
        .ag-terminal__prompt > span { color:#55d187; }
        .ag-terminal__prompt input { flex:1; border:0; outline:0; background:transparent; color:#fff; font:inherit; min-width:0; }
        .ag-terminal__prompt button { border:0; border-radius:8px; padding:9px 14px; background:#2563eb; color:#fff; cursor:pointer; }
        .ag-terminal__prompt button:disabled { opacity:.45; cursor:not-allowed; }
      `}</style>
    </div>
  );
}
