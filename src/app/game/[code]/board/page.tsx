"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  doc, 
  updateDoc, 
  onSnapshot, 
  arrayUnion, 
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Leaderboard from "../../../../components/Leaderboard";

interface GameData {
    id: string;
    players: string[];
    markedNumbers: number[];
    started: boolean;
    currentNumber?: number;
    hostId?: string;
    isGeneratingNumber?: boolean;
    lastNumberTime?: number;
    claims?: Array<{
      type: string;
      player: string;
      timestamp: number;
      verified?: boolean;
    }>;
    gameEnded?: boolean;
    playerScores?: Record<string, {
      firstLine?: number;
      secondLine?: number;
      thirdLine?: number;
      earlyFive?: number;
      corners?: number;
      fullHouse?: number;
      total: number;
    }>;
  }

import PlayerClaims from "../../../../components/PlayerClaims";

export default function GameBoardPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;
  
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [gameDocId, setGameDocId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [timerCount, setTimerCount] = useState(5);
  const [gameEnded, setGameEnded] = useState(false);
const [showLeaderboard, setShowLeaderboard] = useState(false);

useEffect(() => {
    if (gameData?.gameEnded) {
      setGameEnded(true);
      setShowLeaderboard(true);
    }
  }, [gameData?.gameEnded]);

  // Add this function to end the game (to be called by host)
const endGame = async () => {
    if (!isHost || !gameDocId) return;
    
    try {
      const gameDocRef = doc(db, "games", gameDocId);
      
      // Calculate final scores based on verified claims
      const playerScores: Record<string, any> = {};
      
      // Initialize scores for all players
      gameData?.players.forEach(player => {
        playerScores[player] = {
          total: 0
        };
      });
      
      // Calculate scores based on verified claims
      gameData?.claims?.forEach(claim => {
        if (claim.verified && playerScores[claim.player]) {
          const pointValues = {
            'firstLine': 10,
            'secondLine': 10,
            'thirdLine': 10,
            'earlyFive': 5,
            'corners': 5,
            'fullHouse': 20
          };
          
          const claimType = claim.type as keyof typeof pointValues;
          const points = pointValues[claimType] || 0;
          
          playerScores[claim.player][claimType] = points;
          playerScores[claim.player].total += points;
        }
      });
      
      // Update the game document to mark it as ended and store the scores
      await updateDoc(gameDocRef, {
        gameEnded: true,
        playerScores: playerScores
      });
    } catch (err) {
      console.error("Error ending game:", err);
    }
  };
  
  // Add a helper function to format leaderboard data
  const formatLeaderboardData = () => {
    if (!gameData?.playerScores) return [];
    
    return Object.entries(gameData.playerScores).map(([name, scores]) => ({
      name,
      scores,
      totalScore: scores.total || 0
    }));
  };
  // Use useRef for timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastGenerationTimeRef = useRef<number>(0);
  const processingRef = useRef<boolean>(false);

  // Generate a Tambola ticket (3 rows x 9 columns with specific distribution)
  const [playerTicket, setPlayerTicket] = useState<(number | null)[][]>([]);
  // Track which numbers the player has manually marked
  const [playerMarkedNumbers, setPlayerMarkedNumbers] = useState<number[]>([]);
  
  // Add state for player wins
  const [playerWon, setPlayerWon] = useState(false);
  const [winMessage, setWinMessage] = useState("");

  useEffect(() => {
    // Check if player has a name stored
    const storedName = localStorage.getItem("playerName");
    if (!storedName) {
      router.push("/");
      return;
    }
    
    setPlayerName(storedName);

    // Check if player has a saved ticket in localStorage
    const savedTicket = localStorage.getItem(`ticket_${gameCode}`);
    const savedMarkedNumbers = localStorage.getItem(`marked_${gameCode}`);
    
    if (savedTicket) {
      setPlayerTicket(JSON.parse(savedTicket));
    }
    
    if (savedMarkedNumbers) {
      setPlayerMarkedNumbers(JSON.parse(savedMarkedNumbers));
    }

    // Fetch game document and set up listeners
    const fetchGameDoc = async () => {
      try {
        const gamesRef = collection(db, "games");
        const q = query(gamesRef, where("id", "==", gameCode));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          setError("Game not found!");
          setLoading(false);
          return;
        }
        
        const docId = querySnapshot.docs[0].id;
        setGameDocId(docId);
        
        // Get initial game data to determine if user is host
        const initialData = querySnapshot.docs[0].data() as GameData;
        const isHostPlayer = initialData.players && 
                            initialData.players.length > 0 && 
                            initialData.players[0] === storedName;
        setIsHost(isHostPlayer);
        
        // Generate ticket for non-host players if they don't have one
        if (!isHostPlayer && !savedTicket) {
          const newTicket = generateTambolaTicket();
          setPlayerTicket(newTicket);
          localStorage.setItem(`ticket_${gameCode}`, JSON.stringify(newTicket));
        }
        
        // Set up realtime listener for game updates
        const gameDocRef = doc(db, "games", docId);
        const unsubscribe = onSnapshot(gameDocRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const data = docSnapshot.data() as GameData;
            setGameData(data);
            
            // If game hasn't started, redirect back to waiting room
            if (!data.started) {
              router.push(`/game/${gameCode}`);
              return;
            }
            
            setLoading(false);
          } else {
            setError("Game no longer exists!");
            setLoading(false);
          }
        });
        
        return () => {
          unsubscribe();
          // Clear any running timers when component unmounts
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        };
      } catch (error) {
        console.error("Error fetching game:", error);
        setError("Failed to load game data.");
        setLoading(false);
      }
    };
    
    fetchGameDoc();
  }, [gameCode, router]);

  // Setup the timer for host when game data changes
  useEffect(() => {
    // Only the host should manage number generation
    if (!isHost || !gameData || !gameDocId) return;

    // If all numbers have been generated, stop
    if (gameData.markedNumbers.length >= 90) return;

    // Don't start a new timer if we're processing
    if (processingRef.current) return;

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const setupTimer = () => {
      // Calculate remaining time based on last number generation
      const lastTime = gameData.lastNumberTime || 0;
      const currentTime = Date.now();
      const elapsedTime = currentTime - lastTime;
      const initialDelay = Math.max(100, 5000 - elapsedTime);

      // Set initial timer value
      setTimerCount(Math.ceil(initialDelay / 1000));
      
      // Start countdown timer
      timerRef.current = setTimeout(() => {
        runCountdown(5);
      }, 1000);
    };

    const runCountdown = (seconds: number) => {
      if (seconds <= 0) {
        // Time to generate a new number
        generateNextNumber(gameDocId);
        return;
      }

      setTimerCount(seconds);
      timerRef.current = setTimeout(() => {
        runCountdown(seconds - 1);
      }, 1000);
    };

    setupTimer();

    // Cleanup timer on unmount or when game data changes
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameData, isHost, gameDocId]);

  // Function to generate a random number that hasn't been called yet
  const getNextRandomNumber = (markedNumbers: number[]) => {
    const allNumbers = Array.from({ length: 90 }, (_, i) => i + 1);
    const availableNumbers = allNumbers.filter(num => !markedNumbers.includes(num));
    
    if (availableNumbers.length === 0) return null; // All numbers have been called
    
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    return availableNumbers[randomIndex];
  };

  // Generate next number function (only called by host)
  const generateNextNumber = async (docId: string) => {
    // Prevent concurrent operations
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // Get the latest game data
      const gameDocRef = doc(db, "games", docId);
      const docSnapshot = await getDoc(gameDocRef);
      
      if (!docSnapshot.exists()) {
        processingRef.current = false;
        return;
      }
      
      const data = docSnapshot.data() as GameData;
      
      // Check if all numbers have been called
      if (data.markedNumbers.length >= 90) {
        processingRef.current = false;
        return;
      }
      
      // Get next random number
      const nextNumber = getNextRandomNumber(data.markedNumbers);
      
      if (nextNumber) {
        // Update the game with the new number
        await updateDoc(gameDocRef, {
          markedNumbers: arrayUnion(nextNumber),
          currentNumber: nextNumber,
          lastNumberTime: Date.now()
        });
        
        // Record the time of this generation
        lastGenerationTimeRef.current = Date.now();
      }
    } catch (err) {
      console.error("Error generating next number:", err);
    } finally {
      // Reset processing flag and set up next timer
      processingRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setTimerCount(5);
      timerRef.current = setTimeout(() => {
        runCountdown(5);
      }, 1000);
    }
  };

  // Helper function for countdown
  const runCountdown = (seconds: number) => {
    if (seconds <= 0) {
      // Time to generate a new number
      generateNextNumber(gameDocId);
      return;
    }

    setTimerCount(seconds);
    timerRef.current = setTimeout(() => {
      runCountdown(seconds - 1);
    }, 1000);
  };

  // Function to generate a Tambola ticket
  // Function to generate a Tambola ticket
