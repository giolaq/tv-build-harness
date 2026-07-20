import React, { useEffect, useState } from "react";
import { BackHandler, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { movieById, movies, rails, type Movie } from "./catalog";
import { focusItem, heroPreferredFocus, initialFocusState, openFrom, preferredFocus, type FocusState } from "./tv/focus-state";

export default function App() {
  const [selected, setSelected] = useState<Movie | null>(null);
  const [focus, setFocus] = useState<FocusState>(initialFocusState);
  const open = (movie: Movie) => { setFocus((state) => openFrom(state, movie.id)); setSelected(movie); };
  const back = () => { setSelected(null); return true; };
  useEffect(() => { if (!selected) return; const subscription = BackHandler.addEventListener("hardwareBackPress", back); return () => subscription.remove(); }, [selected]);
  if (selected) return <Details movie={selected} onBack={back} />;
  return <Home focus={focus} setFocus={setFocus} onOpen={open} />;
}

function Home({ focus, setFocus, onOpen }: { focus: FocusState; setFocus(value: FocusState | ((state: FocusState) => FocusState)): void; onOpen(movie: Movie): void }) {
  const featured = movies[0];
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}>POCKET CINEMA</Text>
    <View style={[styles.hero, { backgroundColor: featured.color }]}>
      <Text style={styles.eyebrow}>FEATURED TONIGHT</Text><Text style={styles.heroTitle}>{featured.title}</Text><Text style={styles.description}>{featured.description}</Text>
      <Pressable hasTVPreferredFocus={heroPreferredFocus(focus)} onFocus={() => setFocus((state) => focusItem(state, "featured-action"))} style={[styles.button, focus.focusedId === "featured-action" && styles.focused]} onPress={() => onOpen(featured)}><Text style={styles.buttonText}>View details</Text></Pressable>
    </View>
    {rails.map((rail) => <View key={rail.id} style={styles.rail}><Text style={styles.railTitle}>{rail.title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {rail.movieIds.map((id) => { const movie = movieById(id)!; return <ContentCard key={id} movie={movie} focused={focus.focusedId === id} preferred={preferredFocus(focus, id)} onFocus={() => setFocus((state) => focusItem(state, id))} onPress={() => onOpen(movie)} />; })}
    </ScrollView></View>)}
  </ScrollView></SafeAreaView>;
}

function ContentCard({ movie, focused, preferred, onFocus, onPress }: { movie: Movie; focused: boolean; preferred: boolean; onFocus(): void; onPress(): void }) {
  return <Pressable hasTVPreferredFocus={preferred} onFocus={onFocus} style={[styles.card, focused && styles.focused]} onPress={onPress}><View style={[styles.poster, { backgroundColor: movie.color }]}><Text style={styles.posterMark}>{movie.title.slice(0, 1)}</Text></View><Text style={styles.cardTitle}>{movie.title}</Text><Text style={styles.meta}>{movie.genre} · {movie.year}</Text></Pressable>;
}

function Details({ movie, onBack }: { movie: Movie; onBack(): boolean }) {
  const [backFocused, setBackFocused] = useState(false);
  return <SafeAreaView style={styles.page}><View style={styles.content}><Pressable hasTVPreferredFocus onFocus={() => setBackFocused(true)} onBlur={() => setBackFocused(false)} style={[styles.backButton, backFocused && styles.focused]} onPress={onBack}><Text style={styles.back}>Back</Text></Pressable><View style={[styles.detailArt, { backgroundColor: movie.color }]}><Text style={styles.posterMark}>{movie.title.slice(0, 1)}</Text></View><Text style={styles.detailTitle}>{movie.title}</Text><Text style={styles.meta}>{movie.genre} · {movie.year}</Text><Text style={styles.description}>{movie.description}</Text></View></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#101214" }, content: { padding: 48, paddingBottom: 72 }, brand: { color: "#F6C453", fontSize: 20, fontWeight: "800", marginBottom: 22 }, hero: { borderRadius: 8, padding: 40, minHeight: 360, justifyContent: "flex-end" }, eyebrow: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" }, heroTitle: { color: "#FFFFFF", fontSize: 54, fontWeight: "800", marginTop: 6 }, description: { color: "#ECEFF1", fontSize: 23, lineHeight: 32, marginTop: 12, maxWidth: 780 }, button: { alignSelf: "flex-start", backgroundColor: "#F6C453", borderColor: "transparent", borderWidth: 5, borderRadius: 6, marginTop: 24, paddingHorizontal: 28, paddingVertical: 18 }, buttonText: { color: "#101214", fontSize: 20, fontWeight: "800" }, focused: { borderColor: "#FFFFFF", borderWidth: 5, transform: [{ scale: 1.04 }] }, rail: { marginTop: 36 }, railTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "700", marginBottom: 16 }, card: { width: 260, marginRight: 22, borderColor: "transparent", borderWidth: 5 }, poster: { height: 150, alignItems: "center", justifyContent: "center" }, posterMark: { color: "#FFFFFF", fontSize: 64, fontWeight: "900" }, cardTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 10 }, meta: { color: "#A8B0B7", fontSize: 18, marginTop: 4 }, backButton: { alignSelf: "flex-start", borderColor: "transparent", borderWidth: 5, padding: 10, marginBottom: 20 }, back: { color: "#F6C453", fontSize: 21, fontWeight: "700" }, detailArt: { height: 340, alignItems: "center", justifyContent: "center" }, detailTitle: { color: "#FFFFFF", fontSize: 48, fontWeight: "800", marginTop: 24 } });
