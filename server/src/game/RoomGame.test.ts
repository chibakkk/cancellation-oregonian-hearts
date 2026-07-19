import assert from "assert";
import { RoomGame } from "./RoomGame";
import { Card, GameState, Player, Rank, Suit } from "./model";

const INITIAL_TOTAL_SCORE = 100;

function card(id: string, suit: Suit, rank: Rank, deckIndex: 1 | 2 = 1): Card {
  return { id, suit, rank, deckIndex };
}

function player(id: string, name: string, hand: Card[]): Player {
  return {
    id,
    name,
    isHost: id === "P1",
    hand,
    capturedCards: [],
    roundScores: [],
    totalScore: INITIAL_TOTAL_SCORE,
  };
}

function gameWithHands(hands: Card[][], maxRounds = 1, noPenaltyBonusCarryover = 0): RoomGame {
  const game = new RoomGame("ABCDE", "1234", "A");
  const players = hands.map((hand, index) =>
    player(`P${index + 1}`, String.fromCharCode(65 + index), hand)
  );
  const state: GameState = {
    roomId: "ABCDE",
    password: "1234",
    phase: "playing",
    players,
    roundNumber: 1,
    maxRounds,
    restCards: [],
    noPenaltyBonusCarryover,
    currentRound: {
      number: 1,
      firstLeaderId: "P1",
      passOffset: 0,
      passTargetByPlayerId: {},
      passedPlayerIds: [],
      receivedCardsByPlayerId: {},
      heartsBroken: false,
      tricks: [
        {
          number: 1,
          leaderId: "P1",
          cards: [],
          canceledKeys: [],
        },
      ],
    },
    roundSummaries: [],
    createdAt: new Date(0).toISOString(),
  };
  game.forceStateForTests(state);
  return game;
}

function play(game: RoomGame, playerId: string, cardId: string): void {
  game.playCard(playerId, cardId);
}

function testPlayersStartWith100Points(): void {
  const game = new RoomGame("SCORE", "1234", "Host");
  game.addPlayer("P2");
  game.addPlayer("P3");
  game.addPlayer("P4");

  assert.deepEqual(
    game.getView().players.map((item) => item.totalScore),
    [INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE]
  );

  game.startGame();
  assert.deepEqual(
    game.getView().players.map((item) => item.totalScore),
    [INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE]
  );

  game.restart();
  assert.deepEqual(
    game.getView().players.map((item) => item.totalScore),
    [INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE, INITIAL_TOTAL_SCORE]
  );
}

function completePassingIfNeeded(game: RoomGame, playerIds: string[]): number {
  let passCount = 0;
  let guard = 0;

  while (game.getView(playerIds[0]).phase === "passing") {
    guard += 1;
    assert.ok(guard <= playerIds.length + 2, "passing phase should complete");

    for (const playerId of playerIds) {
      const view = game.getView(playerId);
      if (view.phase !== "passing") {
        break;
      }

      const player = view.players.find((item) => item.id === playerId);
      if (player?.passedThisRound) {
        continue;
      }

      const cardIds = view.myHand.slice(0, 3).map((item) => item.id);
      assert.equal(cardIds.length, 3);
      game.passCards(playerId, cardIds);
      passCount += 1;
    }
  }

  return passCount;
}

