/**
 * Socket.IO signaling handler for WebRTC video calls + real-time chat.
 *
 * Rooms follow the pattern:  `room:<sortedId1>_<sortedId2>`
 * so both parties always join the same room regardless of who initiates.
 */

const activeRooms = new Map(); // roomId → Set<socketId>

export default function registerSignalingHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    /* ---- Room management ---- */
    socket.on("join-room", ({ roomId, userId }) => {
      if (!roomId || !userId) return;

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.userId = userId;

      if (!activeRooms.has(roomId)) activeRooms.set(roomId, new Set());
      activeRooms.get(roomId).add(socket.id);

      // Notify others in the room that a new user joined
      socket.to(roomId).emit("user-joined", { userId, socketId: socket.id });

      // Tell the joiner how many people are already in the room
      const count = activeRooms.get(roomId).size;
      socket.emit("room-info", { roomId, participantCount: count });
    });

    /* ---- WebRTC signaling ---- */
    socket.on("offer", ({ roomId, offer }) => {
      socket.to(roomId).emit("offer", { offer, from: socket.id });
    });

    socket.on("answer", ({ roomId, answer }) => {
      socket.to(roomId).emit("answer", { answer, from: socket.id });
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      socket.to(roomId).emit("ice-candidate", { candidate, from: socket.id });
    });

    /* ---- Real-time chat ---- */
    socket.on("chat-message", ({ roomId, message, sender, timestamp }) => {
      if (!roomId || !message) return;

      // Broadcast to everyone in the room (including sender for confirmation)
      io.in(roomId).emit("chat-message", {
        message,
        sender,
        timestamp: timestamp || Date.now(),
        socketId: socket.id,
      });
    });

    /* ---- Typing indicator ---- */
    socket.on("typing", ({ roomId, sender }) => {
      socket.to(roomId).emit("typing", { sender });
    });

    socket.on("stop-typing", ({ roomId, sender }) => {
      socket.to(roomId).emit("stop-typing", { sender });
    });

    /* ---- Call control ---- */
    socket.on("end-call", ({ roomId }) => {
      socket.to(roomId).emit("call-ended", { by: socket.id });
    });

    /* ---- Cleanup ---- */
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (roomId && activeRooms.has(roomId)) {
        activeRooms.get(roomId).delete(socket.id);
        if (activeRooms.get(roomId).size === 0) activeRooms.delete(roomId);

        socket.to(roomId).emit("user-left", {
          userId: socket.data.userId,
          socketId: socket.id,
        });
      }
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}
