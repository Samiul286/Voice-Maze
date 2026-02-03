'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Users, Timer, Map as MapIcon, ChevronRight, Heart, Skull, Trophy, RotateCcw, Lock, Unlock, Zap } from 'lucide-react';
import { useVoiceChat } from '@/hooks/useVoiceChat';

export default function GameView({ lobbyData, lobbyId, socket }: any) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [players, setPlayers] = useState<any>(lobbyData.players || {});
    const { peers, isMuted, toggleMic } = useVoiceChat(socket, lobbyId, players);
    const [maze, setMaze] = useState(lobbyData.maze);
    const [myPlayerId, setMyPlayerId] = useState(socket.id);
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [tileSize, setTileSize] = useState(40);
    const [showTrapMessage, setShowTrapMessage] = useState(false);
    const [showWallMessage, setShowWallMessage] = useState(false);
    const [showSwitchMessage, setShowSwitchMessage] = useState(false);
    const [lives, setLives] = useState(lobbyData.lives ?? 5);
    const [gameState, setGameState] = useState<'playing' | 'lost' | 'won'>(lobbyData.status === 'lost' ? 'lost' : 'playing');
    const [lossReason, setLossReason] = useState<'time-out' | 'traps' | null>(null);
    const PLAYER_SIZE = 24;

    const playSound = useCallback((type: 'collision' | 'trap') => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const audioCtx = new AudioContextClass();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            if (type === 'collision') {
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.1);
            } else if (type === 'trap') {
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.3);
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
                oscillator.start();
                oscillator.stop(audioCtx.currentTime + 0.3);
            }
        } catch (e) {
            console.warn("Sound playback failed:", e);
        }
    }, []);

    // Reset local state when lobbyData changes (e.g. Next Level)
    useEffect(() => {
        setMaze(lobbyData.maze);
        setPlayers(lobbyData.players || {});
        setLives(lobbyData.lives ?? 5);
        setGameState(lobbyData.status === 'lost' ? 'lost' : 'playing');
    }, [lobbyData]);

    // Handle window resize for dynamic scaling
    useEffect(() => {
        const handleResize = () => {
            if (!maze || !maze[0]) return;
            const containerWidth = window.innerWidth - 64; // Horizontal padding
            const calculatedSize = Math.min(40, Math.floor(containerWidth / maze[0].length));
            setTileSize(Math.max(20, calculatedSize));
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [maze]);

    const myPlayer = players[myPlayerId] || { x: 0, y: 0, role: 'walker' };
    const isLeader = myPlayer?.role === 'leader';

    // Handle player movement
    const movePlayer = useCallback((dx: number, dy: number) => {
        if (gameState !== 'playing') return;
        const player = players[myPlayerId];
        if (!player || !maze) return;

        const newX = player.x + dx;
        const newY = player.y + dy;

        // Check boundaries
        if (newX < 0 || newX >= maze[0].length || newY < 0 || newY >= maze.length) {
            if (!isLeader) playSound('collision');
            return;
        }

        // Check walls
        const currentCell = maze[player.y][player.x];
        if ((dx === 1 && currentCell.walls.right) ||
            (dx === -1 && currentCell.walls.left) ||
            (dy === 1 && currentCell.walls.bottom) ||
            (dy === -1 && currentCell.walls.top)) {
            if (!isLeader) playSound('collision');
            return;
        }

        // Check Traps/Exit/Doors/Switches
        const targetCell = maze[newY][newX];

        if (targetCell.type === 'door') {
            if (!isLeader) playSound('collision');
            return;
        }

        if (targetCell.type === 'trap') {
            setShowTrapMessage(true);
            setTimeout(() => setShowTrapMessage(false), 2000);
            if (!isLeader) playSound('trap');

            socket.emit('hit-trap', lobbyId);
            socket.emit('move', { lobbyId, x: 0, y: 0 });
            setPlayers((prev: any) => ({ ...prev, [myPlayerId]: { ...prev[myPlayerId], x: 0, y: 0 } }));
            return;
        }

        if (targetCell.type === 'exit') {
            socket.emit('player-on-exit', { lobbyId, x: newX, y: newY });
        }

        if (targetCell.type === 'switch') {
            socket.emit('activate-switch', lobbyId);
        }

        socket.emit('move', { lobbyId, x: newX, y: newY });
        setPlayers((prev: any) => ({
            ...prev,
            [myPlayerId]: { ...prev[myPlayerId], x: newX, y: newY }
        }));
    }, [players, maze, myPlayerId, lobbyId, socket, isLeader, gameState]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isLeader) return; // Prevent Leader from moving via keyboard
            if (['ArrowUp', 'w'].includes(e.key)) movePlayer(0, -1);
            if (['ArrowDown', 's'].includes(e.key)) movePlayer(0, 1);
            if (['ArrowLeft', 'a'].includes(e.key)) movePlayer(-1, 0);
            if (['ArrowRight', 'd'].includes(e.key)) movePlayer(1, 0);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [movePlayer, isLeader]);

    useEffect(() => {
        socket.on('player-moved', ({ id, x, y }: any) => {
            if (id === socket.id) return; // Prevent jitter by ignoring own updates
            setPlayers((prev: any) => ({
                ...prev,
                [id]: { ...prev[id], x, y }
            }));
        });

        socket.on('lives-update', (newLives: number) => {
            setLives(newLives);
        });

        socket.on('game-over', ({ reason }: { reason: 'time-out' | 'traps' }) => {
            setGameState('lost');
            setLossReason(reason);
        });

        socket.on('update-lobby', (data: any) => {
            setPlayers((prev: any) => {
                const newPlayers = { ...data.players };
                // Keep local position to prevent server-side stale data from snapping player back
                if (prev[socket.id]) {
                    newPlayers[socket.id] = {
                        ...newPlayers[socket.id],
                        x: prev[socket.id].x,
                        y: prev[socket.id].y
                    };
                }
                return newPlayers;
            });
            if (data.lives !== undefined) setLives(data.lives);
        });

        return () => {
            socket.off('player-moved');
            socket.off('lives-update');
            socket.off('game-over');
            socket.off('update-lobby');
        };
    }, [socket]);

    useEffect(() => {
        if (!socket) return;

        const handleMazeUpdate = (newMaze: any) => setMaze(newMaze);
        const handleWallAlert = () => {
            setShowWallMessage(true);
            setTimeout(() => setShowWallMessage(false), 2000);
        };
        const handleSwitchAlert = () => {
            setShowSwitchMessage(true);
            setTimeout(() => setShowSwitchMessage(false), 2000);
        };

        socket.on('maze-update', handleMazeUpdate);
        socket.on('wall-move-alert', handleWallAlert);
        socket.on('switch-activated', handleSwitchAlert);

        return () => {
            socket.off('maze-update', handleMazeUpdate);
            socket.off('wall-move-alert', handleWallAlert);
            socket.off('switch-activated', handleSwitchAlert);
        };
    }, [socket]);

    // Update timer
    useEffect(() => {
        if (gameState !== 'playing') return;

        const startTime = lobbyData.startTime || Date.now();
        const timeLimit = lobbyData.timeLimit || 120;

        const updateTimer = () => {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const remaining = Math.max(0, timeLimit - elapsed);
            setTimeRemaining(Math.floor(remaining));
        };

        updateTimer(); // Initial call
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [lobbyData.startTime, lobbyData.timeLimit, gameState]);

    // Rendering logic
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !maze) return;
        const ctx = canvas.getContext('2d');

        const render = () => {
            if (!canvas || !maze || !ctx) return;
            ctx.clearRect(0, 0, (canvas as any).width, (canvas as any).height);

            // Render Maze (Conditional for Leader/Walker)
            maze.forEach((row: any[], y: number) => {
                row.forEach((cell: any, x: number) => {
                    const px = x * tileSize;
                    const py = y * tileSize;

                    // Visibility Logic:
                    // Leader: Sees top half (y < maze.length / 2)
                    // Walker: Sees adjacent cells (isNear)
                    const isNear = Math.abs(x - myPlayer.x) <= 2 && Math.abs(y - myPlayer.y) <= 2;
                    let isVisible = false;

                    if (isLeader) {
                        isVisible = true; // Leader sees the entire map
                    } else {
                        // Walker cannot see the map
                        isVisible = false;
                    }

                    if (isVisible) {
                        ctx.strokeStyle = '#1a202c';
                        ctx.lineWidth = Math.max(2, tileSize / 10);
                        ctx.lineCap = 'round';

                        if (cell.walls.top) {
                            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + tileSize, py); ctx.stroke();
                        }
                        if (cell.walls.right) {
                            ctx.beginPath(); ctx.moveTo(px + tileSize, py); ctx.lineTo(px + tileSize, py + tileSize); ctx.stroke();
                        }
                        if (cell.walls.bottom) {
                            ctx.beginPath(); ctx.moveTo(px, py + tileSize); ctx.lineTo(px + tileSize, py + tileSize); ctx.stroke();
                        }
                        if (cell.walls.left) {
                            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + tileSize); ctx.stroke();
                        }

                        // Tile indicators
                        if (cell.type === 'exit') {
                            ctx.fillStyle = '#10b981';
                            ctx.fillRect(px + tileSize / 4, py + tileSize / 4, tileSize / 2, tileSize / 2);
                        }
                        // Door
                        if (cell.type === 'door') {
                            ctx.fillStyle = '#7c2d12'; // Brown
                            ctx.fillRect(px, py, tileSize, tileSize);
                            ctx.fillStyle = '#fbbf24'; // Lock
                            ctx.beginPath();
                            ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize / 4, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // Open Door
                        if (cell.type === 'open_door') {
                            ctx.strokeStyle = '#10b981'; // Green outline
                            ctx.lineWidth = 2;
                            ctx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
                        }
                        // Switch
                        if (cell.type === 'switch') {
                            ctx.fillStyle = '#8b5cf6'; // Purple
                            ctx.beginPath();
                            ctx.moveTo(px + tileSize / 2, py + tileSize / 4);
                            ctx.lineTo(px + tileSize * 0.75, py + tileSize * 0.75);
                            ctx.lineTo(px + tileSize * 0.25, py + tileSize * 0.75);
                            ctx.fill();
                        }

                        // Show traps if visible (Only Leader sees traps)
                        if (cell.type === 'trap' && isLeader) {
                            ctx.fillStyle = '#ef444433';
                            ctx.fillRect(px + tileSize / 4, py + tileSize / 4, tileSize / 2, tileSize / 2);
                        }
                    }
                });
            });

            // Render Players
            Object.values(players).forEach((player: any) => {
                ctx.fillStyle = player.color;
                ctx.beginPath();
                ctx.arc(
                    player.x * tileSize + tileSize / 2,
                    player.y * tileSize + tileSize / 2,
                    (tileSize * 0.6) / 2,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Label
                ctx.fillStyle = '#1a202c';
                ctx.font = `bold ${Math.max(8, tileSize / 4)}px Inter`;
                ctx.textAlign = 'center';
                ctx.fillText(player.name, player.x * tileSize + tileSize / 2, player.y * tileSize + tileSize + 10);
            });

            requestAnimationFrame(render);
        };


        render();
    }, [maze, players, isLeader, myPlayer.x, myPlayer.y, gameState]);

    const formatTime = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleRestart = () => {
        socket.emit('restart-game', lobbyId);
    };

    if (!maze || !maze[0]) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl cartoon-border">
                <div className="w-16 h-16 border-8 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <h2 className="text-2xl font-bold text-blue-600">Generating Maze...</h2>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-4 md:gap-6 w-full max-w-6xl px-2">
            {/* Game Over Overlay */}
            <AnimatePresence>
                {gameState === 'lost' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.8, y: 50 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-white p-8 rounded-3xl cartoon-border flex flex-col items-center gap-6 max-w-md w-full mx-4"
                        >
                            <Skull size={64} className="text-red-500" />
                            <div className="text-center">
                                <h2 className="text-4xl font-black text-gray-900 mb-2">GAME OVER</h2>
                                <p className="text-xl font-bold text-gray-500 uppercase">
                                    {lossReason === 'time-out' ? 'Time Runs Out!' : 'Too Many Traps!'}
                                </p>
                            </div>
                            <button
                                onClick={handleRestart}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-black text-xl py-4 rounded-xl cartoon-border active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <RotateCcw size={24} />
                                TRY AGAIN
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HUD */}
            <AnimatePresence>
                {showTrapMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-8 py-4 rounded-2xl cartoon-border font-black text-2xl shadow-2xl flex items-center gap-4"
                    >
                        💥 OH NO! TRAP!
                    </motion.div>
                )}
                {showWallMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-violet-500 text-white px-8 py-4 rounded-2xl cartoon-border font-black text-2xl shadow-2xl flex items-center gap-4"
                    >
                        🌀 WALLS SHIFTED!
                    </motion.div>
                )}
                {showSwitchMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-yellow-500 text-white px-8 py-4 rounded-2xl cartoon-border font-black text-2xl shadow-2xl flex items-center gap-4"
                    >
                        🔓 CLICK! DOORS OPEN!
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="w-full flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex flex-wrap justify-center gap-2">
                    {Object.values(players).map((p: any) => (
                        <div key={p.id} className="flex items-center gap-2 bg-white p-1.5 px-3 rounded-xl cartoon-border">
                            <div className="w-2 h-2 md:w-3 md:h-3 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="font-bold text-[10px] md:text-sm uppercase">{p.name} {p.id === myPlayerId && '(You)'}</span>
                            {p.id === myPlayerId ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleMic(); }}
                                    className={`p-1 rounded-lg transition-all active:scale-95 ${isMuted ? 'text-red-500 bg-red-50' : 'text-green-500 bg-green-50'}`}
                                >
                                    <Mic size={14} strokeWidth={isMuted ? 3 : 2} />
                                </button>
                            ) : (
                                <Mic size={12} className="text-gray-300" />
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    {/* Lives */}
                    <div className="bg-white p-2 md:p-4 rounded-xl md:rounded-2xl cartoon-border flex items-center gap-2 text-red-500">
                        <Heart size={20} className="fill-current" />
                        <span className="text-xl md:text-3xl font-black">{lives}</span>
                    </div>

                    {/* Timer */}
                    <div className="bg-white p-2 md:p-4 rounded-xl md:rounded-2xl cartoon-border flex items-center gap-2 md:gap-4">
                        <Timer size={20} className="text-blue-500" />
                        <span className={`text-xl md:text-3xl font-black ${timeRemaining < 30 ? 'text-red-500 animate-pulse' : ''}`}>
                            {formatTime(timeRemaining)}
                        </span>
                        <div className="w-0.5 h-8 bg-gray-200 mx-2" />
                        <span className="text-sm font-bold text-gray-400 uppercase">Level</span>
                        <span className="text-xl md:text-3xl font-black text-violet-500">{lobbyData.level || 1}</span>
                    </div>

                    <div className="bg-white p-2 md:p-3 rounded-xl cartoon-border flex flex-col items-center">
                        <span className="font-bold uppercase text-[8px] md:text-xs text-gray-400 leading-none mb-1">Role</span>
                        <span className={`font-black uppercase text-xs md:text-base leading-none ${isLeader ? 'text-yellow-500' : 'text-blue-500'}`}>
                            {myPlayer?.role}
                        </span>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div className="relative p-2 md:p-8 bg-blue-50 rounded-2xl md:rounded-3xl cartoon-border overflow-hidden">
                {!isLeader && (
                    <div className="absolute inset-0 bg-black/5 backdrop-blur-[1px] pointer-events-none" />
                )}
                <canvas
                    ref={canvasRef}
                    width={maze[0].length * tileSize}
                    height={maze.length * tileSize}
                    className="rounded-lg shadow-inner bg-white/50 block mx-auto"
                />

                {isLeader && (
                    <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-white/90 p-1.5 md:p-3 rounded-lg md:rounded-xl border-2 border-yellow-400 flex items-center gap-2 shadow-sm">
                        <MapIcon size={14} className="text-yellow-600" />
                        <span className="text-[10px] md:text-sm font-bold text-yellow-700 uppercase">Minimap</span>
                    </div>
                )}
            </div>

            {/* Controls & Help */}
            <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-gray-400 font-bold uppercase text-[10px] md:text-sm tracking-widest flex items-center gap-2">
                    Navigate to the exit <ChevronRight size={16} /> <span className="text-emerald-500 font-black">Green</span>
                </div>

                {/* Mobile D-Pad */}
                {!isLeader && (
                    <div className="grid grid-cols-3 gap-2 md:hidden">
                        <div />
                        <button
                            onPointerDown={(e) => { e.preventDefault(); movePlayer(0, -1); }}
                            className="w-14 h-14 bg-white cartoon-border rounded-xl flex items-center justify-center active:bg-blue-100"
                        >
                            <ChevronRight className="-rotate-90 text-blue-500" />
                        </button>
                        <div />
                        <button
                            onPointerDown={(e) => { e.preventDefault(); movePlayer(-1, 0); }}
                            className="w-14 h-14 bg-white cartoon-border rounded-xl flex items-center justify-center active:bg-blue-100"
                        >
                            <ChevronRight className="rotate-180 text-blue-500" />
                        </button>
                        <button
                            onPointerDown={(e) => { e.preventDefault(); movePlayer(0, 1); }}
                            className="w-14 h-14 bg-white cartoon-border rounded-xl flex items-center justify-center active:bg-blue-100"
                        >
                            <ChevronRight className="rotate-90 text-blue-500" />
                        </button>
                        <button
                            onPointerDown={(e) => { e.preventDefault(); movePlayer(1, 0); }}
                            className="w-14 h-14 bg-white cartoon-border rounded-xl flex items-center justify-center active:bg-blue-100"
                        >
                            <ChevronRight className="text-blue-500" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}


