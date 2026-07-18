import assert from "node:assert/strict";
import test from "node:test";
import { movieById, movies, rails } from "../src/catalog.js";

test("the local catalog is dense enough for two rails", () => {
  assert.equal(movies.length, 8);
  assert.equal(rails.length, 2);
  for (const rail of rails) assert.ok(rail.movieIds.length >= 4);
});

test("every rail id resolves to a movie", () => {
  for (const id of rails.flatMap((rail) => rail.movieIds)) assert.ok(movieById(id), id);
});
