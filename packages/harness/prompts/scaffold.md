Clone the app template into "{{appDir}}":
1. Run: git clone --depth 1{{templateBranch}} {{templateRepo}} "{{appDir}}"
2. Run: rm -rf "{{appDir}}/.git"
3. CRITICAL: Fix React/react-native duplicate resolution. The template has multiple workspaces that can each resolve their own React or react-native copy, causing "Invalid hook call" / "Cannot read properties of null (reading 'useEffect')" at runtime.
   Read {{appDir}}/package.json, then edit it to add resolutions that force a single copy of React AND react-native across ALL workspaces:
   Add these to the "resolutions" field (merge with existing):
     "react": "19.1.0",
     "react-dom": "19.1.0",
     "react-native": "npm:react-native-tvos@~0.81.0-0",
     "@types/react": "~19.1.0"
   Also read {{appDir}}/apps/expo-multi-tv/package.json and ensure its react/react-dom versions match "19.1.0" and react-native is "npm:react-native-tvos@~0.81.0-0".
   Also read {{appDir}}/packages/shared-ui/package.json and ENFORCE this rule:
   shared-ui/package.json devDependencies must ONLY contain "@types/*" and "typescript". NOTHING ELSE.
   ALL runtime packages (react-tv-space-navigation, @bam.tech/lrud, @react-navigation/*, react-native-gesture-handler, react-native-video, etc.) must be in peerDependencies ONLY.
   If the agent added ANY runtime package to shared-ui's devDependencies, REMOVE it and add it to peerDependencies instead.
   WHY: Yarn installs devDependencies in shared-ui/node_modules/. Packages like react-tv-space-navigation do require("react") at runtime but react is NOT in shared-ui/node_modules/ — it's only in expo-multi-tv/node_modules/. This causes "Cannot read properties of undefined (reading 'ReactCurrentOwner')" crash.
   The ONLY place to "yarn add" runtime packages is the expo-multi-tv workspace.
   - If react-tv-space-navigation uses a wildcard ("*") or beta version in the consuming app, pin it to "^6.0.0".
4. CRITICAL: Block Metro from resolving shared-ui/node_modules.
   Read {{appDir}}/apps/expo-multi-tv/metro.config.js. Add a blockList entry to the resolver that excludes shared-ui/node_modules:
   Add to config.resolver:
     blockList: [/packages\/shared-ui\/node_modules\/.*/]
   This prevents Metro from ever bundling packages from shared-ui/node_modules even if they get installed there accidentally. All imports must resolve from expo-multi-tv/node_modules.
5. Force LTR layout (prevents RTL issues on emulators with RTL locale):
   Read {{appDir}}/apps/expo-multi-tv/App.tsx. At the very top (before any component), add:
     import { I18nManager } from 'react-native';
     I18nManager.allowRTL(false);
     I18nManager.forceRTL(false);
6. Run: cd "{{appDir}}" && yarn install
7. Run: cd "{{appDir}}" && git init && git add -A && git commit -m "initial template"
App name: {{appName}}
