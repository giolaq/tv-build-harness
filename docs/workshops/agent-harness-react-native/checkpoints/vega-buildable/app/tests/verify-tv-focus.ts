import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { focusItem, heroPreferredFocus, initialFocusState, moveIndex, openFrom, preferredFocus } from "../src/tv/focus-state.js";

let state = initialFocusState;
assert.equal(heroPreferredFocus(state), true, "launch prefers the featured action");
assert.equal(preferredFocus(state, "signal"), false, "launch has only one preferred target");
state = focusItem(state, "signal");
assert.equal(state.focusedId, "signal", "Down enters the first rail");
assert.equal(moveIndex(0, -1, 3), 0, "left stops at the first card");
assert.equal(moveIndex(1, 1, 3), 2, "right moves to the next card");
assert.equal(moveIndex(2, 1, 3), 2, "right stops at the last card");
state = focusItem(state, "paper");
state = openFrom(state, "paper");
assert.equal(heroPreferredFocus(state), false, "Back does not return focus to the hero");
assert.equal(preferredFocus(state, "paper"), true, "Back restores the originating card");
assert.equal(preferredFocus(state, "signal"), false, "another card does not replace restored focus");

writeFileSync("tv-focus-result.json", JSON.stringify({
  passed: true,
  transitions: ["launch-hero", "down-to-first-rail", "left-boundary", "right", "right-boundary", "open-details", "back-restore"],
}, null, 2));
