import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { join, resolve } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { summarizeRun } from "./status.js";

interface ServerOptions {
  port: number;
  workdir: string;
  skillsDir: string;
  examplesDir: string;
}

export function startServer(options: ServerOptions) {
  const { port, workdir, examplesDir } = options;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  app.get("/api/examples", (_req, res) => {
    if (!existsSync(examplesDir)) return res.json([]);
    res.json(readdirSync(examplesDir).filter((name) => statSync(join(examplesDir, name)).isDirectory()));
  });

  app.get("/api/examples/:name", (req, res) => {
    const dir = resolve(examplesDir, req.params.name);
    if (!dir.startsWith(resolve(examplesDir)) || !existsSync(dir)) return res.status(404).json({ error: "Not found" });
    const json = (name: string) => {
      const path = join(dir, name);
      return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
    };
    const text = (name: string) => existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf-8").trim() : "";
    res.json({ prompt: text("prompt.txt"), content: json("content.json"), brand: json("brand.json"), design: json("design.json"), config: json("run.json"), screens: json("screens.json") });
  });

  app.get("/api/runs", (_req, res) => {
    const out = join(workdir, "out");
    if (!existsSync(out)) return res.json([]);
    res.json(readdirSync(out).filter((id) => statSync(join(out, id)).isDirectory()).map((id) => summarizeRun(workdir, id) ?? { runId: id, state: "unknown" }));
  });

  app.get("/api/runs/:id/state", (req, res) => {
    const summary = summarizeRun(workdir, req.params.id);
    if (!summary) return res.status(404).json({ error: "Run not found" });
    res.json({ schemaVersion: 1, ...summary });
  });

  for (const artifact of ["spec.json", "report.md", "run.log", "android-handoff.json"] as const) {
    const route = artifact.replace(/\..+$/, "");
    app.get(`/api/runs/:id/${route}`, (req, res) => {
      const path = join(workdir, "out", req.params.id, artifact);
      if (!existsSync(path)) return res.status(404).json({ error: `${artifact} not found` });
      if (artifact.endsWith(".json")) return res.json(JSON.parse(readFileSync(path, "utf-8")));
      res.type(artifact.endsWith(".md") ? "text/markdown" : "text/plain").send(readFileSync(path, "utf-8"));
    });
  }

  app.get("/api/runs/:id/screenshots", (req, res) => {
    const dir = join(workdir, "out", req.params.id, "screenshots");
    if (!existsSync(dir)) return res.json([]);
    res.json(readdirSync(dir, { recursive: true }).map(String).filter((name) => name.endsWith(".png")));
  });

  app.get("/api/runs/:id/screenshots/:file", (req, res) => {
    const root = resolve(workdir, "out", req.params.id, "screenshots");
    const path = resolve(root, req.params.file);
    if (!path.startsWith(root) || !existsSync(path)) return res.status(404).send("Not found");
    res.type("image/png").sendFile(path);
  });

  app.post(["/api/runs/start", "/api/runs/stop"], (_req, res) => {
    res.status(410).json({ error: "The web UI is read-only. Use the tv-build CLI plan and confirmation flow." });
  });

  wss.on("connection", (ws) => ws.send(JSON.stringify({ schemaVersion: 1, type: "observer", readOnly: true })));
  server.listen(port, () => console.log(`TV Build read-only run explorer: http://localhost:${port}/api`));
  return { app, server, wss };
}
