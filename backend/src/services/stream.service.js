'use strict';

const HEARTBEAT_MS = 25000;

/** Keeps the open server-sent-event connections for each match and pushes updates to them. */
function createStreamService() {
  const streams = new Map(); // match id -> Set of responses

  const safeWrite = (subs, res, chunk) => {
    try {
      res.write(chunk);
    } catch {
      subs.delete(res);
    }
  };

  const heartbeat = setInterval(() => {
    for (const subs of streams.values()) for (const res of subs) safeWrite(subs, res, ': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const stateEvent = (record) => `event: state\ndata: ${JSON.stringify(record)}\n\n`;

  return {
    /** Opens an event stream on res, sends the current record and keeps it until the client leaves. */
    subscribe(req, res, record) {
      req.socket.setTimeout(0);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      res.write(stateEvent(record));
      let subs = streams.get(record.id);
      if (!subs) streams.set(record.id, (subs = new Set()));
      subs.add(res);
      req.on('close', () => {
        subs.delete(res);
        if (subs.size === 0 && streams.get(record.id) === subs) streams.delete(record.id);
      });
    },

    hasSubscribers: (id) => (streams.get(id)?.size || 0) > 0,

    publish(record) {
      const subs = streams.get(record.id);
      if (!subs) return;
      for (const res of subs) safeWrite(subs, res, stateEvent(record));
    },

    /** Tells viewers the match is gone and closes their streams. */
    closeMatch(id) {
      const subs = streams.get(id);
      if (!subs) return;
      for (const res of subs) {
        try {
          res.write('event: deleted\ndata: {}\n\n');
          res.end();
        } catch {
          /* already closed */
        }
      }
      streams.delete(id);
    },

    closeAll() {
      clearInterval(heartbeat);
      for (const subs of streams.values()) {
        for (const res of subs) {
          try {
            res.end();
          } catch {
            /* already closed */
          }
        }
      }
      streams.clear();
    },
  };
}

module.exports = { createStreamService };
