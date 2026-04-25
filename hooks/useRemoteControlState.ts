import { useEffect, useRef, useState } from "react";
import type {
  GestureResponderEvent,
  LayoutChangeEvent,
} from "react-native";
import type { RemotePayload } from "@/utils/remoteCommands";
import type { RemoteSyncState } from "@/utils/remoteSync";
import { formatTime } from "@/utils/remoteSync";

interface UseRemoteControlStateParams {
  canPlayer: boolean;
  remoteSync: RemoteSyncState;
  sendCommand: (actionName: string, payload: RemotePayload) => boolean;
  haptic: (style?: "light" | "medium" | "heavy") => Promise<void>;
}

export function useRemoteControlState({
  canPlayer,
  remoteSync,
  sendCommand,
  haptic,
}: UseRemoteControlStateParams) {
  const progressTrackWidthRef = useRef(0);
  const isDraggingSeekRef = useRef(false);
  const localVolumeLockUntilRef = useRef(0);

  const [dragSeekRatio, setDragSeekRatio] = useState<number | null>(null);
  const [displayVolume, setDisplayVolume] = useState(remoteSync.state.volume);
  const [displayMuted, setDisplayMuted] = useState(remoteSync.state.isMuted);

  useEffect(() => {
    if (Date.now() >= localVolumeLockUntilRef.current) {
      setDisplayVolume(remoteSync.state.volume);
      setDisplayMuted(remoteSync.state.isMuted);
    }
  }, [remoteSync.state.isMuted, remoteSync.state.volume]);

  const playbackRatio =
    remoteSync.playback.duration > 0
      ? Math.max(0, Math.min(1, remoteSync.playback.position / remoteSync.playback.duration))
      : 0;

  const progressRatio = dragSeekRatio ?? playbackRatio;
  const previewPosition =
    dragSeekRatio !== null ? dragSeekRatio * remoteSync.playback.duration : remoteSync.playback.position;

  function lockLocalVolume() {
    localVolumeLockUntilRef.current = Date.now() + 1500;
  }

  function handleMute() {
    if (!sendCommand("mute", { event: "mute" })) return;
    lockLocalVolume();
    setDisplayMuted((prev) => !prev);
    haptic("light");
  }

  function handleVolumeDown() {
    const nextVolume = Math.max(0, displayVolume - 10);
    if (!sendCommand("set volume", { event: "set_volume", value: nextVolume })) return;
    lockLocalVolume();
    setDisplayVolume(nextVolume);
    if (nextVolume > 0) setDisplayMuted(false);
  }

  function handleVolumeUp() {
    const nextVolume = Math.min(100, displayVolume + 10);
    if (!sendCommand("set volume", { event: "set_volume", value: nextVolume })) return;
    lockLocalVolume();
    setDisplayVolume(nextVolume);
    if (nextVolume > 0) setDisplayMuted(false);
  }

  function updateSeekPreview(locationX: number) {
    if (progressTrackWidthRef.current <= 0) return 0;

    const ratio = Math.max(0, Math.min(1, locationX / progressTrackWidthRef.current));
    setDragSeekRatio(ratio);
    return ratio;
  }

  function commitSeek(ratio: number) {
    const duration = remoteSync.playback.duration;
    if (!canPlayer || duration <= 0) {
      isDraggingSeekRef.current = false;
      setDragSeekRatio(null);
      return;
    }

    const nextPosition = ratio * duration;
    if (sendCommand("seek", { event: "seek", value: nextPosition })) {
      haptic("light");
    }
    isDraggingSeekRef.current = false;
    setDragSeekRatio(null);
  }

  function handleSeekGrant(event: GestureResponderEvent) {
    if (!canPlayer || remoteSync.playback.duration <= 0) return;
    isDraggingSeekRef.current = true;
    updateSeekPreview(event.nativeEvent.locationX);
  }

  function handleSeekMove(event: GestureResponderEvent) {
    if (!isDraggingSeekRef.current) return;
    updateSeekPreview(event.nativeEvent.locationX);
  }

  function handleSeekRelease(event: GestureResponderEvent) {
    if (!isDraggingSeekRef.current) return;
    commitSeek(updateSeekPreview(event.nativeEvent.locationX));
  }

  function handleSeekTerminate() {
    isDraggingSeekRef.current = false;
    setDragSeekRatio(null);
  }

  function handleProgressLayout(event: LayoutChangeEvent) {
    progressTrackWidthRef.current = event.nativeEvent.layout.width;
  }

  return {
    displayMuted,
    displayVolume,
    elapsedTime: formatTime(previewPosition),
    handleMute,
    handleProgressLayout,
    handleSeekGrant,
    handleSeekMove,
    handleSeekRelease,
    handleSeekTerminate,
    handleVolumeDown,
    handleVolumeUp,
    progressRatio,
  };
}