const generateTambolaTicket = () => {
    // Create a 3x9 grid with all nulls initially
    const grid: (number | null)[][] = Array(3).fill(null).map(() => Array(9).fill(null));
    
    // Keep track of all numbers already used in the ticket
    const usedNumbers: number[] = [];
    
    // Each row must have exactly 5 numbers
    for (let row = 0; row < 3; row++) {
      // For each column, determine if it should have a number
      const columnsWithNumbers: number[] = [];
      while (columnsWithNumbers.length < 5) {
        const col = Math.floor(Math.random() * 9);
        if (!columnsWithNumbers.includes(col)) {
          columnsWithNumbers.push(col);
        }
      }
      
      // Fill the chosen columns with appropriate numbers
      for (let col = 0; col < 9; col++) {
        if (columnsWithNumbers.includes(col)) {
          // Range for numbers in each column
          const min = col * 10 + 1;
          const max = col === 8 ? 90 : (col + 1) * 10;
          
          // Keep generating a random number until we get one that's not used yet
          let uniqueNumber: number;
          let attempts = 0;
          do {
            uniqueNumber = Math.floor(Math.random() * (max - min + 1)) + min;
            attempts++;
            
            // Break out if we've tried too many times (safety measure)
            if (attempts > 100) break;
          } while (usedNumbers.includes(uniqueNumber));
          
          // Add the number to the grid and track it as used
          grid[row][col] = uniqueNumber;
          usedNumbers.push(uniqueNumber);
        }
      }
    }
    
    // Ensure columns are sorted from top to bottom
    for (let col = 0; col < 9; col++) {
      const columnNumbers: (number | null)[] = [];
      
      // Collect non-null numbers from this column
      for (let row = 0; row < 3; row++) {
        if (grid[row][col] !== null) {
          columnNumbers.push(grid[row][col]);
        }
      }
      
      // Sort the numbers
      columnNumbers.sort((a, b) => (a || 0) - (b || 0));
      
      // Place them back in the grid
      let numIndex = 0;
      for (let row = 0; row < 3; row++) {
        if (grid[row][col] !== null) {
          grid[row][col] = columnNumbers[numIndex++];
        }
      }
    }
    
    return grid;
  };

  // Function to check if a number is marked by the game
  const isNumberCalled = (number: number | null) => {
    if (!number || !gameData) return false;
    return gameData.markedNumbers.includes(number);
  };

  // Function to check if a number is manually marked by the player
  const isNumberMarkedByPlayer = (number: number | null) => {
    if (!number) return false;
    return playerMarkedNumbers.includes(number);
  };

  // Function to toggle player's marking of a number
  const toggleNumberMark = (number: number | null) => {
    if (!number || isHost) return;
    
    // Only allow marking numbers that have been called in the game
    if (!isNumberCalled(number)) return;
    
    let newMarkedNumbers: number[];
    
    if (isNumberMarkedByPlayer(number)) {
      // If already marked, unmark it
      newMarkedNumbers = playerMarkedNumbers.filter(num => num !== number);
    } else {
      // If not marked, mark it
      newMarkedNumbers = [...playerMarkedNumbers, number];
    }
    
    setPlayerMarkedNumbers(newMarkedNumbers);
    localStorage.setItem(`marked_${gameCode}`, JSON.stringify(newMarkedNumbers));
    
    // Check for wins after marking
    checkForWins();
  };

  // Function to check for winning conditions
  const checkForWins = () => {
    if (isHost || playerWon) return;
    
    // Flatten the ticket to get all numbers (excluding nulls)
    const allTicketNumbers = playerTicket.flat().filter(num => num !== null) as number[];
    
    // Check for full house - all numbers on ticket are marked
    const isFullHouse = allTicketNumbers.every(num => playerMarkedNumbers.includes(num));
    
    if (isFullHouse) {
      setPlayerWon(true);
      setWinMessage("Congratulations! You got a Full House!");
      return;
    }
    
    // Check for rows - all numbers in a row are marked
    for (let row = 0; row < 3; row++) {
      const rowNumbers = playerTicket[row].filter(num => num !== null) as number[];
      const isRowComplete = rowNumbers.every(num => playerMarkedNumbers.includes(num));
      
      if (isRowComplete) {
        setPlayerWon(true);
        setWinMessage(`Congratulations! You completed Row ${row + 1}!`);
        return;
      }
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
    <main className="min-h-screen bg-gradient-to-r from-purple-500 to-indigo-600 p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Tambola Game</h1>
            <div className="text-sm bg-gray-100 px-3 py-1 rounded-full">
              Game Code: <span className="font-mono font-bold">{gameCode}</span>
            </div>
          </div>
          
          {/* Current number section */}
          <div className="mb-8 text-center">
            <div className="text-lg font-medium text-gray-600">Current Number</div>
            <div className="flex flex-col items-center">
              <div className="text-7xl font-bold mb-2 bg-indigo-600 text-white w-24 h-24 rounded-full flex items-center justify-center">
                {gameData?.currentNumber || '-'}
              </div>
              {isHost && (
                <div className="text-lg mt-2">
                  Next number in: <span className="font-bold">{timerCount}</span> seconds
                </div>
              )}
            </div>
          </div>
          
          {/* Win notification */}
          {playerWon && (
            <div className="mb-8 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative text-center">
              <strong className="font-bold text-lg">{winMessage}</strong>
            </div>
          )}
          
          {/* Player's ticket - only shown to non-host players */}
          {!isHost && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Your Ticket</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {playerTicket.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((number, colIndex) => {
                          const isCalled = isNumberCalled(number);
                          const isMarked = isNumberMarkedByPlayer(number);
                          
                          return (
                            <td 
                              key={`${rowIndex}-${colIndex}`} 
                              className={`border border-gray-300 p-4 text-center text-xl font-medium
                                        ${number === null ? 'bg-gray-100' : ''}
                                        ${isCalled && isMarked ? 'bg-green-500 text-white' : ''}
                                        ${isCalled && !isMarked ? 'bg-yellow-100 cursor-pointer' : ''}
                                        ${!isCalled && number !== null ? 'bg-white cursor-not-allowed' : ''}`}
                              onClick={() => toggleNumberMark(number)}
                            >
                              {number || ''}
                              {isCalled && !isMarked && <div className="w-2 h-2 bg-yellow-500 rounded-full absolute top-1 right-1"></div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-yellow-100"></div>
                    <span>Called but not marked</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-green-500"></div>
                    <span>Called and marked</span>
                  </div>
                </div>
                <p className="mt-2">Click on called numbers to mark them on your ticket.</p>
              </div>
            </div>
          )}
          <PlayerClaims
  gameId={gameCode}
  gameDocId={gameDocId}
  playerName={playerName}
  playerTicket={playerTicket}
  playerMarkedNumbers={playerMarkedNumbers}
  isHost={isHost}
  gameData={gameData || {}}
/>
          {/* Host view - list of players */}
          {isHost && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Players</h2>
              <div className="bg-gray-50 rounded-md border border-gray-200 p-4">
                <ul className="divide-y divide-gray-200">
                  {gameData?.players.slice(1).map((player, index) => (
                    <li key={index} className="py-2 flex items-center">
                      <span className="font-medium">{player}</span>
                    </li>
                  ))}
                  {(gameData?.players?.length ?? 0) <= 1 && (
                    <li className="py-2 text-gray-500">No players with tickets</li>
                  )}
                </ul>
              </div>
            </div>
          )}
          
          {/* Numbers board - shown to all players for tracking */}
          {isHost && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Numbers Called</h2>
              <div className="grid grid-cols-10 gap-2">
                {Array.from({ length: 90 }, (_, i) => i + 1).map((num) => (
                  <div 
                    key={num}
                    className={`aspect-square flex items-center justify-center rounded-md text-lg font-medium border
                              ${gameData?.markedNumbers.includes(num) 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-white text-gray-800'}`}
                  >
                    {num}
                  </div>
                ))}
                
              </div>
            </div>
          )}

{gameEnded && isHost && (
  <div className="mt-6 text-center">
    <button
      onClick={() => setShowLeaderboard(true)}
      className="bg-green-600 hover:bg-green-700 text-white py-2 px-6 rounded-md mx-2"
    >
      Show Leaderboard
    </button>
  </div>
)}

{!gameEnded && isHost && gameData?.markedNumbers && gameData.markedNumbers.length >= 90 && (
  <div className="mt-6 text-center">
    <button
      onClick={endGame}
      className="bg-purple-600 hover:bg-purple-700 text-white py-2 px-6 rounded-md mx-2"
    >
      End Game and Show Results
    </button>
  </div>
)}

{showLeaderboard && gameData?.playerScores && (
  <Leaderboard 
    players={formatLeaderboardData()} 
    onClose={() => router.push('/')}
  />
)}
        </div>
      </div>
    </main>
  );
}