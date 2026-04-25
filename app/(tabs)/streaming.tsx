import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { useColors } from "@/hooks/useColors";
import { useWebSocket } from "@/context/WebSocketContext";
import { useStreaming } from "@/hooks/useStreaming";

// RTCView from react-native-webrtc for camera preview
let RTCView: any = null;
try {
  RTCView = require("react-native-webrtc").RTCView;
} catch {}

function ConnectionBanner() {
  const colors = useColors();
  const { state } = useWebSocket();
  if (state === "connected") return null;
  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push("/(tabs)/pairing")}
      activeOpacity={0.8}
    >
      <Feather name="alert-circle" size={14} color="#f59e0b" />
      <Text style={[styles.bannerText, { color: "#f59e0b" }]}>
        {state === "idle" ? "NOT CONNECTED — TAP TO PAIR" : "CONNECTING..."}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

export default function StreamingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { state } = useWebSocket();
  const isConnected = state === "connected";

  const {
    isStreaming,
    audioEnabled,
    videoEnabled,
    localStream,
    error,
    isWebRTCAvailable,
    toggleAudio,
    toggleVideo,
    startStreaming,
    stopStreaming,
  } = useStreaming();

  const canStart = isConnected && (audioEnabled || videoEnabled);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Streaming</Text>
        {isStreaming && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      <ConnectionBanner />

      {/* Camera preview */}
      {isStreaming && videoEnabled && localStream && RTCView ? (
        <View style={[styles.previewContainer, { borderColor: colors.border }]}>
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.preview}
            objectFit="cover"
            mirror
          />
        </View>
      ) : videoEnabled && !isStreaming ? (
        <View
          style={[
            styles.previewContainer,
            styles.previewPlaceholder,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <MaterialCommunityIcons name="camera-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
            Camera preview starts when streaming
          </Text>
        </View>
      ) : null}

      {/* Mode toggles */}
      <View style={styles.modesRow}>
        <ModeCard
          label="Microphone"
          icon="microphone"
          active={audioEnabled}
          onPress={toggleAudio}
          colors={colors}
          disabled={isStreaming}
        />
        <ModeCard
          label="Camera"
          icon="camera"
          active={videoEnabled}
          onPress={toggleVideo}
          colors={colors}
          disabled={isStreaming}
        />
      </View>

      {/* Status / error */}
      {!isWebRTCAvailable && (
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Install react-native-webrtc to enable streaming
          </Text>
        </View>
      )}

      {error ? (
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: "#ef4444" }]}>
          <Feather name="alert-circle" size={14} color="#ef4444" />
          <Text style={[styles.infoText, { color: "#ef4444" }]}>{error}</Text>
        </View>
      ) : null}

      {/* Start / Stop button */}
      <View style={styles.actionRow}>
        {!isStreaming ? (
          <TouchableOpacity
            style={[
              styles.mainBtn,
              {
                backgroundColor: canStart ? colors.primary : colors.card,
                borderColor: canStart ? colors.primary : colors.border,
              },
            ]}
            onPress={startStreaming}
            disabled={!canStart}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="broadcast"
              size={22}
              color={canStart ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.mainBtnText,
                { color: canStart ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              Start Streaming
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.mainBtn, styles.stopBtn, { borderColor: "#ef4444" }]}
            onPress={stopStreaming}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="stop-circle-outline" size={22} color="#ef4444" />
            <Text style={[styles.mainBtnText, { color: "#ef4444" }]}>Stop Streaming</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hint */}
      {!isStreaming && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {!isConnected
            ? "Connect to a desktop to start streaming."
            : !audioEnabled && !videoEnabled
            ? "Enable microphone or camera to stream."
            : `Ready to stream${audioEnabled && videoEnabled ? " audio and video" : audioEnabled ? " audio" : " video"} to the desktop.`}
        </Text>
      )}

      {isStreaming && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {audioEnabled && videoEnabled
            ? "Sending audio and video to desktop."
            : audioEnabled
            ? "Sending audio to desktop."
            : "Sending video to desktop."}
        </Text>
      )}
    </View>
  );
}

interface ModeCardProps {
  label: string;
  icon: "microphone" | "camera";
  active: boolean;
  onPress: () => void;
  disabled: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}

function ModeCard({ label, icon, active, onPress, disabled, colors }: ModeCardProps) {
  const iconName =
    icon === "microphone"
      ? active
        ? "microphone"
        : "microphone-off"
      : active
      ? "camera"
      : "camera-off";

  return (
    <TouchableOpacity
      style={[
        styles.modeCard,
        {
          backgroundColor: active ? colors.primary + "22" : colors.card,
          borderColor: active ? colors.primary : colors.border,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <MaterialCommunityIcons
        name={iconName}
        size={32}
        color={active ? colors.primary : colors.mutedForeground}
      />
      <Text
        style={[
          styles.modeLabel,
          { color: active ? colors.primary : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.modeToggle,
          { backgroundColor: active ? colors.primary : colors.border },
        ]}
      >
        <Text style={[styles.modeToggleText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
          {active ? "ON" : "OFF"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ef4444",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  liveText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "SpaceGrotesk_700Bold",
    letterSpacing: 1,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "SpaceGrotesk_600SemiBold",
    letterSpacing: 0.5,
  },
  previewContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  previewPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  previewHint: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  preview: {
    flex: 1,
  },
  modesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  modeCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  modeLabel: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  modeToggle: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  modeToggleText: {
    fontSize: 11,
    fontFamily: "SpaceGrotesk_700Bold",
    letterSpacing: 1,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  actionRow: {
    marginBottom: 12,
  },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
  },
  stopBtn: {
    backgroundColor: "#ef444422",
  },
  mainBtnText: {
    fontSize: 16,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  hint: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
    paddingHorizontal: 16,
  },
});
