import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

type PlayerSession = {
  name: string;
  page: Page;
};

type StartedRoom = {
  host: PlayerSession;
  players: PlayerSession[];
  roomId: string;
  errorBuckets: string[][];
};

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function createRoom(page: Page, playerName: string): Promise<string> {
  await page.goto("/create-room");
  await page.getByTestId("player-name-input").fill(playerName);
  await page.getByTestId("create-password-input").fill("1234");
  await expect(page.getByTestId("create-room-button")).toBeEnabled();
  await page.getByTestId("create-room-button").click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator("body")).toContainText(playerName);

  const text = await page.locator("body").innerText();
  const match = text.match(/Room\s+([A-Z0-9]{5})/i);
  expect(match?.[1], "room id should be visible on game screen").toBeTruthy();
  return match![1];
}

test("home focuses on joining and links to the room creation page", async ({
  page,
}) => {
  const errors = trackPageErrors(page);

  await page.goto("/");
  await expect(page.getByTestId("join-room-heading")).toBeVisible();
  await expect(page.getByTestId("join-password-input")).toBeVisible();
  await expect(page.getByTestId("create-password-input")).toHaveCount(0);

  await page.getByTestId("rules-link").click();
  await expect(page).toHaveURL(/\/rules$/);
  await expect(page.getByTestId("rules-heading")).toBeVisible();
  await expect(page.getByTestId("rules-heading")).toHaveText("Rule");
  await expect(page.locator("body")).toContainText("スペードQ");

  await page.getByTestId("rules-back-home-link").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("join-room-heading")).toBeVisible();

  await page.getByTestId("create-room-button").click();
  await expect(page).toHaveURL(/\/create-room$/);
  await expect(page.getByTestId("create-room-heading")).toBeVisible();
  await expect(page.getByTestId("create-password-input")).toBeVisible();
  await expect(page.getByTestId("join-password-input")).toHaveCount(0);

  await page.getByTestId("back-home-link").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("join-room-heading")).toBeVisible();
  expect(errors).toEqual([]);
});

async function joinRoom(page: Page, roomId: string, playerName: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("player-name-input").fill(playerName);
  await page.getByTestId("room-id-input").fill(roomId);
  await page.getByTestId("join-password-input").fill("1234");
  await expect(page.getByTestId("join-room-button")).toBeEnabled();
  await page.getByTestId("join-room-button").click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator("body")).toContainText(playerName);
}

async function newPlayer(browser: Browser, name: string): Promise<PlayerSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { name, page };
}

async function closePlayers(players: PlayerSession[]): Promise<void> {
  await Promise.all(players.map((player) => player.page.context().close()));
}

async function setupStartedRoom(
  browser: Browser,
  playerCount: number,
  namePrefix: string
): Promise<StartedRoom> {
  const host = await newPlayer(browser, `${namePrefix}Host`);
  const guests = await Promise.all(
    Array.from({ length: playerCount - 1 }, (_, index) =>
      newPlayer(browser, `${namePrefix}P${index + 2}`)
    )
  );
  const players = [host, ...guests];
  const errorBuckets = players.map((player) => trackPageErrors(player.page));

  const roomId = await createRoom(host.page, host.name);
  for (const guest of guests) {
    await joinRoom(guest.page, roomId, guest.name);
  }

  await expect(host.page.getByTestId("start-game-button")).toBeEnabled();
  await host.page.getByTestId("start-game-button").click();

  for (const player of players) {
    await expect(player.page.getByTestId("playing-card").first()).toBeVisible();
    await expect(player.page.locator("body")).toContainText(roomId);
  }

  return { host, players, roomId, errorBuckets };
}

async function handCardIds(page: Page): Promise<string[]> {
  const cards = page.locator(
    '[data-testid="hand-zone"] [data-testid="playing-card"]'
  );
  const count = await cards.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const cardId = await cards.nth(index).getAttribute("data-card-id");
    if (cardId) {
      ids.push(cardId);
    }
  }
  return ids;
}

async function playableHandCardIds(page: Page): Promise<string[]> {
  const cards = page.locator(
    '[data-testid="hand-zone"] [data-testid="playing-card"][data-playable="true"]:not([disabled])'
  );
  const count = await cards.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const cardId = await cards.nth(index).getAttribute("data-card-id");
    if (cardId) {
      ids.push(cardId);
    }
  }
  return ids;
}

