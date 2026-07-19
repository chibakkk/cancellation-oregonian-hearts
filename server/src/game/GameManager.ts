import { Card, GameState, Player, Round, Suit, Trick } from "./types";

const RANK_ORDER = [
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
const INITIAL_TOTAL_SCORE = 100;

function generateDeck(): Card[] {
  const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
  const ranks = [
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
  let deck: Card[] = [];
  let id = 1;
  // 52枚のカードを2セット生成
  for (let set = 0; set < 2; set++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          suit,
          rank,
          id: `${suit[0].toUpperCase()}-${rank}-${set + 1}`,
        });
        id++;
      }
    }
  }
  return deck;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class GameManager {
  state: GameState;

  constructor(roomId: string, password: string, playerNames: string[]) {
    // ゲーム状態を初期化して設定
    this.state = this.initGame(roomId, password, playerNames);
  }

  private initGame(
    roomId: string,
    password: string,
    playerNames: string[]
  ): GameState {
    // デッキをシャッフル
    const deck = shuffle(generateDeck());
    // プレイヤー配列
    const players: Player[] = playerNames.map((name, idx) => ({
      id: `P${idx + 1}`,
      name,
      hand: [],
      tricks: [],
      isHost: idx === 0,
      totalScore: INITIAL_TOTAL_SCORE,
    }));
    return {
      players,
      deck,
      restCards: [],
      rounds: [],
      currentRound: 0,
      phase: "waiting",
      heartsBroken: false,
      roomId,
      password,
    };
  }

  // カード配布
  dealCards() {
    const numPlayers = this.state.players.length;
    let deck = [...this.state.deck];
    // 余ったカードをrestCardsに格納
    const handSize = Math.floor(deck.length / numPlayers);
    const rest = deck.length % numPlayers;
    const restCards = deck.slice(deck.length - rest);
    deck = deck.slice(0, deck.length - rest);
    // 各プレイヤーにカードを配る
    this.state.players.forEach((player, idx) => {
      player.hand = deck.slice(idx * handSize, (idx + 1) * handSize);
    });
    this.state.restCards = restCards;
    this.state.deck = [];
    this.state.phase = "dealing";
  }

  // ラウンド開始
  startNextRound() {
    const roundNumber = this.state.rounds.length + 1;
    const numPlayers = this.state.players.length;
    // リードプレイヤー決定
    let leadPlayerId: string;
    if (roundNumber === 1) {
      // 1ラウンド目はランダム
      const idx = Math.floor(Math.random() * numPlayers);
      leadPlayerId = this.state.players[idx].id;
    } else {
      // 2ラウンド目以降は前のラウンドの勝者がリードプレイヤー
      const prevLead =
        this.state.rounds[this.state.rounds.length - 1].leadPlayerId;
      const prevIdx = this.state.players.findIndex((p) => p.id === prevLead);
      leadPlayerId = this.state.players[(prevIdx + 1) % numPlayers].id;
    }
    // 新しいラウンドを作成
    const round: Round = {
      roundNumber,
      tricks: [],
      leadPlayerId,
      finished: false,
    };
    this.state.rounds.push(round);
    this.state.currentRound = this.state.rounds.length - 1;
    // フェーズ: 1ラウンド目のみカード交換フェーズに入る
    this.state.phase = "exchanging";
  }

  // カード交換の選択されたカードを各プレイヤーに3枚ずつ
  exchangeCards(selectedCardsMap: Record<string, Card[]>): {
    success: boolean;
    isComplete: boolean;
  } {
    const round = this.getCurrentRound();
    if (!round) throw new Error("No active round");

    console.log("=== カード交換処理開始 ===");
    console.log("選択されたカード", selectedCardsMap);

    // 交換完了プレイヤー配列の初期化
    if (!round.exchangeCompleted) {
      round.exchangeCompleted = [];
    }

    // 現在のプレイヤーの交換完了を記録
    const playerId = Object.keys(selectedCardsMap)[0];
    if (!round.exchangeCompleted.includes(playerId)) {
      round.exchangeCompleted.push(playerId);
    }

    // 現在のプレイヤーの選択を保存
    if (!round.pendingExchanges) {
      round.pendingExchanges = {};
    }
    round.pendingExchanges[playerId] = selectedCardsMap[playerId];

    console.log("交換完了プレイヤー:", round.exchangeCompleted);
    console.log("全プレイヤー数:", this.state.players.length);
    console.log("保存された選択", Object.keys(round.pendingExchanges));

    // 全員の交換が完了していない場合は待機
    if (round.exchangeCompleted.length < this.state.players.length) {
      console.log("全員の交換完了待機...");
      return { success: true, isComplete: false };
    }

    console.log("全員の交換完了が確定、実際の交換を実行");

    // 全員の交換が完了したら実際の交換を実行
    const numPlayers = this.state.players.length;

    // 隣のプレイヤーとの交換マップ作成
    const exchangeMap: Record<string, string> = {};
    for (let i = 0; i < numPlayers; i++) {
      const from = this.state.players[i].id;
      const to = this.state.players[(i + 1) % numPlayers].id; // 隣のプレイヤー（インデックス+1）
      exchangeMap[from] = to;
    }

    console.log("交換マップ作成完了", exchangeMap);

    // 全員の選択カードを一時保存
    const tempCards: Record<string, Card[]> = {};
    for (const fromId in round.pendingExchanges) {
      tempCards[fromId] = round.pendingExchanges[fromId];
    }

    console.log("一時保存した各プレイヤーのカード:");
    this.state.players.forEach((p) => {
      console.log(`${p.name}: ${p.hand.length}枚`);
    });

    // 選択されたカードを手札から削除
    for (const fromId in round.pendingExchanges) {
      const player = this.state.players.find((p) => p.id === fromId);
      if (player) {
        for (const card of round.pendingExchanges[fromId]) {
          const idx = player.hand.findIndex((c) => c.id === card.id);
          if (idx !== -1) {
            player.hand.splice(idx, 1);
            console.log(
              `${player.name}にカードを移動: ${card.suit}${card.rank}`
            );
          }
        }
      }
    }

    // 選択されたカードを隣のプレイヤーに移動
    for (let i = 0; i < numPlayers; i++) {
      const from = this.state.players[i].id;
      const to = exchangeMap[from];
      const toPlayer = this.state.players.find((p) => p.id === to);
      if (toPlayer && tempCards[from]) {
        // 選択されたカードを隣のプレイヤーに移動
        toPlayer.hand.push(...tempCards[from]);
        console.log(
          `${this.state.players.find((p) => p.id === from)?.name} から ${
            toPlayer.name
          }にカードを移動: ${tempCards[from].length}枚`
        );
      }
    }

    console.log("交換後の各プレイヤーのカード:");
    this.state.players.forEach((p) => {
      console.log(`${p.name}: ${p.hand.length}枚`);
    });

    // カード交換の結果を記録
    round.exchangeMap = exchangeMap;

    // 受け取ったカードを記録
    round.receivedCards = {};
    for (let i = 0; i < numPlayers; i++) {
      const from = this.state.players[i].id;
      const to = exchangeMap[from];
      if (tempCards[from]) {
        round.receivedCards[to] = tempCards[from];
        console.log(
          `${
            this.state.players.find((p) => p.id === to)?.name
          }に受け取ったカード:`,
          tempCards[from]
        );
      }
    }

    console.log("receivedCards:", round.receivedCards);

    // カード交換の完了をリセット
    round.exchangeCompleted = [];
    round.pendingExchanges = {};

    // フェーズをプレイングに変更
    this.state.phase = "playing";

    // トリック開始
    this.startTrick();

    console.log("=== カード交換処理終了 ===");
    return { success: true, isComplete: true };
  }

  // トリック開始
  startTrick() {
    const round = this.getCurrentRound();
    if (!round) return;
    // リードプレイヤーを決定
    const leadPlayerId =
      round.tricks.length === 0
        ? round.leadPlayerId
        : round.tricks[round.tricks.length - 1].winnerId || round.leadPlayerId;
    // リードプレイヤーを設定
    round.leadPlayerId = leadPlayerId;
    const trick: Trick = {
      cards: [],
      leadSuit: undefined as any, // リードスートはまだ決まっていない
    };
    round.tricks.push(trick);
    this.state.phase = "playing";
  }

  // カードプレイ
  playCard(playerId: string, card: Card) {
    const round = this.getCurrentRound();
    if (!round) throw new Error("No active round");
    const trick = round.tricks[round.tricks.length - 1];
    if (!trick) throw new Error("No active trick");
    // カードをプレイヤーに追加
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not found");
    const cardIdx = player.hand.findIndex((c) => c.id === card.id);
    if (cardIdx === -1) throw new Error("Card not in hand");
    // カードをプレイ
    trick.cards.push({ playerId, card });
    // 手札からカードを削除
    player.hand.splice(cardIdx, 1);
    // ハートブレークフラグを更新
    if (card.suit === "hearts") {
      this.state.heartsBroken = true;
    }
    // トリックの勝者を判定
    if (trick.cards.length === this.state.players.length) {
      // トリックの勝者を判定
      const winnerId = this.judgeTrickWinner(trick);
      trick.winnerId = winnerId;
      const winner = this.state.players.find((p) => p.id === winnerId);
      if (winner) winner.tricks.push(trick.cards.map((c) => c.card));
      // ゲーム終了チェック
      const isLastTrick = this.state.players.every((p) => p.hand.length === 0);
      if (isLastTrick) {
        // 最終トリックの勝者に残りのカードを追加
        if (winner && this.state.restCards && this.state.restCards.length > 0) {
          winner.tricks.push(this.state.restCards);
          this.state.restCards = [];
        }
        this.state.phase = "scoring";
      } else {
        // 次のトリックを開始
        this.startTrick();
      }
    }
  }

  // 現在のラウンドを取得
  getCurrentRound(): Round | undefined {
    return this.state.rounds[this.state.currentRound];
  }

  // 次のプレイヤーIDを取得
  private getNextPlayerId(currentId: string): string {
    const idx = this.state.players.findIndex((p) => p.id === currentId);
    return this.state.players[(idx + 1) % this.state.players.length].id;
  }

  // トリックの勝者を判定
  judgeTrickWinner(trick: Trick): string {
    if (!trick || trick.cards.length === 0) return "";
    // 1. リードスートを決定
    let leadSuit = trick.cards[0].card.suit;
    for (let i = 1; i < trick.cards.length; i++) {
      const played = trick.cards[i];
      const prevPlayers = trick.cards.slice(0, i).map((c) => c.card.suit);
      // リードスートが変更されたカード
      const player = this.state.players.find((p) => p.id === played.playerId);
      if (player) {
        const hadLeadSuit = false; // リードスートを持っているかどうか
        if (played.card.suit !== leadSuit) {
          // リードスートが変更された場合、新しいリードスートに更新
          leadSuit = played.card.suit;
        }
      }
    }
    // 2. 勝者を決定
    const countMap: Record<string, number> = {};
    for (const { card } of trick.cards) {
      const key = `${card.suit}-${card.rank}`;
      countMap[key] = (countMap[key] || 0) + 1;
    }
    // キャンセルされたカードを除外
    const canceledKeys = Object.entries(countMap)
      .filter(([_, v]) => v > 1)
      .map(([k]) => k);
    // 3. 勝者を決定
    let winner: { playerId: string; card: Card } | null = null;
    for (const played of trick.cards) {
      const key = `${played.card.suit}-${played.card.rank}`;
      if (canceledKeys.includes(key)) continue;
      if (played.card.suit !== leadSuit) continue;
      if (!winner) {
        winner = played;
      } else {
        if (
          RANK_ORDER.indexOf(played.card.rank) <
          RANK_ORDER.indexOf(winner.card.rank)
        ) {
          winner = played;
        }
      }
    }
    return winner ? winner.playerId : trick.cards[0].playerId;
  }

  // ラウンド終了
  finishRound() {
    // 各プレイヤーのスコアを計算
    const playersWithoutMinusPoints: string[] = [];
    const roundScores: Record<string, number> = {};
    for (const player of this.state.players) {
      // 全てのカードのスコアを計算
      const allCards: Card[] = player.tricks.flat();
      let score = 0;
      let hasMinus = false;
      for (const card of allCards) {
        if (card.suit === "hearts") {
          score -= 1;
          hasMinus = true;
        }
        if (card.suit === "spades" && card.rank === "Q") {
          score += 13;
          hasMinus = true;
        }
      }
      if (!hasMinus) playersWithoutMinusPoints.push(player.id);
      roundScores[player.id] = score;
    }
    // マイナスポイントがないプレイヤーにボーナスポイントを加算
    if (playersWithoutMinusPoints.length > 0) {
      const plus = Math.floor(52 / playersWithoutMinusPoints.length);
      for (const pid of playersWithoutMinusPoints) {
        roundScores[pid] += plus;
      }
    }
    // 各プレイヤーのラウンドスコアを更新
    for (const player of this.state.players) {
      if (!player.roundScores) player.roundScores = [];
      player.roundScores.push(roundScores[player.id]);
      // 累計スコアもここで更新
      player.totalScore = (player.totalScore ?? INITIAL_TOTAL_SCORE) + roundScores[player.id];
      // 次のラウンドのためにトリック記録をリセット
      player.tricks = [];
    }

    // ゲーム終了条件のチェック
    if (this.state.rounds.length >= this.state.players.length) {
      // プレイヤー数と同じラウンド数に達したらゲーム終了
      this.finishGame();
      return;
    }

    // デッキを再生成してシャッフル
    this.state.deck = shuffle(generateDeck());

    // カードを再配布
    this.dealCards();

    // ラウンド終了後、次のラウンドを開始
    this.startNextRound();
  }

  // ゲーム終了
  finishGame() {
    // 各プレイヤーの総スコアは既にfinishRoundで計算済みなので、
    // ここでは最終的なゲーム終了処理のみを行う
    this.state.phase = "finished";
  }

  // ゲーム状態を取得
  getState(): GameState {
    return this.state;
  }
}
