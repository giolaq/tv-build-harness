import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline } from "ink";
import Spinner from "ink-spinner";
import type { Phase, PhaseResult, DesignTokens } from "./types.js";

export interface TUIState {
  appName: string;
  platforms: string[];
  design: { template: string; navigation_style: string };
  phases: Phase[];
  currentPhases: Set<Phase>;
  phaseResults: Map<Phase, PhaseResult>;
  phaseCosts: Map<Phase, number>;
  phaseIterations: Map<Phase, { current: number; max: number }>;
  totalTokens: number;
  tokenBudget: number;
  totalCost: number;
  elapsed: number;
  animTick: number;
  logLines: string[];
  status: "running" | "done" | "failed";
}

interface DashboardProps {
  state: TUIState;
}

function PhaseIcon({ status }: { status: string }) {
  if (status === "running") return <Spinner type="dots" />;
  if (status === "success") return <Text color="green">✓</Text>;
  if (status === "degraded") return <Text color="yellow">~</Text>;
  if (status === "failed") return <Text color="red">✗</Text>;
  return <Text color="gray">○</Text>;
}

function WaveText({ text, tick }: { text: string; tick: number }) {
  const wave = tick % (text.length * 2);
  const pos = wave < text.length ? wave : text.length * 2 - 1 - wave;

  const chars = text.split("").map((char, i) => {
    const distance = Math.abs(i - pos);

    if (distance === 0) {
      return <Text key={i} bold color="cyan">{char.toUpperCase()}</Text>;
    } else if (distance === 1) {
      return <Text key={i} bold color="white">{char}</Text>;
    } else {
      return <Text key={i} color="gray">{char}</Text>;
    }
  });

  return <>{chars}</>;
}

const TV_FRAMES = [
  // Frame 0: happy eyes open
  [
    "  ╔═══════════════╗  ",
    "  ║  ◕  ▽  ◕    ║  ",
    "  ║    ╰──╯      ║  ",
    "  ╚═══════════════╝  ",
    "     ║      ║        ",
    "    ╱╨══════╨╲       ",
  ],
  // Frame 1: wink
  [
    "  ╔═══════════════╗  ",
    "  ║  ─  ▽  ◕    ║  ",
    "  ║    ╰──╯      ║  ",
    "  ╚═══════════════╝  ",
    "     ║      ║        ",
    "    ╱╨══════╨╲       ",
  ],
  // Frame 2: excited
  [
    "  ╔═══════════════╗  ",
    "  ║  ◕  ▽  ◕    ║  ",
    "  ║    ╰▽▽╯      ║  ",
    "  ╚═══════════════╝  ",
    "     ║      ║        ",
    "    ╱╨══════╨╲       ",
  ],
  // Frame 3: thinking
  [
    "  ╔═══════════════╗  ",
    "  ║  ◑  ▽  ◑    ║  ",
    "  ║    ╰~~╯      ║  ",
    "  ╚═══════════════╝  ",
    "     ║      ║        ",
    "    ╱╨══════╨╲       ",
  ],
];

function TVLogo({ tick }: { tick: number }) {
  const frameIdx = Math.floor(tick / 12) % TV_FRAMES.length;
  const frame = TV_FRAMES[frameIdx];
  return (
    <Box flexDirection="column" marginRight={1}>
      {frame.map((line, i) => (
        <Text key={i} color={i < 4 ? "cyan" : "gray"}>{line}</Text>
      ))}
    </Box>
  );
}

function Header({ state }: DashboardProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <TVLogo tick={state.animTick} />
        <Box flexDirection="column" justifyContent="center">
          <Box>
            <Text bold color="cyan">TV App Harness</Text>
            <Text color="gray"> │ </Text>
            <Text bold>{state.appName}</Text>
          </Box>
          <Box>
            <Text color="gray">Platforms: </Text>
            <Text>{state.platforms.join(", ")}</Text>
            <Text color="gray"> │ Template: </Text>
            <Text>{state.design.template}</Text>
            <Text color="gray"> │ Nav: </Text>
            <Text>{state.design.navigation_style}</Text>
          </Box>
        </Box>
      </Box>
      <Box marginTop={0}>
        <Text color="gray">{"─".repeat(70)}</Text>
      </Box>
    </Box>
  );
}

