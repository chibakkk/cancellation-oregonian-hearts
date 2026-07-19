import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGame } from "../context/useGame";
import type { StoredResult } from "../types/coh";

const SESSION_STORAGE_KEY = "coh:session";

type StoredSessionSummary = {
  roomId: string;
};

function loadResults(): StoredResult[] {
  try {
    return JSON.parse(localStorage.getItem("coh:results") ?? "[]") as StoredResult[];
  } catch {
    return [];
  }
}

function loadStoredSession(): StoredSessionSummary | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredSessionSummary>;
    return parsed.roomId ? { roomId: parsed.roomId } : null;
  } catch {
    return null;
  }
}

function MiniCard({
  rank,
  suit,
  tone,
  transform,
}: {
  rank: string;
  suit: string;
  tone: "dark" | "red" | "orange" | "green";
  transform: string;
}) {
  const color =
    tone === "red"
      ? "text-rose-600"
      : tone === "orange"
        ? "text-amber-600"
        : tone === "green"
          ? "text-emerald-700"
          : "text-slate-950";

  return (
    <div
      className={`absolute left-1/2 top-1/2 h-40 w-28 rounded-md border border-slate-200 bg-white p-3 shadow-xl ${color}`}
      style={{ transform }}
    >
      <div className="text-lg font-black leading-none">{rank}</div>
      <div className="mt-1 text-2xl leading-none">{suit}</div>
      <div className="absolute bottom-3 right-3 rotate-180 text-lg font-black leading-none">
        {rank}
      </div>
      <div className="absolute bottom-8 right-3 rotate-180 text-2xl leading-none">
        {suit}
      </div>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-white/15 bg-white/10 px-3 py-2 backdrop-blur">
      <div className="text-xl font-black text-white">{value}</div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100/70">
        {label}
      </div>
    </div>
  );
}

