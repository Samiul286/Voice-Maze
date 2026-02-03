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

    const { generateMaze } = require('./lib/maze-gen');
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

                for (let k = 0; k < 5; k++) {
                    const rx = Math.floor(Math.random() * width);
                    const ry = Math.floor(Math.random() * height);
                    if (rx + ry < 3) continue;
                    if (rx === width - 1 && ry === height - 1) continue;

                    const cell = game.maze[ry][rx];
                    const dirs = ['top', 'right', 'bottom', 'left'];
                    const dir = dirs[Math.floor(Math.random() * dirs.length)];

                    let neighbor = null;
                    if (dir === 'top' && ry > 0) neighbor = game.maze[ry - 1][rx];
                    if (dir === 'right' && rx < width - 1) neighbor = game.maze[ry][rx + 1];
                    if (dir === 'bottom' && ry < height - 1) neighbor = game.maze[ry + 1][rx];
                    if (dir === 'left' && rx > 0) neighbor = game.maze[ry][rx - 1];

                    if (neighbor) {
                        const isWall = cell.walls[dir];
                        cell.walls[dir] = !isWall;
                        if (dir === 'top') neighbor.walls.bottom = !isWall;
                        if (dir === 'right') neighbor.walls.left = !isWall;
                        if (dir === 'bottom') neighbor.walls.top = !isWall;
                        if (dir === 'left') neighbor.walls.right = !isWall;
                        changes++;
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
        });

        socket.on('start-game', (lobbyId) => {
            if (games[lobbyId]) {
                const game = games[lobbyId];
                const playerIds = Object.keys(game.players);

                for (let i = playerIds.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
                }

                playerIds.forEach((id, index) => {
                    game.players[id].role = index === 0 ? 'leader' : 'walker';
                });

                game.rotationOrder = playerIds;
                game.leaderIndex = 0;
                game.status = 'playing';
                game.level = 1;
                game.lives = 5;
                game.maze = generateMaze(game.config.width, game.config.height);
                game.startTime = Date.now();
                game.timeLimit = 120;

                startGameTimers(game, lobbyId);
                io.to(lobbyId).emit('game-started', game);
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
            if (games[lobbyId] && games[lobbyId].players[socket.id] && games[lobbyId].status === 'playing') {
                games[lobbyId].players[socket.id].x = x;
                games[lobbyId].players[socket.id].y = y;
                socket.to(lobbyId).emit('player-moved', { id: socket.id, x, y });
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

        socket.on('activate-switch', (lobbyId) => {
            const game = games[lobbyId];
            if (game && game.status === 'playing') {
                game.maze.forEach(row => {
                    row.forEach(cell => {
                        if (cell.type === 'door') cell.type = 'open_door';
                        else if (cell.type === 'open_door') cell.type = 'door';
                    });
                });
                io.to(lobbyId).emit('maze-update', game.maze);
                io.to(lobbyId).emit('switch-activated');
            }
        });

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
