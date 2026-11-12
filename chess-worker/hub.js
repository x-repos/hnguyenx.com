// Matchmaking and relay rules for online chess. Nothing here touches Cloudflare,
// so the same file can be run and tested anywhere.
//
// A "socket" is any object with:  get() -> its state,  set(state),  send(text)
// A state is one of:  { s: "idle" }  { s: "wait" }  { s: "play", room, color }
//
// Messages are small JSON objects with a type field "t".
//   from a player      find · rejoin {room, color} · move {n, uci} · sync {moves} · resign · leave
//   to a player        waiting · start {room, color} · rejoined {peer} · peer {on} · left
//                      and the other player's move, sync and resign, passed on as they came
// The relay never looks at the chess itself. Each player's page checks every move it receives.

export const MAX_MESSAGE = 8192;

const stateOf = (x) => x.get() || { s: "idle" };
const say = (x, obj) => x.send(JSON.stringify(obj));

// the other seat in the same game, if that player is connected
function peerOf(sockets, ws, st) {
  return sockets.find((x) => {
    if (x === ws) return false;
    const xs = stateOf(x);
    return xs.s === "play" && xs.room === st.room && xs.color !== st.color;
  });
}

// walk away from whatever this socket was doing, telling the other player if there is one
function leave(sockets, ws, st) {
  if (st.s !== "play") return;
  const peer = peerOf(sockets, ws, st);
  if (peer) say(peer, { t: "left" });
}

export function onMessage(sockets, ws, text, newRoom) {
  if (typeof text !== "string" || text.length > MAX_MESSAGE) return;
  let m;
  try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m.t !== "string") return;
  const st = stateOf(ws);

  switch (m.t) {
    case "find": {
      // the first player to ask waits; the next one to ask is paired with them
      leave(sockets, ws, st);
      const other = sockets.find((x) => x !== ws && stateOf(x).s === "wait");
      if (!other) { ws.set({ s: "wait" }); say(ws, { t: "waiting" }); return; }
      const room = newRoom(), white = Math.random() < 0.5 ? ws : other, black = white === ws ? other : ws;
      white.set({ s: "play", room, color: "w" });
      black.set({ s: "play", room, color: "b" });
      say(white, { t: "start", room, color: "w" });
      say(black, { t: "start", room, color: "b" });
      return;
    }
    case "rejoin": {
      // a player whose connection dropped takes their seat again. Knowing the room name is the key to it.
      if (typeof m.room !== "string" || !/^[\w-]{8,64}$/.test(m.room) || (m.color !== "w" && m.color !== "b")) return;
      leave(sockets, ws, st);
      const mine = { s: "play", room: m.room, color: m.color };
      // an older connection still holding this same seat gives it up
      for (const x of sockets) {
        if (x === ws) continue;
        const xs = stateOf(x);
        if (xs.s === "play" && xs.room === mine.room && xs.color === mine.color) x.set({ s: "idle" });
      }
      ws.set(mine);
      const peer = peerOf(sockets, ws, mine);
      say(ws, { t: "rejoined", peer: !!peer });
      if (peer) say(peer, { t: "peer", on: true });
      return;
    }
    case "move":
    case "sync":
    case "resign": {
      if (st.s !== "play") return;
      const peer = peerOf(sockets, ws, st);
      if (peer) peer.send(text);
      return;
    }
    case "leave":
      leave(sockets, ws, st);
      ws.set({ s: "idle" });
      return;
  }
}

// a connection ended without saying goodbye: the other player is told, and may wait for a return
export function onClose(sockets, ws) {
  const st = stateOf(ws);
  if (st.s !== "play") return;
  const peer = peerOf(sockets, ws, st);
  if (peer) say(peer, { t: "peer", on: false });
}
