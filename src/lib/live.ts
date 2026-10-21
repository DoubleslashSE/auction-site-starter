// Live updates: the house's lot events from GET /api/v1/events (Server-Sent Events). Read with fetch, not EventSource,
// because the request must name the house (X-Tenant). Reconnects after a dropped connection.

import { useEffect, useRef } from "react";
import type { Schemas } from "./api";
import { getConfig } from "./config";

export type LotEvent = Schemas["LotEventDto"];

/** One event of a text/event-stream: its type and data. */
export interface ServerEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * Splits a growing text/event-stream into events. Feed it chunks as they arrive; it returns the events completed so
 * far and keeps the rest for the next chunk. Comment lines (": keep-alive") are skipped.
 */
export function createEventParser() {
  let buffer = "";
  return (chunk: string): ServerEvent[] => {
    buffer += chunk.replace(/\r\n?/g, "\n");
    const events: ServerEvent[] = [];
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event: ServerEvent = { event: "message", data: "" };
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line === "" || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event.event = value;
        else if (field === "data") data.push(value);
        else if (field === "id") event.id = value;
        else if (field === "retry" && /^\d+$/.test(value)) event.retry = Number(value);
      }

      if (data.length > 0 || event.retry !== undefined) {
        event.data = data.join("\n");
        events.push(event);
      }
    }

    return events;
  };
}

/** Calls `onLot` for every lot event of the house while the component is mounted. */
export function useLotEvents(onLot: (event: LotEvent) => void) {
  const handler = useRef(onLot);
  useEffect(() => {
    handler.current = onLot;
  });

  useEffect(() => {
    const stop = new AbortController();
    let retry = 3000;

    async function connect() {
      while (!stop.signal.aborted) {
        try {
          const response = await fetch(`${getConfig().api}/events`, {
            headers: { "X-Tenant": getConfig().tenant, Accept: "text/event-stream" },
            signal: stop.signal,
          });
          if (!response.ok || !response.body) throw new Error(`Live updates answered ${response.status}.`);
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          const parse = createEventParser();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const event of parse(value)) {
              if (event.retry !== undefined) retry = event.retry;
              if (event.event === "lot" && event.data) handler.current(JSON.parse(event.data) as LotEvent);
            }
          }
        } catch {
          if (stop.signal.aborted) return;
        }

        // Dropped (deploy, network, too many streams): try again a little later, then the page catches up from events.
        await new Promise((resolve) => setTimeout(resolve, retry + Math.random() * 2000));
      }
    }

    void connect();
    return () => stop.abort();
  }, []);
}
