// Load test for 50 participants joining a room
// Run with: node test/load_test.js
const io = require('socket.io-client');
const SERVER_URL = process.env.VITE_SERVER_URL || 'http://localhost:3000';

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

(async () => {
    console.log('Connecting host...');
    const host = io(SERVER_URL);
    await new Promise(res => host.once('connect', res));
    const nickname = 'HostUser';
    const roomCodePromise = new Promise(res => {
        host.emit('create_room', { name: nickname, presentationMode: false, teamCount: 4 });
        host.on('room_joined', data => {
            console.log('Room created, code:', data.roomCode);
            res(data.roomCode);
        });
    });
    const roomCode = await roomCodePromise;
    // Wait a bit before participants join
    await delay(500);
    const participants = [];
    for (let i = 1; i <= 49; i++) {
        const client = io(SERVER_URL);
        await new Promise(res => client.once('connect', res));
        client.emit('join_room', { code: roomCode, name: `Player${i}` });
        client.on('room_joined', data => {
            console.log(`Player${i} joined room ${data.roomCode}`);
        });
        participants.push(client);
        // small stagger to avoid burst
        await delay(50);
    }
    console.log('All participants connected.');
    // Keep connections alive for a short while to observe stability
    await delay(5000);
    // Cleanup
    host.disconnect();
    participants.forEach(p => p.disconnect());
    console.log('Test completed.');
})();
