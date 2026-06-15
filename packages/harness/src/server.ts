import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { ClaudeOrchestrator } from "./claude-orchestrator.js";
import type { PhaseMessage, HarnessEvents } from "./claude-orchestrator.js";
import type { PhaseResult } from "./types.js";
import {
  ContentManifestSchema,
  BrandKitSchema,
  RunConfigSchema,
  DesignTokensSchema,
  ScreenTreeSchema,
} from "./types.js";

export interface WSEvent {
  type: string;
  [key: string]: unknown;
}

interface ServerOptions {
  port: number;
  workdir: string;
  skillsDir: string;
  examplesDir: string;
}

export function startServer(options: ServerOptions) {
  const { port, workdir, skillsDir, examplesDir } = options;

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  let currentRun: ClaudeOrchestrator | null = null;
  let runningPromise: Promise<unknown> | null = null;
  let runState: Record<string, unknown> = {};

  function broadcast(event: WSEvent) {
    const msg = JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }

  // --- WebSocket ---

  wss.on("connection", (ws) => {
    if (runState && Object.keys(runState).length > 0) {
      ws.send(JSON.stringify({ type: "state", ...runState }));
    }
  });

  // --- REST: Examples ---

  app.get("/api/examples", (_req, res) => {
    if (!existsSync(examplesDir)) return res.json([]);
    const entries = readdirSync(examplesDir).filter((e) =>
      statSync(join(examplesDir, e)).isDirectory()
    );
    res.json(entries);
  });

  app.get("/api/examples/:name", (req, res) => {
    const dir = join(examplesDir, req.params.name);
    if (!existsSync(dir)) return res.status(404).json({ error: "Not found" });

    const load = (file: string) => {
      const p = join(dir, file);
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
    };
    const loadText = (file: string) => {
      const p = join(dir, file);
      return existsSync(p) ? readFileSync(p, "utf-8").trim() : "";
    };

    res.json({
      prompt: loadText("prompt.txt"),
      content: load("content.json"),
      brand: load("brand.json"),
      design: load("design.json"),
      config: load("run.json"),
      screens: load("screens.json"),
    });
  });

  // --- REST: Runs ---

  app.get("/api/runs", (_req, res) => {
    const outDir = join(workdir, "out");
    if (!existsSync(outDir)) return res.json([]);
    const entries = readdirSync(outDir)
      .map((name) => {
        const dir = join(outDir, name);
        const stat = statSync(dir);
        const reportPath = join(dir, "report.md");
        const specPath = join(dir, "spec.json");
        return {
          id: name,
          date: stat.mtime.toISOString(),
          hasReport: existsSync(reportPath),
          hasSpec: existsSync(specPath),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    res.json(entries);
  });

  app.get("/api/runs/:id/spec", (req, res) => {
    const specPath = join(workdir, "out", req.params.id, "spec.json");
    if (!existsSync(specPath)) return res.status(404).json({ error: "No spec" });
    res.json(JSON.parse(readFileSync(specPath, "utf-8")));
  });

  app.get("/api/runs/:id/report", (req, res) => {
    const reportPath = join(workdir, "out", req.params.id, "report.md");
    if (!existsSync(reportPath)) return res.status(404).json({ error: "No report" });
    res.type("text/markdown").send(readFileSync(reportPath, "utf-8"));
  });

  app.get("/api/runs/:id/screenshots", (req, res) => {
    const ssDir = join(workdir, "out", req.params.id, "screenshots");
    if (!existsSync(ssDir)) return res.json([]);
    const files = readdirSync(ssDir, { recursive: true })
      .filter((f) => String(f).endsWith(".png"))
      .map(String);
    res.json(files);
  });

  app.get("/api/runs/:id/screenshots/:file", (req, res) => {
    const filePath = join(workdir, "out", req.params.id, "screenshots", req.params.file);
    if (!existsSync(filePath)) return res.status(404).send("Not found");
    res.type("image/png").sendFile(filePath);
  });

  app.get("/api/runs/:id/state", (_req, res) => {
    if (currentRun) {
      const state = currentRun.getState();
      res.json({
        runId: state.runId,
        currentPhase: state.currentPhase,
        tokensUsed: state.tokensUsed,
        tokenBudget: state.tokenBudget,
        phases: [...state.phaseResults.entries()].map(([k, v]) => ({ name: k, ...v })),
      });
    } else {
      res.json(runState);
    }
  });

  // --- REST: Start/Stop ---

  app.post("/api/runs/start", (req, res) => {
    if (runningPromise) {
      return res.status(409).json({ error: "A run is already in progress" });
    }

    const body = req.body;

    try {
      const content = ContentManifestSchema.parse(body.content);
      const brand = body.brand ? BrandKitSchema.parse(body.brand) : BrandKitSchema.parse({});
      const config = body.config ? RunConfigSchema.parse(body.config) : RunConfigSchema.parse({ platforms: ["web"] });
      const design = body.design ? DesignTokensSchema.parse(body.design) : DesignTokensSchema.parse({});
      const screenTree = body.screens ? ScreenTreeSchema.parse(body.screens) : undefined;
      const prompt = body.prompt || `A streaming app called "${content.title}". ${content.description}`;

      const events: HarnessEvents = {
        onPhaseStart: (phase) => {
          runState = { ...runState, currentPhase: phase, status: "running" };
          broadcast({ type: "phaseStart", phase });
        },
        onPhaseEnd: (phase, result, cost) => {
          broadcast({ type: "phaseEnd", phase, result, cost });
        },
        onTokens: (tokens) => {
          broadcast({ type: "tokens", total: tokens });
        },
        onIteration: (phase, current, max) => {
          broadcast({ type: "iteration", phase, current, max });
        },
        onLog: (message) => {
          broadcast({ type: "log", message });
        },
        onPhaseMessage: (phase, msg) => {
          broadcast({ type: "message", phase, msg });
        },
      };

      currentRun = new ClaudeOrchestrator(
        { prompt, content, brand, config, design, screenTree, workdir, skillsDir },
        events
      );

      const runId = currentRun.getState().runId;
      runState = { runId, status: "running", currentPhase: "plan" };
      broadcast({ type: "started", runId });

      runningPromise = currentRun
        .run()
        .then(({ state }) => {
          runState = { runId: state.runId, status: "done" };
          broadcast({ type: "complete", runId: state.runId, status: "done" });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          runState = { ...runState, status: "failed", error: msg };
          broadcast({ type: "complete", runId, status: "failed", error: msg });
        })
        .finally(() => {
          currentRun = null;
          runningPromise = null;
        });

      res.json({ runId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  app.post("/api/runs/stop", (_req, res) => {
    if (!currentRun) return res.status(404).json({ error: "No run in progress" });
    runState = { ...runState, status: "stopped" };
    broadcast({ type: "complete", runId: runState.runId, status: "stopped" });
    currentRun = null;
    runningPromise = null;
    res.json({ ok: true });
  });

  // --- Start ---

  server.listen(port, () => {
    console.log(`\n  TV App Harness — Web Server`);
    console.log(`  REST API: http://localhost:${port}/api`);
    console.log(`  WebSocket: ws://localhost:${port}`);
    console.log(`  Examples: ${examplesDir}`);
    console.log(`  Working dir: ${workdir}\n`);
  });

  return { app, server, wss };
}