function playFullGame(playerCount: number): {
  plays: number;
  passes: number;
} {
  const game = new RoomGame(`T${playerCount}ABC`, "1234", "P1");
  for (let index = 2; index <= playerCount; index += 1) {
    game.addPlayer(`P${index}`);
  }

  const playerIds = game.getView().players.map((item) => item.id);
  game.startGame();

  let plays = 0;
  let passes = 0;
  let guard = 0;

  while (game.getView(playerIds[0]).phase !== "finished") {
    guard += 1;
    assert.ok(guard <= 20000, `${playerCount} players should finish`);

    passes += completePassingIfNeeded(game, playerIds);

    const view = game.getView(playerIds[0]);
    if (view.phase === "finished") {
      break;
    }
    assert.equal(view.phase, "playing");

    const turnPlayerId = view.currentRound?.currentTurnPlayerId;
    assert.ok(turnPlayerId, "current turn player should exist");

    const turnView = game.getView(turnPlayerId);
    const cardId = turnView.playableCardIds[0];
    assert.ok(cardId, `playable card should exist for ${turnPlayerId}`);

    game.playCard(turnPlayerId, cardId);
    plays += 1;

    const completed = game.getView(turnPlayerId).lastCompletedTrick;
    if (completed) {
      assert.ok(completed.trick.winnerId, "completed trick should always have a winner");
    }
  }

  const finalView = game.getView(playerIds[0]);
  assert.equal(finalView.phase, "finished");
  assert.equal(finalView.roundNumber, playerCount);
  assert.equal(finalView.roundSummaries.length, playerCount);

  return {
    plays,
    passes,
  };
}

function testSpadeQueenPenaltyAndNoPenaltyBonus(): void {
  const game = gameWithHands([
    [card("c2", "clubs", "2")],
    [card("sq", "spades", "Q")],
    [card("s3", "spades", "3")],
    [card("sa", "spades", "A")],
  ]);

  play(game, "P1", "c2");
  play(game, "P2", "sq");
  play(game, "P3", "s3");
  play(game, "P4", "sa");

  const summary = game.getStateForTests().roundSummaries[0];
  assert.equal(summary.scores.find((score) => score.playerId === "P4")?.penalty, -13);
  assert.equal(summary.scores.find((score) => score.playerId === "P4")?.total, -13);
  assert.equal(summary.scores.find((score) => score.playerId === "P1")?.bonus, 17);
  assert.equal(game.getStateForTests().noPenaltyBonusCarryover, 1);
}

function testNoPenaltyBonusUsesCarryover(): void {
  const game = gameWithHands(
    [
      [card("c2", "clubs", "2")],
      [card("h2", "hearts", "2")],
      [card("sq", "spades", "Q")],
      [card("ca", "clubs", "A")],
    ],
    1,
    2
  );

  play(game, "P1", "c2");
  play(game, "P2", "h2");
  play(game, "P3", "sq");
  play(game, "P4", "ca");

  const summary = game.getStateForTests().roundSummaries[0];
  assert.equal(summary.scores.find((score) => score.playerId === "P1")?.bonus, 18);
  assert.equal(summary.scores.find((score) => score.playerId === "P2")?.bonus, 18);
  assert.equal(summary.scores.find((score) => score.playerId === "P3")?.bonus, 18);
  assert.equal(summary.scores.find((score) => score.playerId === "P4")?.bonus, 0);
  assert.equal(game.getStateForTests().noPenaltyBonusCarryover, 0);
}

function testRestCardsAreTakenByFinalTrickWinnerAndScored(): void {
  const game = gameWithHands([
    [card("c2", "clubs", "2")],
    [card("c3", "clubs", "3")],
    [card("c4", "clubs", "4")],
    [card("ca", "clubs", "A")],
  ]);
  game.getStateForTests().restCards = [
    card("rest-heart", "hearts", "5"),
    card("rest-spade-q", "spades", "Q"),
  ];

  play(game, "P1", "c2");
  play(game, "P2", "c3");
  play(game, "P3", "c4");
  play(game, "P4", "ca");

  const state = game.getStateForTests();
  const summary = state.roundSummaries[0];
  assert.equal(state.restCards.length, 0);
  assert.equal(summary.scores.find((score) => score.playerId === "P4")?.penalty, -14);
  assert.equal(summary.scores.find((score) => score.playerId === "P4")?.total, -14);
}

