import type { ClientMessage, ServerMessage, ListState } from "../../shared/types";
import { wsUrl } from "./syncWorker";

type StateListener = (state: ListState) => void;
type PresenceListener = (names: string[]) => void;
type ErrorListener = (message: string) => void;
type ConnListener = (connected: boolean) => void;

export class ListConnection {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private queue: ClientMessage[] = [];
  private stateListeners = new Set<StateListener>();
  private presenceListeners = new Set<PresenceListener>();
  private errorListeners = new Set<ErrorListener>();
  private connListeners = new Set<ConnListener>();

  constructor(
    private code: string,
    private participantName: string,
  ) {}

  connect(): void {
    this.closedByUser = false;
    const url = wsUrl(`/api/lists/${encodeURIComponent(this.code)}/ws?name=${encodeURIComponent(this.participantName)}`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = 1000;
      for (const listener of this.connListeners) listener(true);
      for (const msg of this.queue.splice(0)) this.rawSend(msg);
    });

    ws.addEventListener("message", (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (msg.type === "state") {
        for (const listener of this.stateListeners) listener(msg.state);
      } else if (msg.type === "presence") {
        for (const listener of this.presenceListeners) listener(msg.names);
      } else if (msg.type === "error") {
        for (const listener of this.errorListeners) listener(msg.message);
      }
    });

    ws.addEventListener("close", () => this.scheduleReconnect());
    ws.addEventListener("error", () => ws.close());
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    for (const listener of this.connListeners) listener(false);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.7, 15000);
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private rawSend(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.rawSend(msg);
    } else {
      this.queue.push(msg);
    }
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onPresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onConnectionChange(listener: ConnListener): () => void {
    this.connListeners.add(listener);
    return () => this.connListeners.delete(listener);
  }
}
