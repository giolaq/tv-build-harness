import { useRunStore } from "../store/useRunStore";

const STATUS_ICONS: Record<string, string> = {
  pending: "○",
  running: "◌",
  success: "✓",
  degraded: "~",
  failed: "✗",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-gray-500",
  running: "text-cyan-400",
  success: "text-green-400",
  degraded: "text-yellow-400",
  failed: "text-red-400",
};

export function PhaseList() {
  const { phases, selectedPhase, setSelectedPhase } = useRunStore();

  return (
    <div className="flex flex-col gap-1 p-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Phases</h2>
      {[...phases.entries()].map(([name, state]) => {
        const isSelected = selectedPhase === name;
        const msgCount = state.messages.length;

        return (
          <button
            key={name}
            onClick={() => setSelectedPhase(isSelected ? null : name)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
              isSelected ? "bg-gray-700" : "hover:bg-gray-800"
            }`}
          >
            <span className={`text-lg ${STATUS_COLORS[state.status]}`}>
              {state.status === "running" ? (
                <span className="animate-pulse">{STATUS_ICONS.running}</span>
              ) : (
                STATUS_ICONS[state.status]
              )}
            </span>
            <span className={`flex-1 text-sm ${isSelected ? "text-white font-medium" : "text-gray-300"}`}>
              {name}
            </span>
            <span className="text-xs text-gray-500">
              {state.cost ? `$${state.cost.toFixed(3)}` : ""}
            </span>
            {msgCount > 0 && (
              <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                {msgCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
