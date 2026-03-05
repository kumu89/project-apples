import { NextResponse } from "next/server";
import { getGreenCard, getRedCard } from "@/data/cards";
import { redis } from "@/lib/redis";
import {
  normalizeRoomId,
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
  const roomId = normalizeRoomId(searchParams.get("roomId") ?? "");

  if (!roomId || roomId.length !== 5) {
    return NextResponse.json(
      { error: "5桁のルームIDが必要です。" },
      { status: 400 },
    );
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json(
      { error: "ルームが見つかりません。" },
      { status: 404 },
    );
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
    icon: string;
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
      icon: player.icon ?? "blue",
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
    playerIcon: string;
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
    const playerNames = new Map(
      players.map((player) => [player.id, player.name]),
    );
    const playerIcons = new Map(
      players.map((player) => [player.id, player.icon]),
    );
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
      list.push(playerNames.get(voterId) ?? "不明");
      votesByTarget.set(targetId, list);
    }

    revealedCards = [];
    for (const player of players) {
      const submission = submissionsByPlayer.get(player.id);
      if (!submission) continue;
      const card = getRedCard(submission.cardId);
      if (!card) continue;
      const voters = votesByTarget.get(player.id) ?? [];
      revealedCards.push({
        text: card.text,
        playerName: player.name,
        playerIcon: playerIcons.get(player.id) ?? "blue",
        playerId: player.id,
        voteCount: room.phase === "RESULT" ? voters.length : undefined,
        voters: room.phase === "RESULT" ? voters : undefined,
      });
    }
  }

  const response: {
    roomId: string;
    phase: RoomData["phase"];
    prompt: { id: string; text: string } | null;
    players: Array<{
      id: string;
      name: string;
      icon: string;
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
      playerIcon: string;
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

