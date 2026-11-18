import {
  delay,
  fetchUserProfiles,
  processInBatches,
  raceWithTimeout,
  retryOperation,
  type UserProfile,
} from "../src/async-utils";

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("delay", () => {
  it("очікує задану кількість мілісекунд", async () => {
    let completed = false;
    const pending = delay(75).then(() => {
      completed = true;
    });

    await jest.advanceTimersByTimeAsync(74);
    expect(completed).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(completed).toBe(true);
  });
});

describe("fetchUserProfiles", () => {
  it("повертає профіль із заданим ідентифікатором", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    const result: Promise<UserProfile[]> = fetchUserProfiles(["42"]);

    await jest.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toEqual([
      { id: "42", name: "User 42", email: "user42@example.com" },
    ]);
  });

  it("запускає запити паралельно й повертає профілі в порядку вхідних ID", async () => {
    const ids: string[] = ["63", "4", "20"];
    jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.9999)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);

    const result = fetchUserProfiles(ids);
    expect(jest.getTimerCount()).toBe(3);

    await jest.advanceTimersByTimeAsync(50);
    expect(jest.getTimerCount()).toBe(2);
    await jest.advanceTimersByTimeAsync(100);

    const profiles = await result;
    expect(profiles).toHaveLength(3);
    expect(profiles.map(({ id }) => id)).toEqual(ids);
  });

  it("повертає порожній масив для порожнього входу", async () => {
    await expect(fetchUserProfiles([])).resolves.toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("retryOperation", () => {
  it("повертає типізований результат успішної операції з першої спроби", async () => {
    const operation = jest.fn<Promise<{ count: number }>, []>()
      .mockResolvedValue({ count: 4 });

    const result: { count: number } = await retryOperation(operation);

    expect(result.count).toBe(4);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("чекає 100 мс між спробами й повертає успішний результат", async () => {
    const operation = jest.fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error("Перша помилка"))
      .mockRejectedValueOnce(new Error("Друга помилка"))
      .mockResolvedValue(42);

    const pending = retryOperation(operation, 3);

    await jest.advanceTimersByTimeAsync(99);
    expect(operation).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toBe(42);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(console.log).toHaveBeenLastCalledWith("Спроба 3...");
  });

  it("передає останню помилку після трьох спроб за замовчуванням", async () => {
    const lastError = new Error("Помилка останньої спроби");
    const operation = jest.fn<Promise<never>, []>()
      .mockRejectedValueOnce(new Error("Перша помилка"))
      .mockRejectedValueOnce(new Error("Друга помилка"))
      .mockRejectedValue(lastError);

    const rejected = expect(retryOperation(operation)).rejects.toBe(lastError);
    await jest.advanceTimersByTimeAsync(200);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
    await rejected;
  });

  it("дотримується явно заданого ліміту однієї спроби", async () => {
    const operation = jest.fn<Promise<never>, []>()
      .mockRejectedValue(new Error("Операція відхилена"));

    await expect(retryOperation(operation, 1)).rejects.toThrow("Операція відхилена");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, 1.5])("відхиляє некоректний ліміт %s", async (limit: number) => {
    const operation = jest.fn<Promise<number>, []>().mockResolvedValue(1);

    await expect(retryOperation(operation, limit)).rejects.toThrow(RangeError);
    expect(operation).not.toHaveBeenCalled();
  });
});

describe("processInBatches", () => {
  it("обробляє кожну партію послідовно, включно з неповною останньою", async () => {
    const processor = jest.fn<Promise<number[]>, [number[]]>(
      async (batch) => {
        await delay(25);
        return batch.map((value) => value * 2);
      },
    );
    const items: number[] = [1, 2, 3, 4, 5];
    const result = processInBatches(items, 2, processor);
    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenNthCalledWith(1, [1, 2]);

    await jest.advanceTimersByTimeAsync(24);
    expect(processor).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(processor).toHaveBeenCalledTimes(2);
    expect(processor).toHaveBeenNthCalledWith(2, [3, 4]);
    await jest.advanceTimersByTimeAsync(25);
    expect(processor).toHaveBeenCalledTimes(3);
    expect(processor).toHaveBeenNthCalledWith(3, [5]);
    await jest.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual([2, 4, 6, 8, 10]);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(console.log).toHaveBeenLastCalledWith("Обробка партії 3/3...");
  });

  it("виводить тип результату з обробника, який повертає рядки", async () => {
    const records = [{ id: 8 }, { id: 2 }, { id: 9 }];

    const labels: string[] = await processInBatches(
      records,
      2,
      async (batch) => batch.map(({ id }) => String(id)),
    );

    expect(labels).toEqual(["8", "2", "9"]);
  });

  it("повертає порожній результат для порожнього масиву", async () => {
    const processor = jest.fn<Promise<number[]>, [number[]]>();

    await expect(processInBatches([], 2, processor)).resolves.toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it("передає помилку обробника й зупиняє обробку", async () => {
    const failure = new Error("Помилка партії");
    const processor = jest.fn<Promise<number[]>, [number[]]>().mockRejectedValue(failure);

    await expect(processInBatches([1, 2, 3], 2, processor)).rejects.toBe(failure);
    expect(processor).toHaveBeenCalledTimes(1);
  });

  it.each([0, 2.5])("відхиляє некоректний розмір партії %s", async (size: number) => {
    const processor = jest.fn<Promise<number[]>, [number[]]>();

    await expect(processInBatches([1], size, processor)).rejects.toThrow(RangeError);
    expect(processor).not.toHaveBeenCalled();
  });
});

describe("raceWithTimeout", () => {
  it("повертає типізоване значення швидкої операції й очищає таймер", async () => {
    const fast = delay(20).then(() => ({ ready: true }));
    const result: Promise<{ ready: boolean }> = raceWithTimeout(fast, 80);

    await jest.advanceTimersByTimeAsync(20);

    await expect(result).resolves.toEqual({ ready: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("передає помилку операції до таймауту й очищає таймер", async () => {
    const failure = new Error("Операцію відхилено");
    const work = delay(20).then(() => {
      throw failure;
    });
    const rejected = expect(raceWithTimeout(work, 80)).rejects.toBe(failure);

    await jest.advanceTimersByTimeAsync(20);
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
  });

  it("відхиляє результат, коли спливає час очікування", async () => {
    const slow = delay(210).then(() => "Готово");
    const result = raceWithTimeout(slow, 80);
    const rejected = expect(result).rejects.toThrow(
      new Error("Operation timed out after 80ms"),
    );

    await jest.advanceTimersByTimeAsync(79);
    expect(jest.getTimerCount()).toBe(2);
    await jest.advanceTimersByTimeAsync(1);
    await rejected;
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(130);
    await expect(slow).resolves.toBe("Готово");
  });
});
