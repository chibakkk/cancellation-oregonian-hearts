import type { SyntheticEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGame } from "../context/useGame";

function createRoomId(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

export function CreateRoom() {
  const navigate = useNavigate();
  const { createRoom, isConnected } = useGame();
  const [playerName, setPlayerName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!playerName.trim()) {
      setError("プレイヤー名を入力してください");
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      setError("パスワードは4桁の数字で入力してください");
      return;
    }

    setBusy(true);
    setError(null);
    createRoom(
      { roomId: createRoomId(), password, playerName: playerName.trim() },
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
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(135deg,#06382f,#0f766e_52%,#fde68a_170%)] px-4 py-5 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-5xl place-items-center">
        <section className="w-full max-w-xl rounded-md border border-white/70 bg-white/95 p-5 shadow-2xl backdrop-blur md:p-7">
          <Link
            to="/"
            data-testid="back-home-link"
            className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            トップへ戻る
          </Link>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Host a table
            </p>
            <h1
              data-testid="create-room-heading"
              className="mt-2 font-brand text-5xl font-black leading-none text-slate-950"
            >
              Create Room
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              ルームを作成すると、5文字のルームIDが自動で発行されます。友達にはルームIDと4桁パスワードを共有してください。
            </p>
          </div>

          {error && (
            <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          <form className="mt-5" onSubmit={handleCreate}>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">ホスト名</span>
              <input
                data-testid="player-name-input"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={playerName}
                maxLength={20}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="プレイヤー名"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-bold text-slate-700">4桁パスワード</span>
              <input
                data-testid="create-password-input"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 font-mono text-lg tracking-[0.3em] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={password}
                maxLength={4}
                inputMode="numeric"
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, ""))}
                placeholder="0000"
              />
            </label>

            <button
              type="submit"
              data-testid="create-room-button"
              className="mt-5 w-full rounded-md bg-slate-950 px-4 py-3 font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!isConnected || busy}
            >
              {busy ? "作成中..." : "ルームを作成"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
