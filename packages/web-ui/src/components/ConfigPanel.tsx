import { useState, useEffect } from "react";
import { fetchExamples, fetchExample, startRun } from "../api/client";
import { useRunStore } from "../store/useRunStore";

export function ConfigPanel() {
  const { status, reset } = useRunStore();
  const [examples, setExamples] = useState<string[]>([]);
  const [selectedExample, setSelectedExample] = useState("");
  const [prompt, setPrompt] = useState("");
  const [appName, setAppName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1a1a2e");
  const [accentColor, setAccentColor] = useState("#e94560");
  const [backgroundColor, setBackgroundColor] = useState("#16213e");
  const [navStyle, setNavStyle] = useState("drawer");
  const [platforms, setPlatforms] = useState<string[]>(["web"]);
  const [contentJson, setContentJson] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchExamples().then(setExamples).catch(() => {});
  }, []);

  const loadExample = async (name: string) => {
    setSelectedExample(name);
    const data = await fetchExample(name);
    setPrompt(data.prompt || "");
    setContentJson(JSON.stringify(data.content, null, 2));
    if (data.brand) {
      setAppName(data.brand.name || "");
      setPrimaryColor(data.brand.primary_color || "#1a1a2e");
      setAccentColor(data.brand.accent_color || "#e94560");
      setBackgroundColor(data.brand.background_color || "#16213e");
    }
    if (data.design) {
      setNavStyle(data.design.navigation_style || "drawer");
    }
    if (data.config?.platforms) {
      setPlatforms(data.config.platforms);
    }
  };

  const handleStart = async () => {
    setError("");
    try {
      const content = JSON.parse(contentJson);
      reset();
      await startRun({
        prompt,
        content,
        brand: {
          name: appName,
          primary_color: primaryColor,
          accent_color: accentColor,
          background_color: backgroundColor,
          font_family: "System",
          logo_path: "",
          splash_path: "",
        },
        design: { navigation_style: navStyle },
        config: { platforms },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    }
  };

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const isRunning = status === "running";

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configuration</h2>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Example</label>
        <select
          value={selectedExample}
          onChange={(e) => loadExample(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          disabled={isRunning}
        >
          <option value="">Select an example...</option>
          {examples.map((ex) => (
            <option key={ex} value={ex}>{ex}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm h-24 resize-y"
          placeholder="Describe the TV app you want to build..."
          disabled={isRunning}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">App Name</label>
          <input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            disabled={isRunning}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Nav Style</label>
          <select
            value={navStyle}
            onChange={(e) => setNavStyle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            disabled={isRunning}
          >
            <option value="drawer">Drawer</option>
            <option value="tabs">Tabs</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Primary</label>
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={isRunning} className="w-10 h-8 rounded cursor-pointer" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Accent</label>
          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} disabled={isRunning} className="w-10 h-8 rounded cursor-pointer" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Background</label>
          <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} disabled={isRunning} className="w-10 h-8 rounded cursor-pointer" />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Platforms</label>
        <div className="flex gap-2 flex-wrap">
          {["web", "androidtv", "appletv", "firetv-vega"].map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={platforms.includes(p)}
                onChange={() => togglePlatform(p)}
                disabled={isRunning}
                className="rounded"
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Content JSON</label>
        <textarea
          value={contentJson}
          onChange={(e) => setContentJson(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono h-32 resize-y"
          placeholder='{"title": "My App", "categories": [...], "videos": [...], "featured": [...]}'
          disabled={isRunning}
        />
      </div>

      {error && <div className="text-red-400 text-xs">{error}</div>}

      <button
        onClick={handleStart}
        disabled={isRunning || !contentJson.trim()}
        className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
      >
        {isRunning ? "Running..." : "Start Generation"}
      </button>
    </div>
  );
}
