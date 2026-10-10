import { describe, expect, it, vi } from "vitest";
import { withPrismaConnectionRetry } from "./client.js";

describe("withPrismaConnectionRetry", () => {
  it("retries once after P1001 and returns the successful result", async () => {
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
});
