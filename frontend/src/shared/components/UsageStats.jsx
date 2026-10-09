
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  if (id === "leonardo" || id === "weavy") return true;
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}
import Badge from "./Badge";
import Card from "./Card";
import OverviewCards from "@/pages/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/pages/usage/components/UsageTable";
import ProviderTopology from "@/pages/usage/components/ProviderTopology";
import UsageChart from "@/pages/usage/components/UsageChart";

function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every second without re-rendering parent
function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  
  return <>{timeAgo(timestamp)}</>;
}

function RecentRequests({ requests = [] }) {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" padding="sm" style={{ height: 480 }}>
      {/* Header */}
      <div className="px-1 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Recent Requests</span>
      </div>

      {!requests.length ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">No requests yet.</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full min-w-[300px] border-collapse text-xs">
            <thead className="sticky top-0 bg-bg z-10">
              <tr className="border-b border-border">
                <th className="py-1.5 text-left font-semibold text-text-muted w-2"></th>
                <th className="py-1.5 text-left font-semibold text-text-muted">Model</th>
                <th className="py-1.5 text-right font-semibold text-text-muted whitespace-nowrap">In / Out</th>
                <th className="py-1.5 text-right font-semibold text-text-muted">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {requests.map((r, i) => {
                const ok = !r.status || r.status === "ok" || r.status === "success";
                return (
                  <tr key={i} className="hover:bg-bg-subtle transition-colors">
                    <td className="py-1.5">
                      <span className={`block w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-error"}`} />
                    </td>
                    <td className="py-1.5 font-mono truncate max-w-[120px]" title={r.model}>{r.model}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <span className="text-primary">{fmt(r.promptTokens)}↑</span>
                      {" "}
                      <span className="text-success">{fmt(r.completionTokens)}↓</span>
                    </td>
                    <td className="py-1.5 text-right text-text-muted whitespace-nowrap"><TimeAgo timestamp={r.timestamp} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}


function TokenSpaceArcade({ requests = [], period = "today" }) {
  const [enabled, setEnabled] = useState(true);
  const [shots, setShots] = useState(0);
  const [pilotX, setPilotX] = useState(0.5);
  const [lastSeen, setLastSeen] = useState("");
  const canvasRef = useRef(null);
  const gameRef = useRef({ enemies: [], lasers: [], particles: [], lastFrame: 0, lastShot: 0, width: 0, height: 0, pilotX: 0.5, score: 0, raf: 0 });
  const recent = Array.isArray(requests) ? requests : [];
  const totalTokens = recent.reduce((sum, r) => sum + (Number(r.promptTokens) || 0) + (Number(r.completionTokens) || 0), 0);
  const successful = recent.filter((r) => !r.status || ["ok", "success", "200"].includes(String(r.status).toLowerCase())).length;
  const successRate = recent.length ? Math.round((successful / recent.length) * 100) : 0;
  const requestSignature = recent.map((request) => request.id ?? [request.timestamp, request.model, request.provider, request.promptTokens, request.completionTokens].join(":")).join("|");
  const seenRequestsRef = useRef(null);

  // A shot represents a completed, successful response from the router, not an idle animation.
  useEffect(() => {
    if (!recent.length) return;
    const getId = (request) => String(request.id ?? [request.timestamp, request.model, request.provider, request.promptTokens, request.completionTokens].join(":"));
    const isSuccessful = (request) => {
      const status = String(request.status ?? "ok").toLowerCase();
      return ["ok", "success", "200", "completed"].includes(status);
    };
    const currentIds = new Set(recent.map(getId));

    // Seed the list on first load; only responses arriving after the page is open trigger shots.
    if (seenRequestsRef.current === null) {
      seenRequestsRef.current = currentIds;
      return;
    }

    const previousIds = seenRequestsRef.current;
    const newlyCompleted = recent
      .filter((request) => !previousIds.has(getId(request)) && isSuccessful(request))
      .reverse();

    newlyCompleted.forEach((request) => {
      const game = gameRef.current;
      const x = game.width * game.pilotX;
      game.lasers.push({ x, y: game.height - 76, speed: 620, power: Math.max(1, Number(request.completionTokens) || 1), fresh: true });
      game.particles.push(...Array.from({ length: 8 }, (_, i) => ({
        x, y: game.height - 70,
        vx: Math.cos(i * Math.PI / 4) * 55,
        vy: Math.sin(i * Math.PI / 4) * 55,
        life: .55, color: "#69f5ff",
      })));
      setShots((value) => value + 1);
    });

    // Remember all observed IDs (including failed responses) so they never fire later by accident.
    seenRequestsRef.current = currentIds;
  }, [requestSignature]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const game = gameRef.current;
    let active = true;
    let lastSpawn = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      game.width = Math.max(320, rect.width);
      game.height = Math.max(260, rect.height);
      canvas.width = Math.floor(game.width * dpr);
      canvas.height = Math.floor(game.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    const spawnEnemy = (x = Math.random() * .84 + .08, type = Math.floor(Math.random() * 4)) => {
      game.enemies.push({ x: x * game.width, y: -25, baseX: x * game.width, phase: Math.random() * 7, speed: 22 + Math.random() * 26, type, hp: 1 + (type === 3 ? 1 : 0), radius: 13 + Math.random() * 5 });
    };
    for (let i = 0; i < 9; i++) spawnEnemy(.09 + (i % 9) * .1, i % 4);
    const drawShip = (x, y) => {
      ctx.save(); ctx.translate(x, y);
      ctx.shadowColor = "#51e8ff"; ctx.shadowBlur = 18;
      ctx.fillStyle = "#ff9d45"; ctx.beginPath(); ctx.moveTo(-9, 17); ctx.lineTo(-3, 5); ctx.lineTo(0, 18); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9, 17); ctx.lineTo(3, 5); ctx.lineTo(0, 18); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 7; ctx.fillStyle = "#f7fbff"; ctx.strokeStyle = "#101936"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(16, 8); ctx.lineTo(6, 6); ctx.lineTo(0, 15); ctx.lineTo(-6, 6); ctx.lineTo(-16, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#45dfff"; ctx.beginPath(); ctx.ellipse(0, -4, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const drawEnemy = (enemy, time) => {
      const x = enemy.x + Math.sin(time * .0016 + enemy.phase) * 17;
      const y = enemy.y;
      const colors = ["#5ef0b7", "#ff70d8", "#ffd166", "#79a7ff"];
      const color = colors[enemy.type % colors.length];
      ctx.save(); ctx.translate(x, y); ctx.shadowColor = color; ctx.shadowBlur = 13;
      ctx.fillStyle = color; ctx.strokeStyle = "#101936"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(-enemy.radius, -enemy.radius * .68, enemy.radius * 2, enemy.radius * 1.45, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#121a3c";
      ctx.fillRect(-enemy.radius * .58, -enemy.radius * .25, 4, 6);
      ctx.fillRect(enemy.radius * .2, -enemy.radius * .25, 4, 6);
      ctx.strokeStyle = "#121a3c"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-enemy.radius * .4, enemy.radius * .45); ctx.lineTo(0, enemy.radius * .58); ctx.lineTo(enemy.radius * .4, enemy.radius * .45); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-enemy.radius * .9, enemy.radius * .55, 4, 6);
      ctx.fillRect(enemy.radius * .55, enemy.radius * .55, 4, 6);
      ctx.restore();
      enemy.drawX = x;
    };
    const draw = (time) => {
      if (!active) return;
      const dt = Math.min(.04, game.lastFrame ? (time - game.lastFrame) / 1000 : .016);
      game.lastFrame = time;
      const w = game.width, h = game.height;
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#090f2c"); bg.addColorStop(.55, "#17285b"); bg.addColorStop(1, "#253e7a");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 82; i++) {
        const x = (i * 97.13) % w;
        const y = ((i * 53.7 + time * (.008 + (i % 3) * .004)) % h);
        ctx.globalAlpha = .25 + (i % 5) * .13;
        ctx.fillStyle = i % 7 === 0 ? "#ffd166" : "#c5e9ff";
        ctx.fillRect(x, y, i % 9 === 0 ? 2.5 : 1.5, i % 9 === 0 ? 2.5 : 1.5);
      }
      ctx.globalAlpha = 1;
      // Animated planet and its rings
      const px = w * .82, py = h * .28, pr = Math.min(40, w * .07);
      const planet = ctx.createRadialGradient(px - pr * .35, py - pr * .4, 2, px, py, pr);
      planet.addColorStop(0, "#e4b8ff"); planet.addColorStop(.55, "#9668e8"); planet.addColorStop(1, "#423b9b");
      ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(151,224,255,.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py + 5, pr * 1.45, pr * .36, -.18, 0, Math.PI * 2); ctx.stroke();

      if (enabled) {
        if (time - lastSpawn > Math.max(520, 1350 - Math.min(shots, 15) * 40)) { spawnEnemy(); lastSpawn = time; }
      }
      game.enemies = game.enemies.filter((enemy) => enemy.y < h + 35 && enemy.hp > 0);
      game.enemies.forEach((enemy) => {
        if (enabled) { enemy.y += enemy.speed * dt; enemy.x = enemy.baseX + Math.sin(time * .001 + enemy.phase) * 22; }
        drawEnemy(enemy, time);
      });
      game.lasers = game.lasers.filter((laser) => laser.y > -25);
      game.lasers.forEach((laser) => {
        if (enabled) laser.y -= laser.speed * dt;
        ctx.save(); ctx.strokeStyle = laser.fresh ? "#ffffff" : "#56eaff"; ctx.shadowColor = "#58efff"; ctx.shadowBlur = laser.fresh ? 22 : 10;
        ctx.lineWidth = laser.fresh ? 4 : 2; ctx.beginPath(); ctx.moveTo(laser.x, laser.y + 13); ctx.lineTo(laser.x, laser.y - (laser.fresh ? 29 : 19)); ctx.stroke(); ctx.restore();
        for (const enemy of game.enemies) {
          if (Math.abs((enemy.drawX || enemy.x) - laser.x) < enemy.radius + 7 && Math.abs(enemy.y - laser.y) < enemy.radius + 15) {
            enemy.hp -= 1; laser.y = -100;
            if (enemy.hp <= 0) {
              game.score += 10;
              for (let j = 0; j < 7; j++) game.particles.push({ x: enemy.drawX || enemy.x, y: enemy.y, vx: (Math.random() - .5) * 100, vy: (Math.random() - .5) * 100, life: .45, color: ["#62f2bd", "#ff78d9", "#ffd166"][enemy.type % 3] });
            }
            break;
          }
        }
      });
      game.particles = game.particles.filter((p) => p.life > 0);
      game.particles.forEach((p) => {
        if (enabled) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
        ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3);
      });
      ctx.globalAlpha = 1;
      drawShip(w * game.pilotX, h - 48 + Math.sin(time * .004) * 3);
      ctx.fillStyle = "rgba(5,10,30,.72)"; ctx.fillRect(12, h - 31, w - 24, 20);
      ctx.fillStyle = "#bfeaff"; ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText("SKOR " + game.score + "  •  TEMBAKAN " + shots + "  •  " + (enabled ? "SISTEM AKTIF" : "JEDA"), 22, h - 17);
      game.raf = requestAnimationFrame(draw);
    };
    game.raf = requestAnimationFrame(draw);
    return () => { active = false; cancelAnimationFrame(game.raf); observer?.disconnect(); };
  }, [enabled, shots]);

  useEffect(() => { gameRef.current.pilotX = pilotX; }, [pilotX]);
  const movePilot = (event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPilotX(Math.max(.06, Math.min(.94, (event.clientX - rect.left) / rect.width)));
  };
  const days = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (83 - index));
    const dayKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    const count = recent.filter((r) => {
      const stamp = r.timestamp ? new Date(r.timestamp) : null;
      return stamp && !Number.isNaN(stamp.getTime()) && [stamp.getFullYear(), String(stamp.getMonth() + 1).padStart(2, "0"), String(stamp.getDate()).padStart(2, "0")].join("-") === dayKey;
    }).length;
    return { date, count, dayKey };
  });
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  return (
    <section className="mr-token-arcade flex min-w-0 flex-col gap-4" aria-label="Permainan penggunaan token">
      <div className="mr-token-game-shell relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mr-token-kicker">MODE ARKADE · PERTAHANAN GALAKSI</div>
            <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">Pilot AI: Serangan Token</h2>
            <p className="mt-1 text-sm opacity-80">Alien bergerak di galaksi. Pesawat hanya menembak saat Max Router menerima respons AI yang berhasil.</p>
          </div>
          <button type="button" onClick={() => setEnabled((value) => !value)} className="mr-token-toggle rounded-xl border-2 px-3 py-2 text-sm font-bold">
            {enabled ? "Jeda permainan" : "Lanjut bermain"}
          </button>
        </div>
        <div className="mr-token-battle mr-token-battle-canvas relative mt-4 overflow-hidden rounded-xl border-2">
          <canvas ref={canvasRef} className="mr-token-game-canvas" onPointerMove={movePilot} onPointerDown={movePilot} aria-label="Permainan pesawat. Gerakkan tetikus atau sentuh layar untuk mengendalikan pesawat." />
          <div className="mr-token-stat mr-token-stat-left">
            <span>TOKEN TERCATAT</span><strong>{fmt(totalTokens)}</strong>
            <small>{recent.length} permintaan tersedia</small>
          </div>
          <div className="mr-token-stat mr-token-stat-right">
            <span>KEBERHASILAN</span><strong>{recent.length ? successRate + "%" : "—"}</strong>
            <small>{successful} permintaan berhasil</small>
          </div>
          <div className="mr-token-game-hint">GERAKKAN KURSOR UNTUK MENGENDALIKAN PESAWAT</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="mr-token-live-dot">{recent.length ? "Data permintaan tersambung" : "Menunggu permintaan AI"}</span>
          <span className="opacity-70">Tembakan mengikuti respons AI yang berhasil</span>
        </div>
      </div>
      <div className="mr-token-heatmap rounded-2xl border-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-extrabold">Peta Aktivitas Token</h3><p className="mt-1 text-sm opacity-70">Setiap kotak mewakili aktivitas permintaan yang masih tersedia di data.</p></div>
          <span className="mr-token-heatmap-total">{recent.length} permintaan terbaru</span>
        </div>
        <div className="mr-token-heatmap-grid mt-4" role="img" aria-label="Peta aktivitas harian berdasarkan permintaan terbaru">
          {days.map((day) => {
            const level = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / maxCount) * 4));
            return <span key={day.dayKey} className={`mr-token-heat mr-token-heat-${level}`} title={`${day.dayKey}: ${day.count} permintaan dalam data yang tersedia`} />;
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs opacity-75">
          <span>Warna hijau menunjukkan jumlah permintaan per hari</span>
          <span className="flex items-center gap-1.5">Sedikit {[0,1,2,3,4].map((level) => <i key={level} className={`mr-token-heat mr-token-heat-${level}`} />)} Banyak</span>
        </div>
        <p className="mt-2 text-xs opacity-60">Hari tanpa data ditampilkan kosong; riwayat lengkap memerlukan agregasi dari backend.</p>
      </div>
    </section>
  );
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      const inputCost = totalTokens > 0 ? (data.promptTokens || 0) * (totalCost / totalTokens) : 0;
      const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return { ...data, key, totalTokens, totalCost, inputCost, outputCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown Model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account";
    case "keyName": return item.keyName || "Unknown Key";
    case "endpoint": return item.endpoint || "Unknown Endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data, keyField) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, inputCost: 0, outputCost: 0, lastUsed: null, pending: 0 },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.outputCost += item.outputCost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

function normalizeStatsData(data) {
  if (!data) return data;
  const next = { ...data };

  // 1. Normalize byProvider
  if (next.byProvider) {
    next.byProvider = { ...next.byProvider };
    if (next.byProvider.cb) {
      if (!next.byProvider.codebuddy) {
        next.byProvider.codebuddy = next.byProvider.cb;
      } else {
        const cb = next.byProvider.cb;
        const codebuddy = next.byProvider.codebuddy;
        next.byProvider.codebuddy = {
          requests: (codebuddy.requests || 0) + (cb.requests || 0),
          promptTokens: (codebuddy.promptTokens || 0) + (cb.promptTokens || 0),
          completionTokens: (codebuddy.completionTokens || 0) + (cb.completionTokens || 0),
          cost: (codebuddy.cost || 0) + (cb.cost || 0),
        };
      }
      delete next.byProvider.cb;
    }
  }

  // 2. Normalize byModel (change suffix (cb) to (codebuddy))
  if (next.byModel) {
    next.byModel = Object.fromEntries(
      Object.entries(next.byModel).map(([key, modelData]) => {
        if (key.endsWith(" (cb)")) {
          const newKey = key.slice(0, -5) + " (codebuddy)";
          return [newKey, { ...modelData, provider: "CodeBuddy" }];
        }
        return [key, modelData];
      })
    );
  }

  // 3. Normalize byAccount
  if (next.byAccount) {
    next.byAccount = Object.fromEntries(
      Object.entries(next.byAccount).map(([key, accData]) => {
        if (accData.provider === "cb" || accData.provider === "Codebuddy" || accData.provider === "codebuddy") {
          return [key, { ...accData, provider: "CodeBuddy" }];
        }
        return [key, accData];
      })
    );
  }

  // 4. Normalize recentRequests provider name
  if (Array.isArray(next.recentRequests)) {
    next.recentRequests = next.recentRequests.map(r => {
      if (r.provider === "cb") return { ...r, provider: "codebuddy" };
      return r;
    });
  }

  return next;
}

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Fetch connected providers once, deduplicate by provider type
  // Always include noAuth free providers (e.g. opencode) regardless of connections
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const seen = new Set();
        const unique = (d?.connections || []).filter((c) => {
          if (c.isActive === false) return false;
          if (!isLLMProvider(c.provider)) return false;
          if (seen.has(c.provider)) return false;
          seen.add(c.provider);
          return true;
        });
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
  }, []);

  // Fetch filtered stats via REST when period changes
  useEffect(() => {
    // First load: show full spinner; subsequent: show subtle fetching indicator
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    fetch(`/api/usage/stats?period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          const normalized = normalizeStatsData(data);
          setStats((prev) => ({ ...prev, ...normalized }));
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE connection - real-time updates for all stats (requests, costs, tokens) matching current period
  useEffect(() => {
    const es = new EventSource(`/api/usage/stream?period=${period}`);

    es.onmessage = (e) => {
      try {
        const rawData = JSON.parse(e.data);
        const data = normalizeStatsData(rawData);
        setStats(data);
        setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoading(false);

    return () => es.close();
  }, [period]);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    navigate(`?${params.toString()}`, { scroll: false });
  }, [searchParams, navigate]);

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium">{item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
          )}
        </div>
      )}

      {/* Overview cards */}
      {loading ? spinner : <OverviewCards stats={stats} />}

      {/* Space-shooter token activity and GitHub-style contribution heatmap */}
      {loading ? null : <TokenSpaceArcade requests={stats?.recentRequests || []} period={period} />}

      {/* Provider topology + Recent Requests */}
      {loading ? spinner : (
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <ProviderTopology
            providers={providers}
            activeRequests={stats.activeRequests || []}
            lastProvider={stats.recentRequests?.[0]?.provider || ""}
            errorProvider={stats.errorProvider || ""}
          />
          <RecentRequests requests={stats.recentRequests || []} />
        </div>
      )}

      {/* Token / Cost chart - sync period */}
      {loading ? spinner : <UsageChart period={period} lastRequestTime={stats?.recentRequests?.[0]?.timestamp} />}

      {/* Table with dropdown selector */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={tableView}
            onChange={(e) => setTableView(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 sm:w-auto"
            style={{ colorScheme: 'auto' }}
          >
            {TABLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex">
            <button
              onClick={() => setViewMode("costs")}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "costs" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              Costs
            </button>
            <button
              onClick={() => setViewMode("tokens")}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              Tokens
            </button>
          </div>
        </div>
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
