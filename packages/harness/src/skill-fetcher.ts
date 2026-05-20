import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface RemoteSkill {
  path: string;
  as: string;
}

interface RemoteRepo {
  repo: string;
  branch: string;
  basePath: string;
  skills: RemoteSkill[];
}

interface RemoteSkillsConfig {
  remotes: RemoteRepo[];
}

export class SkillFetcher {
  private skillsDir: string;
  private cacheDir: string;
  private configPath: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.cacheDir = join(skillsDir, ".remote-cache");
    this.configPath = join(skillsDir, "remote-skills.json");
  }

  async fetchAll(): Promise<{ fetched: string[]; failed: string[] }> {
    if (!existsSync(this.configPath)) {
      return { fetched: [], failed: [] };
    }

    mkdirSync(this.cacheDir, { recursive: true });

    const config: RemoteSkillsConfig = JSON.parse(readFileSync(this.configPath, "utf-8"));
    const fetched: string[] = [];
    const failed: string[] = [];

    for (const remote of config.remotes) {
      for (const skill of remote.skills) {
        const destPath = join(this.cacheDir, `${skill.as}.md`);

        if (existsSync(destPath)) {
          fetched.push(skill.as);
          continue;
        }

        try {
          const url = `https://raw.githubusercontent.com/${remote.repo}/${remote.branch}/${remote.basePath}/${skill.path}`;
          const content = execSync(`curl -fsSL "${url}"`, {
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 15_000,
            encoding: "utf-8",
          });

          const patched = content.replace(
            /^(name:\s*).+$/m,
            `$1${skill.as}`
          );

          writeFileSync(destPath, patched);
          fetched.push(skill.as);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failed.push(`${skill.as}: ${message}`);
        }
      }
    }

    return { fetched, failed };
  }

  isPopulated(): boolean {
    if (!existsSync(this.configPath)) return true;

    const config: RemoteSkillsConfig = JSON.parse(readFileSync(this.configPath, "utf-8"));
    const totalSkills = config.remotes.reduce((sum, r) => sum + r.skills.length, 0);

    if (totalSkills === 0) return true;

    if (!existsSync(this.cacheDir)) return false;

    for (const remote of config.remotes) {
      for (const skill of remote.skills) {
        if (!existsSync(join(this.cacheDir, `${skill.as}.md`))) {
          return false;
        }
      }
    }

    return true;
  }

  async update(): Promise<{ updated: string[]; failed: string[] }> {
    if (!existsSync(this.configPath)) {
      return { updated: [], failed: [] };
    }

    const config: RemoteSkillsConfig = JSON.parse(readFileSync(this.configPath, "utf-8"));
    mkdirSync(this.cacheDir, { recursive: true });

    const updated: string[] = [];
    const failed: string[] = [];

    for (const remote of config.remotes) {
      for (const skill of remote.skills) {
        const destPath = join(this.cacheDir, `${skill.as}.md`);

        try {
          const url = `https://raw.githubusercontent.com/${remote.repo}/${remote.branch}/${remote.basePath}/${skill.path}`;
          const content = execSync(`curl -fsSL "${url}"`, {
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 15_000,
            encoding: "utf-8",
          });

          const patched = content.replace(
            /^(name:\s*).+$/m,
            `$1${skill.as}`
          );

          writeFileSync(destPath, patched);
          updated.push(skill.as);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failed.push(`${skill.as}: ${message}`);
        }
      }
    }

    return { updated, failed };
  }

  getCacheDir(): string {
    return this.cacheDir;
  }
}
