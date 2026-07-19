import { expect, test, type Browser, type Page } from "@playwright/test";

type PlayerSession = {
  name: string;
  page: Page;
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

async function submitPassesIfNeeded(players: PlayerSession[]): Promise<boolean> {
  let submitted = false;

  for (const player of players) {
    const passButton = player.page
      .getByRole("button", { name: /交換|渡す|Pass|pass/i })
      .first();
    if ((await passButton.count()) === 0 || !(await passButton.isVisible())) {
      continue;
    }
    if (await passButton.isEnabled()) {
      await passButton.click();
      submitted = true;
      continue;
    }

    const enabledPassButton = player.page
      .getByRole("button", { name: /交換|渡す|Pass|pass/i })
      .locator(":enabled")
      .first();
    if ((await enabledPassButton.count()) > 0) {
      await enabledPassButton.click();
      submitted = true;
      continue;
    }

    const cards = player.page.locator('[data-testid="playing-card"]');
    const cardCount = Math.min(3, await cards.count());
    for (let index = 0; index < cardCount; index += 1) {
      await cards.nth(index).click();
    }
    if (await passButton.isEnabled()) {
      await passButton.click();
      submitted = true;
    }
  }

  return submitted;
}

async function clickNextPlayableCard(players: PlayerSession[], timeoutMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await submitPassesIfNeeded(players)) {
      await players[0].page.waitForTimeout(150);
      continue;
    }

    for (const player of players) {
      const playable = player.page.locator(
        '[data-testid="playing-card"][data-playable="true"]:not([disabled])'
      );
      if ((await playable.count()) > 0) {
        try {
          await playable.first().click({ timeout: 2_000 });
          return true;
        } catch {
          // The active card can change while trick previews update.
        }
      }
    }
    await players[0].page.waitForTimeout(150);
  }
  return false;
}

test("Compose services can create a 4-player room and play several turns", async ({
  browser,
}) => {
  const players = await Promise.all([
    newPlayer(browser, "ComposeHost"),
    newPlayer(browser, "ComposeP2"),
    newPlayer(browser, "ComposeP3"),
    newPlayer(browser, "ComposeP4"),
  ]);
  const errors = players.flatMap((player) => trackPageErrors(player.page));
  const [host, ...guests] = players;

  try {
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

    for (let turn = 0; turn < 4; turn += 1) {
      expect(await clickNextPlayableCard(players)).toBe(true);
    }

    await expect(host.page.getByTestId("player-seat")).toHaveCount(4);
    expect(errors).toEqual([]);
  } finally {
    await closePlayers(players);
  }
});
