import React from "react";
import { SafeAreaView, StyleSheet, Text } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.brand}>POCKET CINEMA</Text>
      <Text style={styles.message}>Your screen goes here.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101214", padding: 24 },
  brand: { color: "#F6C453", fontSize: 18, fontWeight: "800" },
  message: { color: "#FFFFFF", fontSize: 28, marginTop: 48 },
});
