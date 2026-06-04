import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "../types.js";

export const addScreenDefinition: ToolDefinition = {
  name: "add_screen",
  description: "Generate a new screen component by composing existing shared-ui components. Creates the file and exports it from the screens index.",
  input_schema: {
    type: "object",
    properties: {
      workdir: { type: "string", description: "Root of the template project" },
      name: { type: "string", description: "Screen name in PascalCase (e.g. 'Watchlist', 'Search')" },
      layout: {
        type: "string",
        description: "Layout type: hero+rails, grid, detail, player, settings, search",
      },
      data_source: { type: "string", description: "Hook or data source for the screen content (e.g. 'useCategories', 'useFeatured')" },
    },
    required: ["workdir", "name", "layout"],
  },
};

const LAYOUT_TEMPLATES: Record<string, (name: string, dataSource: string) => string> = {
  "hero+rails": (name, dataSource) => `import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../theme';

export function ${name}Screen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.color.background }]}>
      <View style={styles.hero}>
        {/* Hero banner area */}
      </View>
      <FlatList
        data={[]}
        horizontal
        renderItem={({ item }) => <View style={styles.tile} />}
        keyExtractor={(_, i) => String(i)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { height: 400, marginBottom: 24 },
  tile: { width: 240, height: 135, marginRight: 16, borderRadius: 8 },
});
`,

  grid: (name, dataSource) => `import React from 'react';
import { View, StyleSheet, FlatList, Pressable, Text } from 'react-native';
import { useTheme } from '../theme';

export function ${name}Screen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.color.background }]}>
      <Text style={[styles.title, { color: theme.color.text }]}>${name}</Text>
      <FlatList
        data={[]}
        numColumns={4}
        renderItem={({ item }) => (
          <Pressable style={({ focused }) => [styles.tile, focused && styles.tileFocused]}>
            <View />
          </Pressable>
        )}
        keyExtractor={(_, i) => String(i)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 48 },
  title: { fontSize: 36, fontWeight: '700', marginBottom: 24 },
  tile: { width: 240, height: 135, margin: 8, borderRadius: 8 },
  tileFocused: { borderWidth: 3, borderColor: '#fff' },
});
`,

  detail: (name, dataSource) => `import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useTheme } from '../theme';

export function ${name}Screen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.color.background }]}>
      <View style={styles.backdrop} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.color.text }]}>Title</Text>
        <Text style={[styles.description, { color: theme.color.textMuted }]}>Description</Text>
        <Pressable style={({ focused }) => [styles.playButton, focused && styles.playButtonFocused]}>
          <Text style={styles.playText}>Play</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backdrop: { height: 500, opacity: 0.6 },
  content: { padding: 48 },
  title: { fontSize: 48, fontWeight: '700', marginBottom: 12 },
  description: { fontSize: 24, marginBottom: 24 },
  playButton: { backgroundColor: '#E50914', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 4 },
  playButtonFocused: { opacity: 0.8, transform: [{ scale: 1.05 }] },
  playText: { color: '#fff', fontSize: 24, fontWeight: '700' },
});
`,

  player: (name, dataSource) => `import React from 'react';
import { View, StyleSheet } from 'react-native';

export function ${name}Screen() {
  return (
    <View style={styles.container}>
      {/* Video player component goes here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
`,

  settings: (name, dataSource) => `import React from 'react';
import { View, StyleSheet, Text, Pressable, FlatList } from 'react-native';
import { useTheme } from '../theme';

const SETTINGS_ITEMS = [
  { id: 'account', label: 'Account' },
  { id: 'playback', label: 'Playback' },
  { id: 'about', label: 'About' },
];

export function ${name}Screen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.color.background }]}>
      <Text style={[styles.title, { color: theme.color.text }]}>Settings</Text>
      <FlatList
        data={SETTINGS_ITEMS}
        renderItem={({ item }) => (
          <Pressable style={({ focused }) => [styles.row, focused && styles.rowFocused]}>
            <Text style={[styles.rowText, { color: theme.color.text }]}>{item.label}</Text>
          </Pressable>
        )}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 48 },
  title: { fontSize: 36, fontWeight: '700', marginBottom: 24 },
  row: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 8 },
  rowFocused: { backgroundColor: 'rgba(255,255,255,0.1)' },
  rowText: { fontSize: 24 },
});
`,

  search: (name, dataSource) => `import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, FlatList, Pressable } from 'react-native';
import { useTheme } from '../theme';

export function ${name}Screen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  return (
    <View style={[styles.container, { backgroundColor: theme.color.background }]}>
      <TextInput
        style={[styles.input, { color: theme.color.text, borderColor: theme.color.textMuted }]}
        placeholder="Search..."
        placeholderTextColor={theme.color.textMuted}
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={[]}
        numColumns={4}
        renderItem={({ item }) => (
          <Pressable style={({ focused }) => [styles.tile, focused && styles.tileFocused]}>
            <View />
          </Pressable>
        )}
        keyExtractor={(_, i) => String(i)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 48 },
  input: { fontSize: 28, borderWidth: 2, borderRadius: 8, padding: 16, marginBottom: 24 },
  tile: { width: 240, height: 135, margin: 8, borderRadius: 8 },
  tileFocused: { borderWidth: 3, borderColor: '#fff' },
});
`,
};

export const addScreenHandler: ToolHandler = async (input): Promise<ToolResult> => {
  const workdir = input.workdir as string;
  const name = input.name as string;
  const layout = input.layout as string;
  const dataSource = (input.data_source as string) ?? "";

  const screensDir = join(workdir, "packages", "shared-ui", "src", "screens");
  if (!existsSync(screensDir)) {
    mkdirSync(screensDir, { recursive: true });
  }

  const templateFn = LAYOUT_TEMPLATES[layout];
  if (!templateFn) {
    return { ok: false, output: null, error: `Unknown layout: ${layout}. Valid: ${Object.keys(LAYOUT_TEMPLATES).join(", ")}` };
  }

  const fileName = `${name}Screen.tsx`;
  const filePath = join(screensDir, fileName);

  if (existsSync(filePath)) {
    return { ok: true, output: `Screen ${name} already exists at ${filePath}` };
  }

  const content = templateFn(name, dataSource);
  writeFileSync(filePath, content);

  // Update screens index
  const indexPath = join(screensDir, "index.ts");
  if (existsSync(indexPath)) {
    let indexContent = readFileSync(indexPath, "utf-8");
    const exportLine = `export { ${name}Screen } from './${name}Screen';\n`;
    if (!indexContent.includes(`${name}Screen`)) {
      indexContent += exportLine;
      writeFileSync(indexPath, indexContent);
    }
  } else {
    writeFileSync(indexPath, `export { ${name}Screen } from './${name}Screen';\n`);
  }

  return {
    ok: true,
    output: `Screen "${name}" created at ${filePath} with layout "${layout}". Exported from screens/index.ts.`,
  };
};
