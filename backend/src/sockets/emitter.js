'use strict';
// A handle on the Socket.IO server for the services, without making them depend on it. Until the server is attached
// (in tests, scripts, or if sockets are off) every emit is a no-op, so a request never fails because nobody is listening.
let io = null;

const setIo = (server) => {
  io = server;
};

/** Sends an event to every connected device of one person (they all join the room `user:<id>`). */
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

module.exports = { setIo, emitToUser };
