import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { Phase, PhaseResult } from "./types.js";
import type { PhaseMessage } from "./claude-orchestrator.js";

export interface TUIState {
  appName: string;
  platforms: string[];
  design: { template: string; navigation_style: string };
  phases: Phase[];
  currentPhases: Set<Phase>;
  phaseResults: Map<Phase, PhaseResult>;
  phaseCosts: Map<Phase, number>;
  phaseIterations: Map<Phase, { current: number; max: number }>;
  phaseMessages: Map<Phase, PhaseMessage[]>;
  totalTokens: number;
  tokenBudget: number;
  totalCost: number;
  elapsed: number;
  animTick: number;
  logLines: string[];
  status: "running" | "done" | "failed";
  selectedIndex: number;
  detailPhase: Phase | null;
  detailScroll: number;
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


const TV_FACES = ["◕‿◕", "─‿◕", "◕▽◕", "◑~◑"];

function TVFace({ tick }: { tick: number }) {
  const face = TV_FACES[Math.floor(tick / 12) % TV_FACES.length];
  return <Text color="cyan">[{face}]</Text>;
}

function Header({ state }: DashboardProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <TVFace tick={state.animTick} />
        <Text> </Text>
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
      {state.phases.map((phase, idx) => {
        const result = state.phaseResults.get(phase);
        const isCurrent = state.currentPhases.has(phase);
        const status = isCurrent ? "running" : result?.status ?? "pending";
        const cost = state.phaseCosts.get(phase);
        const iterInfo = state.phaseIterations.get(phase);
        const isSelected = idx === state.selectedIndex;
        const msgCount = state.phaseMessages.get(phase)?.length ?? 0;

        return (
          <Box key={phase}>
            <Box width={2}>
              <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "▸" : " "}</Text>
            </Box>
            <Box width={3}>
              <PhaseIcon status={status} />
            </Box>
            <Box width={24}>
              {isCurrent ? (
                <WaveText text={phase} tick={state.animTick} />
              ) : (
                <Text
                  color={isSelected ? "cyan" : status === "pending" ? "gray" : undefined}
                  bold={isSelected}
                >
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
            <Box width={8}>
              {msgCount > 0 ? <Text color="gray">[{msgCount}]</Text> : null}
            </Box>
          </Box>
        );
      })}
      <Box marginTop={0}>
        <Text color="gray" dimColor> ↑↓ select  Enter: view detail  </Text>
      </Box>
    </Box>
  );
}

function Stats({ state }: DashboardProps) {
  const minutes = Math.floor(state.elapsed / 60);
  const seconds = state.elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  const succeeded = [...state.phaseResults.values()].filter(r => r.status === "success").length;
  const total = state.phases.length;

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
        <Text color="gray"> │ Phases: </Text>
        <Text color="green">{succeeded}</Text>
        <Text color="gray">/{total}</Text>
      </Box>
    </Box>
  );
}


