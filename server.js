const express = require('express');
const next = require('next');
const http = require('http');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const port = process.env.PORT || 3000;

app.prepare().then(() => {
    const server = express();
    const httpServer = http.createServer(server);
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || "*",
            methods: ["GET", "POST"]
        }
    });

    const { generateMaze, findPath } = require('./lib/maze-gen');
    // Game state management
    const games = {};
    const gameIntervals = {}; // Store intervals for each game
    const mazeIntervals = {}; // Store intervals for moving walls

    function startGameTimers(game, lobbyId) {
        if (gameIntervals[lobbyId]) clearInterval(gameIntervals[lobbyId]);
        if (mazeIntervals[lobbyId]) clearInterval(mazeIntervals[lobbyId]);

        // Start Game Timer
        gameIntervals[lobbyId] = setInterval(() => {
            if (game.status === 'playing') {
                const elapsedSeconds = (Date.now() - game.startTime) / 1000;
                if (elapsedSeconds >= game.timeLimit) {
                    game.status = 'lost';
                    game.lossReason = 'time-out';
                    io.to(lobbyId).emit('game-over', { reason: 'time-out' });
                    clearInterval(gameIntervals[lobbyId]);
                    if (mazeIntervals[lobbyId]) clearInterval(mazeIntervals[lobbyId]);
                }
            }
        }, 1000);

        // Start Moving Walls Timer (every 15 seconds)
        mazeIntervals[lobbyId] = setInterval(() => {
            if (game.status === 'playing') {
                let changes = 0;
                const width = game.config.width;
                const height = game.config.height;

                for (let k = 0; k < 10; k++) { // Try 10 times to find 5 valid changes
                    if (changes >= 5) break;

                    const rx = Math.floor(Math.random() * width);
                    const ry = Math.floor(Math.random() * height);
                    if (rx + ry < 2) continue; // Keep start clear
                    if (rx === width - 1 && ry === height - 1) continue; // Keep exit clear

                    const cell = game.maze[ry][rx];
                    const dirs = ['top', 'right', 'bottom', 'left'];
                    const dir = dirs[Math.floor(Math.random() * dirs.length)];

                    let neighbor = null;
                    let nx = rx, ny = ry;
                    if (dir === 'top' && ry > 0) { neighbor = game.maze[ry - 1][rx]; ny--; }
                    if (dir === 'right' && rx < width - 1) { neighbor = game.maze[ry][rx + 1]; nx++; }
                    if (dir === 'bottom' && ry < height - 1) { neighbor = game.maze[ry + 1][rx]; ny++; }
                    if (dir === 'left' && rx > 0) { neighbor = game.maze[ry][rx - 1]; nx--; }

                    if (neighbor) {
                        const isWall = cell.walls[dir];

                        // "What-if" check: Apply change temporarily
                        cell.walls[dir] = !isWall;
                        const reverseDir = { 'top': 'bottom', 'right': 'left', 'bottom': 'top', 'left': 'right' }[dir];
                        neighbor.walls[reverseDir] = !isWall;

                        // Check if ALL players still have a path to the exit
                        const exitCoords = { x: width - 1, y: height - 1 };
                        let allValid = true;

                        // 1. Check current players
                        const players = Object.values(game.players);
                        for (const player of players) {
                            if (player.role === 'walker') {
                                // FIX: Include 'door' in blockTypes for pathfinding during wall shifts
                                // This prevents trapping players behind doors they may not have keys for.
                                // However, if they HAVE a key, the door should technically be reachable.
                                // To be safe, we treat doors as blocks here unless they are open.
                                const path = findPath(game.maze, width, height, { x: player.x, y: player.y }, exitCoords, ['door']);
                                if (path.length === 0) {
                                    allValid = false;
                                    break;
                                }
                            }
                        }

                        // 2. Check if start is still connected to exit (for future players/respawns)
                        if (allValid) {
                            const pathFromStart = findPath(game.maze, width, height, { x: 0, y: 0 }, exitCoords, ['door']);
                            if (pathFromStart.length === 0) allValid = false;
                        }

                        if (allValid) {
                            changes++;
                        } else {
                            // Revert change if it traps anyone
                            cell.walls[dir] = isWall;
                            neighbor.walls[reverseDir] = isWall;
                        }
                    }
                }

                if (changes > 0) {
                    io.to(lobbyId).emit('maze-update', game.maze);
                    io.to(lobbyId).emit('wall-move-alert');
                }
            }
        }, 15000);
    }

    io.on('connection', (socket) => {
        socket.on('join-game', ({ lobbyId, playerName }) => {
            socket.join(lobbyId);
            if (!games[lobbyId]) {
                games[lobbyId] = {
                    players: {},
                    status: 'waiting',
                    maze: null,
                    startTime: 0,
                    timeLimit: 120,
                    lives: 5,
                    level: 1,
                    config: { width: 15, height: 15 }
                };
            }

            const isFirstPlayer = Object.keys(games[lobbyId].players).length === 0;

            games[lobbyId].players[socket.id] = {
                name: playerName,
                id: socket.id,
                role: isFirstPlayer ? 'leader' : 'waiting',
                x: 0,
                y: 0,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`
            };

            io.to(lobbyId).emit('update-lobby', games[lobbyId]);
            socket.to(lobbyId).emit('user-joined-voice', socket.id);
        });

        socket.on('start-game', (lobbyId) => {
            console.log(`[SERVER] Start game requested for lobby: ${lobbyId}`);
            if (games[lobbyId]) {
                const game = games[lobbyId];
                const playerIds = Object.keys(game.players);
                console.log(`[SERVER] Players in lobby: ${playerIds.length}`);

                for (let i = playerIds.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
                }

                playerIds.forEach((id, index) => {
                    game.players[id].role = index === 0 ? 'leader' : 'walker';
                    game.players[id].keys = 0;
                    game.players[id].x = 0;
                    game.players[id].y = 0;
                });

                game.rotationOrder = playerIds;
                game.leaderIndex = 0;
                game.status = 'playing';
                game.level = 1;
                game.lives = 5;
                console.log(`[SERVER] Generating maze...`);
                try {
                    game.maze = generateMaze(game.config.width, game.config.height);
                    console.log(`[SERVER] Maze generated successfully`);
                } catch (err) {
                    console.error(`[SERVER] Maze generation failed:`, err);
                }
                game.startTime = Date.now();
                game.timeLimit = 120;

                startGameTimers(game, lobbyId);
                io.to(lobbyId).emit('game-started', game);
                console.log(`[SERVER] game-started emitted to lobby: ${lobbyId}`);
            } else {
                console.log(`[SERVER] Lobby ${lobbyId} not found`);
            }
        });

        socket.on('restart-game', (lobbyId) => {
            if (games[lobbyId]) {
                const game = games[lobbyId];
                game.status = 'playing';
                game.level = 1;
                game.lives = 5;
                game.maze = generateMaze(game.config.width, game.config.height);
                game.startTime = Date.now();
                game.timeLimit = 120;

                Object.values(game.players).forEach(p => {
                    p.x = 0;
                    p.y = 0;
                });

                startGameTimers(game, lobbyId);
                io.to(lobbyId).emit('game-started', game);
            }
        });

        socket.on('move', ({ lobbyId, x, y }) => {
            const game = games[lobbyId];
            if (game && game.players[socket.id] && game.status === 'playing') {
                const player = game.players[socket.id];
                const targetCell = game.maze[y]?.[x];

                if (!targetCell) return;

                // Handle interactive tiles
                if (targetCell.type === 'key') {
                    targetCell.type = 'empty';
                    player.keys = (player.keys || 0) + 1;
                    io.to(lobbyId).emit('maze-update', game.maze);
                    io.to(lobbyId).emit('key-collected', { playerId: socket.id, keys: player.keys });
                } else if (targetCell.type === 'door') {
                    if (player.keys > 0) {
                        player.keys--;
                        targetCell.type = 'open_door';
                        io.to(lobbyId).emit('maze-update', game.maze);
                        io.to(lobbyId).emit('door-opened', { playerId: socket.id, keys: player.keys });
                    } else {
                        // Prevent moving into a closed door without a key
                        return;
                    }
                }

                player.x = x;
                player.y = y;
                socket.to(lobbyId).emit('player-moved', { id: socket.id, x, y, keys: player.keys });
            }
        });

        socket.on('player-on-exit', ({ lobbyId, x, y }) => {
            const game = games[lobbyId];
            if (game && game.players[socket.id] && game.status === 'playing') {
                game.players[socket.id].x = x;
                game.players[socket.id].y = y;

                const walkers = Object.values(game.players).filter(p => p.role === 'walker');
                const allWalkersOnExit = walkers.every(player => {
                    const cell = game.maze[player.y]?.[player.x];
                    return cell && cell.type === 'exit';
                });

                if (allWalkersOnExit && walkers.length > 0) {
                    game.level++;
                    game.lives = 5;
                    game.startTime = Date.now();
                    game.leaderIndex = (game.leaderIndex + 1) % game.rotationOrder.length;
                    const newLeaderId = game.rotationOrder[game.leaderIndex];

                    Object.values(game.players).forEach(p => {
                        p.role = (p.id === newLeaderId) ? 'leader' : 'walker';
                        p.x = 0;
                        p.y = 0;
                    });

                    game.maze = generateMaze(game.config.width, game.config.height);
                    startGameTimers(game, lobbyId);
                    io.to(lobbyId).emit('game-started', game);
                }
            }
        });

        socket.on('hit-trap', (lobbyId) => {
            const game = games[lobbyId];
            if (game && game.status === 'playing') {
                game.lives--;
                io.to(lobbyId).emit('lives-update', game.lives);
                socket.to(lobbyId).emit('player-hit-trap', socket.id);

                if (game.lives <= 0) {
                    game.status = 'lost';
                    game.lossReason = 'traps';
                    io.to(lobbyId).emit('game-over', { reason: 'traps' });
                    if (gameIntervals[lobbyId]) clearInterval(gameIntervals[lobbyId]);
                    if (mazeIntervals[lobbyId]) clearInterval(mazeIntervals[lobbyId]);
                }
            }
        });

        // Removed activate-switch in favor of automatic key/door logic in 'move'

        socket.on('voice-signal', ({ to, from, signal }) => {
            io.to(to).emit('voice-signal', { from, signal });
        });

        socket.on('disconnect', () => {
            for (const lobbyId in games) {
                if (games[lobbyId].players[socket.id]) {
                    delete games[lobbyId].players[socket.id];
                    if (Object.keys(games[lobbyId].players).length === 0) {
                        if (gameIntervals[lobbyId]) clearInterval(gameIntervals[lobbyId]);
                        if (mazeIntervals[lobbyId]) clearInterval(mazeIntervals[lobbyId]);
                        delete games[lobbyId];
                        delete gameIntervals[lobbyId];
                        delete mazeIntervals[lobbyId];
                    } else {
                        io.to(lobbyId).emit('update-lobby', games[lobbyId]);
                    }
                    break;
                }
            }
        });
    });

    server.all('*', (req, res) => {
        return handle(req, res);
    });

    httpServer.listen(port, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${port}`);
    });
});
