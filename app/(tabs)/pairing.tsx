import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";

import { useColors } from "@/hooks/useColors";
import { useWebSocket, WSState } from "@/context/WebSocketContext";
import { loadDeviceName, saveDeviceName } from "@/utils/storage";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const FINDER_SIZE = Math.min(SCREEN_W * 0.7, 280);

function StateIndicator({ state }: { state: WSState }) {
  const colors = useColors();
  const config: Record<WSState, { label: string; color: string }> = {
    idle: { label: "DISCONNECTED", color: colors.mutedForeground },
    connecting: { label: "CONNECTING...", color: "#f59e0b" },
    registering: { label: "REGISTERING...", color: "#f59e0b" },
    authenticating: { label: "AUTHENTICATING...", color: "#f59e0b" },
    connected: { label: "CONNECTED", color: "#22c55e" },
    error: { label: "ERROR", color: "#ef4444" },
  };
  const { label, color } = config[state];
  const isAnimating = ["connecting", "registering", "authenticating"].includes(state);
  return (
    <View style={styles.stateRow}>
      {isAnimating ? (
        <ActivityIndicator size="small" color={color} style={{ marginRight: 6 }} />
      ) : (
        <View style={[styles.stateDot, { backgroundColor: color }]} />
      )}
      <Text style={[styles.stateLabel, { color }]}>{label}</Text>
    </View>
  );
}

function CornerBracket({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const color = "#b9c3ff";
  const size = 22;
  const thickness = 3;
  const radius = 5;
  const isTop = position.startsWith("t");
  const isLeft = position.endsWith("l");
  return (
    <View
      style={{
        position: "absolute",
        width: size,
        height: size,
        top: isTop ? 0 : undefined,
        bottom: !isTop ? 0 : undefined,
        left: isLeft ? 0 : undefined,
        right: !isLeft ? 0 : undefined,
        borderTopWidth: isTop ? thickness : 0,
        borderBottomWidth: !isTop ? thickness : 0,
        borderLeftWidth: isLeft ? thickness : 0,
        borderRightWidth: !isLeft ? thickness : 0,
        borderColor: color,
        borderTopLeftRadius: position === "tl" ? radius : 0,
        borderTopRightRadius: position === "tr" ? radius : 0,
        borderBottomLeftRadius: position === "bl" ? radius : 0,
        borderBottomRightRadius: position === "br" ? radius : 0,
      }}
    />
  );
}

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (ip: string | null, token: string) => void;
}

