import type { RemotePayload } from "@/utils/remoteCommands";
import {
  EMPTY_REMOTE_SYNC,
  clampProgress,
  hydratePosition,
  normalizeSentAt,
  type RemoteSyncState,
} from "@/utils/remoteSync";

export interface PlaybackClock {
  isPlaying: boolean;
  anchorPosition: number;
  anchorStartedAt: number;
  duration: number;
}

export function createPlaybackClock(): PlaybackClock {
  return {
    isPlaying: false,
    anchorPosition: 0,
    anchorStartedAt: 0,
    duration: 0,
  };
}

export function resetRemoteSyncState() {
  return {
    sync: EMPTY_REMOTE_SYNC,
    clock: createPlaybackClock(),
  };
}

export function advanceRemoteSyncState(
  sync: RemoteSyncState,
  clock: PlaybackClock,
  now = Date.now()
): RemoteSyncState {
  if (!clock.isPlaying) return sync;

  const nextPosition = clampProgress(
    clock.anchorPosition + (now - clock.anchorStartedAt) / 1000,
    clock.duration
  );

  if (Math.abs(nextPosition - sync.playback.position) < 0.25) {
    return sync;
  }

  return {
    ...sync,
    playback: {
      ...sync.playback,
      position: nextPosition,
    },
  };
}

export function applyOptimisticRemoteCommand(
  sync: RemoteSyncState,
  clock: PlaybackClock,
  payload: RemotePayload,
  now = Date.now()
) {
  switch (payload.event) {
    case "play_pause": {
      const nextIsPlaying = !sync.playback.isPlaying;
      return {
        sync: {
          ...sync,
          playback: {
            ...sync.playback,
            isPlaying: nextIsPlaying,
          },
          lastAction: "play_pause",
        },
        clock: {
          ...clock,
          isPlaying: nextIsPlaying,
          anchorPosition: sync.playback.position,
          anchorStartedAt: nextIsPlaying ? now : 0,
          duration: sync.playback.duration,
        },
      };
    }
    case "stop":
      return {
        sync: {
          ...sync,
          playback: {
            ...sync.playback,
            isPlaying: false,
            position: 0,
          },
          lastAction: "stop",
        },
        clock: {
          ...clock,
          isPlaying: false,
          anchorPosition: 0,
          anchorStartedAt: 0,
          duration: sync.playback.duration,
        },
      };
    case "seek": {
      const nextPosition = clampProgress(payload.value, sync.playback.duration);
      return {
        sync: {
          ...sync,
          playback: {
            ...sync.playback,
            position: nextPosition,
          },
          lastAction: "seek",
        },
        clock: {
          ...clock,
          isPlaying: sync.playback.isPlaying,
          anchorPosition: nextPosition,
          anchorStartedAt: sync.playback.isPlaying ? now : 0,
          duration: sync.playback.duration,
        },
      };
    }
    case "set_volume":
      return {
        sync: {
          ...sync,
          state: {
            ...sync.state,
            volume: payload.value,
          },
          lastAction: "set_volume",
        },
        clock,
      };
    case "mute":
      return {
        sync: {
          ...sync,
          state: {
            ...sync.state,
            isMuted: !sync.state.isMuted,
          },
          lastAction: "mute",
        },
        clock,
      };
    case "set_loop":
      return {
        sync: {
          ...sync,
          state: {
            ...sync.state,
            isLoop: payload.value === 1,
          },
          lastAction: "set_loop",
        },
        clock,
      };
    case "next":
    case "previous":
    case "load_url":
    case "load_lyric":
    case "metadata":
    case "progress":
      return {
        sync: {
          ...sync,
          lastAction: payload.event,
        },
        clock,
      };
    default:
      return { sync, clock };
  }
}

export function applyPlayerSyncMessage(
  sync: RemoteSyncState,
  message: Record<string, unknown>,
  now = Date.now()
) {
  const media = (message.media ?? {}) as Record<string, unknown>;
  const playback = (message.playback ?? {}) as Record<string, unknown>;
  const state = (message.state ?? {}) as Record<string, unknown>;
  const lyric = (message.lyric ?? {}) as Record<string, unknown>;
  const sentAt = normalizeSentAt(playback.sent_at);
  const duration = typeof playback.duration === "number" ? Math.max(0, playback.duration) : 0;
  const isPlaying = playback.is_playing === true;
  const position = hydratePosition(
    typeof playback.position === "number" ? playback.position : 0,
    duration,
    isPlaying,
    sentAt
  );

  return {
    sync: {
      ...sync,
      media: {
        url: typeof media.url === "string" ? media.url : sync.media.url,
        title: typeof media.title === "string" ? media.title : sync.media.title,
        artist: typeof media.artist === "string" ? media.artist : sync.media.artist,
        type: typeof media.type === "string" ? media.type : sync.media.type,
      },
      playback: {
        isPlaying,
        position,
        duration,
        sentAt,
      },
      state: {
        isLoop: typeof state.is_loop === "boolean" ? state.is_loop : sync.state.isLoop,
        isMuted: typeof state.is_muted === "boolean" ? state.is_muted : sync.state.isMuted,
        volume:
          typeof state.volume === "number"
            ? Math.max(0, Math.min(100, Math.round(state.volume)))
            : sync.state.volume,
      },
      lyric:
        lyric.active === true
          ? {
              active: true,
              url: typeof lyric.url === "string" ? lyric.url : null,
              slideIndex:
                typeof lyric.slide_index === "number"
                  ? Math.max(0, Math.floor(lyric.slide_index))
                  : 0,
              totalSlides:
                typeof lyric.total_slides === "number"
                  ? Math.max(0, Math.floor(lyric.total_slides))
                  : 0,
            }
          : null,
      lastAction: typeof message.action === "string" ? message.action : sync.lastAction,
    },
    clock: {
      isPlaying,
      anchorPosition: position,
      anchorStartedAt: isPlaying ? now : 0,
      duration,
    },
  };
}
