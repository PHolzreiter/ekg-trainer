// EKG-Trainer – Online-Räume. Gleiche Nachrichten wie der lokale Server:
// Der Host (role=host, mit Schlüssel) sendet, alle Teilnehmer (role=view) empfangen. Nachrichten mit "k" werden für Nachzügler gemerkt.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(room)) return new Response('Raum fehlt', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    if (url.pathname === '/api/room') return Response.json({});
    return env.ASSETS.fetch(req);
  },
};

export class Room {
  constructor(state) { this.state = state; this.host = null; this.key = null; this.peers = new Map(); this.stored = new Map(); this.next = 0; }
  peersMsg() { return JSON.stringify({ t: 'peers', list: [...this.peers].map(([id, p]) => ({ id, name: p.name })) }); }
  tellHost() { if (this.host) { try { this.host.send(this.peersMsg()); } catch (e) {} } }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
    const url = new URL(req.url), role = url.searchParams.get('role'), key = url.searchParams.get('key') || '';
    const [client, server] = Object.values(new WebSocketPair()); server.accept();
    if (role === 'host') {
      if (key.length < 16 || (this.key && this.key !== key)) { server.close(4003, 'abgelehnt'); return new Response(null, { status: 101, webSocket: client }); }
      this.key = key; this.host = server; server.send(this.peersMsg());
      server.addEventListener('message', (e) => {
        if (typeof e.data !== 'string' || e.data.length > 600000) return; let v; try { v = JSON.parse(e.data); } catch (x) { return; }
        if (v.t === 'kick') { const p = this.peers.get(v.id); if (p) { this.peers.delete(v.id); try { p.ws.close(4001, 'entfernt'); } catch (x) {} this.tellHost(); } return; }
        if (v.k) this.stored.set(v.k, e.data);
        for (const p of this.peers.values()) { try { p.ws.send(e.data); } catch (x) {} }
      });
      const bye = () => { if (this.host === server) this.host = null; };
      server.addEventListener('close', bye); server.addEventListener('error', bye);
    } else if (role === 'view') {
      if (!this.key || this.peers.size >= 200) { server.close(4003, 'abgelehnt'); return new Response(null, { status: 101, webSocket: client }); }
      const id = ++this.next; this.peers.set(id, { ws: server, name: '' });
      for (const m of this.stored.values()) server.send(m);
      this.tellHost();
      server.addEventListener('message', (e) => {
        if (typeof e.data !== 'string' || e.data.length > 4000) return; let v; try { v = JSON.parse(e.data); } catch (x) { return; }
        if (v.t === 'hello') { const p = this.peers.get(id); if (p) { p.name = String(v.name || '').slice(0, 24); this.tellHost(); } }
        else if (this.host) { v.from = id; try { this.host.send(JSON.stringify(v)); } catch (x) {} }
      });
      const bye = () => { if (this.peers.delete(id)) this.tellHost(); };
      server.addEventListener('close', bye); server.addEventListener('error', bye);
    } else server.close(4003, 'abgelehnt');
    return new Response(null, { status: 101, webSocket: client });
  }
}
