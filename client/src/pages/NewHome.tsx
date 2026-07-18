import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "../context/useGame";
import type { StoredResult } from "../types/coh";

function createRoomId(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function loadResults(): StoredResult[] {
  try {
    return JSON.parse(localStorage.getItem("coh:results") ?? "[]") as StoredResult[];
  } catch {
    return [];
  }
}

export function NewHome() {
  const navigate = useNavigate();
  const { createRoom, joinRoom, isConnected, connectionStatus } = useGame();
  const [playerName, setPlayerName] = useState("");
  const [password, setPassword] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const results = useMemo(loadResults, []);

  const validateCommon = () => {
    if (!playerName.trim()) {
      return "プレイヤー名を入力してください";
    }
    if (!/^\d{4}$/.test(password)) {
      return "パスワードは4桁の数字で入力してください";
    }
    return null;
  };

  const handleCreate = (event: SyntheticEvent) => {
    event.preventDefault();
    const validation = validateCommon();
    if (validation) {
      setError(validation);
      return;
    }

    const nextRoomId = createRoomId();
    setBusy("create");
    setError(null);
    createRoom(
      { roomId: nextRoomId, password, playerName: playerName.trim() },
      (response) => {
        setBusy(null);
        if (response.error) {
          setError(response.error);
          return;
        }
        navigate("/game");
      }
    );
  };

  const handleJoin = (event: SyntheticEvent) => {
    event.preventDefault();
    const validation = validateCommon();
    if (validation) {
      setError(validation);
      return;
    }
    if (!/^[A-Z0-9]{5}$/.test(roomId)) {
      setError("ルームIDは5文字の英数字です");
      return;
    }

    setBusy("join");
    setError(null);
    joinRoom(
      { roomId, password, playerName: playerName.trim() },
      (response) => {
        setBusy(null);
        if (response.error) {
          setError(response.error);
          return;
        }
        navigate("/game");
      }
    );
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f7d9c4,transparent_32%),linear-gradient(135deg,#f8fafc,#dbeafe_48%,#fef3c7)] px-4 py-10 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex min-h-[76vh] flex-col justify-between rounded-md border border-white/60 bg-white/72 p-6 shadow-sm backdrop-blur">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Cancellation Oregonian Hearts
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-slate-950 md:text-6xl">
              キャンセレーション オレゴニアン ハーツ
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              2組のトランプで遊ぶ4-10人用トリックテイキング。キャンセル、リードスート変更、ハーツの失点を一つのテーブルで扱います。
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="text-3xl font-bold">104</div>
              <div className="mt-1 text-sm text-slate-500">cards</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="text-3xl font-bold">4-10</div>
              <div className="mt-1 text-sm text-slate-500">players</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="text-3xl font-bold">5</div>
              <div className="mt-1 text-sm text-slate-500">recent games</div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-white/60 bg-white/86 p-5 shadow-sm backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">ルーム</h2>
            <span className="text-sm text-slate-500">
              {connectionStatus}
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">名前</span>
              <input
                data-testid="player-name-input"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
                value={playerName}
                maxLength={20}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="プレイヤー名"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">
                4桁パスワード
              </span>
              <input
                data-testid="password-input"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono tracking-[0.3em] outline-none focus:border-sky-500"
                value={password}
                maxLength={4}
                inputMode="numeric"
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, ""))}
                placeholder="0000"
              />
            </label>

            <button
              data-testid="create-room-button"
              className="w-full rounded-md bg-slate-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!isConnected || busy === "create"}
              onClick={handleCreate}
            >
              {busy === "create" ? "作成中..." : "新しいルームを作成"}
            </button>

            <div className="border-t border-slate-200 pt-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-600">
                  参加するルームID
                </span>
                <input
                  data-testid="room-id-input"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono uppercase tracking-[0.2em] outline-none focus:border-sky-500"
                  value={roomId}
                  maxLength={5}
                  onChange={(event) =>
                    setRoomId(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                  placeholder="ABCDE"
                />
              </label>
              <button
                data-testid="join-room-button"
                className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={!isConnected || busy === "join"}
                onClick={handleJoin}
              >
                {busy === "join" ? "参加中..." : "ルームに参加"}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-bold text-slate-700">直近の戦績</h3>
            <div className="mt-3 space-y-2">
              {results.length === 0 && (
                <p className="text-sm text-slate-500">まだ保存された戦績はありません。</p>
              )}
              {results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                >
                  <div className="flex justify-between text-slate-500">
                    <span>{result.roomId}</span>
                    <span>{new Date(result.playedAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.players.map((player) => (
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
