import { createContext } from "react";
import type { ConnectionPhase } from "../hooks/useCohSocket";
import type { GameView } from "../types/coh";

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
  roomId?: string;
}
interface PassCardsData {
  cardIds: string[];
}
interface PlayCardData {
  cardId: string;
}

type Callback = (res: {
  success?: boolean;
  error?: string;
  myPlayerId?: string;
  sessionToken?: string;
  state?: GameView;
}) => void;

interface GameContextProps {
  state: GameView | null;
  myPlayerId: string | null;
  connectionStatus: string;
  connectionPhase: ConnectionPhase;
  isConnected: boolean;
  connectionError: string | null;
  reconnectAttempt: number;
  reconnect: () => void;
  createRoom: (data: CreateRoomData, cb?: Callback) => void;
  joinRoom: (data: JoinRoomData, cb?: Callback) => void;
  startGame: (data: StartGameData, cb?: Callback) => void;
  passCards: (data: PassCardsData, cb?: Callback) => void;
  playCard: (data: PlayCardData, cb?: Callback) => void;
  restartGame: (data?: { roomId?: string }, cb?: Callback) => void;
  resetGame: () => void;
}

export const GameContext = createContext<GameContextProps | undefined>(
  undefined
);
