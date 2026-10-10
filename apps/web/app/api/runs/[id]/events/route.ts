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

      const safeEnqueue = (payload: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            isClosed = true;
          }
        }
      };

      // Replay historical events if requested
      if (fromSequence !== undefined) {
        try {
          const pastEvents = await eventBus.replay(id, fromSequence);
          for (const evt of pastEvents) {
            safeEnqueue(`data: ${JSON.stringify(evt)}\n\n`);
          }
        } catch (replayError) {
          console.error("Error replaying events for SSE:", replayError);
        }
      }

      // Subscribe to live run events
      const unsubscribe = eventBus.subscribe(id, (evt: Event) => {
        safeEnqueue(`data: ${JSON.stringify(evt)}\n\n`);
      });

      // Periodic heartbeat comment every 15 seconds
      const heartbeatTimer = setInterval(() => {
        safeEnqueue(": heartbeat\n\n");
      }, 15000);

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          clearInterval(heartbeatTimer);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Stream already finished or cancelled
          }
        }
      };

      req.signal.addEventListener("abort", cleanup);
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
