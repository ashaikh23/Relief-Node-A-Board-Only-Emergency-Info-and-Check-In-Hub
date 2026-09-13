/*
 * Relief Node WebUI client
 *
 * A tiny, self-contained Socket.IO v4 / Engine.IO v4 WebSocket client for the
 * simple JSON event traffic used by Arduino App Lab's WebUI brick.
 * It removes the need to copy socket.io.min.js or arduino.js from another app.
 */
class ReliefSocket {
  constructor() {
    this.handlers = new Map();
    this.ws = null;
    this.connected = false;
    this.intentionalClose = false;
    this.queue = [];
    this.retryTimer = null;
    this.connect();
  }

  on(name, callback) {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name).push(callback);
  }

  fire(name, ...args) {
    for (const cb of this.handlers.get(name) || []) {
      try { cb(...args); } catch (err) { console.error(err); }
    }
  }

  connect() {
    clearTimeout(this.retryTimer);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/socket.io/?EIO=4&transport=websocket`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('WebSocket creation failed:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('message', (event) => this.handlePacket(String(event.data)));
    this.ws.addEventListener('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.fire('disconnect');
      if (!this.intentionalClose) this.scheduleReconnect();
    });
    this.ws.addEventListener('error', (err) => {
      console.error('Relief Node WebSocket error:', err);
    });
  }

  scheduleReconnect() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), 1500);
  }

  rawSend(packet) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet);
      return true;
    }
    return false;
  }

  handlePacket(packet) {
    // Engine.IO OPEN
    if (packet.startsWith('0')) {
      this.rawSend('40'); // Socket.IO connect to default namespace
      return;
    }

    // Engine.IO ping/pong
    if (packet === '2') {
      this.rawSend('3');
      return;
    }

    // Socket.IO CONNECT
    if (packet.startsWith('40')) {
      if (!this.connected) {
        this.connected = true;
        this.fire('connect');
        for (const queued of this.queue.splice(0)) this.rawSend(queued);
      }
      return;
    }

    // Socket.IO DISCONNECT
    if (packet.startsWith('41')) {
      if (this.connected) this.fire('disconnect');
      this.connected = false;
      return;
    }

    // Socket.IO EVENT: 42["event", {...}]
    if (packet.startsWith('42')) {
      try {
        const payload = JSON.parse(packet.slice(2));
        if (Array.isArray(payload) && typeof payload[0] === 'string') {
          this.fire(payload[0], ...payload.slice(1));
        }
      } catch (err) {
        console.error('Could not parse Socket.IO event:', packet, err);
      }
    }
  }

  emit(name, data = {}) {
    const packet = '42' + JSON.stringify([name, data]);
    if (!this.connected || !this.rawSend(packet)) this.queue.push(packet);
  }
}

class WebUI {
  constructor() {
    this.socket = new ReliefSocket();
  }
  on_connect(callback) { this.socket.on('connect', callback); }
  on_disconnect(callback) { this.socket.on('disconnect', callback); }
  on_message(eventName, callback) { this.socket.on(eventName, callback); }
  send_message(eventName, data) { this.socket.emit(eventName, data ?? {}); }
}
