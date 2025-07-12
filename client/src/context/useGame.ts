import { useContext } from "react";
import { GameContext } from "./GameContextContext";

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error("useGameはGameProviderの中でのみ使用してください");
  }
  return ctx;
}
