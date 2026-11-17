'use strict';
// A handle on the Socket.IO server for the services, without making them depend on it. Until the server is attached
// (in tests, scripts, or if sockets are off) every emit is a no-op, so a request never fails because nobody is listening.
let io = null;

const setIo = (server) => {
  io = server;
};

/** True once the live server is attached. Work that only exists to tell clients about a change is skipped when it is false. */
const hasIo = () => Boolean(io);

/** Sends an event to every connected device of one person (they all join the room `user:<id>`). */
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

/** Sends an event to everyone in the given rooms at once (a device in several of them still hears it once). */
function emitToRooms(rooms, event, payload) {
  if (!io || rooms.length === 0) return;
  io.to(rooms).emit(event, payload);
}

/** Sends an event to every connected device. Only for things that carry no private data. */
function emitToAll(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

module.exports = { setIo, hasIo, emitToUser, emitToRooms, emitToAll };