export function NewHome() {
  const navigate = useNavigate();
  const { joinRoom, isConnected, connectionStatus } = useGame();
  const [playerName, setPlayerName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useMemo(loadResults, []);
  const storedSession = useMemo(loadStoredSession, []);

  const validateCommon = (password: string) => {
    if (!playerName.trim()) {
      return "プレイヤー名を入力してください";
    }
    if (!/^\d{4}$/.test(password)) {
      return "パスワードは4桁の数字で入力してください";
    }
    return null;
  };

  const handleJoin = (event: SyntheticEvent) => {
    event.preventDefault();
    const validation = validateCommon(joinPassword);
    if (validation) {
      setError(validation);
      return;
    }
    if (!/^[A-Z0-9]{5}$/.test(roomId)) {
      setError("ルームIDは5文字の英数字で入力してください");
      return;
    }

    setBusy(true);
    setError(null);
    joinRoom(
      { roomId, password: joinPassword, playerName: playerName.trim() },
      (response) => {
        setBusy(false);
        if (response.error) {
          setError(response.error);
          return;
        }
        navigate("/game");
      }
    );
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#06382f,#0f766e_48%,#fde68a_160%)] px-4 py-5 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-7xl gap-4 lg:h-[calc(100vh-2.5rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="relative overflow-hidden rounded-md border border-white/15 bg-emerald-950 shadow-2xl lg:min-h-0">
          <div className="absolute inset-6 rounded-full border border-emerald-700/70 bg-emerald-800/55 shadow-inner" />
          <div className="absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent)]" />

          <div className="relative z-10 flex min-h-full flex-col p-6 text-white md:p-8">
            <header className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-100/70">
                  Trick-taking for 4-10 players
                </p>
                <h1 className="mt-3 max-w-4xl font-brand text-5xl font-black leading-[0.95] text-white [text-shadow:0_6px_18px_rgba(0,0,0,0.28)] md:text-7xl">
                  Cancellation{" "}
                  <span className="block">Oregonian Hearts</span>
                </h1>
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-50/75">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm text-rose-600 shadow-sm">
                    ♥
                  </span>
                  キャンセレーション オレゴニアンハーツ
                </p>
              </div>
              <div
                data-testid="home-connection-status"
                className="shrink-0 rounded-md border border-white/20 bg-white/12 px-3 py-2 text-sm font-semibold text-emerald-50 backdrop-blur"
              >
                {connectionStatus}
              </div>
            </header>

            <div className="relative mt-8 flex flex-1 items-center justify-center py-10">
              <div className="relative h-72 w-full max-w-lg">
                <MiniCard
                  rank="Q"
                  suit="♠"
                  tone="dark"
                  transform="translate(-178%, -42%) rotate(-12deg)"
                />
                <MiniCard
                  rank="10"
                  suit="♥"
                  tone="red"
                  transform="translate(-78%, -58%) rotate(6deg)"
                />
                <MiniCard
                  rank="A"
                  suit="♦"
                  tone="orange"
                  transform="translate(18%, -35%) rotate(12deg)"
                />
                <MiniCard
                  rank="K"
                  suit="♣"
                  tone="green"
                  transform="translate(112%, -52%) rotate(-3deg)"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatPill value="104" label="cards" />
              <StatPill value="4-10" label="players" />
              <StatPill value="2" label="decks" />
            </div>
          </div>
        </section>

        <section className="rounded-md border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur md:p-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                data-testid="join-room-heading"
                className="text-2xl font-black"
              >
                ルームに参加
              </h2>
              <p className="mt-1 text-sm text-slate-500">招待されたルームIDでそのまま参加できます</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              {isConnected ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          {storedSession && (
            <section className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
                    前回のルーム
                  </div>
                  <div className="mt-1 font-mono text-lg font-black text-slate-950">
                    {storedSession.roomId}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="resume-session-button"
                  className="shrink-0 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
                  disabled={!isConnected}
                  onClick={() => navigate("/game")}
                >
                  復帰
                </button>
              </div>
            </section>
          )}

          {error && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <form className="mt-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleJoin}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-950">参加情報</h3>
              <span className="text-xs font-bold text-slate-400">GUEST</span>
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-bold text-slate-700">プレイヤー名</span>
              <input
                data-testid="player-name-input"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={playerName}
                maxLength={20}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="プレイヤー名"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_0.72fr]">
              <label className="block">
                <span className="text-sm font-bold text-slate-600">ルームID</span>
                <input
                  data-testid="room-id-input"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 font-mono text-lg uppercase tracking-[0.22em] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={roomId}
                  maxLength={5}
                  onChange={(event) =>
                    setRoomId(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                  placeholder="ABCDE"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-600">4桁パスワード</span>
                <input
                  data-testid="join-password-input"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 font-mono text-lg tracking-[0.3em] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={joinPassword}
                  maxLength={4}
                  inputMode="numeric"
                  onChange={(event) =>
                    setJoinPassword(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="0000"
                />
              </label>
            </div>
            <button
              type="submit"
              data-testid="join-room-button"
              className="mt-4 w-full rounded-md bg-slate-950 px-4 py-3 font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!isConnected || busy}
            >
              {busy ? "参加中..." : "ルームに参加"}
            </button>
          </form>

          <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
            <p className="text-sm font-semibold text-slate-600">まだルームがない場合</p>
            <Link
              to="/create-room"
              data-testid="create-room-button"
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-3 font-black text-slate-950 shadow-sm transition hover:bg-slate-50"
            >
              ルームを作成する
            </Link>
            <Link
              to="/rules"
              data-testid="rules-link"
              className="mt-2 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50"
            >
              ルールを見る
            </Link>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">直近の戦績</h3>
              <span className="text-xs font-semibold text-slate-400">{results.length}/5</span>
            </div>
            <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {results.length === 0 && (
                <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  まだ保存された戦績はありません。
                </p>
              )}
              {results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                >
                  <div className="flex justify-between gap-3 text-slate-500">
                    <span className="font-mono font-bold">{result.roomId}</span>
                    <span>{new Date(result.playedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.players.slice(0, 4).map((player) => (
                      <span
                        key={player.name}
                        className="rounded bg-white px-2 py-1 text-slate-700"
                      >
                        {player.rank}位 {player.name}: {player.totalScore}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
