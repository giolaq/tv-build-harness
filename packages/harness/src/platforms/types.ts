import type { CommandResult } from "../process/command-runner.js";

export type RemoteAction = "up" | "down" | "left" | "right" | "select" | "back";

export interface AndroidBuildProfile {
  projectDir: string;
  module: string;
  variant: string;
  packageName?: string;
  activity?: string;
  compileTask: string;
  assembleTask: string;
  installTask: string;
  apkPath: string;
}

export interface PlatformContext {
  appDir: string;
  profile: AndroidBuildProfile;
  deviceSerial?: string;
  artifactsDir: string;
}

export interface PlatformResult {
  ok: boolean;
  step: string;
  message: string;
  command?: CommandResult;
  artifact?: string;
  failureClass?: "input" | "environment" | "product" | "aborted";
  details?: Record<string, unknown>;
}

export interface PlatformAdapter {
  doctor(): Promise<PlatformResult[]>;
  build(context: PlatformContext): Promise<PlatformResult[]>;
  install(context: PlatformContext): Promise<PlatformResult>;
  launch(context: PlatformContext): Promise<PlatformResult>;
  input(context: PlatformContext, actions: RemoteAction[]): Promise<PlatformResult>;
  screenshot(context: PlatformContext, name: string): Promise<PlatformResult>;
  logs(context: PlatformContext): Promise<PlatformResult>;
  cleanup(): Promise<void>;
}
