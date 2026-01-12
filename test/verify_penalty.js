
const io = require('socket.io-client');
const SERVER_URL = 'http://localhost:3000';

(async () => {
    console.log('Connecting to server...');
    const client = io(SERVER_URL);

    await new Promise(res => client.once('connect', res));
    console.log('Connected.');

    // Create room
    client.emit('create_room', { name: 'Tester', presentationMode: false });

    const roomCode = await new Promise(resolve => {
        client.on('room_joined', data => resolve(data.roomCode));
    });
    console.log('Joined room:', roomCode);

    // Start game
    client.emit('start_game');

    // Wait for initial state
    await new Promise(resolve => {
        client.once('game_state', state => {
            console.log('Initial Game State Received. Phase:', state.phase);
            resolve(state);
        });
    });
    console.log('Game started.');

    // Force move to Tax square (ID 4)
    console.log('Forcing move to Square 4 (Tax)...');
    client.emit('dispatch_action', {
        action: {
            type: 'DEBUG_MOVE',
            payload: { targetId: 4 }
        }
    });

    // Listen for state update
    client.on('game_state', state => {
        console.log('State update. Phase:', state.phase);
        if (state.phase === 'penalty') {
            console.log('SUCCESS: Phase is "penalty".');
            console.log('Pending Payload:', JSON.stringify(state.pending, null, 2));

            // Now try to confirm penalty
            console.log('Confirming penalty...');
            client.emit('dispatch_action', { action: { type: 'PENALTY_OK' } });
        }

        if (state.phase === 'post_roll' && state.log[0].includes('chấp nhận hình phạt')) {
            console.log('SUCCESS: Penalty confirmed and logged.');
            console.log('Log:', state.log[0]);
            process.exit(0);
        }
    });

    // Timeout
    setTimeout(() => {
        console.log('TIMEOUT: Penalty state never reached.');
        process.exit(1);
    }, 5000);

})();