function PhaseList({ state }: DashboardProps) {
  return (
    <Box flexDirection="column">
      {state.phases.map((phase) => {
        const result = state.phaseResults.get(phase);
        const isCurrent = state.currentPhases.has(phase);
        const status = isCurrent ? "running" : result?.status ?? "pending";
        const cost = state.phaseCosts.get(phase);
        const iterInfo = state.phaseIterations.get(phase);

        return (
          <Box key={phase}>
            <Box width={3}>
              <PhaseIcon status={status} />
            </Box>
            <Box width={24}>
              {isCurrent ? (
                <WaveText text={phase} tick={state.animTick} />
              ) : (
                <Text color={status === "pending" ? "gray" : undefined}>
                  {phase}
                </Text>
              )}
            </Box>
            <Box width={16}>
              <Text color={
                status === "success" ? "green" :
                status === "degraded" ? "yellow" :
                status === "failed" ? "red" : "gray"
              }>
                {status}
                {iterInfo ? ` ${iterInfo.current}/${iterInfo.max}` : ""}
              </Text>
            </Box>
            <Box width={10}>
              {cost ? <Text color="gray">${cost.toFixed(3)}</Text> : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function Stats({ state }: DashboardProps) {
  const minutes = Math.floor(state.elapsed / 60);
  const seconds = state.elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  const succeeded = [...state.phaseResults.values()].filter(r => r.status === "success").length;
  const total = state.phaseResults.size;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="gray">{"─".repeat(70)}</Text>
      </Box>
      <Box>
        <Text color="gray">Time: </Text>
        <Text>{timeStr}</Text>
        <Text color="gray"> │ Tokens: </Text>
        <Text>{state.totalTokens.toLocaleString()}</Text>
        <Text color="gray">/{(state.tokenBudget / 1000).toFixed(0)}K</Text>
        <Text color="gray"> │ Cost: </Text>
        <Text color="green">${state.totalCost.toFixed(4)}</Text>
        {total > 0 && (
          <>
            <Text color="gray"> │ Phases: </Text>
            <Text color="green">{succeeded}</Text>
            <Text color="gray">/{total}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

function LogPanel({ state }: DashboardProps) {
  const visibleLines = state.logLines.slice(-8);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="gray">{"─".repeat(70)}</Text>
      </Box>
      <Box marginBottom={0}>
        <Text color="gray" bold> Activity </Text>
      </Box>
      {visibleLines.map((line, i) => (
        <Box key={i}>
          <Text color="gray" wrap="truncate-end">
            {line.length > 68 ? line.slice(0, 68) + "…" : line}
          </Text>
        </Box>
      ))}
      {visibleLines.length === 0 && (
        <Text color="gray" italic>  Waiting for activity...</Text>
      )}
    </Box>
  );
}

function Dashboard({ state }: DashboardProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Header state={state} />
      <PhaseList state={state} />
      <Stats state={state} />
      <LogPanel state={state} />
      {state.status === "done" && (
        <Box marginTop={1}>
          <Text color="green" bold>Run complete.</Text>
        </Box>
      )}
      {state.status === "failed" && (
        <Box marginTop={1}>
          <Text color="red" bold>Run failed.</Text>
        </Box>
      )}
    </Box>
  );
}

export class TUI {
  private state: TUIState;
  private rerender: ((element: React.ReactElement) => void) | null = null;
  private timer: NodeJS.Timer | null = null;
  private animTimer: NodeJS.Timer | null = null;
  private startTime: number;

  constructor(appName: string, platforms: string[], design: { template: string; navigation_style: string }, phases: Phase[]) {
    this.startTime = Date.now();
    this.state = {
      appName,
      platforms,
      design,
      phases,
      currentPhases: new Set(),
      phaseResults: new Map(),
      phaseCosts: new Map(),
      phaseIterations: new Map(),
      totalTokens: 0,
      tokenBudget: 500_000,
      totalCost: 0,
      elapsed: 0,
      animTick: 0,
      logLines: [],
      status: "running",
    };
  }

  start(): void {
    const { rerender } = render(<Dashboard state={this.state} />);
    this.rerender = rerender;

    this.timer = setInterval(() => {
      this.state.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.update();
    }, 1000);

    this.animTimer = setInterval(() => {
      this.state.animTick++;
      if (this.state.currentPhases.size > 0) {
        this.update();
      }
    }, 100);
  }

  setPhase(phase: Phase): void {
    this.state.currentPhases.add(phase);
    this.log(`Starting phase: ${phase}`);
    this.update();
  }

  phaseComplete(phase: Phase, result: PhaseResult, cost?: number): void {
    this.state.phaseResults.set(phase, result);
    if (cost) {
      this.state.phaseCosts.set(phase, cost);
      this.state.totalCost += cost;
    }
    this.state.currentPhases.delete(phase);
    this.log(`${result.status === "success" ? "✓" : "✗"} ${phase}: ${result.status}${cost ? ` ($${cost.toFixed(3)})` : ""}`);
    this.update();
  }

  setIteration(phase: Phase, current: number, max: number): void {
    this.state.phaseIterations.set(phase, { current, max });
    this.update();
  }

  addTokens(tokens: number): void {
    this.state.totalTokens += tokens;
    this.update();
  }

  log(message: string): void {
    this.state.logLines.push(message);
    if (this.state.logLines.length > 50) {
      this.state.logLines = this.state.logLines.slice(-50);
    }
    this.update();
  }

  finish(status: "done" | "failed"): void {
    this.state.status = status;
    this.state.currentPhases.clear();
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
      this.timer = null;
    }
    if (this.animTimer) {
      clearInterval(this.animTimer as unknown as number);
      this.animTimer = null;
    }
    this.update();
  }

  private update(): void {
    if (this.rerender) {
      this.rerender(<Dashboard state={this.state} />);
    }
  }
}
