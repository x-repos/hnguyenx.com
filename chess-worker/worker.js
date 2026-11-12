// Online chess relay for hnguyenx.com
//
// One Durable Object holds every open connection. It pairs players who press
// "Play a friend online" and then passes their moves back and forth. The rules
// for that live in hub.js; this file is only the Cloudflare plumbing.
//
// Connections use the WebSocket Hibernation API: between moves the object is
// asleep and costs nothing, and "ping" is answered with "pong" without waking it.
//
//   GET /ws   (WebSocket)   the game connection
//   GET /     plain text, to check the worker is up

import { DurableObject } from "cloudflare:workers";
import { onMessage, onClose } from "./hub.js";

// pages allowed to connect: the site itself, and local previews of it
const ALLOWED_ORIGIN = /^(https:\/\/(www\.)?hnguyenx\.com|http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?)$/;
const MAX_SOCKETS = 200;

// Each connection carries a small note (its "attachment") that survives sleep:
// an id, and where the player is: idle, waiting, or playing in a room.
function wrap(ws) {
  const id = (ws.deserializeAttachment() || {}).id;
  return {
    id,
    get: () => ws.deserializeAttachment(),
    set: (state) => ws.serializeAttachment({ ...state, id }),
    send: (text) => { try { ws.send(text); } catch (e) { /* that player has gone */ } },
  };
}

export class ChessHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("Busy, try again later", { status: 503 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID(), s: "idle" });
    return new Response(null, { status: 101, webSocket: client });
  }

  // every connection, and the one this event is about, in the form hub.js works with
  sockets(ws) {
    const all = this.ctx.getWebSockets().map(wrap), id = (ws.deserializeAttachment() || {}).id;
    return { all, me: all.find((x) => x.id === id) || wrap(ws) };
  }

  webSocketMessage(ws, message) {
    const { all, me } = this.sockets(ws);
    onMessage(all, me, message, () => crypto.randomUUID());
  }

  webSocketClose(ws, code, reason) {
    const { all, me } = this.sockets(ws);
    onClose(all, me);
    try { ws.close(code, reason); } catch (e) { /* already closed */ }
  }

  webSocketError(ws) {
    const { all, me } = this.sockets(ws);
    onClose(all, me);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/ws") return new Response("Chess relay for hnguyenx.com is running.\n");
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    if (!ALLOWED_ORIGIN.test(request.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
    return env.HUB.get(env.HUB.idFromName("hub")).fetch(request);
  },
};
