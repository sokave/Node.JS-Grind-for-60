export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchUserProfiles(userIds: string[]): Promise<UserProfile[]> {
  const requests: Promise<UserProfile>[] = userIds.map(
    async (id: string): Promise<UserProfile> => {
      const requestDelay: number = 50 + Math.floor(Math.random() * 101);
      await delay(requestDelay);

      return {
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`,
      };
    },
  );

  return await Promise.all(requests);
}

export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 1) {
    throw new RangeError("maxRetries має бути додатним цілим числом");
  }

  for (let attempt = 1; ; attempt += 1) {
    console.log(`Спроба ${attempt}...`);

    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      await delay(100);
    }
  }
}

export async function processInBatches(
  items: number[],
  batchSize: number,
  processor: (batch: number[]) => Promise<number[]>,
): Promise<number[]> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize має бути додатним цілим числом");
  }

  const total: number = Math.ceil(items.length / batchSize);
  const results: number[] = [];

  for (let index = 0; index < total; index += 1) {
    const offset: number = index * batchSize;
    const batch: number[] = items.slice(offset, offset + batchSize);
    console.log(`Обробка партії ${index + 1}/${total}...`);

    const processed: number[] = await processor(batch);
    for (const value of processed) {
      results.push(value);
    }
  }

  return results;
}

export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