function DetailView({ state }: DashboardProps) {
  const phase = state.detailPhase!;
  const messages = state.phaseMessages.get(phase) ?? [];
  const maxVisible = 20;
  const scroll = state.detailScroll;
  const visible = messages.slice(scroll, scroll + maxVisible);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Phase: {phase}</Text>
        <Text color="gray"> │ </Text>
        <Text color="gray">{messages.length} messages</Text>
        <Text color="gray"> │ </Text>
        <Text color="gray" dimColor>Esc: back  ↑↓: scroll</Text>
      </Box>
      <Box>
        <Text color="gray">{"─".repeat(70)}</Text>
      </Box>
      <Box flexDirection="column">
        {visible.map((msg, i) => (
          <Box key={scroll + i} marginBottom={0}>
            <Box width={3}>
              <Text color={
                msg.type === "text" ? "white" :
                msg.type === "tool_use" ? "yellow" : "green"
              }>
                {msg.type === "text" ? "▪" : msg.type === "tool_use" ? "▶" : "◀"}
              </Text>
            </Box>
            <Box flexGrow={1}>
              {msg.type === "tool_use" ? (
                <Text wrap="truncate-end">
                  <Text color="yellow" bold>{msg.toolName}</Text>
                  <Text color="gray"> {msg.content.slice(0, 60)}</Text>
                </Text>
              ) : msg.type === "tool_result" ? (
                <Text color="green" wrap="truncate-end" dimColor>
                  {msg.content.slice(0, 68)}
                </Text>
              ) : (
                <Text wrap="truncate-end">
                  {msg.content.slice(0, 68)}
                </Text>
              )}
            </Box>
          </Box>
        ))}
        {visible.length === 0 && (
          <Text color="gray" italic>  No messages yet...</Text>
        )}
      </Box>
      {messages.length > maxVisible && (
        <Box marginTop={1}>
          <Text color="gray">
            Showing {scroll + 1}-{Math.min(scroll + maxVisible, messages.length)} of {messages.length}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function Dashboard({ state }: DashboardProps) {
  if (state.detailPhase) {
    return <DetailView state={state} />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header state={state} />
      <PhaseList state={state} />
      <Stats state={state} />
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

function InteractiveDashboard({ initialState }: { initialState: TUIState }) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const handler = () => setState({ ...initialState });
    (initialState as any).__notify = handler;
    return () => { (initialState as any).__notify = null; };
  }, [initialState]);

  useInput((input, key) => {
    if (state.detailPhase) {
      if (key.escape) {
        initialState.detailPhase = null;
        (initialState as any).__notify?.();
      } else if (key.upArrow) {
        initialState.detailScroll = Math.max(0, initialState.detailScroll - 1);
        (initialState as any).__notify?.();
      } else if (key.downArrow) {
        const msgs = initialState.phaseMessages.get(initialState.detailPhase!) ?? [];
        initialState.detailScroll = Math.min(Math.max(0, msgs.length - 20), initialState.detailScroll + 1);
        (initialState as any).__notify?.();
      }
    } else {
      if (key.upArrow) {
        initialState.selectedIndex = Math.max(0, initialState.selectedIndex - 1);
        (initialState as any).__notify?.();
      } else if (key.downArrow) {
        initialState.selectedIndex = Math.min(initialState.phases.length - 1, initialState.selectedIndex + 1);
        (initialState as any).__notify?.();
      } else if (key.return) {
        const phase = initialState.phases[initialState.selectedIndex];
        if (phase) {
          initialState.detailPhase = phase;
          initialState.detailScroll = Math.max(0, (initialState.phaseMessages.get(phase)?.length ?? 0) - 20);
          (initialState as any).__notify?.();
        }
      }
    }
  });

  return <Dashboard state={state} />;
}

export class TUI {
  private state: TUIState;
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
      phaseMessages: new Map(),
      totalTokens: 0,
      tokenBudget: 500_000,
      totalCost: 0,
      elapsed: 0,
      animTick: 0,
      logLines: [],
      status: "running",
      selectedIndex: 0,
      detailPhase: null,
      detailScroll: 0,
    };
  }

  start(): void {
    render(<InteractiveDashboard initialState={this.state} />);

    this.timer = setInterval(() => {
      this.state.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.notify();
    }, 1000);

    this.animTimer = setInterval(() => {
      this.state.animTick++;
      if (this.state.currentPhases.size > 0) {
        this.notify();
      }
    }, 100);
  }

  setPhase(phase: Phase): void {
    this.state.currentPhases.add(phase);
    if (!this.state.phaseMessages.has(phase)) {
      this.state.phaseMessages.set(phase, []);
    }
    this.log(`Starting phase: ${phase}`);
    this.notify();
  }

  phaseComplete(phase: Phase, result: PhaseResult, cost?: number): void {
    this.state.phaseResults.set(phase, result);
    if (cost) {
      this.state.phaseCosts.set(phase, cost);
      this.state.totalCost += cost;
    }
    this.state.currentPhases.delete(phase);
    this.log(`${result.status === "success" ? "✓" : "✗"} ${phase}: ${result.status}${cost ? ` ($${cost.toFixed(3)})` : ""}`);
    this.notify();
  }

  setIteration(phase: Phase, current: number, max: number): void {
    this.state.phaseIterations.set(phase, { current, max });
    this.notify();
  }

  addTokens(tokens: number): void {
    this.state.totalTokens += tokens;
    this.notify();
  }

  addPhaseMessage(phase: Phase, message: PhaseMessage): void {
    if (!this.state.phaseMessages.has(phase)) {
      this.state.phaseMessages.set(phase, []);
    }
    const messages = this.state.phaseMessages.get(phase)!;
    messages.push(message);
    if (messages.length > 500) {
      messages.splice(0, messages.length - 500);
    }

    // Auto-scroll if in detail view for this phase
    if (this.state.detailPhase === phase) {
      this.state.detailScroll = Math.max(0, messages.length - 20);
    }

    this.notify();
  }

  log(message: string): void {
    this.state.logLines.push(message);
    if (this.state.logLines.length > 50) {
      this.state.logLines = this.state.logLines.slice(-50);
    }
    this.notify();
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
    this.notify();
  }

  private notify(): void {
    (this.state as any).__notify?.();
  }
}
