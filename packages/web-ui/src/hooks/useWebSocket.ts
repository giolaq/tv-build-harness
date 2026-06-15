import { useEffect, useRef } from "react";
import { useRunStore } from "../store/useRunStore";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const handleEvent = useRunStore((s) => s.handleEvent);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data);
          handleEvent(event);
        } catch {}
      };

      ws.onclose = () => {
        setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [handleEvent]);
}
