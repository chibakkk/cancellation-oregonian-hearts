import { createContext } from "react";
import type { Card, GameState } from "../types/game";

interface CreateRoomData {
  roomId: string;
  password: string;
  playerName: string;
}
interface JoinRoomData {
  roomId: string;
  playerName: string;
  password: string;
}
interface StartGameData {
  roomId: string;
}
interface ExchangeCardsData {
  roomId: string;
  selectedCardsMap: Record<string, Card[]>;
}
interface PlayCardData {
  roomId: string;
  playerId: string;
  card: Card;
}

type Callback = (res: {
  error?: string;
  myPlayerId?: string;
  isComplete?: boolean;
}) => void;

interface GameContextProps {
  state: GameState | null;
  myPlayerId: string | null;
  connectionStatus: string;
  isConnected: boolean;
  connectionError: string | null;
  reconnect: () => void;
  createRoom: (data: CreateRoomData, cb?: Callback) => void;
  joinRoom: (data: JoinRoomData, cb?: Callback) => void;
  startGame: (data: StartGameData, cb?: Callback) => void;
  exchangeCards: (data: ExchangeCardsData, cb?: Callback) => void;
  playCard: (data: PlayCardData, cb?: Callback) => void;
}

export const GameContext = createContext<GameContextProps | undefined>(
  undefined
);
