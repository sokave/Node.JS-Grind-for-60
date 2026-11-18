import {
  delay,
  fetchUserProfiles,
  processInBatches,
  raceWithTimeout,
  retryOperation,
} from "./async-utils";

async function main(): Promise<void> {
  console.log("=== Тест 1. Паралельне завантаження ===");
  console.time("fetchUserProfiles");
  const profiles = await fetchUserProfiles(["1", "2", "3", "4", "5"]);
  console.timeEnd("fetchUserProfiles");
  console.log(`Завантажено ${profiles.length} профілів`);

  console.log("\n=== Тест 2. Повторні спроби ===");
  let attempt = 0;
  const result = await retryOperation(async (): Promise<string> => {
    attempt += 1;
    if (attempt < 2) {
      throw new Error("Тимчасова помилка");
    }
    return "Успіх!";
  }, 3);
  console.log(result);

  console.log("\n=== Тест 3. Послідовна обробка партій ===");
  const items: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const processed = await processInBatches(items, 3, async (batch) => {
    await delay(50);
    return batch.map((value) => value * 2);
  });
  console.log("Оброблено:", processed);

  console.log("\n=== Тест 4. Таймаут ===");
  const timeoutMs = 100;
  const fast = delay(50).then(() => "Готово");
  console.log(await raceWithTimeout(fast, timeoutMs));

  try {
    await raceWithTimeout(delay(200), timeoutMs);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== `Operation timed out after ${timeoutMs}ms`
    ) {
      throw error;
    }
    console.error(error.message);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
