import type { RetryingPrismaClient } from "@chroma/db";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./bus.js";

describe("EventBus", () => {
  it("assigns concurrent events unique sequences with one atomic query per event", async () => {
    let sequence = 0;
    const created: Array<Record<string, unknown>> = [];
    const queryRaw = vi.fn(async () => [{ eventSequence: ++sequence }]);
    const db = {
      $queryRaw: queryRaw,
      event: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const event = { id: `event-${data.sequence}`, ...data };
          created.push(event);
          return event;
        }),
      },
    } as unknown as RetryingPrismaClient;
    const bus = new EventBus({ db });

    const events = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        bus.publish("run-1", {
          type: "node.status",
          nodeId: `node-${index}`,
          payload: { status: "RUNNING" },
        }),
      ),
    );

    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(created.map((event) => event.sequence).sort()).toEqual([
      1, 2, 3, 4,
    ]);
    expect(events.map((event) => event.sequence).sort()).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("does not insert an event when its run does not exist", async () => {
    const eventCreate = vi.fn();
    const db = {
      $queryRaw: vi.fn(async () => []),
      event: { create: eventCreate },
    } as unknown as RetryingPrismaClient;
    const bus = new EventBus({ db });

    await expect(
      bus.publish("missing-run", { type: "run.created", payload: {} }),
    ).rejects.toThrow('Cannot publish event: run "missing-run" was not found');
    expect(eventCreate).not.toHaveBeenCalled();
  });
});
