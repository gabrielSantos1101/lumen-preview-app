import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useWebSocket } from "@/context/WebSocketContext";

// On web, use the browser's native WebRTC APIs
// On native, try to load react-native-webrtc
let RTCPeerConnection: any = null;
let RTCSessionDescription: any = null;
let RTCIceCandidate: any = null;
let getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null = null;
let webrtcAvailable = false;

if (Platform.OS === "web") {
  RTCPeerConnection = window.RTCPeerConnection;
  RTCSessionDescription = window.RTCSessionDescription;
  RTCIceCandidate = window.RTCIceCandidate;
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints);
  webrtcAvailable = true;
} else {
  try {
    const webrtc = require("react-native-webrtc");
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    getUserMedia = (constraints) => webrtc.mediaDevices.getUserMedia(constraints);
    webrtcAvailable = true;
  } catch {
    // react-native-webrtc not installed
  }
}

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export interface StreamingState {
  isStreaming: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  localStream: MediaStream | null;
  error: string | null;
  isWebRTCAvailable: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
}

export function useStreaming(): StreamingState {
  const { state, sendRaw, subscribeToMessages } = useWebSocket();
  const isConnected = state === "connected";

  const [isStreaming, setIsStreaming] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const stopStreaming = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => { t.stop(); });
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setIsStreaming(false);
    setError(null);
  }, []);

  useEffect(() => {
    return () => { stopStreaming(); };
  }, [stopStreaming]);

  // Handle incoming WebRTC signaling messages
  useEffect(() => {
    const unsubscribe = subscribeToMessages(async (msg) => {
      if (!pcRef.current) return;

      if (msg.event === "mobile_answer" && msg.sdp) {
        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: msg.sdp })
          );
        } catch {
          setError("Failed to apply remote answer");
        }
        return;
      }

      if (
        msg.event === "stream_ice_candidate" &&
        msg.stream_type === "mobile" &&
        msg.candidate
      ) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          // ignore stale candidates
        }
      }
    });

    return unsubscribe;
  }, [subscribeToMessages]);

  const startStreaming = useCallback(async () => {
    if (!isConnected) {
      setError("Not connected to desktop");
      return;
    }
    if (!webrtcAvailable || !getUserMedia) {
      setError("WebRTC not available — install react-native-webrtc");
      return;
    }
    if (!audioEnabled && !videoEnabled) {
      setError("Enable at least microphone or camera");
      return;
    }

    setError(null);

    try {
      const stream = await getUserMedia({
        audio: audioEnabled,
        video: videoEnabled ? { facingMode: "user", width: 1280, height: 720 } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (!ev.candidate) return;
        sendRaw({
          event: "webrtc_ice_candidate",
          stream_type: "mobile",
          candidate: ev.candidate,
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          stopStreaming();
          setError("Connection lost");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendRaw({ event: "mobile_offer", sdp: offer.sdp });
      setIsStreaming(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start streaming");
      stopStreaming();
    }
  }, [isConnected, audioEnabled, videoEnabled, sendRaw, stopStreaming]);

  const toggleAudio = useCallback(() => {
    if (isStreaming && localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
    }
    setAudioEnabled((prev) => !prev);
  }, [isStreaming]);

  const toggleVideo = useCallback(() => {
    if (isStreaming && localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
    }
    setVideoEnabled((prev) => !prev);
  }, [isStreaming]);

  return {
    isStreaming,
    audioEnabled,
    videoEnabled,
    localStream,
    error,
    isWebRTCAvailable: webrtcAvailable,
    toggleAudio,
    toggleVideo,
    startStreaming,
    stopStreaming,
  };
}
