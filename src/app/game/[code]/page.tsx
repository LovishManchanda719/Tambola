"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { ClipboardIcon, CheckIcon } from "lucide-react";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCTr8rxHD7PRq81swlhCKfFGPaQ6KeJ8xo",
    authDomain: "tambola-52a2e.firebaseapp.com",
    projectId: "tambola-52a2e",
    storageBucket: "tambola-52a2e.firebasestorage.app",
    messagingSenderId: "105693415908",
    appId: "1:105693415908:web:65d861800d3b7d24209ff1"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface GameData {
  id: string;
  players: string[];
  markedNumbers: number[];
  started: boolean;
  gameConfig?: {
    firstLine: number;
    secondLine: number;
    thirdLine: number;
    earlyFive: number;
    corners: number;
    fullHouse: number;
  };
}

export default function GameWaitingPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;
  
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [gameDocId, setGameDocId] = useState("");
  
  // Game configuration state
  const [showConfig, setShowConfig] = useState(false);
  const [gameConfig, setGameConfig] = useState({
    firstLine: 1,
    secondLine: 1,
    thirdLine: 1,
    earlyFive: 1,
    corners: 1,
    fullHouse: 1
  });

  useEffect(() => {
    // Get player name from localStorage
    const storedName = localStorage.getItem("playerName");
    if (!storedName) {
      // If no player name in storage, redirect to home
      router.push("/");
      return;
    }
    
    setPlayerName(storedName);

    const fetchGameData = async () => {
      try {
        const gamesRef = collection(db, "games");
        const q = query(gamesRef, where("id", "==", gameCode));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          setError("Game not found!");
          setLoading(false);
          return;
        }
        
        // Store the document ID for later use
        const docId = querySnapshot.docs[0].id;
        setGameDocId(docId);
        
        // Check if the current user is the host (first player)
        const initialGameData = querySnapshot.docs[0].data() as GameData;
        
        // If game already started, redirect to board
        if (initialGameData.started) {
          router.push(`/game/${gameCode}/board`);
          return;
        }
        
        // Determine if current player is the host
        const isHostPlayer = initialGameData.players && 
                            initialGameData.players.length > 0 && 
                            initialGameData.players[0] === storedName;
        setIsHost(isHostPlayer);
        
        // Set up real-time listener for the game data
        const gameDocRef = doc(db, "games", docId);
        
        const unsubscribe = onSnapshot(gameDocRef, (doc) => {
          if (doc.exists()) {
            const currentGameData = doc.data() as GameData;
            setGameData(currentGameData);
            
            // If there's existing config in the game data, use it
            // When setting gameConfig from Firebase data, ensure all required fields exist:
if (currentGameData.gameConfig) {
    setGameConfig({
      firstLine: currentGameData.gameConfig.firstLine ?? 1,
      secondLine: currentGameData.gameConfig.secondLine ?? 1,
      thirdLine: currentGameData.gameConfig.thirdLine ?? 1,
      earlyFive: currentGameData.gameConfig.earlyFive ?? 1,
      corners: currentGameData.gameConfig.corners ?? 1,
      fullHouse: currentGameData.gameConfig.fullHouse ?? 1
    });
  }
            
            // If game has started, redirect to board
            if (currentGameData.started) {
              router.push(`/game/${gameCode}/board`);
              return;
            }
            
            setLoading(false);
          } else {
            setError("Game no longer exists!");
            setLoading(false);
          }
        });
        
        return () => unsubscribe();
      } catch (error) {
        console.error("Error fetching game data:", error);
        setError("Failed to load game data.");
        setLoading(false);
      }
    };
    
    fetchGameData();
  }, [gameCode, router]);
  
  const copyGameCode = () => {
    navigator.clipboard.writeText(gameCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleConfigChange = (field: keyof typeof gameConfig, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;
    
    setGameConfig(prev => ({
      ...prev,
      [field]: numValue
    }));
  };
  
  const saveGameConfig = async () => {
    if (!gameData || !isHost || !gameDocId) return;
    
    try {
      // Update the game configuration
      const gameDocRef = doc(db, "games", gameDocId);
      await updateDoc(gameDocRef, {
        gameConfig
      });
      
      setShowConfig(false);
    } catch (error) {
      console.error("Error saving game configuration:", error);
      setError("Failed to save game configuration.");
    }
  };
  
  const startGame = async () => {
    if (!gameData || !isHost || !gameDocId) return;
    
    try {
      setLoading(true);
      
      // Ensure game configuration is saved before starting
      const gameDocRef = doc(db, "games", gameDocId);
      await updateDoc(gameDocRef, {
        gameConfig,
        started: true
      });
      
      // Redirect happens automatically via the onSnapshot listener
    } catch (error) {
      console.error("Error starting game:", error);
      setError("Failed to start the game.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin text-4xl">⟳</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p>{error}</p>
          <button 
            onClick={() => router.push('/')}
            className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6">Tambola Game</h1>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Game Code</h2>
          <div className="flex items-center">
            <div className="bg-gray-100 py-3 px-4 rounded-l-md border border-gray-300 font-mono text-lg flex-grow">
              {gameCode}
            </div>
            <button
              onClick={copyGameCode}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-r-md flex items-center justify-center"
            >
              {copied ? <CheckIcon size={20} /> : <ClipboardIcon size={20} />}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Share this code with players to join your game
          </p>
        </div>
        
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-3">
            Players ({gameData?.players.length || 0})
            {isHost && <span className="text-sm font-normal text-green-600 ml-2">You are the host</span>}
          </h2>
          <div className="bg-gray-50 rounded-md border border-gray-200 max-h-40 overflow-y-auto">
            {gameData?.players.length ? (
              <ul className="divide-y divide-gray-200">
                {gameData.players.map((player, index) => (
                  <li key={index} className="py-2 px-4 flex items-center">
                    <span className="font-medium">
                      {player} {player === playerName && "(You)"}
                    </span>
                    {index === 0 && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 py-1 px-2 rounded-full">
                        Host
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-4 px-4 text-gray-500 text-center">
                No players have joined yet
              </div>
            )}
          </div>
        </div>
        
        {isHost && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-semibold">Game Configuration</h2>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="text-indigo-600 text-sm font-medium hover:text-indigo-800"
              >
                {showConfig ? "Hide" : "Configure"}
              </button>
            </div>
            
            {showConfig ? (
              <div className="bg-gray-50 rounded-md border border-gray-200 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Line Winners
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gameConfig.firstLine}
                      onChange={(e) => handleConfigChange("firstLine", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Second Line Winners
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gameConfig.secondLine}
                      onChange={(e) => handleConfigChange("secondLine", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Third Line Winners
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gameConfig.thirdLine}
                      onChange={(e) => handleConfigChange("thirdLine", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Early Five Winners
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gameConfig.earlyFive}
                      onChange={(e) => handleConfigChange("earlyFive", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Corner Winners
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gameConfig.corners}
                      onChange={(e) => handleConfigChange("corners", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full House Winners
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={gameConfig.fullHouse}
                      onChange={(e) => handleConfigChange("fullHouse", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                
                <button
                  onClick={saveGameConfig}
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md"
                >
                  Save Configuration
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-md border border-gray-200 p-4">
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div>First Line Winners:</div>
                  <div className="font-medium">{gameConfig.firstLine}</div>
                  
                  <div>Second Line Winners:</div>
                  <div className="font-medium">{gameConfig.secondLine}</div>
                  
                  <div>Third Line Winners:</div>
                  <div className="font-medium">{gameConfig.thirdLine}</div>
                  
                  <div>Early Five Winners:</div>
                  <div className="font-medium">{gameConfig.earlyFive}</div>

                  <div>Corners:</div>
                  <div className="font-medium">{gameConfig.corners}</div>

                  <div>Full House Winners:</div>
                  <div className="font-medium">{gameConfig.fullHouse}</div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {isHost ? (
          <div className="text-center">
            <button
              onClick={startGame}
              disabled={(gameData?.players.length || 0) < 2}
              className={`w-full py-3 px-6 rounded-md font-medium ${
                (gameData?.players.length || 0) < 2
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              Start Game
            </button>
            {(gameData?.players.length || 0) < 2 && (
              <p className="text-sm text-orange-500 mt-2">
                Wait for at least one more player to join
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="w-full py-3 px-6 rounded-md bg-gray-100 border border-gray-200">
              <p>Waiting for host to start the game...</p>
            </div>
            
            {/* Show game configuration for non-host players */}
            {gameData?.gameConfig && (
              <div className="mt-4 text-left">
                <h3 className="text-sm font-medium mb-2">Game Configuration:</h3>
                <div className="bg-gray-50 rounded-md border border-gray-200 p-3">
                  <div className="grid grid-cols-2 gap-y-1 text-xs">
                    <div>First Line Winners:</div>
                    <div className="font-medium">{gameData.gameConfig.firstLine}</div>
                    
                    <div>Second Line Winners:</div>
                    <div className="font-medium">{gameData.gameConfig.secondLine}</div>
                    
                    <div>Third Line Winners:</div>
                    <div className="font-medium">{gameData.gameConfig.thirdLine}</div>
                    
                    <div>Early Five Winners:</div>
                    <div className="font-medium">{gameData.gameConfig.earlyFive}</div>
                    
                    <div>Corners:</div>
                    <div className="font-medium">{gameData.gameConfig.corners}</div>

                    <div>Full House Winners:</div>
                    <div className="font-medium">{gameData.gameConfig.fullHouse}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}