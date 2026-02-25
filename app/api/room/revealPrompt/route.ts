import { NextResponse } from "next/server";
import { greenCards, redCards } from "@/data/cards";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  dealtRedKey,
  handKey,
  nowMs,
  roomKey,
  safeJsonParse,
  submissionsKey,
  votesKey,
  type RoomData,
  type SubmissionData,
} from "@/lib/room";

function pickReplacement(used: Set<string>): string | null {
  const available = redCards.filter((card) => !used.has(card.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)]?.id ?? null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string }
    | null;
  const roomId = body?.roomId?.toUpperCase().trim() ?? "";
  const hostToken = getBearerToken(request);

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
  }

  if (!hostToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (room.hostToken !== hostToken) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (room.phase !== "WAITING" && room.phase !== "RESULT") {
    return NextResponse.json(
      { error: "Prompt already revealed." },
      { status: 409 },
    );
  }

  const nextPrompt =
    greenCards[Math.floor(Math.random() * greenCards.length)];
  if (!nextPrompt) {
    return NextResponse.json(
      { error: "No prompt cards available." },
      { status: 500 },
    );
  }

  if (room.phase === "RESULT") {
    const submissionsRaw =
      (await redis.hgetall(submissionsKey(roomId))) ?? {};
    const usedRaw = await redis.smembers(dealtRedKey(roomId));
    const used = new Set(usedRaw ?? []);
    const handOps: Array<Promise<unknown>> = [];

    for (const [playerId, value] of Object.entries(submissionsRaw)) {
      const submission = safeJsonParse<SubmissionData>(value);
      if (!submission) continue;
      const handRaw = await redis.get<string>(handKey(roomId, playerId));
      const hand = safeJsonParse<{ cardIds: string[] }>(handRaw);
      if (!hand) continue;

      const replacementId = pickReplacement(used);
      if (!replacementId) {
        return NextResponse.json(
          { error: "No cards available." },
          { status: 409 },
        );
      }
      used.add(replacementId);

      const nextHand = {
        cardIds: hand.cardIds.map((id) =>
          id === submission.cardId ? replacementId : id,
        ),
      };
      handOps.push(
        redis.set(handKey(roomId, playerId), JSON.stringify(nextHand)),
      );
      handOps.push(redis.expire(handKey(roomId, playerId), TTL_SECONDS));
    }

    await redis.del(submissionsKey(roomId));
    await redis.del(votesKey(roomId));
    await Promise.all([
      ...handOps,
      redis.sadd(dealtRedKey(roomId), Array.from(used)),
      redis.expire(submissionsKey(roomId), TTL_SECONDS),
      redis.expire(dealtRedKey(roomId), TTL_SECONDS),
      redis.expire(votesKey(roomId), TTL_SECONDS),
    ]);
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "SELECT",
    promptCardId: nextPrompt.id,
    updatedAt: nowMs(),
  };

  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await redis.expire(roomKey(roomId), TTL_SECONDS);

  return NextResponse.json({ promptCard: { text: nextPrompt.text } });
}

