// src/app/page.tsx
"use client";

import { useState } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, arrayUnion, query, where, getDocs } from "firebase/firestore";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";

// Firebase configuration - you'll need to replace these with your actual Firebase config
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

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [selectedOption, setSelectedOption] = useState<"join" | "create">("join");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Generate a unique game code
      const newGameCode = nanoid(6).toUpperCase();
      
      // Create a new game document in Firebase
      await addDoc(collection(db, "games"), {
        id: newGameCode,
        players: [playerName],
        markedNumbers: [],
        started: false,
        gameConfig: {
          firstLine: 1,
          secondLine: 1,
          thirdLine: 1,
          earlyFive: 1,
          fullHouse: 1
        }
      });

      // Store player name in localStorage
      localStorage.setItem("playerName", playerName);

      // Redirect to the game waiting page
      router.push(`/game/${newGameCode}`);
    } catch (error) {
      console.error("Error creating game:", error);
      setError("Failed to create game. Please try again.");
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!gameCode.trim()) {
      setError("Please enter a game code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Check if the game exists by querying for the game code
      const gamesRef = collection(db, "games");
      const q = query(gamesRef, where("id", "==", gameCode));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError("Game not found. Please check the code and try again.");
        setLoading(false);
        return;
      }

      // Check if game has already started
      const gameData = querySnapshot.docs[0].data();
      if (gameData.started) {
        setError("This game has already started. You cannot join.");
        setLoading(false);
        return;
      }

      // Get the document ID (not the game ID we created)
      const gameDocId = querySnapshot.docs[0].id;
      
      // Add player to the game using arrayUnion to prevent duplicates
      const gameDocRef = doc(db, "games", gameDocId);
      await updateDoc(gameDocRef, {
        players: arrayUnion(playerName)
      });

      // Store player name in localStorage
      localStorage.setItem("playerName", playerName);

      // Redirect to the game waiting page
      router.push(`/game/${gameCode}`);
    } catch (error) {
      console.error("Error joining game:", error);
      setError("Failed to join game. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6">Tambola Game</h1>
        
        <div className="mb-6">
          <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-1">
            Your Name
          </label>
          <input
            type="text"
            id="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter your name"
          />
        </div>

        <div className="flex gap-4 mb-6">
          <button
            className={`flex-1 py-2 px-4 rounded-md ${
              selectedOption === "join"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setSelectedOption("join")}
          >
            Join Game
          </button>
          <button
            className={`flex-1 py-2 px-4 rounded-md ${
              selectedOption === "create"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => setSelectedOption("create")}
          >
            Create Game
          </button>
        </div>

        {selectedOption === "join" && (
          <div className="mb-6">
            <label htmlFor="gameCode" className="block text-sm font-medium text-gray-700 mb-1">
              Game Code
            </label>
            <input
              type="text"
              id="gameCode"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter game code"
            />
          </div>
        )}

        {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

        <button
          onClick={selectedOption === "join" ? handleJoinGame : handleCreateGame}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md transition duration-300 flex items-center justify-center"
        >
          {loading ? (
            <span className="animate-spin mr-2">⟳</span>
          ) : null}
          {selectedOption === "join" ? "Join Game" : "Create Game"}
        </button>
      </div>
    </main>
  );
}