function QRScannerModal({ visible, onClose, onScanned }: QRScannerModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setScanned(false);
    setScanError(null);
  }, [visible]);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scanned) return;
      setScanned(true);
      setScanError(null);

      let parsedIp: string | null = null;
      let parsedToken: string | null = null;

      try {
        const json = JSON.parse(data);
        if (json.token) parsedToken = String(json.token);
        if (json.ip) parsedIp = String(json.ip);
        if (json.host) parsedIp = String(json.host);
      } catch {
        try {
          const url = new URL(data);
          const params = url.searchParams;
          if (params.get("token")) parsedToken = params.get("token");
          if (params.get("ip")) parsedIp = params.get("ip");
          if (params.get("host")) parsedIp = params.get("host");
        } catch {
          if (data.trim().length > 0) parsedToken = data.trim();
        }
      }

      if (!parsedToken) {
        setScanError("COULD NOT EXTRACT TOKEN FROM QR CODE");
        setScanned(false);
        return;
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onScanned(parsedIp, parsedToken);
    },
    [scanned, onScanned]
  );

  const handleClose = () => {
    setScanned(false);
    setScanError(null);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={[scanStyles.overlay, { backgroundColor: "#000" }]}>
        {!permission ? (
          <ActivityIndicator color="#b9c3ff" size="large" />
        ) : !permission.granted ? (
          <View style={scanStyles.permBox}>
            <MaterialCommunityIcons name="camera-off" size={48} color="#b9c3ff" />
            <Text style={scanStyles.permTitle}>CAMERA ACCESS NEEDED</Text>
            <Text style={scanStyles.permSub}>
              Lumen needs camera permission to scan the QR code from your desktop.
            </Text>
            <TouchableOpacity style={scanStyles.permBtn} onPress={requestPermission} activeOpacity={0.8}>
              <Text style={scanStyles.permBtnText}>GRANT PERMISSION</Text>
            </TouchableOpacity>
            <TouchableOpacity style={scanStyles.cancelLink} onPress={handleClose} activeOpacity={0.7}>
              <Text style={scanStyles.cancelLinkText}>ENTER TOKEN MANUALLY</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            <View style={[scanStyles.topBar, { paddingTop: insets.top + 12 }]}>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7} style={scanStyles.closeBtn}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={scanStyles.topCenter}>
                <Text style={scanStyles.scanTitle}>SCAN QR CODE</Text>
                <Text style={scanStyles.scanSub}>Lumen Desktop → Settings</Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <View style={scanStyles.finderWrapper}>
              <View style={[scanStyles.finder, { width: FINDER_SIZE, height: FINDER_SIZE }]}>
                <View style={scanStyles.finderInner}>
                  <CornerBracket position="tl" />
                  <CornerBracket position="tr" />
                  <CornerBracket position="bl" />
                  <CornerBracket position="br" />
                </View>
                <View style={[scanStyles.scanLine, { backgroundColor: "#b9c3ff" }]} />
              </View>
            </View>

            {scanError && (
              <View style={scanStyles.errorBanner}>
                <Feather name="alert-triangle" size={14} color="#ef4444" />
                <Text style={scanStyles.errorText}>{scanError}</Text>
                <TouchableOpacity onPress={() => { setScanError(null); setScanned(false); }} activeOpacity={0.7}>
                  <Text style={scanStyles.retryText}>RETRY</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[scanStyles.bottomHint, { paddingBottom: insets.bottom + 20 }]}>
              <Text style={scanStyles.hintText}>
                Point your camera at the QR code shown{"\n"}on the Lumen desktop application
              </Text>
              <TouchableOpacity style={scanStyles.manualBtn} onPress={handleClose} activeOpacity={0.7}>
                <MaterialCommunityIcons name="keyboard" size={14} color="#b9c3ff" />
                <Text style={scanStyles.manualBtnText}>ENTER TOKEN MANUALLY</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

export default function PairingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const {
    state,
    serverIp,
    isRegistered,
    knownDesktops,
    lastError,
    register,
    reconnect,
    disconnect,
    forgetDevice,
    renameDesktop,
    sessionId,
  } =
    useWebSocket();

  const [ip, setIp] = useState(serverIp ?? "");
  const [token, setToken] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [editingDesktopIp, setEditingDesktopIp] = useState<string | null>(null);
  const [editingDesktopLabel, setEditingDesktopLabel] = useState("");

  const isBusy = loading || ["connecting", "registering", "authenticating"].includes(state);
  const isConnected = state === "connected";
  const knownDesktopIps = useMemo(() => knownDesktops.map((desktop) => desktop.serverIp), [knownDesktops]);

  useEffect(() => {
    let alive = true;
    loadDeviceName()
      .then((savedName) => {
        if (!alive) return;
        setDeviceName(savedName?.trim() ? savedName : "Lumen Mobile");
      })
      .catch(() => {
        if (!alive) return;
        setDeviceName("Lumen Mobile");
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleDeviceNameChange = useCallback((value: string) => {
    setDeviceName(value);
    void saveDeviceName(value);
  }, []);

  const handleQRScanned = useCallback((scannedIp: string | null, scannedToken: string) => {
    setScannerOpen(false);
    const finalIp = scannedIp ?? ip;
    setToken(scannedToken);
    if (scannedIp) setIp(scannedIp);

    if (!finalIp || !scannedToken) return;

    setLoading(true);
    register(finalIp, scannedToken, deviceName.trim() || "Lumen Mobile")
      .then(() => {
        setToken("");
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      })
      .catch((err: unknown) => {
        const msg = typeof err === "string" ? err : (err as Error)?.message ?? "Registration failed";
        Alert.alert("Registration Failed", msg);
      })
      .finally(() => setLoading(false));
  }, [ip, deviceName, register]);

  async function handleRegister() {
    if (!ip.trim() || !token.trim()) {
      Alert.alert("Missing Fields", "Enter the server IP and the QR token.");
      return;
    }
    setLoading(true);
    try {
      await register(ip.trim(), token.trim(), deviceName.trim() || "Lumen Mobile");
      setToken("");
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message ?? "Registration failed";
      Alert.alert("Registration Failed", msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleReconnect() {
    const target = ip.trim() || serverIp;
    if (!target) {
      Alert.alert("Missing IP", "Enter the desktop IP address.");
      return;
    }
    setLoading(true);
    try {
      await reconnect(target);
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message ?? "Connection failed";
      Alert.alert("Connection Failed", msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleReconnectToDesktop(targetIp: string) {
    setLoading(true);
    try {
      await reconnect(targetIp);
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message ?? "Connection failed";
      Alert.alert("Connection Failed", msg);
    } finally {
      setLoading(false);
    }
  }

  function handleDisconnect() { disconnect(); }

  function handleForget(ip?: string | null) {
    const label = ip ?? serverIp ?? "this desktop";
    Alert.alert(
      "Forget Device",
      `This will remove saved credentials for ${label}. You will need a new QR token to register again.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Forget", style: "destructive", onPress: () => forgetDevice(ip) },
      ]
    );
  }

  function beginEditDesktop(ip: string, label: string) {
    setEditingDesktopIp(ip);
    setEditingDesktopLabel(label);
  }

  function cancelEditDesktop() {
    setEditingDesktopIp(null);
    setEditingDesktopLabel("");
  }

  async function saveDesktopLabel() {
    if (!editingDesktopIp) return;
    const nextLabel = editingDesktopLabel.trim();
    if (!nextLabel) {
      Alert.alert("Invalid name", "Desktop label cannot be empty.");
      return;
    }
    setLoading(true);
    try {
      await renameDesktop(editingDesktopIp, nextLabel);
      cancelEditDesktop();
    } catch {
      Alert.alert("Could not rename", "Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS !== "web" && (
        <QRScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScanned={handleQRScanned}
        />
      )}

      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View>
          <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>LUMEN</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>PAIRING</Text>
        </View>
        <StateIndicator state={state} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isConnected && sessionId && (
          <View style={[styles.sessionCard, { backgroundColor: "#0d1f0d", borderColor: "#22c55e40" }]}>
            <View style={styles.sessionRow}>
              <View style={[styles.connDot, { backgroundColor: "#22c55e" }]} />
              <Text style={[styles.sessionTitle, { color: "#22c55e" }]}>ACTIVE SESSION</Text>
            </View>
            <Text style={[styles.sessionIp, { color: colors.foreground }]}>{serverIp}</Text>
            <Text style={[styles.sessionSub, { color: colors.mutedForeground }]}>
              SESSION / {sessionId.toUpperCase().slice(0, 16)}
            </Text>
            <TouchableOpacity
              style={[styles.disconnectBtn, { borderColor: "#ef444440" }]}
              onPress={handleDisconnect}
              activeOpacity={0.7}
            >
              <Text style={[styles.disconnectText, { color: "#ef4444" }]}>DISCONNECT</Text>
            </TouchableOpacity>
          </View>
        )}

        {lastError && (
          <View style={[styles.errorCard, { backgroundColor: "#1f0d0d", borderColor: "#ef444440" }]}>
            <Feather name="alert-triangle" size={14} color="#ef4444" />
            <Text style={[styles.errorText, { color: "#ef4444" }]}>
              {lastError.toUpperCase().replace(/_/g, " ")}
            </Text>
          </View>
        )}

        <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>DESKTOP IP ADDRESS</Text>
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
            <Feather name="wifi" size={14} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: "SpaceGrotesk_400Regular" }]}
              value={ip}
              onChangeText={setIp}
              placeholder="192.168.x.x"
              placeholderTextColor={colors.border}
              keyboardType="decimal-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
            {isRegistered ? "ADD ANOTHER DESKTOP" : "REGISTRATION (FIRST TIME)"}
          </Text>
          <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>
            Open Lumen on your desktop, go to Settings and scan the QR code below or paste the token manually.
          </Text>

          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.qrBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
              onPress={() => setScannerOpen(true)}
              activeOpacity={0.85}
              disabled={isBusy}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={20} color={colors.primaryForeground} />
              <Text style={[styles.qrBtnText, { color: colors.primaryForeground }]}>SCAN QR CODE</Text>
            </TouchableOpacity>
          )}

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>OR</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>

          <View style={[styles.inputRow, { borderColor: token ? colors.primary + "60" : colors.border, backgroundColor: colors.secondary }]}>
            <MaterialCommunityIcons name="key-outline" size={14} color={token ? colors.primary : colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: "SpaceGrotesk_400Regular" }]}
              value={token}
              onChangeText={setToken}
              placeholder="PASTE TOKEN MANUALLY..."
              placeholderTextColor={colors.border}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={false}
            />
            {token.length > 0 && (
              <TouchableOpacity onPress={() => setToken("")} activeOpacity={0.7}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {token.length > 0 && (
            <View style={[styles.tokenPreview, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={13} color={colors.primary} />
              <Text style={[styles.tokenPreviewText, { color: colors.primary }]} numberOfLines={1}>
                TOKEN READY — {token.slice(0, 12)}...
              </Text>
            </View>
          )}

          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.secondary, marginTop: 4 }]}>
            <Feather name="smartphone" size={14} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: "SpaceGrotesk_400Regular" }]}
              value={deviceName}
              onChangeText={handleDeviceNameChange}
              placeholder="DEVICE NAME"
              placeholderTextColor={colors.border}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: isBusy || !token || !ip ? colors.border : colors.foreground,
                marginTop: 4,
              },
            ]}
            onPress={handleRegister}
            activeOpacity={0.85}
            disabled={isBusy || !token || !ip}
          >
            {isBusy ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.background }]}>REGISTER DEVICE</Text>
            )}
          </TouchableOpacity>
        </View>

        {knownDesktops.length > 0 && (
          <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>SAVED DESKTOPS</Text>
            <Text style={[styles.inputHint, { color: colors.mutedForeground }]}>
              You can connect this phone to multiple desktops and switch anytime.
            </Text>

            {knownDesktops.map((desktop) => {
              const active = desktop.serverIp === serverIp;
              const editing = editingDesktopIp === desktop.serverIp;
              return (
                <View key={desktop.serverIp} style={[styles.desktopRow, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <View style={{ flex: 1 }}>
                    {editing ? (
                      <View style={[styles.desktopEditRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <TextInput
                          style={[styles.desktopEditInput, { color: colors.foreground, fontFamily: "SpaceGrotesk_400Regular" }]}
                          value={editingDesktopLabel}
                          onChangeText={setEditingDesktopLabel}
                          placeholder="Desktop label"
                          placeholderTextColor={colors.border}
                          autoCapitalize="words"
                          autoCorrect={false}
                        />
                        <TouchableOpacity onPress={() => void saveDesktopLabel()} activeOpacity={0.75} disabled={isBusy}>
                          <Text style={[styles.desktopSaveText, { color: colors.primary }]}>SAVE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={cancelEditDesktop} activeOpacity={0.75}>
                          <Text style={[styles.desktopCancelText, { color: colors.mutedForeground }]}>CANCEL</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={[styles.desktopIp, { color: colors.foreground }]}>{desktop.label}</Text>
                    )}
                    <Text style={[styles.desktopMeta, { color: colors.mutedForeground }]}>
                      {desktop.serverIp} {active ? `• ${isConnected ? "CONNECTED" : "ACTIVE"}` : "• SAVED"}
                    </Text>
                  </View>

                  <View style={styles.desktopButtonsRow}>
                    <TouchableOpacity
                      style={[
                        styles.desktopActionBtn,
                        { borderColor: colors.border, backgroundColor: active && isConnected ? colors.border : colors.card },
                      ]}
                      onPress={() => {
                        setIp(desktop.serverIp);
                        if (!active || !isConnected) void handleReconnectToDesktop(desktop.serverIp);
                      }}
                      activeOpacity={0.75}
                      disabled={isBusy || (active && isConnected)}
                    >
                      <Text style={[styles.desktopActionText, { color: colors.foreground }]}>
                        {active && isConnected ? "CONNECTED" : "CONNECT"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.desktopEditBtn, { borderColor: colors.border }]}
                      onPress={() => beginEditDesktop(desktop.serverIp, desktop.label)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.desktopEditText, { color: colors.foreground }]}>EDIT</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.desktopDangerBtn, { borderColor: "#ef444430" }]}
                      onPress={() => handleForget(desktop.serverIp)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.desktopDangerText, { color: "#ef4444" }]}>FORGET</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: isBusy || isConnected ? colors.border : colors.foreground, marginTop: 8 },
              ]}
              onPress={handleReconnect}
              activeOpacity={0.85}
              disabled={isBusy || isConnected}
            >
              {isBusy ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={[styles.primaryBtnText, { color: colors.background }]}>
                  {isConnected ? "CONNECTED" : knownDesktopIps.includes(ip.trim()) ? "CONNECT SELECTED DESKTOP" : "CONNECT USING IP FIELD"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>PROTOCOL INFO</Text>
          {[
            ["TRANSPORT", "WebSocket / ws:// port 8080"],
            ["AUTH", "Ed25519 challenge-response"],
            ["TOKEN", "One-time QR, 15 min expiry"],
            ["STORAGE", "Encrypted on-device"],
          ].map(([k, v]) => (
            <View key={k} style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: colors.mutedForeground }]}>{k}</Text>
              <Text style={[styles.infoVal, { color: colors.foreground }]}>{v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 3, marginBottom: 2 },
  headerTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 26, letterSpacing: 2 },
  stateRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  stateDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  stateLabel: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  sessionCard: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  sessionTitle: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 2 },
  sessionIp: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 15, letterSpacing: 1 },
  sessionSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 0.5 },
  disconnectBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  disconnectText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 11, letterSpacing: 2 },
  errorCard: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 11, letterSpacing: 1 },
  inputCard: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  inputLabel: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 9, letterSpacing: 2, marginBottom: 4 },
  inputHint: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 0.5, lineHeight: 15 },
  qrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 16,
  },
  qrBtnText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 13, letterSpacing: 2 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 2 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 13, letterSpacing: 0.5 },
  tokenPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 9,
    borderRadius: 7,
    borderWidth: 1,
  },
  tokenPreviewText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 1, flex: 1 },
  primaryBtn: { borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryBtnText: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 12, letterSpacing: 2 },
  dangerBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  dangerBtnText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 2 },
  desktopRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    marginTop: 8,
  },
  desktopButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  desktopIp: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12, letterSpacing: 0.5 },
  desktopMeta: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 1.2, marginTop: 2 },
  desktopEditRow: {
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  desktopEditInput: { flex: 1, fontSize: 12, letterSpacing: 0.5, paddingVertical: 6 },
  desktopSaveText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1.1 },
  desktopCancelText: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 1.1 },
  desktopActionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 78,
    alignItems: "center",
  },
  desktopActionText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1.2 },
  desktopEditBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 56,
    alignItems: "center",
  },
  desktopEditText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1.2 },
  desktopDangerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 62,
    alignItems: "center",
  },
  desktopDangerText: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1.2 },
  infoCard: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoKey: { fontFamily: "SpaceGrotesk_500Medium", fontSize: 10, letterSpacing: 1.5 },
  infoVal: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
});

const scanStyles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
  },
  topCenter: { alignItems: "center" },
  scanTitle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 14, letterSpacing: 2, color: "#fff" },
  scanSub: { fontFamily: "SpaceGrotesk_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  finderWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  finder: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  finderInner: {
    ...StyleSheet.absoluteFillObject,
  },
  scanLine: {
    width: "80%",
    height: 2,
    opacity: 0.7,
    borderRadius: 1,
  },
  errorBanner: {
    position: "absolute",
    bottom: 130,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderColor: "#ef444440",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    color: "#ef4444",
    flex: 1,
  },
  retryText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    color: "#ef4444",
  },
  bottomHint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  hintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(185,195,255,0.1)",
    borderColor: "rgba(185,195,255,0.25)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  manualBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.5,
    color: "#b9c3ff",
  },
  permBox: { alignItems: "center", paddingHorizontal: 40, gap: 16 },
  permTitle: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    letterSpacing: 2,
    color: "#fff",
    textAlign: "center",
  },
  permSub: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 20,
  },
  permBtn: {
    backgroundColor: "#b9c3ff",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  permBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 12,
    letterSpacing: 2,
    color: "#0e0e0e",
  },
  cancelLink: { marginTop: 4 },
  cancelLinkText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    letterSpacing: 1.5,
    color: "rgba(185,195,255,0.7)",
  },
});
