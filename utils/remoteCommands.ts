import type { Permissions } from "@/utils/remoteTypes";

export type RemoteEvent =
  | "play_pause"
  | "stop"
  | "next"
  | "previous"
  | "mute"
  | "set_volume"
  | "seek"
  | "set_loop"
  | "load_url"
  | "load_lyric"
  | "metadata"
  | "progress";

export type RemotePayload =
  | { event: "play_pause" }
  | { event: "stop" }
  | { event: "next" }
  | { event: "previous" }
  | { event: "mute" }
  | { event: "set_volume"; value: number }
  | { event: "seek"; value: number }
  | { event: "set_loop"; value: 0 | 1 }
  | { event: "load_url"; url: string; value?: number }
  | { event: "load_lyric"; url: string }
  | { event: "metadata"; title?: string; artist?: string; url?: string }
  | { event: "progress"; value: number; duration: number };

export const EVENT_PERMISSION_MAP: Record<RemoteEvent, keyof Permissions> = {
  play_pause: "player",
  stop: "player",
  next: "player",
  previous: "player",
  mute: "player",
  set_volume: "player",
  seek: "player",
  set_loop: "player",
  load_url: "player",
  metadata: "player",
  progress: "player",
  load_lyric: "lyrics",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRemotePayload(payload: RemotePayload): RemotePayload {
  switch (payload.event) {
    case "set_volume":
      return { ...payload, value: clamp(Math.round(payload.value), 0, 100) };
    case "seek":
      return { ...payload, value: Math.max(0, payload.value) };
    case "set_loop":
      return { ...payload, value: payload.value === 1 ? 1 : 0 };
    case "load_url":
      return {
        ...payload,
        value: payload.value === undefined ? 0 : Math.max(0, payload.value),
      };
    case "progress":
      return {
        ...payload,
        value: Math.max(0, payload.value),
        duration: Math.max(0, payload.duration),
      };
    default:
      return payload;
  }
}

export function parseRemotePayload(raw: unknown): RemotePayload | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as Record<string, unknown>;
  const event = payload.event;

  if (typeof event !== "string") return null;

  switch (event) {
    case "play_pause":
    case "stop":
    case "next":
    case "previous":
    case "mute":
      return { event };
    case "set_volume":
      return typeof payload.value === "number" ? normalizeRemotePayload({ event, value: payload.value }) : null;
    case "seek":
      return typeof payload.value === "number" ? normalizeRemotePayload({ event, value: payload.value }) : null;
    case "set_loop":
      return typeof payload.value === "number"
        ? normalizeRemotePayload({ event, value: payload.value === 1 ? 1 : 0 })
        : null;
    case "load_url":
      return typeof payload.url === "string"
        ? normalizeRemotePayload({
            event,
            url: payload.url,
            value: typeof payload.value === "number" ? payload.value : 0,
          })
        : null;
    case "load_lyric":
      return typeof payload.url === "string" ? { event, url: payload.url } : null;
    case "metadata":
      return {
        event,
        title: typeof payload.title === "string" ? payload.title : undefined,
        artist: typeof payload.artist === "string" ? payload.artist : undefined,
        url: typeof payload.url === "string" ? payload.url : undefined,
      };
    case "progress":
      return typeof payload.value === "number" && typeof payload.duration === "number"
        ? normalizeRemotePayload({ event, value: payload.value, duration: payload.duration })
        : null;
    default:
      return null;
  }
}
