import { useState } from 'react';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PlayerClaimsProps {
  gameId: string;
  gameDocId: string;
  playerName: string;
  playerTicket: (number | null)[][];
  playerMarkedNumbers: number[];
  isHost: boolean;
  gameData: any;
}

interface Claim {
  type: string;
  player: string;
  timestamp: number;
  verified?: boolean;
}

interface GameConfig {
  firstLine: number;
  secondLine: number;
  thirdLine: number;
  earlyFive: number;
  corners: number;
  fullHouse: number;
}

export default function PlayerClaims({
  gameId,
  gameDocId,
  playerName,
  playerTicket,
  playerMarkedNumbers,
  isHost,
  gameData
}: PlayerClaimsProps) {
  const [processing, setProcessing] = useState(false);
  const [claimStatus, setClaimStatus] = useState<{message: string, type: 'success' | 'error' | 'info' | null}>({
    message: '',
    type: null
  });

  // Check if a specific row is complete
  const isRowComplete = (rowIndex: number) => {
    const rowNumbers = playerTicket[rowIndex].filter(num => num !== null) as number[];
    return rowNumbers.every(num => playerMarkedNumbers.includes(num));
  };

  // Check for early 5 (first 5 numbers marked)
  const hasEarlyFive = () => {
    return playerMarkedNumbers.length >= 5;
  };

  // Check for corners
  const hasCorners = () => {
    // Find the corner positions in the ticket
    const corners: number[] = [];
    
    // Top-left corner
    if (playerTicket[0][0] !== null) corners.push(playerTicket[0][0] as number);
    
    // Top-right corner
    const topRightIndex = playerTicket[0].findIndex((val, index) => val !== null && index > playerTicket[0].length - 5);
    if (topRightIndex !== -1) corners.push(playerTicket[0][topRightIndex] as number);
    
    // Bottom-left corner
    if (playerTicket[2][0] !== null) corners.push(playerTicket[2][0] as number);
    
    // Bottom-right corner
    const bottomRightIndex = playerTicket[2].findIndex((val, index) => val !== null && index > playerTicket[2].length - 5);
    if (bottomRightIndex !== -1) corners.push(playerTicket[2][bottomRightIndex] as number);
    
    // Check if all corners are marked
    return corners.every(num => playerMarkedNumbers.includes(num));
  };

  // Check for full house
  const hasFullHouse = () => {
    const allTicketNumbers = playerTicket.flat().filter(num => num !== null) as number[];
    return allTicketNumbers.every(num => playerMarkedNumbers.includes(num));
  };

  // Check if a claim has already been made by this player
  const hasClaimBeenMade = (claimType: string) => {
    if (!gameData.claims) return false;
    return gameData.claims.some((claim: Claim) => 
      claim.type === claimType && claim.player === playerName
    );
  };

  // Check if a claim has already been won by any player
  const isClaimAlreadyWon = (claimType: string) => {
    if (!gameData.claims) return false;
    return gameData.claims.some((claim: Claim) => 
      claim.type === claimType && claim.verified === true
    );
  };

  // Count how many verified claims exist for a specific type
  const countVerifiedClaims = (claimType: string) => {
    if (!gameData.claims) return 0;
    return gameData.claims.filter((claim: Claim) => 
      claim.type === claimType && claim.verified === true
    ).length;
  };

  // Check if rewards are still available for a claim type
  const areRewardsAvailable = (claimType: string) => {
    if (!gameData.gameConfig) return true; // If no config, assume unlimited
    
    const configKey = claimType as keyof GameConfig;
    const maxRewards = gameData.gameConfig[configKey] || 0;
    const usedRewards = countVerifiedClaims(claimType);
    
    return usedRewards < maxRewards;
  };

  // Get remaining rewards count for a claim type
  const getRemainingRewards = (claimType: string) => {
    if (!gameData.gameConfig) return "∞"; // If no config, show infinity symbol
    
    const configKey = claimType as keyof GameConfig;
    const maxRewards = gameData.gameConfig[configKey] || 0;
    const usedRewards = countVerifiedClaims(claimType);
    
    return Math.max(0, maxRewards - usedRewards);
  };

  // Submit a claim
  const submitClaim = async (claimType: string) => {
    setProcessing(true);
    setClaimStatus({message: 'Processing your claim...', type: 'info'});
    
    try {
      // Check if any rewards are still available for this claim type
      if (!areRewardsAvailable(claimType)) {
        setClaimStatus({message: 'No more rewards available for this claim type!', type: 'error'});
        setProcessing(false);
        return;
      }
      
      // Check if player has already made this claim
      if (hasClaimBeenMade(claimType)) {
        setClaimStatus({message: 'You have already made this claim. Waiting for verification.', type: 'info'});
        setProcessing(false);
        return;
      }
      
      // Verify the claim is valid before submitting
      let isValid = false;
      
      switch (claimType) {
        case 'firstLine':
          isValid = isRowComplete(0);
          break;
        case 'secondLine':
          isValid = isRowComplete(1);
          break;
        case 'thirdLine':
          isValid = isRowComplete(2);
          break;
        case 'earlyFive':
          isValid = hasEarlyFive();
          break;
        case 'corners':
          isValid = hasCorners();
          break;
        case 'fullHouse':
          isValid = hasFullHouse();
          break;
        default:
          isValid = false;
      }
      
      if (!isValid) {
        setClaimStatus({message: 'Your claim is not valid! Check your ticket.', type: 'error'});
        setProcessing(false);
        return;
      }
      
      // Get current game document
      const gameDocRef = doc(db, "games", gameDocId);
      const gameSnapshot = await getDoc(gameDocRef);
      
      if (!gameSnapshot.exists()) {
        setClaimStatus({message: 'Game not found!', type: 'error'});
        setProcessing(false);
        return;
      }
      
      // Create the claim object
      const claim: Claim = {
        type: claimType,
        player: playerName,
        timestamp: Date.now()
      };
      
      // If host is making claim, auto-verify it
      if (isHost) {
        claim.verified = true;
      }
      
      // Update the game document with the new claim
      await updateDoc(gameDocRef, {
        claims: arrayUnion(claim)
      });
      
      setClaimStatus({
        message: isHost ? 'Your claim has been verified!' : 'Your claim has been submitted and is awaiting verification!',
        type: 'success'
      });
    } catch (error) {
      console.error('Error submitting claim:', error);
      setClaimStatus({message: 'Failed to submit your claim. Please try again.', type: 'error'});
    } finally {
      setProcessing(false);
    }
  };

  // Verify a claim (host only)
  const verifyClaim = async (claimIndex: number) => {
    if (!isHost || !gameData.claims) return;
    
    setProcessing(true);
    
    try {
      const claim = gameData.claims[claimIndex];
      
      // Check if any rewards are still available for this claim type
      if (!areRewardsAvailable(claim.type)) {
        setClaimStatus({message: 'No more rewards available for this claim type!', type: 'error'});
        setProcessing(false);
        return;
      }
      
      // Create a new claims array with the updated claim
      const updatedClaims = [...gameData.claims];
      updatedClaims[claimIndex] = {
        ...claim,
        verified: true
      };
      
      // Update the game document with the verified claim
      const gameDocRef = doc(db, "games", gameDocId);
      await updateDoc(gameDocRef, {
        claims: updatedClaims
      });
      
      setClaimStatus({message: 'Claim verified successfully!', type: 'success'});
    } catch (error) {
      console.error('Error verifying claim:', error);
      setClaimStatus({message: 'Failed to verify claim. Please try again.', type: 'error'});
    } finally {
      setProcessing(false);
    }
  };

  // Reject a claim (host only)
  const rejectClaim = async (claimIndex: number) => {
    if (!isHost || !gameData.claims) return;
    
    setProcessing(true);
    
    try {
      const claim = gameData.claims[claimIndex];
      
      // Create a new claims array with the updated claim
      const updatedClaims = [...gameData.claims];
      updatedClaims[claimIndex] = {
        ...claim,
        verified: false
      };
      
      // Update the game document with the rejected claim
      const gameDocRef = doc(db, "games", gameDocId);
      await updateDoc(gameDocRef, {
        claims: updatedClaims
      });
      
      setClaimStatus({message: 'Claim rejected successfully!', type: 'success'});
    } catch (error) {
      console.error('Error rejecting claim:', error);
      setClaimStatus({message: 'Failed to reject claim. Please try again.', type: 'error'});
    } finally {
      setProcessing(false);
    }
  };

  // Get the formatted name for a claim type
  const getClaimName = (claimType: string) => {
    switch (claimType) {
      case 'firstLine': return 'First Line';
      case 'secondLine': return 'Second Line';
      case 'thirdLine': return 'Third Line';
      case 'earlyFive': return 'Early 5';
      case 'corners': return 'Corners';
      case 'fullHouse': return 'Full House';
      default: return claimType;
    }
  };
  
  return (
    <div className="mt-8 bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">
        {isHost ? 'Player Claims' : 'Claim Prizes'}
      </h2>
      
      {claimStatus.message && (
        <div className={`mb-4 p-3 rounded ${
          claimStatus.type === 'success' ? 'bg-green-100 text-green-700' :
          claimStatus.type === 'error' ? 'bg-red-100 text-red-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {claimStatus.message}
        </div>
      )}
      
      {gameData.gameConfig && (
        <div className="mb-4">
          <h3 className="font-medium mb-2 text-gray-700">Available Rewards:</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
            <div className="bg-gray-100 p-2 rounded text-center">
              <div className="font-medium">First Line</div>
              <div className="text-lg font-bold">{getRemainingRewards('firstLine')}</div>
            </div>
            <div className="bg-gray-100 p-2 rounded text-center">
              <div className="font-medium">Second Line</div>
              <div className="text-lg font-bold">{getRemainingRewards('secondLine')}</div>
            </div>
            <div className="bg-gray-100 p-2 rounded text-center">
              <div className="font-medium">Third Line</div>
              <div className="text-lg font-bold">{getRemainingRewards('thirdLine')}</div>
            </div>
            <div className="bg-gray-100 p-2 rounded text-center">
              <div className="font-medium">Early 5</div>
              <div className="text-lg font-bold">{getRemainingRewards('earlyFive')}</div>
            </div>
            <div className="bg-gray-100 p-2 rounded text-center">
              <div className="font-medium">Corners</div>
              <div className="text-lg font-bold">{getRemainingRewards('corners')}</div>
            </div>
            <div className="bg-gray-100 p-2 rounded text-center">
              <div className="font-medium">Full House</div>
              <div className="text-lg font-bold">{getRemainingRewards('fullHouse')}</div>
            </div>
          </div>
        </div>
      )}
      
      {!isHost && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {[
            { id: 'firstLine', label: 'First Line', check: () => isRowComplete(0) },
            { id: 'secondLine', label: 'Second Line', check: () => isRowComplete(1) },
            { id: 'thirdLine', label: 'Third Line', check: () => isRowComplete(2) },
            { id: 'earlyFive', label: 'Early 5', check: hasEarlyFive },
            { id: 'corners', label: 'Corners', check: hasCorners },
            { id: 'fullHouse', label: 'Full House', check: hasFullHouse }
          ].map((claim) => {
            const alreadyWon = isClaimAlreadyWon(claim.id);
            const alreadyClaimed = hasClaimBeenMade(claim.id);
            const noRewardsLeft = !areRewardsAvailable(claim.id);
            const isDisabled = processing || alreadyWon || alreadyClaimed || noRewardsLeft;
            
            const buttonStyle = isDisabled ? 
              alreadyWon ? 'bg-gray-300 cursor-not-allowed' : 
              alreadyClaimed ? 'bg-yellow-500' : 
              noRewardsLeft ? 'bg-red-300 cursor-not-allowed' :
              'bg-gray-300 cursor-not-allowed' : 
              claim.check() ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700';
            
            return (
              <button
                key={claim.id}
                onClick={() => submitClaim(claim.id)}
                disabled={isDisabled}
                className={`py-2 px-4 rounded-md text-white font-medium relative ${buttonStyle}`}
              >
                {claim.label}
                {alreadyWon && ' (Won)'}
                {alreadyClaimed && !alreadyWon && ' (Claimed)'}
                {noRewardsLeft && !alreadyClaimed && ' (No rewards left)'}
                {!alreadyClaimed && !alreadyWon && !noRewardsLeft && claim.check() && ' ✓'}
                
                {gameData.gameConfig && !alreadyWon && !alreadyClaimed && !noRewardsLeft && (
                  <span className="absolute top-0 right-0 -mt-2 -mr-2 bg-white border border-indigo-500 text-indigo-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                    {getRemainingRewards(claim.id)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      
      {/* Claims List */}
      <div className="overflow-hidden">
        <h3 className="text-lg font-medium mb-2">
          {gameData?.claims?.length ? 'Current Claims' : 'No claims yet'}
        </h3>
        
        {gameData?.claims?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  {isHost && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {gameData.claims.map((claim: Claim, index: number) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getClaimName(claim.type)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {claim.player} {claim.player === playerName && '(You)'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {claim.verified === true ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Verified
                        </span>
                      ) : claim.verified === false ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Rejected
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      )}
                    </td>
                    {isHost && claim.verified === undefined && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => verifyClaim(index)}
                          disabled={processing || !areRewardsAvailable(claim.type)}
                          className={`text-green-600 hover:text-green-900 mr-4 ${!areRewardsAvailable(claim.type) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => rejectClaim(index)}
                          disabled={processing}
                          className="text-red-600 hover:text-red-900"
                        >
                          Reject
                        </button>
                        {!areRewardsAvailable(claim.type) && (
                          <span className="text-xs text-red-500 ml-2">No rewards left</span>
                        )}
                      </td>
                    )}
                    {isHost && claim.verified !== undefined && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        -
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}