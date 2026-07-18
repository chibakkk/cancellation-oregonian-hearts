import {
  Card,
  CompletedTrickView,
  GameState,
  GameView,
  Player,
  Rank,
  Round,
  RoundScore,
  Suit,
  Trick,
} from "./model";

export interface RoomGameSnapshot {
  state: GameState;
  nextPlayerNumber: number;
  pendingPasses: Record<string, Card[]>;
  lastCompletedTrick?: CompletedTrickView;
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

const RANK_VALUE: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  "10": 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

function cardKey(card: Card): string {
  return `${card.suit}:${card.rank}`;
}

function isPenaltyCard(card: Card): boolean {
  return card.suit === "hearts" || (card.suit === "spades" && card.rank === "Q");
}

function generateDeck(): Card[] {
  const deck: Card[] = [];
  for (const deckIndex of [1, 2] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${deckIndex}-${suit}-${rank}`,
          suit,
          rank,
          deckIndex,
        });
      }
    }
  }
  return deck;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const result: Card[] = [];
  for (const card of cards) {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      result.push(card);
    }
  }
  return result;
}

export class RoomGame {
  private state: GameState;
  private nextPlayerNumber = 1;
  private pendingPasses: Record<string, Card[]> = {};
  private lastCompletedTrick?: CompletedTrickView;

  constructor(roomId: string, password: string, hostName: string) {
    this.state = {
      roomId,
      password,
      phase: "waiting",
      players: [this.createPlayer(hostName, true)],
      roundNumber: 0,
      maxRounds: 0,
      restCards: [],
      roundSummaries: [],
      createdAt: new Date().toISOString(),
    };
  }

  static fromSnapshot(snapshot: RoomGameSnapshot): RoomGame {
    const hostName =
      snapshot.state.players.find((player) => player.isHost)?.name ??
      snapshot.state.players[0]?.name ??
      "Host";
    const room = new RoomGame(snapshot.state.roomId, snapshot.state.password, hostName);
    room.state = cloneJson(snapshot.state);
    room.nextPlayerNumber = snapshot.nextPlayerNumber;
    room.pendingPasses = cloneJson(snapshot.pendingPasses ?? {});
    room.lastCompletedTrick = snapshot.lastCompletedTrick
      ? cloneJson(snapshot.lastCompletedTrick)
      : undefined;
    return room;
  }

  get roomId(): string {
    return this.state.roomId;
  }

  get password(): string {
    return this.state.password;
  }

  get phase(): string {
    return this.state.phase;
  }

  get playerCount(): number {
    return this.state.players.length;
  }

  isHost(playerId: string): boolean {
    return this.findPlayer(playerId).isHost;
  }

  hasPlayer(playerId: string): boolean {
    return this.state.players.some((player) => player.id === playerId);
  }

  addPlayer(name: string): Player {
    if (this.state.phase !== "waiting") {
      throw new Error("ゲーム開始後は参加できません");
    }
    if (this.state.players.length >= 10) {
      throw new Error("このルームは満員です");
    }
    if (this.state.players.some((player) => player.name === name)) {
      throw new Error("同じ名前のプレイヤーが既に参加しています");
    }
    const player = this.createPlayer(name, false);
    this.state.players.push(player);
    return player;
  }

  startGame(): void {
    if (this.state.phase !== "waiting") {
      throw new Error("ゲームは既に開始されています");
    }
    if (this.state.players.length < 4 || this.state.players.length > 10) {
      throw new Error("プレイヤーは4人から10人で開始できます");
    }
    this.state.maxRounds = this.state.players.length;
    this.setupRound(1);
  }

  passCards(playerId: string, cardIds: string[]): void {
    if (this.state.phase !== "passing" || !this.state.currentRound) {
      throw new Error("現在はカード交換フェーズではありません");
    }
    const round = this.state.currentRound;
    if (round.passedPlayerIds.includes(playerId)) {
      throw new Error("このラウンドでは既にカードを渡しています");
    }
    if (cardIds.length !== 3 || new Set(cardIds).size !== 3) {
      throw new Error("交換するカードを3枚選んでください");
    }

    const player = this.findPlayer(playerId);
    const selected = cardIds.map((cardId) => {
      const card = player.hand.find((item) => item.id === cardId);
      if (!card) {
        throw new Error("手札にないカードが選ばれています");
      }
      return card;
    });

    this.pendingPasses[playerId] = selected;
    round.passedPlayerIds.push(playerId);

    if (round.passedPlayerIds.length === this.state.players.length) {
      this.completePassing();
    }
  }

  playCard(playerId: string, cardId: string): void {
    if (this.state.phase !== "playing" || !this.state.currentRound) {
      throw new Error("現在はプレイフェーズではありません");
    }

    const round = this.state.currentRound;
    const trick = this.getCurrentTrick();
    const turnPlayerId = this.getCurrentTurnPlayerId();
    if (turnPlayerId !== playerId) {
      throw new Error("あなたの手番ではありません");
    }

    const player = this.findPlayer(playerId);
    const cardIndex = player.hand.findIndex((card) => card.id === cardId);
    if (cardIndex < 0) {
      throw new Error("手札にないカードです");
    }
    const card = player.hand[cardIndex];
    this.validateCardPlay(player, card, trick, round);
    this.lastCompletedTrick = undefined;

    if (trick.cards.length === 0) {
      trick.leadSuit = card.suit;
    } else if (trick.leadSuit) {
      const hasLeadSuit = player.hand.some((item) => item.suit === trick.leadSuit);
      if (!hasLeadSuit && card.suit !== trick.leadSuit) {
        trick.leadSuit = card.suit;
      }
    }

    player.hand.splice(cardIndex, 1);
    trick.cards.push({ playerId, card });
    if (isPenaltyCard(card)) {
      round.heartsBroken = true;
    }

    if (trick.cards.length === this.state.players.length) {
      this.resolveTrick(trick);
    }
  }

  restart(): void {
    for (const player of this.state.players) {
      player.hand = [];
      player.capturedCards = [];
      player.roundScores = [];
      player.totalScore = 0;
    }
    this.pendingPasses = {};
    this.lastCompletedTrick = undefined;
    this.state.phase = "waiting";
    this.state.roundNumber = 0;
    this.state.maxRounds = 0;
    this.state.restCards = [];
    this.state.currentRound = undefined;
    this.state.roundSummaries = [];
  }

  getView(playerId?: string): GameView {
    const myPlayer = playerId
      ? this.state.players.find((player) => player.id === playerId)
      : undefined;
    const round = this.state.currentRound;

    return {
      roomId: this.state.roomId,
      phase: this.state.phase,
      players: this.state.players.map((player) => ({
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        handCount: player.hand.length,
        capturedCount: player.capturedCards.length,
        roundScores: [...player.roundScores],
        totalScore: player.totalScore,
        passedThisRound: round?.passedPlayerIds.includes(player.id) ?? false,
      })),
      roundNumber: this.state.roundNumber,
      maxRounds: this.state.maxRounds,
      restCardCount: this.state.restCards.length,
      currentRound: round
        ? {
            number: round.number,
            firstLeaderId: round.firstLeaderId,
            passOffset: round.passOffset,
            passTargetByPlayerId: round.passTargetByPlayerId,
            passedPlayerIds: [...round.passedPlayerIds],
            receivedCards: playerId
              ? round.receivedCardsByPlayerId[playerId] ?? []
              : [],
            heartsBroken: round.heartsBroken,
            currentTurnPlayerId: this.state.phase === "playing"
              ? this.getCurrentTurnPlayerId()
              : undefined,
            currentTrick: this.cloneCurrentTrick(),
          }
        : undefined,
      myPlayerId: playerId,
      myHand: myPlayer ? this.sortCards(myPlayer.hand) : [],
      playableCardIds: playerId ? this.getPlayableCards(playerId).map((card) => card.id) : [],
      lastCompletedTrick: this.cloneLastCompletedTrick(),
      roundSummaries: this.state.roundSummaries,
    };
  }

  getStateForTests(): GameState {
    return this.state;
  }

  forceStateForTests(state: GameState): void {
    this.state = state;
  }

  snapshot(): RoomGameSnapshot {
    return {
      state: cloneJson(this.state),
      nextPlayerNumber: this.nextPlayerNumber,
      pendingPasses: cloneJson(this.pendingPasses),
      lastCompletedTrick: this.lastCompletedTrick
        ? cloneJson(this.lastCompletedTrick)
        : undefined,
    };
  }

  private createPlayer(name: string, isHost: boolean): Player {
    const player: Player = {
      id: `P${this.nextPlayerNumber}`,
      name,
      isHost,
      hand: [],
      capturedCards: [],
      roundScores: [],
      totalScore: 0,
    };
    this.nextPlayerNumber += 1;
    return player;
  }

  private setupRound(roundNumber: number): void {
    this.pendingPasses = {};
    const shuffledDeck = shuffle(generateDeck());
    const handSize = Math.floor(shuffledDeck.length / this.state.players.length);
    const dealtCardCount = handSize * this.state.players.length;
    const dealtCards = shuffledDeck.slice(0, dealtCardCount);

    for (const player of this.state.players) {
      player.hand = [];
      player.capturedCards = [];
    }
    for (let i = 0; i < dealtCards.length; i += 1) {
      this.state.players[i % this.state.players.length].hand.push(dealtCards[i]);
    }

    const firstLeaderId = this.getFirstLeaderId(roundNumber);
    const passOffset = roundNumber === 1 ? 0 : roundNumber - 1;
    const round: Round = {
      number: roundNumber,
      firstLeaderId,
      passOffset,
      passTargetByPlayerId: this.createPassMap(passOffset),
      passedPlayerIds: [],
      receivedCardsByPlayerId: {},
      heartsBroken: false,
      tricks: [],
    };

    this.state.roundNumber = roundNumber;
    this.state.restCards = shuffledDeck.slice(dealtCardCount);
    this.state.currentRound = round;
    this.state.phase = roundNumber === 1 ? "playing" : "passing";

    if (this.state.phase === "playing") {
      this.startTrick(firstLeaderId);
    }
  }

  private getFirstLeaderId(roundNumber: number): string {
    if (roundNumber === 1 || !this.state.currentRound) {
      const index = Math.floor(Math.random() * this.state.players.length);
      return this.state.players[index].id;
    }

    const previousFirstLeaderId = this.state.currentRound.firstLeaderId;
    const previousIndex = this.playerIndex(previousFirstLeaderId);
    return this.state.players[(previousIndex + 1) % this.state.players.length].id;
  }

  private createPassMap(offset: number): Record<string, string> {
    const map: Record<string, string> = {};
    if (offset === 0) {
      return map;
    }
    for (let i = 0; i < this.state.players.length; i += 1) {
      const from = this.state.players[i];
      const to = this.state.players[(i + offset) % this.state.players.length];
      map[from.id] = to.id;
    }
    return map;
  }

  private completePassing(): void {
    const round = this.requireRound();

    for (const [playerId, cards] of Object.entries(this.pendingPasses)) {
      const player = this.findPlayer(playerId);
      for (const card of cards) {
        const index = player.hand.findIndex((item) => item.id === card.id);
        if (index < 0) {
          throw new Error("交換カードの処理中に手札が不整合になりました");
        }
        player.hand.splice(index, 1);
      }
    }

    for (const [fromPlayerId, cards] of Object.entries(this.pendingPasses)) {
      const targetId = round.passTargetByPlayerId[fromPlayerId];
      const target = this.findPlayer(targetId);
      target.hand.push(...cards);
      round.receivedCardsByPlayerId[targetId] = [
        ...(round.receivedCardsByPlayerId[targetId] ?? []),
        ...cards,
      ];
    }

    this.pendingPasses = {};
    this.lastCompletedTrick = undefined;
    this.state.phase = "playing";
    this.startTrick(round.firstLeaderId);
  }

  private validateCardPlay(player: Player, card: Card, trick: Trick, round: Round): void {
    if (trick.cards.length === 0) {
      const hasNonHeart = player.hand.some((item) => item.suit !== "hearts");
      if (card.suit === "hearts" && !round.heartsBroken && hasNonHeart) {
        throw new Error("ハーツブレイク前はハートをリードできません");
      }
      return;
    }

    if (!trick.leadSuit) {
      throw new Error("リードスートが不正です");
    }
    const hasLeadSuit = player.hand.some((item) => item.suit === trick.leadSuit);
    if (hasLeadSuit && card.suit !== trick.leadSuit) {
      throw new Error("リードスートを持っている場合はマストフォローです");
    }
  }

  private resolveTrick(trick: Trick): void {
    const round = this.requireRound();
    const counts: Record<string, number> = {};
    for (const played of trick.cards) {
      counts[cardKey(played.card)] = (counts[cardKey(played.card)] ?? 0) + 1;
    }
    trick.canceledKeys = Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([key]) => key);

    const leadSuit = trick.leadSuit;
    const candidates = leadSuit
      ? trick.cards.filter(
          (played) =>
            played.card.suit === leadSuit &&
            !trick.canceledKeys.includes(cardKey(played.card))
        )
      : [];

    const winner =
      candidates.length === 0
        ? trick.cards.find((played) => played.playerId === trick.leaderId) ?? trick.cards[0]
        : candidates.reduce((best, played) =>
            RANK_VALUE[played.card.rank] > RANK_VALUE[best.card.rank] ? played : best
          );
    if (!winner) {
      throw new Error("トリック勝者を決定できません");
    }
    trick.winnerId = winner.playerId;
    const winnerPlayer = this.findPlayer(winner.playerId);
    winnerPlayer.capturedCards.push(...trick.cards.map((played) => played.card));

    this.lastCompletedTrick = {
      roundNumber: this.state.roundNumber,
      trick: this.cloneTrick(trick),
    };

    const isRoundOver = this.state.players.every((player) => player.hand.length === 0);
    if (isRoundOver) {
      this.findPlayer(trick.winnerId).capturedCards.push(...this.state.restCards);
      this.state.restCards = [];
      this.finishRound();
      return;
    }

    this.startTrick(trick.winnerId);
  }

  private finishRound(): void {
    const scores = this.calculateRoundScores();
    for (const score of scores) {
      const player = this.findPlayer(score.playerId);
      player.roundScores.push(score.total);
      player.totalScore += score.total;
      player.capturedCards = [];
    }

    this.state.roundSummaries.push({
      roundNumber: this.state.roundNumber,
      scores,
    });

    if (this.state.roundNumber >= this.state.maxRounds) {
      this.state.phase = "finished";
      this.state.currentRound = undefined;
      return;
    }

    this.setupRound(this.state.roundNumber + 1);
  }

  private calculateRoundScores(): RoundScore[] {
    const rawScores = this.state.players.map((player) => {
      let penalty = 0;
      for (const card of player.capturedCards) {
        if (card.suit === "hearts") {
          penalty -= 1;
        }
        if (card.suit === "spades" && card.rank === "Q") {
          penalty -= 13;
        }
      }
      return {
        player,
        penalty,
        bonus: 0,
      };
    });

    const playersWithoutPenalty = rawScores.filter((score) => score.penalty === 0);
    if (playersWithoutPenalty.length > 0) {
      const bonus = Math.floor(52 / playersWithoutPenalty.length);
      for (const score of playersWithoutPenalty) {
        score.bonus = bonus;
      }
    }

    return rawScores.map(({ player, penalty, bonus }) => ({
      playerId: player.id,
      playerName: player.name,
      penalty,
      bonus,
      total: penalty + bonus,
    }));
  }

  private startTrick(leaderId: string): void {
    const round = this.requireRound();
    round.tricks.push({
      number: round.tricks.length + 1,
      leaderId,
      cards: [],
      canceledKeys: [],
    });
  }

  private getCurrentTrick(): Trick {
    const round = this.requireRound();
    const trick = round.tricks[round.tricks.length - 1];
    if (!trick) {
      throw new Error("現在のトリックがありません");
    }
    return trick;
  }

  private cloneCurrentTrick(): Trick | undefined {
    if (!this.state.currentRound?.tricks.length) {
      return undefined;
    }
    const trick = this.state.currentRound.tricks[this.state.currentRound.tricks.length - 1];
    return this.cloneTrick(trick);
  }

  private cloneLastCompletedTrick(): CompletedTrickView | undefined {
    if (!this.lastCompletedTrick) {
      return undefined;
    }
    return {
      roundNumber: this.lastCompletedTrick.roundNumber,
      trick: this.cloneTrick(this.lastCompletedTrick.trick),
    };
  }

  private cloneTrick(trick: Trick): Trick {
    return {
      ...trick,
      cards: trick.cards.map((played) => ({ ...played })),
      canceledKeys: [...trick.canceledKeys],
    };
  }

  private getCurrentTurnPlayerId(): string | undefined {
    if (this.state.phase !== "playing" || !this.state.currentRound) {
      return undefined;
    }
    const trick = this.state.currentRound.tricks[this.state.currentRound.tricks.length - 1];
    if (!trick) {
      return undefined;
    }
    if (trick.cards.length === 0) {
      return trick.leaderId;
    }
    const lastPlayerId = trick.cards[trick.cards.length - 1].playerId;
    const lastIndex = this.playerIndex(lastPlayerId);
    return this.state.players[(lastIndex + 1) % this.state.players.length].id;
  }

  private getPlayableCards(playerId: string): Card[] {
    if (this.state.phase !== "playing" || this.getCurrentTurnPlayerId() !== playerId) {
      return [];
    }

    const player = this.findPlayer(playerId);
    const round = this.requireRound();
    const trick = this.getCurrentTrick();
    if (trick.cards.length === 0) {
      const hasNonHeart = player.hand.some((card) => card.suit !== "hearts");
      if (!round.heartsBroken && hasNonHeart) {
        return player.hand.filter((card) => card.suit !== "hearts");
      }
      return [...player.hand];
    }

    if (!trick.leadSuit) {
      return [];
    }
    const leadSuitCards = player.hand.filter((card) => card.suit === trick.leadSuit);
    return leadSuitCards.length > 0 ? leadSuitCards : [...player.hand];
  }

  private findPlayer(playerId: string): Player {
    const player = this.state.players.find((item) => item.id === playerId);
    if (!player) {
      throw new Error("プレイヤーが見つかりません");
    }
    return player;
  }

  private playerIndex(playerId: string): number {
    const index = this.state.players.findIndex((player) => player.id === playerId);
    if (index < 0) {
      throw new Error("プレイヤーが見つかりません");
    }
    return index;
  }

  private requireRound(): Round {
    if (!this.state.currentRound) {
      throw new Error("現在のラウンドがありません");
    }
    return this.state.currentRound;
  }

  private sortCards(cards: Card[]): Card[] {
    const suitOrder: Record<Suit, number> = {
      spades: 0,
      hearts: 1,
      diamonds: 2,
      clubs: 3,
    };
    return uniqueCards(cards).sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
    });
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
