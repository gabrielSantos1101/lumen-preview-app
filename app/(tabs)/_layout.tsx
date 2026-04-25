import { Tabs } from "expo-router";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function TabBarLabel({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return (
    <Text
      style={{
        fontFamily: "SpaceGrotesk_600SemiBold",
        fontSize: 9,
        letterSpacing: 1.5,
        color,
        marginTop: 2,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === "web" ? 84 : 60 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: tabBarHeight,
          paddingBottom: Platform.OS === "web" ? 20 : insets.bottom,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: ({ focused, color }) => (
            <TabBarLabel label="Library" focused={focused} color={color} />
          ),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-grid-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pairing"
        options={{
          tabBarLabel: ({ focused, color }) => (
            <TabBarLabel label="Pairing" focused={focused} color={color} />
          ),
          tabBarIcon: ({ color, size }) => (
            <Feather name="bluetooth" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="control"
        options={{
          tabBarLabel: ({ focused, color }) => (
            <TabBarLabel label="Control" focused={focused} color={color} />
          ),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="remote" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="streaming"
        options={{
          tabBarLabel: ({ focused, color }) => (
            <TabBarLabel label="Stream" focused={focused} color={color} />
          ),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="broadcast" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          tabBarLabel: ({ focused, color }) => (
            <TabBarLabel label="Terminal" focused={focused} color={color} />
          ),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="console" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
