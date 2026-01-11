// Load test: 60 participants (host + 59 spectators) with reliable start and auto‑roll/answer
// Run with: node test/load_test_60.js
const io = require('socket.io-client');
const SERVER_URL = process.env.VITE_SERVER_URL || 'http://localhost:3000';

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

(async () => {
    console.log('Connecting host...');
    const host = io(SERVER_URL);
    await new Promise(res => host.once('connect', res));
    const nickname = 'HostUser';

    // Create room
    const roomCode = await new Promise(resolve => {
        host.emit('create_room', { name: nickname, presentationMode: false, teamCount: 4 });
        host.on('room_joined', data => {
            console.log('Room created, code:', data.roomCode);
            resolve(data.roomCode);
        });
    });

    // Connect 59 spectators
    const spectators = [];
    for (let i = 1; i <= 59; i++) {
        const client = io(SERVER_URL);
        await new Promise(res => client.once('connect', res));
        client.emit('join_room', { code: roomCode, name: `Spectator${i}` });
        client.on('room_joined', () => console.log(`Spectator${i} joined`));
        spectators.push(client);
        await delay(10);
    }
    console.log('All spectators connected.');

    // Wait for the room to be marked as started (in case server needs a moment)
    await new Promise(resolve => {
        const handler = data => {
            if (data.started) {
                console.log('Room marked as started by server.');
                host.off('room_update', handler);
                resolve();
            }
        };
        host.on('room_update', handler);
        // Fallback: after 2 seconds, just proceed
        setTimeout(() => {
            host.off('room_update', handler);
            resolve();
        }, 2000);
    });

    // Helper to roll dice
    const rollDice = () => host.emit('dispatch_action', { action: { type: 'ROLL' } });

    // Start the game
    host.emit('start_game');
    console.log('Game start requested.');

    let answered = 0;
    const maxQuestions = 35;
    let rolling = false;

    host.on('game_state', async state => {
        // Answer pending questions
        if (state.pending && state.pending.type === 'question') {
            const choiceIndex = Math.floor(Math.random() * state.pending.options.length);
            host.emit('dispatch_action', { action: { type: 'QUESTION_ANSWER', payload: { choiceIndex } } });
            answered++;
            console.log(`Answered question ${answered}`);
            if (answered >= maxQuestions) {
                console.log('All questions answered, cleaning up.');
                cleanup();
                return;
            }
        }
        // Roll when allowed
        if (!rolling && state.phase === 'await_roll') {
            rolling = true;
            rollDice();
            setTimeout(() => { rolling = false; }, 300);
        }
    });

    const timeoutId = setTimeout(() => {
        console.log('Timeout reached, cleaning up.');
        cleanup();
    }, 180000); // 3 minutes max

    function cleanup() {
        clearTimeout(timeoutId);
        host.disconnect();
        spectators.forEach(s => s.disconnect());
        console.log('Test completed.');
    }
})();
