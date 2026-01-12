// Load test: 60 participants (host + 59 spectators)
// Forces host to land on Challenge squares (ID 17) to trigger questions.
// Run with: node test/load_test_60.js
const io = require('socket.io-client');
const SERVER_URL = process.env.VITE_SERVER_URL || 'http://localhost:3000';

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

(async () => {
    console.log('Connecting host to:', SERVER_URL);
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
        client.on('room_joined', () => { /* quiet */ });
        spectators.push(client);
        if (i % 10 === 0) console.log(`${i} spectators connected...`);
        await delay(10);
    }
    console.log('All spectators connected.');

    // Wait for room readiness
    await delay(1000);

    // Helper actions
    const debugMove = (id) => host.emit('dispatch_action', { action: { type: 'DEBUG_MOVE', payload: { targetId: id } } });
    const answerQuestion = (idx) => host.emit('dispatch_action', { action: { type: 'QUESTION_ANSWER', payload: { choiceIndex: idx } } });
    const endTurn = () => host.emit('dispatch_action', { action: { type: 'END_TURN' } });

    // Start game
    host.emit('start_game');
    console.log('Game start requested.');

    let answered = 0;
    const maxQuestions = 35;
    let processing = false;
    let lastPhase = '';

    host.on('game_state', async state => {
        if (state.phase !== lastPhase) {
            console.log(`Phase changed to: ${state.phase}`);
            lastPhase = state.phase;
        }

        if (processing) return;

        if (state.pending && state.pending.type === 'question') {
            processing = true;
            const choiceIndex = Math.floor(Math.random() * state.pending.options.length);
            console.log(`Answering question ${answered + 1}...`);
            answerQuestion(choiceIndex);
            answered++;
            if (answered >= maxQuestions) {
                console.log('All questions answered! SUCCESS.');
                cleanup();
            }
            setTimeout(() => { processing = false; }, 200);
        }
        else if (state.phase === 'await_roll') {
            // Force move to Challenge ID 17
            if (!processing) {
                processing = true;
                console.log('Forcing move to Challenge (ID 17)...');
                debugMove(17);
                setTimeout(() => { processing = false; }, 500);
            }
        }
        else if (state.phase === 'post_roll') {
            if (!processing) {
                processing = true;
                endTurn();
                setTimeout(() => { processing = false; }, 200);
            }
        }
    });

    const timeoutId = setTimeout(() => {
        console.log(`Timeout reached. Answered ${answered} questions.`);
        cleanup();
    }, 300000); // 5 minutes

    function cleanup() {
        clearTimeout(timeoutId);
        host.disconnect();
        spectators.forEach(s => s.disconnect());
        console.log('Test completed.');
        process.exit(0);
    }
})();
