// Load test: 60 participants joining an EXISTING room
// Run with: ROOM_CODE=YY8WV node test/join_existing_room.js
const io = require('socket.io-client');

// Using the production server URL directly
const SERVER_URL = 'https://monolopy.onrender.com';
const ROOM_CODE = process.env.ROOM_CODE || 'YY8WV';

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

(async () => {
    console.log(`Connecting 60 participants to Room: ${ROOM_CODE} on ${SERVER_URL}`);

    const clients = [];
    for (let i = 1; i <= 60; i++) {
        const client = io(SERVER_URL);

        // Error handling
        client.on('connect_error', (err) => {
            console.error(`Client ${i} Connection Error:`, err.message);
        });

        await new Promise(res => client.once('connect', res));

        // Join room
        client.emit('join_room', { code: ROOM_CODE, name: `Bot-${i}` });

        client.on('room_joined', () => {
            console.log(`Bot-${i} joined room ${ROOM_CODE}`);
        });

        client.on('room_error', (err) => {
            console.error(`Bot-${i} Error:`, err.message);
            client.disconnect();
        });

        clients.push(client);

        // Small stagger to prevent mostly network/local CPU bottlenecks, 
        // but fast enough to be "simultaneous"
        await delay(50);
    }

    console.log('All 60 join requests sent.');

    // Keep alive for a bit
    setInterval(() => { }, 1000);
})();
