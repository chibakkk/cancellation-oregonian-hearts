const quickRules = [
  "4-10人で遊ぶ、2組104枚のトランプを使うトリックテイキングです。",
  "各トリックでは、最初にカードを出したプレイヤーが親です。",
  "基本はマストフォローです。リードスートを持っている場合は、そのスートを出します。",
  "同じスート・同じランクのカードが複数出るとキャンセルされ、勝敗候補から外れます。",
  "勝敗候補がすべてキャンセルされた場合は、そのトリックの親が勝ちます。",
  "配り残ったカードは最終トリックの勝者が引き取り、失点カードが含まれていれば得点計算に入ります。",
];

const scoreRules = [
  {
    label: "heart",
    mark: "♥",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
    value: "♥は1枚につき -1点",
  },
  {
    label: "spade queen",
    mark: "♠Q",
    color: "text-slate-950",
    bg: "bg-slate-100",
    border: "border-slate-200",
    value: "スペードQは -13点",
  },
  {
    label: "clean round",
    mark: "0",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    value: "無失点ならラウンド終了時にボーナス（52点 + 持ち越し点を無失点者で割り、余りは次ラウンドへ持ち越し）",
  },
  {
    label: "ranking",
    mark: "#",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-100",
    value: "全員100点から開始し、全ラウンド終了後の合計点で順位を決定",
  },
];

export function RulesContent({ compact = false }: { compact?: boolean }) {
  return (
    <section className="overflow-hidden rounded-md border border-white/70 bg-white/95 shadow-2xl backdrop-blur">
      <div className={`${compact ? "p-5" : "p-5 md:p-7"} border-b border-slate-200`}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          How to play
        </p>
        <h1
          data-testid="rules-heading"
          className={`mt-2 font-brand font-black leading-none text-slate-950 ${
            compact ? "text-5xl" : "text-6xl md:text-7xl"
          }`}
        >
          Rule
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Cancellation Oregonian Hearts は、キャンセルによって勝敗候補が変わるハーツ系のトリックテイキングです。
          まずはここだけ読めば、遊び始められます。
        </p>
      </div>

      <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
        <section className={`${compact ? "p-5" : "p-5 md:p-7"} border-b border-slate-200 md:border-b-0 md:border-r`}>
          <h2 className="text-xl font-black text-slate-950">基本の流れ</h2>
          <ol className="mt-4 space-y-3">
            {quickRules.map((rule, index) => (
              <li key={rule} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                  {index + 1}
                </span>
                <span className="pt-0.5 text-sm leading-6 text-slate-700">{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={compact ? "p-5" : "p-5 md:p-7"}>
          <h2 className="text-xl font-black text-slate-950">得点</h2>
          <div className="mt-4 grid gap-3">
            {scoreRules.map((rule) => (
              <div
                key={rule.label}
                className={`grid grid-cols-[4.25rem_1fr] items-center gap-3 rounded-md border ${rule.border} ${rule.bg} p-3`}
              >
                <span
                  aria-label={rule.label}
                  className={`flex h-16 w-16 items-center justify-center rounded-md bg-white text-4xl font-black leading-none shadow-sm ${rule.color}`}
                >
                  {rule.mark}
                </span>
                <span className="text-sm font-bold leading-6 text-slate-700">
                  {rule.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <h3 className="font-black text-amber-900">リードスートの変化</h3>
            <p className="mt-2 text-sm leading-6 text-amber-900/80">
              リードスートを持っていないプレイヤーが別スートを出すと、そのカード以降の比較対象スートが変わることがあります。
              画面右上のトリック情報で現在のリードスートを確認できます。
            </p>
          </div>
        </section>
      </div>

      <section className={`${compact ? "p-5" : "p-5 md:p-7"} border-t border-slate-200 bg-slate-50`}>
        <h2 className="text-xl font-black text-slate-950">画面上の見え方</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-950">出せるカード</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              自分の手札では、出せるカードが通常表示されます。出せないカードは薄く表示されます。
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-950">キャンセル</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              キャンセルされたカードには斜線が入り、そのトリックの勝敗に関わらないことが分かります。
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
