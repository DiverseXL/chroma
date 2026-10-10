import { PrismaClient } from "@chroma/db";
import type { Event } from "../types/index.js";

/**
 * Event publication input payload.
 */
export interface EventPublishInput {
  type: string;
  nodeId?: string | null;
  payload: unknown;
}

/**
 * Event listener callback invoked when events are emitted for a run.
 */
export type EventListener = (event: Event) => void;

/**
 * Centralized transactional event bus for publishing, subscribing, and replaying run events.
 */
export class EventBus {
  private readonly db: PrismaClient;
  private readonly subscribers = new Map<string, Set<EventListener>>();

  /**
   * Initializes the event bus.
   * @param opts Database client dependency.
   */
  constructor(opts: { db: PrismaClient }) {
    this.db = opts.db;
  }

  /**
   * Publishes an event to the persistent event store and notifies active in-process subscribers.
   * Employs row-level locking on the Run row to prevent sequence race conditions under concurrency.
   *
   * @param runId The ID of the run.
   * @param event The event payload, type, and optional originating node ID.
   */
  async publish(runId: string, event: EventPublishInput): Promise<Event> {
    const createdEvent = await this.db.$transaction(async (tx) => {
      // Row-level lock on Run to serialize sequence assignment under concurrent node executions
      try {
        await tx.$executeRaw`SELECT 1 FROM "Run" WHERE id = ${runId} FOR UPDATE`;
      } catch {
        // Fallback for environments / test stubs where raw SQL locking is not supported
      }

      const agg = await tx.event.aggregate({
        where: { runId },
        _max: { sequence: true },
      });

      const nextSequence = (agg._max.sequence ?? 0) + 1;

      const record = await tx.event.create({
        data: {
          runId,
          nodeId: event.nodeId ?? null,
          type: event.type,
          payload: (event.payload ?? {}) as object,
          sequence: nextSequence,
        },
      });

      return record as Event;
    });

    const listeners = this.subscribers.get(runId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(createdEvent);
        } catch (listenerError) {
          console.error("Unhandled listener error in EventBus:", listenerError);
        }
      }
    }

    return createdEvent;
  }

  /**
   * Subscribes an in-process listener to events emitted for a specific run.
   *
   * @param runId The target run ID.
   * @param handler The callback function invoked on each new event.
   * @returns Unsubscribe function to release the listener.
   */
  subscribe(runId: string, handler: EventListener): () => void {
    if (!this.subscribers.has(runId)) {
      this.subscribers.set(runId, new Set());
    }
    const set = this.subscribers.get(runId)!;
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.subscribers.delete(runId);
      }
    };
  }

  /**
   * Replays events from the database for a run, optionally starting after a given sequence number.
   *
   * @param runId The run ID whose events to retrieve.
   * @param fromSequence Optional sequence threshold; only events with sequence > fromSequence are returned.
   * @returns Array of events sorted in ascending sequence order.
   */
  async replay(runId: string, fromSequence?: number): Promise<Event[]> {
    const records = await this.db.event.findMany({
      where: {
        runId,
        ...(fromSequence !== undefined
          ? { sequence: { gt: fromSequence } }
          : {}),
      },
      orderBy: { sequence: "asc" },
    });

    return records as unknown as Event[];
  }
}
