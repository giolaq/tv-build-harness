---
name: remote-control-listener-return-type
applies_to: [verify]
meta:
  created_by_run: 62c3202d
  created_at: 2026-06-25
  times_loaded: 0
  times_defect_recurred: 0
---

# RemoteControlManager addKeydownListener Must Return Unsubscribe Function

## Problem
The `addKeydownListener` method in platform RemoteControlManager implementations returns the listener function itself instead of a proper unsubscribe function (`() => void`). This causes accumulated listeners and double-step D-pad navigation because:

1. `react-tv-space-navigation`'s `remoteControlSubscriber` stores the return value and passes it to `remoteControlUnsubscriber`
2. When the return is the listener itself (type `(event: SupportedKeys) => void`), calling it as an unsubscribe does nothing — the actual mitt listener is never removed
3. On re-mount or focus changes, new listeners stack without old ones being removed

## Fix Pattern
```typescript
// BEFORE (broken) — returns the listener, not an unsubscriber
addKeydownListener = (listener: (event: SupportedKeys) => void): ((event: SupportedKeys) => void) => {
  this.eventEmitter.on('keyDown', listener);
  return listener; // ← BUG: this is not () => void
};

// AFTER (fixed) — returns a proper unsubscribe closure
addKeydownListener = (listener: (event: SupportedKeys) => void): (() => void) => {
  this.eventEmitter.on('keyDown', listener);
  return () => {
    this.eventEmitter.off('keyDown', listener);
  };
};
```

The `configureRemoteControl.ts` must also be updated to match:
```typescript
// BEFORE (broken)
remoteControlSubscriber: (callback) => {
  // ...
  return RemoteControlManager.addKeydownListener(remoteControlListener);
},
remoteControlUnsubscriber: (remoteControlListener) => {
  RemoteControlManager.removeKeydownListener(remoteControlListener);
},

// AFTER (fixed)
remoteControlSubscriber: (callback) => {
  // ...
  const unsubscribe = RemoteControlManager.addKeydownListener(remoteControlListener);
  return unsubscribe;
},
remoteControlUnsubscriber: (unsubscribe) => {
  unsubscribe();
},
```

## Verification Command
```bash
grep -n "addKeydownListener" packages/shared-ui/src/app/remote-control/RemoteControlManager*.ts | grep -v "removeKeydownListener"
```
Every match should show `(): (() => void) =>` as the return type annotation.

## Gotchas
- The interface `RemoteControlManagerInterface` defines `addKeydownListener(listener: KeydownListener): () => void` — this is CORRECT. The implementations are what drift.
- ALL platform files must be fixed: `.android.ts`, `.ios.ts`, `.kepler.ts`, `.ts` (web). Missing one causes platform-specific double-navigation.
- This bug is silent in development with StrictMode off — it only manifests as "focus moves two steps" or "focus gets stuck" after navigating between screens.
- Also check for duplicate `configureRemoteControl` imports (e.g. both in App.tsx AND in AppNavigator useEffect) — this causes double-registration even with the correct return type.
