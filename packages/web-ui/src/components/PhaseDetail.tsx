import { useEffect, useRef } from "react";
import { useRunStore } from "../store/useRunStore";

export function PhaseDetail() {
  const { selectedPhase, phases } = useRunStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const phaseState = selectedPhase ? phases.get(selectedPhase) : null;
  const messages = phaseState?.messages ?? [];

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  if (!selectedPhase) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a phase to view details
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-cyan-400">{selectedPhase}</h3>
        <span className="text-xs text-gray-500">{messages.length} messages</span>
        {phaseState?.iteration && (
          <span className="text-xs text-gray-400">
            iter {phaseState.iteration.current}/{phaseState.iteration.max}
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs"
      >
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-2">
            <span className={
              msg.type === "text" ? "text-gray-300" :
              msg.type === "tool_use" ? "text-yellow-400" : "text-green-400"
            }>
              {msg.type === "text" ? "▪" : msg.type === "tool_use" ? "▶" : "◀"}
            </span>
            <div className="flex-1 min-w-0">
              {msg.type === "tool_use" ? (
                <div>
                  <span className="text-yellow-300 font-semibold">{msg.toolName}</span>
                  <span className="text-gray-500 ml-2">{msg.content.slice(0, 120)}</span>
                </div>
              ) : msg.type === "tool_result" ? (
                <span className="text-green-300/70">{msg.content.slice(0, 200)}</span>
              ) : (
                <span className="text-gray-200 whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-gray-600 italic">
            {phaseState?.status === "running" ? "Waiting for messages..." : "No messages recorded"}
          </div>
        )}
      </div>
    </div>
  );
}
