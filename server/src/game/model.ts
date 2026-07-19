export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2";

export type GamePhase = "waiting" | "passing" | "playing" | "finished";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  deckIndex: 1 | 2;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  hand: Card[];
  capturedCards: Card[];
  roundScores: number[];
  totalScore: number;
}

export interface PlayedCard {
  playerId: string;
  card: Card;
}

export interface Trick {
  number: number;
  leaderId: string;
  cards: PlayedCard[];
  leadSuit?: Suit;
  canceledKeys: string[];
  winnerId?: string;
}

export interface Round {
  number: number;
  firstLeaderId: string;
  passOffset: number;
  passTargetByPlayerId: Record<string, string>;
  passedPlayerIds: string[];
  receivedCardsByPlayerId: Record<string, Card[]>;
  heartsBroken: boolean;
  tricks: Trick[];
}

export interface RoundScore {
  playerId: string;
  playerName: string;
  penalty: number;
  bonus: number;
  total: number;
}

export interface RoundSummary {
  roundNumber: number;
  scores: RoundScore[];
}

export interface CompletedTrickView {
  roundNumber: number;
  trick: Trick;
}

export interface GameState {
  roomId: string;
  password: string;
  phase: GamePhase;
  players: Player[];
  roundNumber: number;
  maxRounds: number;
  restCards: Card[];
  noPenaltyBonusCarryover: number;
  currentRound?: Round;
  roundSummaries: RoundSummary[];
  createdAt: string;
}

export interface PlayerView {
  id: string;
  name: string;
  isHost: boolean;
  handCount: number;
  capturedCount: number;
  roundScores: number[];
  totalScore: number;
  passedThisRound: boolean;
}

export interface GameView {
  roomId: string;
  phase: GamePhase;
  players: PlayerView[];
  roundNumber: number;
  maxRounds: number;
  restCardCount: number;
  currentRound?: {
    number: number;
    firstLeaderId: string;
    passOffset: number;
    passTargetByPlayerId: Record<string, string>;
    passedPlayerIds: string[];
    receivedCards: Card[];
    heartsBroken: boolean;
    currentTurnPlayerId?: string;
    currentTrick?: Trick;
  };
  myPlayerId?: string;
  myHand: Card[];
  playableCardIds: string[];
  lastCompletedTrick?: CompletedTrickView;
  roundSummaries: RoundSummary[];
}
