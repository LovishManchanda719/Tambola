import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface LeaderboardProps {
  players: Array<{
    name: string;
    scores: {
      firstLine?: number;
      secondLine?: number;
      thirdLine?: number;
      earlyFive?: number;
      corners?: number;
      fullHouse?: number;
    };
    totalScore: number;
  }>;
  onClose: () => void;
}

const Leaderboard = ({ players, onClose }: LeaderboardProps) => {
  // Sort players by total score in descending order
  const sortedPlayers = [...players].sort((a, b) => b.totalScore - a.totalScore);
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Game Over - Final Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 text-left">Rank</th>
                  <th className="p-2 text-left">Player</th>
                  <th className="p-2 text-right">First Line</th>
                  <th className="p-2 text-right">Second Line</th>
                  <th className="p-2 text-right">Third Line</th>
                  <th className="p-2 text-right">Early 5</th>
                  <th className="p-2 text-right">Corners</th>
                  <th className="p-2 text-right">Full House</th>
                  <th className="p-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, index) => (
                  <tr key={player.name} className={index === 0 ? "bg-yellow-50" : "border-t"}>
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2 font-medium">
                      {player.name} {index === 0 && "🏆"}
                    </td>
                    <td className="p-2 text-right">{player.scores.firstLine || "-"}</td>
                    <td className="p-2 text-right">{player.scores.secondLine || "-"}</td>
                    <td className="p-2 text-right">{player.scores.thirdLine || "-"}</td>
                    <td className="p-2 text-right">{player.scores.earlyFive || "-"}</td>
                    <td className="p-2 text-right">{player.scores.corners || "-"}</td>
                    <td className="p-2 text-right">{player.scores.fullHouse || "-"}</td>
                    <td className="p-2 text-right font-bold">{player.totalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-center">
            <button 
              onClick={onClose}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-6 rounded-md"
            >
              Back to Home
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Leaderboard;