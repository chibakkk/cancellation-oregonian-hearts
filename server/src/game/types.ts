// カードのスート
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

// カード
export interface Card {
  suit: Suit;
  rank: string; // 'A', 'K', 'Q', 'J', '10' ... '2'
  id: string; // 識別用ID（例: 'S-A-1'）
}

// プレイヤー
export interface Player {
  id: string;
  name: string;
  hand: Card[];
  tricks: Card[][]; // 獲得したトリック（1トリック=Card[]）
  isHost?: boolean;
  roundScores?: number[]; // 各ラウンドのスコア履歴
  totalScore?: number; // 合計スコア
}

// トリック
export interface Trick {
  cards: { playerId: string; card: Card }[];
  leadSuit: Suit;
  winnerId?: string;
}

// ラウンド
export interface Round {
  roundNumber: number;
  tricks: Trick[];
  leadPlayerId: string;
  exchangeMap?: Record<string, string>; // カード交換マップ
  exchangeCompleted?: string[]; // 交換完了済みプレイヤーID
  pendingExchanges?: Record<string, Card[]>; // 保留中の交換カード
  receivedCards?: Record<string, Card[]>; // 各プレイヤーが受け取ったカード
  finished: boolean;
}

// ゲーム全体
export interface GameState {
  players: Player[];
  deck: Card[];
  restCards: Card[];
  rounds: Round[];
  currentRound: number;
  phase:
    | "waiting"
    | "dealing"
    | "exchanging"
    | "playing"
    | "scoring"
    | "finished";
  heartsBroken: boolean;
  leadSuit?: Suit;
  roomId: string;
  password: string;
}
