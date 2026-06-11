Build the app. Focus on web first (fastest feedback loop), then native if requested.

Platforms requested: {{platforms}}

STEP 1: Verify the project compiles.
Run: cd {{appDir}}/apps/expo-multi-tv && npx tsc --noEmit 2>&1 | tail -10
If there are type errors, fix them before proceeding.

STEP 2: Web build (always do this — fastest verification).
Run: cd {{appDir}}/apps/expo-multi-tv && BROWSER=none EXPO_TV=1 npx expo start --web --port 19006 &
Wait: sleep 5
Verify: curl -s http://localhost:19006 | head -5
If HTML is returned, web build works. Kill it: kill $(lsof -ti:19006) 2>/dev/null || true
{{#if wantsAndroid}}
STEP 3: Android TV prebuild.
First check: echo $ANDROID_HOME — if empty, skip with "Android SDK not configured"
Run: cd {{appDir}}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform android --no-install
{{/if}}
{{#if wantsIos}}
STEP {{iosStepNumber}}: Apple TV prebuild.
First check: which xcodebuild — if not found, skip with "Xcode not available"
Run: cd {{appDir}}/apps/expo-multi-tv && EXPO_TV=1 npx expo prebuild --platform ios --no-install
{{/if}}

Report: which platforms succeeded, which were skipped, which failed.
