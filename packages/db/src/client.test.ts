import { afterEach, describe, expect, it, vi } from "vitest";
import { withPrismaConnectionRetry } from "./client.js";

describe("withPrismaConnectionRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries once after P1001 and returns the successful result", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: "P1001" })
      .mockResolvedValueOnce("connected");
    const sleep = vi.fn<(_: number) => Promise<void>>().mockResolvedValue();

    await expect(withPrismaConnectionRetry(operation, sleep)).resolves.toBe(
      "connected",
    );
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
  });

  it("does not retry non-connection Prisma errors", async () => {
    const failure = { code: "P2002" };
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(failure);
    const sleep = vi.fn<(_: number) => Promise<void>>().mockResolvedValue();

    await expect(withPrismaConnectionRetry(operation, sleep)).rejects.toBe(
      failure,
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries with the 1s/3s/7s schedule, then rethrows the last error", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const failure = { code: "P1001" };
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(failure);
    const sleep = vi.fn<(_: number) => Promise<void>>().mockResolvedValue();

    await expect(withPrismaConnectionRetry(operation, sleep)).rejects.toBe(
      failure,
    );
    expect(operation).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 3000, 7000]);
    expect(logSpy).toHaveBeenCalledTimes(3);
    expect(logSpy.mock.calls[0][0]).toBe(
      "[db] connection error P1001; retry 1/3 in 1000ms",
    );
    expect(logSpy.mock.calls[2][0]).toBe(
      "[db] connection error P1001; retry 3/3 in 7000ms",
    );
  });

  it.each(["P1002", "P1008", "P1017", "P2024"])(
    "retries %s once before succeeding",
    async (code) => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce({ code })
        .mockResolvedValueOnce("connected");
      const sleep = vi.fn<(_: number) => Promise<void>>().mockResolvedValue();

      await expect(withPrismaConnectionRetry(operation, sleep)).resolves.toBe(
        "connected",
      );
      expect(operation).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
    },
  );
});