function testAllCanceledTrickFallsBackToLeader(): void {
  const game = gameWithHands([
    [
      card("c-a-1", "clubs", "A", 1),
      card("c-q-1", "clubs", "Q", 1),
      card("s-2-1", "spades", "2", 1),
    ],
    [
      card("c-a-2", "clubs", "A", 2),
      card("c-j-1", "clubs", "J", 1),
      card("s-3-1", "spades", "3", 1),
    ],
    [
      card("c-k-1", "clubs", "K", 1),
      card("c-10-1", "clubs", "10", 1),
      card("s-4-1", "spades", "4", 1),
    ],
    [
      card("c-k-2", "clubs", "K", 2),
      card("c-9-1", "clubs", "9", 1),
      card("s-5-1", "spades", "5", 1),
    ],
  ]);

  play(game, "P1", "c-a-1");
  play(game, "P2", "c-a-2");
  play(game, "P3", "c-k-1");
  play(game, "P4", "c-k-2");

  const round = game.getStateForTests().currentRound;
  const p1 = game.getStateForTests().players.find((item) => item.id === "P1");
  assert.equal(round?.tricks[0].winnerId, "P1");
  assert.equal(p1?.capturedCards.length, 4);
  assert.equal(round?.tricks[1].leaderId, "P1");
}

function testOregonianChangesLeadSuit(): void {
  const game = gameWithHands([
    [card("c2", "clubs", "2"), card("s2", "spades", "2")],
    [card("da", "diamonds", "A"), card("s3", "spades", "3")],
    [card("d3", "diamonds", "3"), card("s4", "spades", "4")],
    [card("d4", "diamonds", "4"), card("s5", "spades", "5")],
  ]);

  play(game, "P1", "c2");
  play(game, "P2", "da");
  play(game, "P3", "d3");
  play(game, "P4", "d4");

  const p2 = game.getStateForTests().players.find((item) => item.id === "P2");
  assert.equal(p2?.capturedCards.length, 4);
  assert.equal(game.getStateForTests().currentRound?.tricks[0].leadSuit, "diamonds");
}

function testCompletedTrickPreviewIsExposedAndCleared(): void {
  const game = gameWithHands([
    [
      card("c-a-1", "clubs", "A", 1),
      card("c-2-1", "clubs", "2", 1),
    ],
    [
      card("c-k-1", "clubs", "K", 1),
      card("c-3-1", "clubs", "3", 1),
    ],
    [
      card("c-q-1", "clubs", "Q", 1),
      card("c-4-1", "clubs", "4", 1),
    ],
    [
      card("c-j-1", "clubs", "J", 1),
      card("c-5-1", "clubs", "5", 1),
    ],
  ]);

  play(game, "P1", "c-a-1");
  play(game, "P2", "c-k-1");
  play(game, "P3", "c-q-1");
  play(game, "P4", "c-j-1");

  const preview = game.getView("P1").lastCompletedTrick;
  assert.equal(preview?.roundNumber, 1);
  assert.equal(preview?.trick.cards.length, 4);
  assert.equal(preview?.trick.winnerId, "P1");
  assert.equal(game.getView("P1").currentRound?.currentTrick?.number, 2);

  play(game, "P1", "c-2-1");
  assert.equal(game.getView("P1").lastCompletedTrick, undefined);
}

function testFullGameScenariosFinishForAllPlayerCounts(): void {
  for (let playerCount = 4; playerCount <= 10; playerCount += 1) {
    const result = playFullGame(playerCount);
    const cardsPerPlayer = Math.floor(104 / playerCount);
    assert.equal(result.plays, cardsPerPlayer * playerCount * playerCount);
    assert.equal(result.passes, (playerCount - 1) * playerCount);
  }
}

testPlayersStartWith100Points();
testSpadeQueenPenaltyAndNoPenaltyBonus();
testNoPenaltyBonusUsesCarryover();
testRestCardsAreTakenByFinalTrickWinnerAndScored();
testAllCanceledTrickFallsBackToLeader();
testOregonianChangesLeadSuit();
testCompletedTrickPreviewIsExposedAndCleared();
testFullGameScenariosFinishForAllPlayerCounts();

console.log("RoomGame tests passed");
