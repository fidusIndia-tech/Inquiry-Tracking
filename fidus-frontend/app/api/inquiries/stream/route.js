import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

export async function GET() {
  let pgClient;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (txt) => { if (!closed) controller.enqueue(enc.encode(txt)); };

      try {
        pgClient = await pool.connect();
        await pgClient.query("LISTEN inquiries_changed");

        send(": connected\n\n");

        pgClient.on("notification", () => send("data: update\n\n"));
        pgClient.on("error", () => { if (!closed) { closed = true; controller.close(); } });

        // Heartbeat every 25 s — keeps the connection alive through Railway's proxy
        const hb = setInterval(() => {
          if (closed) { clearInterval(hb); return; }
          send(": heartbeat\n\n");
        }, 25000);

      } catch {
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() {
      closed = true;
      if (pgClient) pgClient.query("UNLISTEN inquiries_changed").finally(() => pgClient.release());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
