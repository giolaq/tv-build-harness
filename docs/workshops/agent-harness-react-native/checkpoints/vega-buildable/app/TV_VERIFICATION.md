# TV Verification Matrix

| Step | Expected | Evidence |
| --- | --- | --- |
| Launch | Featured action has visible focus | VDA capture `01-launch.png` |
| Down | Focus enters first rail | D-pad transition |
| Left/right | Focus stays within rail boundaries | Transition log |
| Select | Details opens for current card | VDA capture `02-details.png` |
| Back | Home returns with the originating card focused | VDA capture `03-restored.png` |

Run `tests/verify-tv-focus.ts` first. It writes `tv-focus-result.json` from executable transition checks against the same focus-state module used by the app.

The local suite proves the focus rules. Live VDA evidence is still required to prove that the rendered app and device deliver those rules.
