import { useEffect, useRef, useState } from "react";

type RoomIdCopyProps = {
  roomId: string;
  tone?: "light" | "dark";
};

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function RoomIdCopy({ roomId, tone = "light" }: RoomIdCopyProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const dark = tone === "dark";

  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    await copyText(roomId);
    setCopied(true);
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, 1500);
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        data-testid="room-id-label"
        className={`min-w-0 truncate text-xs font-semibold uppercase tracking-[0.18em] ${
          dark ? "text-emerald-100/70" : "text-slate-500"
        }`}
      >
        Room {roomId}
      </span>
      <button
        type="button"
        data-testid="room-id-copy-button"
        className={`shrink-0 rounded px-2 py-1 text-[11px] font-black transition ${
          dark
            ? "border border-amber-200/80 bg-amber-300 text-emerald-950 shadow-sm hover:bg-amber-200"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        onClick={handleCopy}
        aria-label={`ルームID ${roomId} をコピー`}
      >
        {copied ? "コピー済み" : "コピー"}
      </button>
    </div>
  );
}
