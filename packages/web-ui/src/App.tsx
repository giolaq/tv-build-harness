import { useWebSocket } from "./hooks/useWebSocket";
import { StatusBar } from "./components/StatusBar";
import { PhaseList } from "./components/PhaseList";
import { PhaseDetail } from "./components/PhaseDetail";
import { ConfigPanel } from "./components/ConfigPanel";

export default function App() {
  useWebSocket();

  return (
    <div className="h-screen flex flex-col">
      <StatusBar />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-72 border-r border-gray-800 overflow-y-auto flex flex-col">
          <ConfigPanel />
        </aside>
        <aside className="w-56 border-r border-gray-800 overflow-y-auto">
          <PhaseList />
        </aside>
        <main className="flex-1 overflow-hidden">
          <PhaseDetail />
        </main>
      </div>
    </div>
  );
}
