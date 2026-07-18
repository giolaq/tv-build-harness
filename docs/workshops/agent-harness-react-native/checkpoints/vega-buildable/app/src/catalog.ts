export type Movie = { id: string; title: string; year: number; genre: string; description: string; color: string };

export const movies: Movie[] = [
  { id: "signal", title: "Signal Coast", year: 2026, genre: "Mystery", color: "#176B87", description: "A radio host follows a transmission across a fogbound coastline." },
  { id: "orbit", title: "Small Orbit", year: 2025, genre: "Drama", color: "#5B4B8A", description: "Two engineers improvise a home aboard a failing research station." },
  { id: "paper", title: "Paper City", year: 2024, genre: "Adventure", color: "#C05746", description: "A cartographer finds a district that redraws itself every night." },
  { id: "seconds", title: "Borrowed Seconds", year: 2026, genre: "Thriller", color: "#2D6A4F", description: "A courier discovers that every delivery changes yesterday." },
  { id: "garden", title: "The Quiet Garden", year: 2023, genre: "Documentary", color: "#6A7B53", description: "Four seasons inside a community garden built above a railway." },
  { id: "lantern", title: "Lantern Weather", year: 2025, genre: "Comedy", color: "#D18B28", description: "A forecast team tries to predict a festival's impossible weather." },
  { id: "frame", title: "Outside the Frame", year: 2024, genre: "Drama", color: "#7A3E65", description: "A projectionist recognizes a stranger appearing in unfinished films." },
  { id: "north", title: "Northbound", year: 2026, genre: "Adventure", color: "#326273", description: "Three friends restore a night train for one final winter journey." },
];

export const rails = [
  { id: "new", title: "New this week", movieIds: ["signal", "orbit", "paper", "seconds"] },
  { id: "slow", title: "Stories to settle into", movieIds: ["garden", "lantern", "frame", "north"] },
];

export function movieById(id: string): Movie | undefined { return movies.find((movie) => movie.id === id); }
