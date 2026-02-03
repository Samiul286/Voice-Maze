'use client';

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Users, Play, Map as MapIcon, Timer } from 'lucide-react';
import GameView from '@/components/GameView';

export default function VoiceMaze() {
  const [socket, setSocket] = useState<any>(null);
  const [gameState, setGameState] = useState('menu'); // menu, lobby, playing
  const [lobbyData, setLobbyData] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [isLeader, setIsLeader] = useState(false);
  const [gameOverData, setGameOverData] = useState<any>(null);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('update-lobby', (data: any) => {
      setLobbyData(data);
      if (data.players && newSocket.id && data.players[newSocket.id]?.role === 'leader') {
        setIsLeader(true);
      }
    });

    newSocket.on('game-started', (data: any) => {
      setLobbyData(data);
      setGameState('playing');
    });

    /*
    newSocket.on('game-over', (data: any) => {
      setGameOverData(data);
      setGameState('finished');
    });
    */

    return () => {
      newSocket.close();
    };
  }, []);

  const joinLobby = () => {
    if (playerName && lobbyId) {
      socket.emit('join-game', { lobbyId, playerName });
      setGameState('lobby');
    }
  };

  const startGame = () => {
    socket.emit('start-game', lobbyId);
  };

  const returnToLobby = () => {
    setGameState('lobby');
    setGameOverData(null);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {gameState === 'menu' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-8 rounded-2xl cartoon-border max-w-md w-full"
          >
            <h1 className="text-4xl font-extrabold text-center mb-8 text-blue-600 italic">VOICE MAZE</h1>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Your Name"
                className="w-full p-4 rounded-xl border-4 border-gray-100 focus:border-blue-400 outline-none"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Lobby ID"
                className="w-full p-4 rounded-xl border-4 border-gray-100 focus:border-blue-400 outline-none"
                value={lobbyId}
                onChange={(e) => setLobbyId(e.target.value)}
              />
              <button onClick={joinLobby} className="w-full btn-fun text-xl">
                JOIN LOBBY
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'lobby' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white p-8 rounded-2xl cartoon-border max-w-xl w-full"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Lobby: <span className="text-blue-500">{lobbyId}</span></h2>
              <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full">
                <Users size={20} />
                <span className="font-bold">{Object.keys(lobbyData?.players || {}).length} / 6</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {Object.values(lobbyData?.players || {}).map((player: any) => (
                <div key={player.id} className="p-4 rounded-xl border-2 border-gray-100 flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: player.color }} />
                  <span className="font-bold flex-1">{player.name}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase ${player.role === 'leader' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                    {player.role}
                  </span>
                </div>
              ))}
            </div>

            {isLeader ? (
              <button onClick={startGame} className="w-full btn-fun flex items-center justify-center gap-2 text-xl">
                <Play fill="currentColor" /> START GAME
              </button>
            ) : (
              <p className="text-center text-gray-500 font-medium italic">Waiting for leader to start...</p>
            )}
          </motion.div>
        )}

        {gameState === 'playing' && lobbyData && socket && (
          <GameView lobbyData={lobbyData} lobbyId={lobbyId} socket={socket} />
        )}

        {gameState === 'finished' && gameOverData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="bg-white p-12 rounded-3xl cartoon-border max-w-lg w-full text-center"
          >
            <div className="mb-8">
              <div className="text-8xl mb-4">🎉</div>
              <h1 className="text-5xl font-black text-emerald-500 mb-2">VICTORY!</h1>
              <p className="text-2xl font-bold text-gray-700">
                <span className="text-blue-600">{gameOverData.winner}</span> found the exit!
              </p>
            </div>
            <button onClick={returnToLobby} className="btn-fun text-xl w-full">
              RETURN TO LOBBY
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}


