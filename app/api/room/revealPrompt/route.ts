import { NextResponse } from "next/server";
import { greenCards, redCards } from "@/data/cards";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  dealtRedKey,
  handKey,
  nowMs,
  normalizeRoomId,
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
  const roomId = normalizeRoomId(body?.roomId ?? "");
  const hostToken = getBearerToken(request);

  if (!roomId || roomId.length !== 5) {
    return NextResponse.json(
      { error: "5桁のルームIDが必要です。" },
      { status: 400 },
    );
  }

  if (!hostToken) {
    return NextResponse.json({ error: "認証に失敗しました。" }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json(
      { error: "ルームが見つかりません。" },
      { status: 404 },
    );
  }

  if (room.hostToken !== hostToken) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  if (room.phase !== "WAITING" && room.phase !== "RESULT") {
    return NextResponse.json(
      { error: "お題はすでに公開されています。" },
      { status: 409 },
    );
  }

  const nextPrompt =
    greenCards[Math.floor(Math.random() * greenCards.length)];
  if (!nextPrompt) {
    return NextResponse.json(
      { error: "お題カードがありません。" },
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
          { error: "カードが不足しています。" },
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
    round: room.round + 1,
  };

  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await redis.expire(roomKey(roomId), TTL_SECONDS);

  return NextResponse.json({ promptCard: { text: nextPrompt.text } });
}

