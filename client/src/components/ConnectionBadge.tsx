import { useGame } from "../context/useGame";

export function ConnectionBadge() {
  const {
    connectionPhase,
    connectionStatus,
    connectionError,
    reconnect,
  } = useGame();
  const connected = connectionPhase === "connected";
  const reconnecting =
    connectionPhase === "connecting" || connectionPhase === "reconnecting";
  const dot = connected
    ? "bg-emerald-500"
    : reconnecting
    ? "bg-amber-500"
    : "bg-rose-500";
  const title = connected
    ? "接続中"
    : reconnecting
    ? connectionStatus
    : "切断中";
  const detail =
    connectionError ??
    (reconnecting
      ? "サーバーへの接続を確認しています。"
      : connected
      ? null
      : "操作を続けるには再接続してください。");

  return (
    <div
      data-testid="connection-badge"
      className="fixed right-4 top-4 z-50 max-w-72 rounded-md border border-white/40 bg-white/92 px-3 py-2 text-sm shadow-sm backdrop-blur"
    >
      <div className="flex items-center gap-2 text-slate-800">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="font-medium">{title}</span>
      </div>
      {detail && (
        <p
          data-testid="connection-detail"
          className="mt-1 text-xs leading-5 text-slate-600"
        >
          {detail}
        </p>
      )}
      {!connected && (
        <button
          type="button"
          data-testid="connection-reconnect-button"
          className="mt-2 inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-400"
          disabled={reconnecting}
          onClick={reconnect}
          title="サーバーへ再接続"
        >
          再接続
        </button>
      )}
    </div>
  );
}
