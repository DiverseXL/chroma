import type { Event } from "@chroma/core";
import { eventBus } from "@/lib/engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Server-Sent Events stream for real-time run execution updates.
 * Supports optional event replay from a given sequence number, periodic heartbeats, and graceful disconnection.
 *
 * @param req HTTP request object with query parameters and abort signal.
 * @param context Dynamic route parameters resolving the run ID.
 * @returns Streaming HTTP response with SSE headers.
 */
export async function GET(
  req: Request,
  context: RouteParams,
): Promise<Response> {
  const { id } = await context.params;
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const fromSequence = fromParam !== null ? parseInt(fromParam, 10) : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let replayComplete = false;
      let lastSentSequence = fromSequence ?? 0;
      const pendingLiveEvents: Event[] = [];
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let closeStream = () => {};

      const safeEnqueue = (payload: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            closeStream();
          }
        }
      };

      const sendEvent = (evt: Event) => {
        if (evt.sequence <= lastSentSequence) return;
        lastSentSequence = evt.sequence;
        safeEnqueue(`data: ${JSON.stringify(evt)}\n\n`);
      };

      const unsubscribe = eventBus.subscribe(id, (evt: Event) => {
        if (replayComplete) {
          sendEvent(evt);
        } else {
          pendingLiveEvents.push(evt);
        }
      });

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Stream already finished or cancelled.
          }
        }
      };
      closeStream = cleanup;

      req.signal.addEventListener("abort", cleanup, { once: true });
      if (req.signal.aborted) {
        cleanup();
        return;
      }

      if (fromSequence !== undefined) {
        try {
          const pastEvents = await eventBus.replay(id, fromSequence);
          for (const evt of pastEvents) sendEvent(evt);
        } catch (replayError) {
          console.error("Error replaying events for SSE:", replayError);
        }
      }

      replayComplete = true;
      pendingLiveEvents.sort((left, right) => left.sequence - right.sequence);
      for (const evt of pendingLiveEvents) sendEvent(evt);
      if (isClosed) return;

      // Periodic heartbeat comment every 15 seconds
      heartbeatTimer = setInterval(() => {
        safeEnqueue(": heartbeat\n\n");
      }, 15000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