function expectBoxInBounds(
  box: { x: number; y: number; width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number },
  label: string,
  tolerance = 1
): void {
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(bounds.x - tolerance);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(bounds.y - tolerance);
  expect(
    box.x + box.width,
    `${label} right edge`
  ).toBeLessThanOrEqual(bounds.x + bounds.width + tolerance);
  expect(
    box.y + box.height,
    `${label} bottom edge`
  ).toBeLessThanOrEqual(bounds.y + bounds.height + tolerance);
}

async function expectLocatorBoxesInViewport(
  page: Page,
  locator: Locator,
  label: string,
  minCount = 1
): Promise<void> {
  const count = await locator.count();
  expect(count, `${label} count`).toBeGreaterThanOrEqual(minCount);

  const viewport = page.viewportSize();
  expect(viewport, "viewport should be available").toBeTruthy();
  const bounds = { x: 0, y: 0, width: viewport!.width, height: viewport!.height };

  for (let index = 0; index < count; index += 1) {
    const box = await locator.nth(index).boundingBox();
    expect(box, `${label} ${index + 1} should be visible`).toBeTruthy();
    expectBoxInBounds(box!, bounds, `${label} ${index + 1}`, 2);
  }
}

async function expectLocatorBoxesInsideParent(
  child: Locator,
  parent: Locator,
  label: string,
  minCount = 1
): Promise<void> {
  const parentBox = await parent.first().boundingBox();
  expect(parentBox, `${label} parent should be visible`).toBeTruthy();

  const count = await child.count();
  expect(count, `${label} count`).toBeGreaterThanOrEqual(minCount);

  for (let index = 0; index < count; index += 1) {
    const childBox = await child.nth(index).boundingBox();
    expect(childBox, `${label} ${index + 1} should be visible`).toBeTruthy();
    expectBoxInBounds(childBox!, parentBox!, `${label} ${index + 1}`, 2);
  }
}

async function clickNextPlayableCard(
  players: PlayerSession[],
  timeoutMs = 8_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const player of players) {
      const playable = player.page.locator(
        '[data-testid="playing-card"][data-playable="true"]:not([disabled])'
      );
      if ((await playable.count()) > 0) {
        try {
          await playable.first().click({ timeout: 2_000 });
          return true;
        } catch {
          // The active card can be replaced while trick previews update.
        }
      }
    }
    await players[0].page.waitForTimeout(150);
  }
  return false;
}

async function waitForPlayerWithPlayableCard(
  players: PlayerSession[],
  timeoutMs = 10_000
): Promise<PlayerSession> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await submitPassesIfNeeded(players)) {
      await players[0].page.waitForTimeout(150);
      continue;
    }

    for (const player of players) {
      if ((await playableHandCardIds(player.page)).length > 0) {
        return player;
      }
    }
    await players[0].page.waitForTimeout(150);
  }

  throw new Error("No player had a playable card before timeout");
}

async function reopenPlayerInNewPage(player: PlayerSession): Promise<Page> {
  const context = player.page.context();
  await player.page.close();
  const page = await context.newPage();
  player.page = page;
  await page.goto("/game");
  return page;
}

async function submitPassesIfNeeded(players: PlayerSession[]): Promise<boolean> {
  let submitted = false;
  for (const player of players) {
    const passButton = player.page
      .getByRole("button")
      .filter({ hasText: /0\/3|1\/3|2\/3|3\/3/ });
    if ((await passButton.count()) === 0) {
      continue;
    }

    const enabledPassButton = player.page
      .getByRole("button")
      .filter({ hasText: /3\/3/ });
    if ((await enabledPassButton.count()) > 0 && (await enabledPassButton.first().isEnabled())) {
      await enabledPassButton.first().click();
      submitted = true;
      continue;
    }

    const cards = player.page.locator('[data-testid="playing-card"]');
    if ((await cards.count()) >= 3) {
      await cards.nth(0).click();
      await cards.nth(1).click();
      await cards.nth(2).click();
      await expect(enabledPassButton.first()).toBeEnabled();
      await enabledPassButton.first().click();
      submitted = true;
    }
  }
  return submitted;
}

