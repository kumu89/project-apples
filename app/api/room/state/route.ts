import { NextResponse } from "next/server";
import { getGreenCard, getRedCard } from "@/data/cards";
import { redis } from "@/lib/redis";
import {
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  votesKey,
  type PlayerData,
  type RoomData,
  type SubmissionData,
} from "@/lib/room";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.toUpperCase().trim() ?? "";

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const playersRaw = (await redis.hgetall(playersKey(roomId))) ?? {};
  const submissionsRaw =
    (await redis.hgetall(submissionsKey(roomId))) ?? {};
  const votesRaw = (await redis.hgetall(votesKey(roomId))) ?? {};

  const votesByVoterId = new Map<string, boolean>(
    Object.keys(votesRaw).map((voterId) => [voterId, true]),
  );
  const players: Array<{
    id: string;
    name: string;
    submitted: boolean;
    joinedAt: number;
    score: number;
    voted: boolean;
  }> = [];
  for (const [playerId, value] of Object.entries(playersRaw)) {
    const player = safeJsonParse<PlayerData>(value);
    if (!player) continue;
    players.push({
      id: playerId,
      name: player.name,
      submitted: Boolean(submissionsRaw[playerId]),
      joinedAt: player.joinedAt,
      score: player.score ?? 0,
      voted: Boolean(votesByVoterId.get(playerId)),
    });
  }
  players.sort((a, b) => a.joinedAt - b.joinedAt);

  const promptCard = getGreenCard(room.promptCardId);
  const submissionsRevealed =
    room.phase === "VOTING" || room.phase === "RESULT";

  let revealedCards: Array<{
    text: string;
    playerName: string;
    playerId: string;
    voteCount?: number;
    voters?: string[];
  }> = [];
  if (submissionsRevealed) {
    const submissionsByPlayer = new Map(
      Object.entries(submissionsRaw).map(([playerId, value]) => [
        playerId,
        safeJsonParse<SubmissionData>(value),
      ]),
    );
    const playerNames = new Map(players.map((player) => [player.id, player.name]));
    const votesByVoter = new Map(
      Object.entries(votesRaw)
        .map(([voterId, value]) => {
          const vote = safeJsonParse<{ targetPlayerId: string }>(value);
          return [voterId, vote?.targetPlayerId ?? null] as const;
        })
        .filter(([voterId, target]) => Boolean(voterId) && Boolean(target)),
    );
    const votesByTarget = new Map<string, string[]>();
    const joinOrderIds = players.map((player) => player.id);
    for (const voterId of joinOrderIds) {
      const targetId = votesByVoter.get(voterId);
      if (!targetId) continue;
      if (!playerNames.has(voterId) || !playerNames.has(targetId)) continue;
      const list = votesByTarget.get(targetId) ?? [];
      list.push(playerNames.get(voterId) ?? "Unknown");
      votesByTarget.set(targetId, list);
    }

    revealedCards = players
      .map((player) => {
        const submission = submissionsByPlayer.get(player.id);
        if (!submission) return null;
        const card = getRedCard(submission.cardId);
        if (!card) return null;
        const voters = votesByTarget.get(player.id) ?? [];
        return {
          text: card.text,
          playerName: player.name,
          playerId: player.id,
          voteCount: room.phase === "RESULT" ? voters.length : undefined,
          voters: room.phase === "RESULT" ? voters : undefined,
        };
      })
      .filter(
        (card): card is {
          text: string;
          playerName: string;
          playerId: string;
          voteCount?: number;
          voters?: string[];
        } => Boolean(card),
      );
  }

  const response: {
    roomId: string;
    phase: RoomData["phase"];
    prompt: { id: string; text: string } | null;
    players: Array<{
      id: string;
      name: string;
      submitted: boolean;
      joinedAt: number;
      score: number;
      voted: boolean;
    }>;
    submittedCount: number;
    playerCount: number;
    revealed: boolean;
    votesCount: number;
    voterCount: number;
    round: number;
    revealedCards?: Array<{
      text: string;
      playerName: string;
      playerId: string;
      voteCount?: number;
      voters?: string[];
    }>;
  } = {
    roomId,
    phase: room.phase,
    prompt: promptCard ? { id: promptCard.id, text: promptCard.text } : null,
    players,
    submittedCount: players.filter((player) => player.submitted).length,
    playerCount: players.length,
    revealed: submissionsRevealed,
    votesCount: Object.keys(votesRaw).length,
    voterCount: players.length,
    round: room.round,
  };

  if (submissionsRevealed) {
    response.revealedCards = revealedCards;
  }

  return NextResponse.json(response);
}

