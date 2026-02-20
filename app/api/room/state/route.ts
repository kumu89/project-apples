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

  const playersRaw = (await redis.hgetall<string>(playersKey(roomId))) ?? {};
  const submissionsRaw =
    (await redis.hgetall<string>(submissionsKey(roomId))) ?? {};

  const players: Array<{ id: string; name: string; submitted: boolean }> = [];
  for (const [playerId, value] of Object.entries(playersRaw)) {
    const player = safeJsonParse<PlayerData>(value);
    if (!player) continue;
    players.push({
      id: playerId,
      name: player.name,
      submitted: Boolean(submissionsRaw[playerId]),
    });
  }

  const promptCard = getGreenCard(room.promptCardId);
  const submissionsRevealed = room.phase === "REVEALED";

  let revealedCards: Array<{ text: string }> = [];
  if (submissionsRevealed) {
    revealedCards = Object.values(submissionsRaw)
      .map((value) => safeJsonParse<SubmissionData>(value))
      .filter((submission): submission is SubmissionData => Boolean(submission))
      .map((submission) => getRedCard(submission.cardId))
      .filter((card): card is { id: string; text: string } => Boolean(card))
      .map((card) => ({ text: card.text }));
  }

  const response: {
    roomId: string;
    phase: RoomData["phase"];
    prompt: { id: string; text: string } | null;
    players: Array<{ id: string; name: string; submitted: boolean }>;
    submittedCount: number;
    playerCount: number;
    revealed: boolean;
    revealedCards?: Array<{ text: string }>;
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

