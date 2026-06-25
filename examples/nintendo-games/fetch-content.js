#!/usr/bin/env node

/**
 * Fetches Nintendo game data from the public Nintendo Europe search API
 * and generates content.json for the TV app harness.
 *
 * Usage: node fetch-content.js
 *
 * API: https://search.nintendo-europe.com/en/select
 * No auth required. Returns game metadata including titles, descriptions,
 * images (16:9 and square), categories, publishers, and player counts.
 */

const API_BASE = "https://search.nintendo-europe.com/en/select";

const FIELDS = [
  "title",
  "excerpt",
  "image_url_h16x9_s",
  "image_url_sq_s",
  "pretty_game_categories_txt",
  "game_series_txt",
  "publisher",
  "players_to",
  "age_rating_sorting_i",
].join(",");

async function fetchGames({ rows = 30, sort = "popularity asc" } = {}) {
  const params = new URLSearchParams({
    q: "*",
    fq: "type:GAME AND system_names_txt:Switch",
    sort,
    rows: String(rows),
    wt: "json",
    fl: FIELDS,
  });

  const url = `${API_BASE}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data = await res.json();
  return data.response.docs;
}

function categorizeGames(games) {
  const categoryMap = new Map();

  for (const game of games) {
    const cats = game.pretty_game_categories_txt || ["Other"];
    const primaryCat = cats[0];
    if (!categoryMap.has(primaryCat)) {
      categoryMap.set(primaryCat, []);
    }
    categoryMap.get(primaryCat).push(game);
  }

  return categoryMap;
}

function buildContent(games) {
  const categoryMap = categorizeGames(games);

  const videos = games.map((game, i) => ({
    id: `g${i + 1}`,
    title: game.title.trim(),
    description: game.excerpt || `A ${(game.pretty_game_categories_txt || ["game"])[0].toLowerCase()} game by ${game.publisher || "Nintendo"}`,
    duration_sec: 0,
    thumbnail_url: game.image_url_h16x9_s || game.image_url_sq_s || "",
    stream_url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    stream_type: "hls",
    tags: [
      ...(game.pretty_game_categories_txt || []).map((c) => c.toLowerCase()),
      ...(game.game_series_txt || []),
      game.publisher?.toLowerCase(),
    ].filter(Boolean),
  }));

  const categories = [];
  let catIndex = 0;
  for (const [name, catGames] of categoryMap) {
    if (catGames.length < 2) continue;
    const gameIndices = catGames.map((g) => {
      const idx = games.indexOf(g);
      return `g${idx + 1}`;
    });
    categories.push({
      id: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      items: gameIndices,
    });
    catIndex++;
  }

  const featured = videos.slice(0, 5).map((v) => v.id);

  return {
    title: "Nintendo Games",
    description: "Browse and discover Nintendo Switch games",
    categories,
    videos,
    featured,
  };
}

async function main() {
  console.log("Fetching games from Nintendo Europe API...");
  const games = await fetchGames({ rows: 30 });
  console.log(`Got ${games.length} games`);

  const content = buildContent(games);
  console.log(
    `Built content: ${content.videos.length} games, ${content.categories.length} categories`
  );

  const fs = await import("node:fs");
  const path = await import("node:path");
  const outPath = path.join(import.meta.dirname || ".", "content.json");
  fs.writeFileSync(outPath, JSON.stringify(content, null, 2) + "\n");
  console.log(`Written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
