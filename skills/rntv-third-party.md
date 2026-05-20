---
name: rntv-third-party
description: Use when working with third-party packages in React Native TV apps, including Expo packages, React Navigation TV support, NativeWind/Tailwind TV focus styles, and other community package TV compatibility considerations.
version: 1.0.0
license: MIT
---

# Third-Party Package TV Support

## When to Use

- Configuring React Navigation for TV focus-based navigation
- Using react-native-video on Apple TV or Android TV
- Setting up Expo modules and Expo Router for TV
- Using NativeWind/Tailwind CSS with TV focus states
- Adapting react-native-gesture-handler for TV remote input
- Evaluating whether a third-party package works on TV platforms
- Troubleshooting third-party package compatibility issues on TV

## When NOT to Use

- Core React Native TV features (focus, remote input) — use the `specific-features` skill instead
- Platform detection — use the `platform-detection` skill instead
- Build configuration — use the `build-configuration` skill instead
- Creating a new project — use the `project-create` skill instead

---

## React Navigation

React Navigation works on TV with focus-based navigation out of the box. The stack, tab, and drawer navigators all support TV remote/D-Pad input.

### Best Practices

- Use `@react-navigation/native-stack` instead of `@react-navigation/stack` for optimal TV performance
- Tab navigators work well for TV app main navigation — the tab bar is focusable via D-Pad
- Drawer navigators can be opened/closed with TV remote left/right navigation
- Use `screenOptions` to customize focus behavior per screen if needed

### Known Considerations

- Ensure touchable/pressable components inside screens are focusable (use `Pressable` or `TouchableOpacity`, not `TouchableWithoutFeedback`).
- When using custom header components, ensure all interactive elements are focusable.

---

## Expo and Expo Router

As of Expo SDK 52 and later, Expo supports TV targets (Apple TV and Android TV) through the `react-native-tvos` fork.

### Setup

- Use the Expo project create workflow from the `project-create` skill
- TV support requires the `@react-native-tvos/config-tv` plugin to be added as a dependency and in the Expo config

### Expo Router on TV

Expo Router works on TV platforms. Stack and tab layouts support focus-based navigation.

- Tab layouts provide a natural TV navigation pattern
- The new [native tabs](https://docs.expo.dev/router/advanced/native-tabs) work on TV
  - On Apple TV, the native tabs are rendered as a native UITabBar at the top of the screen
- Stack navigation responds to the TV back/menu button
- Use `Redirect` and `useRouter()` for programmatic navigation as on mobile

### Expo Modules on TV

Many Expo modules work on TV without modification. Modules that depend on phone-specific hardware (camera, GPS, telephony) are not applicable. Key compatible modules include:

- `expo-audio` — audio playback
- `expo-font` — custom fonts
- `expo-image` — optimized image loading
- `expo-linear-gradient` — gradient backgrounds
- `expo-splash-screen` — launch screen
- `expo-updates` — OTA updates
- `expo-video` - video playback

### Examples using Expo

- ExpoRouterTV: Expo app that demonstrates expo-router, expo-video, and TV focus and blur events. https://github.com/react-native-tvos/ExpoRouterTV
- NativewindMultiplatform: Expo app that demonstrates NativeWind with React Native TV, and shows a multiplatform design that works on web, mobile, and TV. https://github.com/react-native-tvos/NativewindMultiplatform
- SkiaMultiplatform: Expo app that demonstrates react-native-skia and react-native-reanimated APIs on TV, web, and mobile.

For a full list of supported Expo modules, see the [Expo documentation](https://docs.expo.dev/guides/building-for-tv/#see-which-libraries-are-supported).

### Creating custom native Expo modules

New native modules created with `create-expo-module` are automatically configured so that they can be built into Apple TV or Android TV apps. See [Expo module API documentation](https://docs.expo.dev/modules/overview/) and the associated [tutorial](https://docs.expo.dev/modules/native-module-tutorial/) for details.

---

## react-native-video

`react-native-video` (v6+) supports Apple TV and Android TV.

### TV-Specific Features

- Fullscreen video playback works natively on TV
- Remote control play/pause/seek integration on both platforms
- Picture-in-Picture is not available on TV platforms

### Best Practices

- Use `controls={true}` to enable native playback controls, which are already TV remote-accessible
- Handle `onEnd` and `onError` to navigate back or show appropriate UI
- For custom controls, ensure all buttons are `Pressable` so they receive TV focus

---

## NativeWind / Tailwind CSS

NativeWind (Tailwind CSS for React Native) supports TV focus states.

### Focus Styles

The `focus:` pseudo-class in NativeWind maps to the `onFocus`/`onBlur` events that React Native TV provides on `Pressable` and `Touchable` components.

```jsx
import { Pressable, Text } from 'react-native';

<Pressable className="bg-gray-800 focus:bg-blue-600 p-4 rounded-lg">
  <Text className="text-white">Focusable Card</Text>
</Pressable>;
```

### Best Practices

- Use `focus:` for visual focus indicators — this is essential for TV usability
- Combine with `active:` for press state feedback on select button press
- Ensure sufficient contrast between focused and unfocused states for 10-foot UI readability
- Use larger text sizes and padding for TV — Tailwind's `text-2xl`+ and `p-6`+ are good starting points
- See [this example](https://github.com/react-native-tvos/NativewindMultiplatform) that uses NativeWind v4.

---

## react-native-reanimated

`react-native-reanimated` works on TV platforms. All features that do not depend on touchscreen gestures will work on TV.

### Common TV Use Cases

- Animating scale or opacity changes on focus/blur for card-style UIs
- Creating smooth transitions between focused and unfocused states
- Building custom parallax-like effects beyond the built-in Apple TV parallax

```jsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';

const FocusableCard = ({ children }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onFocus={() => {
        scale.value = withSpring(1.1);
      }}
      onBlur={() => {
        scale.value = withSpring(1);
      }}
    >
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
};
```

---

## General Third-Party Package Compatibility

### Evaluating TV Compatibility

When considering a third-party package for a TV app:

1. **Check for native module dependencies** — packages with iOS/Android native modules may need tvOS/Android TV build target support
2. **Check input assumptions** — packages assuming touch/scroll input may not work with D-Pad/remote navigation
3. **Check for focusable elements** — UI component libraries must use focusable primitives (`Pressable`, `TouchableOpacity`) for TV
4. **Test on both platforms** — Apple TV and Android TV have different focus engines and remote input models

### Common Issues

- **Missing tvOS target**: Native modules built only for iOS may fail to compile for tvOS. Check if the package includes a tvOS target in its Podspec or if `react-native-tvos` provides a patch.
- **Touch-only interactions**: Packages relying on pan/pinch/multi-touch gestures won't work with standard TV remotes. Look for keyboard/D-Pad fallbacks.
- **Hardcoded dimensions**: Packages assuming phone screen sizes may render incorrectly on TV. Prefer packages that use responsive layouts.