async function playUntilRound(
  players: PlayerSession[],
  hostPage: Page,
  roundPattern: RegExp,
  maxActions = 160
): Promise<number> {
  for (let action = 0; action < maxActions; action += 1) {
    if (roundPattern.test(await hostPage.locator("body").innerText())) {
      return action;
    }

    if (await submitPassesIfNeeded(players)) {
      await hostPage.waitForTimeout(120);
      continue;
    }

    const played = await clickNextPlayableCard(players);
    if (!played) {
      await hostPage.waitForTimeout(300);
    }
    await hostPage.waitForTimeout(120);
  }

  throw new Error(`Round did not reach ${roundPattern} within ${maxActions} actions`);
}

async function playUntilVisiblePlayedCards(
  players: PlayerSession[],
  hostPage: Page,
  targetCount: number
): Promise<void> {
  for (let action = 0; action < 80; action += 1) {
    if ((await hostPage.getByTestId("played-card").count()) >= targetCount) {
      return;
    }

    if (await submitPassesIfNeeded(players)) {
      await hostPage.waitForTimeout(150);
      continue;
    }

    if (await clickNextPlayableCard(players)) {
      await hostPage.waitForTimeout(200);
      continue;
    }

    await hostPage.waitForTimeout(200);
  }

  expect(
    await hostPage.getByTestId("played-card").count(),
    "played cards should become visible"
  ).toBeGreaterThanOrEqual(targetCount);
}

async function playUntilTrickWinnerPreview(
  players: PlayerSession[],
  hostPage: Page
): Promise<void> {
  for (let action = 0; action < 80; action += 1) {
    if (await hostPage.getByTestId("trick-winner-preview").isVisible()) {
      return;
    }

    if (await submitPassesIfNeeded(players)) {
      await hostPage.waitForTimeout(150);
      continue;
    }

    if (await clickNextPlayableCard(players, 3_000)) {
      await hostPage.waitForTimeout(80);
      continue;
    }

    await hostPage.waitForTimeout(150);
  }

  await expect(hostPage.getByTestId("trick-winner-preview")).toBeVisible();
}

test("creates a room and restores the session after reload", async ({ page }) => {
  const errors = trackPageErrors(page);
  const roomId = await createRoom(page, "E2EHost");

  await page.getByTestId("open-rules-modal-button").click();
  await expect(page.getByTestId("rules-modal")).toBeVisible();
  await expect(page.getByTestId("rules-heading")).toHaveText("Rule");
  await expect(page.locator("body")).toContainText("スペードQ");
  await page.getByTestId("rules-modal-close-button").click();
  await expect(page.getByTestId("rules-modal")).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator("body")).toContainText(roomId);
  await expect(page.locator("body")).toContainText("E2EHost");
  await expect(page.locator("body")).not.toContainText("ルームに参加していません");
  expect(errors).toEqual([]);
});

