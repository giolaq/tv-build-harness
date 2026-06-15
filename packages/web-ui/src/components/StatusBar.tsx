import { useRunStore } from "../store/useRunStore";
import { useEffect, useState } from "react";

export function StatusBar() {
  const { status, tokensUsed, tokenBudget, totalCost, startTime, phases } = useRunStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "running" || !startTime) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status, startTime]);

  const completedCount = [...phases.values()].filter(
    (p) => p.status === "success" || p.status === "degraded"
  ).length;
  const totalPhases = phases.size;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="flex items-center gap-6 px-6 py-3 bg-gray-900 border-b border-gray-800 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Status:</span>
        <span className={
          status === "running" ? "text-cyan-400" :
          status === "done" ? "text-green-400" :
          status === "failed" ? "text-red-400" : "text-gray-500"
        }>
          {status}
        </span>
      </div>
      {status === "running" && (
        <>
          <div>
            <span className="text-gray-400">Time: </span>
            <span>{timeStr}</span>
          </div>
          <div>
            <span className="text-gray-400">Tokens: </span>
            <span>{tokensUsed.toLocaleString()}</span>
            <span className="text-gray-500">/{(tokenBudget / 1000).toFixed(0)}K</span>
          </div>
          <div>
            <span className="text-gray-400">Cost: </span>
            <span className="text-green-400">${totalCost.toFixed(4)}</span>
          </div>
          <div>
            <span className="text-gray-400">Phases: </span>
            <span className="text-green-400">{completedCount}</span>
            <span className="text-gray-500">/{totalPhases}</span>
          </div>
        </>
      )}
    </div>
  );
}
