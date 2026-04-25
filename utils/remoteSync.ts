export interface SyncedMedia {
  url: string | null;
  title: string | null;
  artist: string | null;
  type: string | null;
}

export interface SyncedPlayback {
  isPlaying: boolean;
  position: number;
  duration: number;
  sentAt: number | null;
}

export interface SyncedPlayerState {
  isLoop: boolean;
  isMuted: boolean;
  volume: number;
}

export interface SyncedLyric {
  active: boolean;
  url: string | null;
  slideIndex: number;
  totalSlides: number;
}

export interface RemoteSyncState {
  media: SyncedMedia;
  playback: SyncedPlayback;
  state: SyncedPlayerState;
  lyric: SyncedLyric | null;
  lastAction: string | null;
}

export const EMPTY_REMOTE_SYNC: RemoteSyncState = {
  media: {
    url: null,
    title: null,
    artist: null,
    type: null,
  },
  playback: {
    isPlaying: false,
    position: 0,
    duration: 0,
    sentAt: null,
  },
  state: {
    isLoop: false,
    isMuted: false,
    volume: 0,
  },
  lyric: null,
  lastAction: null,
};

export function normalizeSentAt(sentAt: unknown): number | null {
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt) || sentAt <= 0) return null;
  return sentAt > 1_000_000_000_000 ? sentAt : sentAt * 1000;
}

export function clampProgress(position: number, duration: number): number {
  if (!Number.isFinite(position)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, position);
  return Math.min(Math.max(0, position), duration);
}

export function hydratePosition(position: number, duration: number, isPlaying: boolean, sentAt: number | null) {
  if (!isPlaying || !sentAt) return clampProgress(position, duration);

  const driftSeconds = Math.max(0, (Date.now() - sentAt) / 1000);
  return clampProgress(position + driftSeconds, duration);
}

export function formatTime(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
