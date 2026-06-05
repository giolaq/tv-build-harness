import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline } from "ink";
import Spinner from "ink-spinner";
import type { Phase, PhaseResult, DesignTokens } from "./types.js";

export interface TUIState {
  appName: string;
  platforms: string[];
  design: { template: string; navigation_style: string };
  phases: Phase[];
  currentPhase: Phase | null;
  phaseResults: Map<Phase, PhaseResult>;
  phaseCosts: Map<Phase, number>;
  totalTokens: number;
  tokenBudget: number;
  totalCost: number;
  elapsed: number;
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

function WaveText({ text, color }: { text: string; color?: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % (text.length * 2));
    }, 80);
    return () => clearInterval(interval);
  }, [text.length]);

  const chars = text.split("").map((char, i) => {
    const wave = tick % (text.length * 2);
    const pos = wave < text.length ? wave : text.length * 2 - 1 - wave;
    const distance = Math.abs(i - pos);
    const isHighlight = distance === 0;
    const isNear = distance === 1;

    if (isHighlight) {
      return <Text key={i} bold color="cyan">{char.toUpperCase()}</Text>;
    } else if (isNear) {
      return <Text key={i} color={color ?? "white"}>{char}</Text>;
    } else {
      return <Text key={i} color="white" dimColor>{char}</Text>;
    }
  });

  return <>{chars}</>;
}

function Header({ state }: DashboardProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
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
        const isCurrent = phase === state.currentPhase;
        const status = isCurrent ? "running" : result?.status ?? "pending";
        const cost = state.phaseCosts.get(phase);

        return (
          <Box key={phase}>
            <Box width={3}>
              <PhaseIcon status={status} />
            </Box>
            <Box width={24}>
              {isCurrent ? (
                <WaveText text={phase} />
              ) : (
                <Text color={status === "pending" ? "gray" : undefined}>
                  {phase}
                </Text>
              )}
            </Box>
            <Box width={12}>
              <Text color={
                status === "success" ? "green" :
                status === "degraded" ? "yellow" :
                status === "failed" ? "red" : "gray"
              }>
                {status}
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
  private startTime: number;

  constructor(appName: string, platforms: string[], design: { template: string; navigation_style: string }, phases: Phase[]) {
    this.startTime = Date.now();
    this.state = {
      appName,
      platforms,
      design,
      phases,
      currentPhase: null,
      phaseResults: new Map(),
      phaseCosts: new Map(),
      totalTokens: 0,
      tokenBudget: 500_000,
      totalCost: 0,
      elapsed: 0,
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
  }

  setPhase(phase: Phase): void {
    this.state.currentPhase = phase;
    this.log(`Starting phase: ${phase}`);
    this.update();
  }

  phaseComplete(phase: Phase, result: PhaseResult, cost?: number): void {
    this.state.phaseResults.set(phase, result);
    if (cost) {
      this.state.phaseCosts.set(phase, cost);
      this.state.totalCost += cost;
    }
    this.state.currentPhase = null;
    this.log(`${result.status === "success" ? "✓" : "✗"} ${phase}: ${result.status}${cost ? ` ($${cost.toFixed(3)})` : ""}`);
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
    this.state.currentPhase = null;
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
      this.timer = null;
    }
    this.update();
  }

  private update(): void {
    if (this.rerender) {
      this.rerender(<Dashboard state={this.state} />);
    }
  }
}
