import { Link } from "react-router-dom";
import { RulesContent } from "../components/RulesContent";

export function Rules() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#06382f,#0f766e_52%,#fde68a_170%)] px-4 py-5 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <nav className="flex flex-wrap gap-2">
          <Link
            to="/"
            data-testid="rules-back-home-link"
            className="rounded-md border border-white/60 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-white"
          >
            トップへ戻る
          </Link>
          <Link
            to="/create-room"
            className="rounded-md border border-white/25 bg-emerald-950/50 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-950/70"
          >
            ルームを作成
          </Link>
        </nav>

        <div className="mt-5">
          <RulesContent />
        </div>
      </div>
    </main>
  );
}
