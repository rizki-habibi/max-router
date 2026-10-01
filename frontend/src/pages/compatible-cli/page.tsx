import { useEffect, useMemo, useState, type FormEvent } from "react";

type ModelItem = { id: string; name?: string };

export default function CompatibleTerminalPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [lines, setLines] = useState([
    { type: "system", text: "Max Router Compatible CLI" },
    { type: "system", text: "Gunakan model dari provider kompatibel yang terdaftar. Tidak memakai OAuth/provider bawaan." },
  ]);
  const [busy, setBusy] = useState(false);
  const prompt = useMemo(() => input.trim(), [input]);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/models").then((r) => r.json()).then((data) => {
      if (!active) return;
      const items = Array.isArray(data?.data) ? data.data : [];
      setModels(items);
      if (items[0]?.id) setModel((current) => current || items[0].id);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt || busy || !model) return;
    const command = prompt;
    setInput("");
    setLines((current) => [...current, { type: "input", text: "$ compatible " + command }]);
    setBusy(true);
    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ model, messages: [{ role: "user", content: command }], stream: false }),
      });
      const raw = await response.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch {}
      if (!response.ok) {
        setLines((current) => [...current, { type: "error", text: data?.error?.message || raw || ("HTTP " + response.status) }]);
        return;
      }
      const answer = data?.choices?.[0]?.message?.content ?? data?.output_text ?? raw ?? "(tidak ada respons)";
      setLines((current) => [...current, { type: "output", text: String(answer) }]);
    } catch (error) {
      setLines((current) => [...current, { type: "error", text: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ag-terminal">
      <div className="ag-terminal__top">
        <div><strong>Compatible CLI</strong><span> · Max Router</span></div>
        <span className={busy ? "ag-terminal__status busy" : "ag-terminal__status"}>{busy ? "MENJALANKAN" : "SIAP"}</span>
      </div>
      <div className="ag-terminal__toolbar">
        <label>Model</label>
        <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy || models.length === 0}>
          {models.length === 0 && <option value="">Belum ada model kompatibel</option>}
          {models.map((item) => <option key={item.id} value={item.id}>{item.name ? item.name + " · " : ""}{item.id}</option>)}
        </select>
      </div>
      <div className="ag-terminal__screen" role="log" aria-live="polite">
        {lines.map((line, index) => <div className={"ag-terminal__line ag-terminal__line--" + line.type} key={index}>{line.text}</div>)}
        {busy && <div className="ag-terminal__line ag-terminal__line--system">Provider kompatibel sedang memproses...</div>}
      </div>
      <form className="ag-terminal__prompt" onSubmit={runCommand}>
        <span>$</span>
        <input autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder="tulis pesan..." disabled={busy || !model} aria-label="Pesan Compatible CLI" />
        <button type="submit" disabled={!prompt || busy || !model}>{busy ? "..." : "Kirim"}</button>
      </form>
      <style>{`
        .ag-terminal{height:calc(100vh - 32px);display:flex;flex-direction:column;margin:16px;border:1px solid rgba(148,163,184,.25);border-radius:14px;overflow:hidden;background:#090b10;color:#d7dde8;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
        .ag-terminal__top{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#11151d;border-bottom:1px solid rgba(148,163,184,.18);font-family:Inter,system-ui,sans-serif}.ag-terminal__top span{color:#7f8a9d}.ag-terminal__status{color:#55d187!important;font-size:11px}.ag-terminal__status.busy{color:#f5b94c!important}
        .ag-terminal__toolbar{display:flex;align-items:center;gap:10px;padding:10px 18px;background:#0f131a;border-bottom:1px solid rgba(148,163,184,.12);font-family:Inter,system-ui,sans-serif}.ag-terminal__toolbar label{color:#7f8a9d;font-size:12px}.ag-terminal__toolbar select{min-width:260px;max-width:70%;background:#111923;color:#e4e9f2;border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:7px 10px}
        .ag-terminal__screen{flex:1;overflow:auto;padding:20px;white-space:pre-wrap;line-height:1.65}.ag-terminal__line{margin-bottom:10px;word-break:break-word}.ag-terminal__line--system{color:#7f8a9d}.ag-terminal__line--input{color:#8fc7ff}.ag-terminal__line--output{color:#e4e9f2}.ag-terminal__line--error{color:#ff7b7b}
        .ag-terminal__prompt{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#0f131a;border-top:1px solid rgba(148,163,184,.18)}.ag-terminal__prompt>span{color:#55d187}.ag-terminal__prompt input{flex:1;border:0;outline:0;background:transparent;color:#fff;font:inherit;min-width:0}.ag-terminal__prompt button{border:0;border-radius:8px;padding:9px 14px;background:#2563eb;color:#fff;cursor:pointer}.ag-terminal__prompt button:disabled{opacity:.45;cursor:not-allowed}
      `}</style>
    </div>
  );
}
