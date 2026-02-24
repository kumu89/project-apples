import { NextResponse } from "next/server";
import { getGreenCard, getRedCard } from "@/data/cards";
import { redis } from "@/lib/redis";
import {
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
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

  const players: Array<{
    id: string;
    name: string;
    submitted: boolean;
    joinedAt: number;
  }> = [];
  for (const [playerId, value] of Object.entries(playersRaw)) {
    const player = safeJsonParse<PlayerData>(value);
    if (!player) continue;
    players.push({
      id: playerId,
      name: player.name,
      submitted: Boolean(submissionsRaw[playerId]),
      joinedAt: player.joinedAt,
    });
  }
  players.sort((a, b) => {
    if (a.id === room.hostId) return -1;
    if (b.id === room.hostId) return 1;
    return a.joinedAt - b.joinedAt;
  });

  const promptCard = getGreenCard(room.promptCardId);
  const submissionsRevealed = room.phase === "REVEALED";

  let revealedCards: Array<{ text: string; playerName: string; playerId: string }> = [];
  if (submissionsRevealed) {
    const submissionsByPlayer = new Map(
      Object.entries(submissionsRaw).map(([playerId, value]) => [
        playerId,
        safeJsonParse<SubmissionData>(value),
      ]),
    );
    revealedCards = players
      .map((player) => {
        const submission = submissionsByPlayer.get(player.id);
        if (!submission) return null;
        const card = getRedCard(submission.cardId);
        if (!card) return null;
        return {
          text: card.text,
          playerName: player.name,
          playerId: player.id,
        };
      })
      .filter(
        (card): card is { text: string; playerName: string; playerId: string } =>
          Boolean(card),
      );
  }

  const response: {
    roomId: string;
    phase: RoomData["phase"];
    prompt: { id: string; text: string } | null;
    players: Array<{ id: string; name: string; submitted: boolean }>;
    submittedCount: number;
    playerCount: number;
    revealed: boolean;
    revealedCards?: Array<{ text: string; playerName: string; playerId: string }>;
  } = {
    roomId,
    phase: room.phase,
    prompt: promptCard ? { id: promptCard.id, text: promptCard.text } : null,
    players,
    submittedCount: players.filter((player) => player.submitted).length,
    playerCount: players.length,
    revealed: submissionsRevealed,
  };

  if (submissionsRevealed) {
    response.revealedCards = revealedCards;
  }

  return NextResponse.json(response);
}