test("home displays readable server errors for failed joins", async ({ browser }) => {
  const host = await newPlayer(browser, "E2EErrorHost");
  const guest = await newPlayer(browser, "E2EErrorGuest");
  const p3 = await newPlayer(browser, "E2EErrorP3");
  const p4 = await newPlayer(browser, "E2EErrorP4");
  const lateGuest = await newPlayer(browser, "E2EErrorLate");
  const players = [host, guest, p3, p4, lateGuest];
  const errors = players.flatMap((player) => trackPageErrors(player.page));

  try {
    await guest.page.goto("/");
    await guest.page.getByTestId("player-name-input").fill("MissingRoomGuest");
    await guest.page.getByTestId("room-id-input").fill("ZZ999");
    await guest.page.getByTestId("join-password-input").fill("1234");
    await guest.page.getByTestId("join-room-button").click();
    await expect(guest.page.locator("body")).toContainText("ルームが見つかりません");

    const roomId = await createRoom(host.page, host.name);

    await guest.page.goto("/");
    await guest.page.getByTestId("player-name-input").fill("WrongPasswordGuest");
    await guest.page.getByTestId("room-id-input").fill(roomId);
    await guest.page.getByTestId("join-password-input").fill("9999");
    await guest.page.getByTestId("join-room-button").click();
    await expect(guest.page.locator("body")).toContainText("パスワードが正しくありません");

    await guest.page.goto("/");
    await guest.page.getByTestId("player-name-input").fill(host.name);
    await guest.page.getByTestId("room-id-input").fill(roomId);
    await guest.page.getByTestId("join-password-input").fill("1234");
    await guest.page.getByTestId("join-room-button").click();
    await expect(guest.page.locator("body")).toContainText(
      "同じ名前のプレイヤーが既に参加しています"
    );

    await joinRoom(guest.page, roomId, guest.name);
    await joinRoom(p3.page, roomId, p3.name);
    await joinRoom(p4.page, roomId, p4.name);
    await expect(host.page.getByTestId("start-game-button")).toBeEnabled();
    await host.page.getByTestId("start-game-button").click();

    await lateGuest.page.goto("/");
    await lateGuest.page.getByTestId("player-name-input").fill(lateGuest.name);
    await lateGuest.page.getByTestId("room-id-input").fill(roomId);
    await lateGuest.page.getByTestId("join-password-input").fill("1234");
    await lateGuest.page.getByTestId("join-room-button").click();
    await expect(lateGuest.page.locator("body")).toContainText(
      "ゲーム開始後は参加できません"
    );

    expect(errors).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test("connection badge shows disconnect state and manual reconnect", async ({
  page,
}) => {
  const errors = trackPageErrors(page);

  await page.goto("/");
  await expect(page.getByTestId("connection-badge")).toContainText("接続中");
  await expect(page.getByTestId("join-room-button")).toBeEnabled();

  await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __cohSocketDebug?: { disconnect: () => void };
    };
    debugWindow.__cohSocketDebug?.disconnect();
  });

  await expect(page.getByTestId("connection-badge")).toContainText("切断中");
  await expect(page.getByTestId("connection-detail")).toContainText(
    "接続が切断されました"
  );
  await expect(page.getByTestId("join-room-button")).toBeDisabled();
  await expect(page.getByTestId("connection-reconnect-button")).toBeEnabled();

  await page.getByTestId("connection-reconnect-button").click();
  await expect(page.getByTestId("connection-badge")).toContainText("接続中");
  await expect(page.getByTestId("join-room-button")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("four players can start and play several turns", async ({ browser }) => {
  const host = await newPlayer(browser, "E2EHost4");
  const guests = await Promise.all(
    ["E2EP2", "E2EP3", "E2EP4"].map((name) => newPlayer(browser, name))
  );
  const players = [host, ...guests];
  const errors = players.flatMap((player) => trackPageErrors(player.page));

  try {
    const roomId = await createRoom(host.page, host.name);
    await Promise.all(guests.map((guest) => joinRoom(guest.page, roomId, guest.name)));

    await expect(host.page.getByTestId("start-game-button")).toBeEnabled();
    await host.page.getByTestId("start-game-button").click();

    for (const player of players) {
      await expect(player.page.getByTestId("playing-card").first()).toBeVisible();
      await expect(player.page.locator("body")).toContainText(roomId);
    }

    for (let turn = 0; turn < 12; turn += 1) {
      expect(await clickNextPlayableCard(players)).toBe(true);
    }

    await expect(host.page.locator("body")).toContainText(/Round\s+1\s*\/\s*4/i);
    expect(errors).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test("four players can complete round 1 and enter round 2", async ({ browser }) => {
  test.slow();
  const host = await newPlayer(browser, "E2EFullHost");
  const guests = await Promise.all(
    ["E2EFullP2", "E2EFullP3", "E2EFullP4"].map((name) => newPlayer(browser, name))
  );
  const players = [host, ...guests];
  const errors = players.flatMap((player) => trackPageErrors(player.page));

  try {
    const roomId = await createRoom(host.page, host.name);
    await Promise.all(guests.map((guest) => joinRoom(guest.page, roomId, guest.name)));

    await expect(host.page.getByTestId("start-game-button")).toBeEnabled();
    await host.page.getByTestId("start-game-button").click();

    for (const player of players) {
      await expect(player.page.getByTestId("playing-card").first()).toBeVisible();
    }

    const actionCount = await playUntilRound(players, host.page, /Round\s+2\s*\/\s*4/i);
    expect(actionCount).toBeGreaterThan(0);
    await expect(host.page.locator("body")).toContainText(/Round\s+2\s*\/\s*4/i);
    await expect(host.page.locator("body")).toContainText(roomId);
    expect(errors).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test("four players can reload during play, restore session, and complete round 1", async ({
  browser,
}) => {
  test.slow();
  const { host, players, roomId, errorBuckets } = await setupStartedRoom(
    browser,
    4,
    "E2EReload"
  );

  try {
    await expect(host.page.locator("body")).toContainText(/Round\s+1\s*\/\s*4/i);

    const reconnectingPlayer = await waitForPlayerWithPlayableCard(players);
    const handBeforeReload = await handCardIds(reconnectingPlayer.page);
    const playableBeforeReload = await playableHandCardIds(reconnectingPlayer.page);
    expect(handBeforeReload.length, "hand should exist before reload").toBeGreaterThan(0);
    expect(
      playableBeforeReload.length,
      "player should be able to act before reload"
    ).toBeGreaterThan(0);

    await reconnectingPlayer.page.reload();
    await expect(reconnectingPlayer.page).toHaveURL(/\/game$/);
    await expect(reconnectingPlayer.page.locator("body")).toContainText(roomId);
    await expect(reconnectingPlayer.page.locator("body")).toContainText(
      reconnectingPlayer.name
    );
    await expect
      .poll(() => handCardIds(reconnectingPlayer.page), {
        message: "hand should be restored after reload",
        timeout: 10_000,
      })
      .toEqual(handBeforeReload);
    await expect
      .poll(() => playableHandCardIds(reconnectingPlayer.page), {
        message: "playable cards should be restored after reload",
        timeout: 10_000,
      })
      .toEqual(playableBeforeReload);

    expect(await clickNextPlayableCard([reconnectingPlayer], 5_000)).toBe(true);

    const actionCount = await playUntilRound(
      players,
      host.page,
      /Round\s+2\s*\/\s*4/i
    );
    expect(actionCount).toBeGreaterThan(0);
    await expect(host.page.locator("body")).toContainText(/Round\s+2\s*\/\s*4/i);
    await expect(host.page.locator("body")).toContainText(roomId);
    expect(errorBuckets.flat()).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test("four players can reopen a closed tab, restore session, and complete round 1", async ({
  browser,
}) => {
  test.slow();
  const { host, players, roomId, errorBuckets } = await setupStartedRoom(
    browser,
    4,
    "E2EReopen"
  );

  try {
    await expect(host.page.locator("body")).toContainText(/Round\s+1\s*\/\s*4/i);

    const reconnectingPlayer = await waitForPlayerWithPlayableCard(players);
    const handBeforeClose = await handCardIds(reconnectingPlayer.page);
    const playableBeforeClose = await playableHandCardIds(reconnectingPlayer.page);
    expect(handBeforeClose.length, "hand should exist before closing tab").toBeGreaterThan(0);
    expect(
      playableBeforeClose.length,
      "player should be able to act before closing tab"
    ).toBeGreaterThan(0);

    const reopenedErrors = trackPageErrors(
      await reopenPlayerInNewPage(reconnectingPlayer)
    );
    errorBuckets.push(reopenedErrors);

    await expect(reconnectingPlayer.page).toHaveURL(/\/game$/);
    await expect(reconnectingPlayer.page.locator("body")).toContainText(roomId);
    await expect(reconnectingPlayer.page.locator("body")).toContainText(
      reconnectingPlayer.name
    );
    await expect
      .poll(() => handCardIds(reconnectingPlayer.page), {
        message: "hand should be restored after reopening a tab",
        timeout: 10_000,
      })
      .toEqual(handBeforeClose);
    await expect
      .poll(() => playableHandCardIds(reconnectingPlayer.page), {
        message: "playable cards should be restored after reopening a tab",
        timeout: 10_000,
      })
      .toEqual(playableBeforeClose);

    expect(await clickNextPlayableCard([reconnectingPlayer], 5_000)).toBe(true);

    const actionCount = await playUntilRound(
      players,
      host.page,
      /Round\s+2\s*\/\s*4/i
    );
    expect(actionCount).toBeGreaterThan(0);
    await expect(host.page.locator("body")).toContainText(/Round\s+2\s*\/\s*4/i);
    await expect(host.page.locator("body")).toContainText(roomId);
    expect(errorBuckets.flat()).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test("four players can reload during trick completion preview and complete round 1", async ({
  browser,
}) => {
  test.slow();
  const { host, players, roomId, errorBuckets } = await setupStartedRoom(
    browser,
    4,
    "E2EPreviewReload"
  );

  try {
    await expect(host.page.locator("body")).toContainText(/Round\s+1\s*\/\s*4/i);

    await playUntilTrickWinnerPreview(players, host.page);
    await expect(host.page.getByTestId("played-card")).toHaveCount(4);
    await expect(host.page.getByTestId("trick-winner-preview")).toBeVisible();

    await host.page.reload();
    await expect(host.page).toHaveURL(/\/game$/);
    await expect(host.page.locator("body")).toContainText(roomId);
    await expect(host.page.locator("body")).toContainText(host.name);
    await expect(host.page.locator("body")).toContainText(/Round\s+1\s*\/\s*4/i);
    await expect(host.page.getByTestId("player-seat")).toHaveCount(4);
    await expect(host.page.getByTestId("trick-winner-preview")).toBeVisible();
    await expect(host.page.getByTestId("played-card")).toHaveCount(4);

    const actionCount = await playUntilRound(
      players,
      host.page,
      /Round\s+2\s*\/\s*4/i
    );
    expect(actionCount).toBeGreaterThan(0);
    await expect(host.page.locator("body")).toContainText(/Round\s+2\s*\/\s*4/i);
    await expect(host.page.locator("body")).toContainText(roomId);
    expect(errorBuckets.flat()).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test("ten players can complete round 1 and enter round 2", async ({ browser }) => {
  test.slow();
  const { host, players, roomId, errorBuckets } = await setupStartedRoom(
    browser,
    10,
    "E2EFull10"
  );

  try {
    await expect(host.page.locator("body")).toContainText(/Round\s+1\s*\/\s*10/i);
    await expect(host.page.getByTestId("player-seat")).toHaveCount(10);

    const actionCount = await playUntilRound(
      players,
      host.page,
      /Round\s+2\s*\/\s*10/i,
      220
    );

    expect(actionCount).toBeGreaterThan(0);
    await expect(host.page.locator("body")).toContainText(/Round\s+2\s*\/\s*10/i);
    await expect(host.page.locator("body")).toContainText(roomId);
    await expect(host.page.getByTestId("player-seat")).toHaveCount(10);
    await expect(host.page.getByTestId("playing-card").first()).toBeVisible();
    expect(errorBuckets.flat()).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});

test.describe("large table layout", () => {
  for (const playerCount of [7, 10]) {
    test(`${playerCount} players keep seats, hand, and played cards in bounds`, async ({
      browser,
    }, testInfo) => {
      const { host, players, roomId, errorBuckets } = await setupStartedRoom(
        browser,
        playerCount,
        `E2E${playerCount}`
      );

      try {
        await expect(host.page.locator("body")).toContainText(
          new RegExp(`Round\\s+1\\s*\\/\\s*${playerCount}`, "i")
        );
        await expect(host.page.getByTestId("player-seat")).toHaveCount(playerCount);
        await expectLocatorBoxesInViewport(
          host.page,
          host.page.getByTestId("player-seat"),
          `${playerCount}-player seat`,
          playerCount
        );
        await expectLocatorBoxesInViewport(
          host.page,
          host.page.getByTestId("hand-zone"),
          `${playerCount}-player hand zone`
        );

        await playUntilVisiblePlayedCards(
          players,
          host.page,
          Math.min(4, playerCount)
        );
        await expectLocatorBoxesInViewport(
          host.page,
          host.page.getByTestId("played-card"),
          `${playerCount}-player played card`
        );
        await expectLocatorBoxesInsideParent(
          host.page.getByTestId("played-card"),
          host.page.getByTestId("game-table"),
          `${playerCount}-player played card`
        );
        await testInfo.attach(`${playerCount}-player-table`, {
          body: await host.page.screenshot({ fullPage: false }),
          contentType: "image/png",
        });

        await expect(host.page.locator("body")).toContainText(roomId);
        expect(errorBuckets.flat()).toEqual([]);
      } finally {
        await closePlayers(players);
      }
    });
  }
});
