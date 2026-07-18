import React, { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { movieById, movies, rails, type Movie } from "./catalog.js";

export default function App() {
  const [selected, setSelected] = useState<Movie | null>(null);
  if (selected) return <Details movie={selected} onBack={() => setSelected(null)} />;
  return <Home onOpen={setSelected} />;
}

function Home({ onOpen }: { onOpen(movie: Movie): void }) {
  const featured = movies[0];
  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>POCKET CINEMA</Text>
      <View style={[styles.hero, { backgroundColor: featured.color }]}>
        <Text style={styles.eyebrow}>FEATURED TONIGHT</Text>
        <Text style={styles.heroTitle}>{featured.title}</Text>
        <Text style={styles.description}>{featured.description}</Text>
        <Pressable style={styles.button} onPress={() => onOpen(featured)}><Text style={styles.buttonText}>View details</Text></Pressable>
      </View>
      {rails.map((rail) => <View key={rail.id} style={styles.rail}>
        <Text style={styles.railTitle}>{rail.title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {rail.movieIds.map((id) => { const movie = movieById(id)!; return <ContentCard key={id} movie={movie} onPress={() => onOpen(movie)} />; })}
        </ScrollView>
      </View>)}
    </ScrollView>
  </SafeAreaView>;
}

export function ContentCard({ movie, onPress }: { movie: Movie; onPress(): void }) {
  return <Pressable style={styles.card} onPress={onPress}>
    <View style={[styles.poster, { backgroundColor: movie.color }]}><Text style={styles.posterMark}>{movie.title.slice(0, 1)}</Text></View>
    <Text style={styles.cardTitle}>{movie.title}</Text><Text style={styles.meta}>{movie.genre} · {movie.year}</Text>
  </Pressable>;
}

function Details({ movie, onBack }: { movie: Movie; onBack(): void }) {
  return <SafeAreaView style={styles.page}><View style={styles.content}>
    <Pressable onPress={onBack}><Text style={styles.back}>Back</Text></Pressable>
    <View style={[styles.detailArt, { backgroundColor: movie.color }]}><Text style={styles.posterMark}>{movie.title.slice(0, 1)}</Text></View>
    <Text style={styles.detailTitle}>{movie.title}</Text><Text style={styles.meta}>{movie.genre} · {movie.year}</Text>
    <Text style={styles.description}>{movie.description}</Text>
    <Pressable style={styles.button}><Text style={styles.buttonText}>Play preview</Text></Pressable>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#101214" }, content: { padding: 20, paddingBottom: 40 }, brand: { color: "#F6C453", fontSize: 14, fontWeight: "800", marginBottom: 16 },
  hero: { borderRadius: 8, padding: 24, minHeight: 220, justifyContent: "flex-end" }, eyebrow: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  heroTitle: { color: "#FFFFFF", fontSize: 32, fontWeight: "800", marginTop: 4 }, description: { color: "#ECEFF1", fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 520 },
  button: { alignSelf: "flex-start", backgroundColor: "#F6C453", borderRadius: 6, marginTop: 18, paddingHorizontal: 18, paddingVertical: 12 }, buttonText: { color: "#101214", fontWeight: "800" },
  rail: { marginTop: 26 }, railTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginBottom: 12 }, card: { width: 150, marginRight: 14 },
  poster: { height: 190, borderRadius: 6, alignItems: "center", justifyContent: "center" }, posterMark: { color: "#FFFFFF", fontSize: 58, fontWeight: "900" },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginTop: 8 }, meta: { color: "#A8B0B7", fontSize: 13, marginTop: 3 }, back: { color: "#F6C453", fontWeight: "700", marginBottom: 18 },
  detailArt: { height: 260, borderRadius: 8, alignItems: "center", justifyContent: "center" }, detailTitle: { color: "#FFFFFF", fontSize: 34, fontWeight: "800", marginTop: 20 },
});
