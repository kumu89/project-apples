import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  handKey,
  nowMs,
  normalizeRoomId,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  type RoomData,
} from "@/lib/room";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string; cardId?: string }
    | null;
  const roomId = normalizeRoomId(body?.roomId ?? "");
  const cardId = body?.cardId ?? "";
  const playerToken = getBearerToken(request);

  if (!roomId || roomId.length !== 5 || !cardId) {
    return NextResponse.json(
      { error: "5桁のルームIDとカードは必須です。" },
      { status: 400 },
    );
  }

  if (!playerToken) {
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

  if (room.phase !== "SELECT") {
    return NextResponse.json(
      { error: "手札選択は終了しています。" },
      { status: 409 },
    );
  }

  const playerId = await redis.hget<string>(tokensKey(roomId), playerToken);
  if (!playerId) {
    return NextResponse.json({ error: "トークンが無効です。" }, { status: 403 });
  }

  const handRaw = await redis.get<string>(handKey(roomId, playerId));
  const hand = safeJsonParse<{ cardIds: string[] }>(handRaw);
  if (!hand || !hand.cardIds.includes(cardId)) {
    return NextResponse.json(
      { error: "そのカードは手札にありません。" },
      { status: 400 },
    );
  }

  const existing = await redis.hget<string>(submissionsKey(roomId), playerId);
  if (existing) {
    return NextResponse.json(
      { error: "すでに提出済みです。" },
      { status: 409 },
    );
  }

  await redis.hset(submissionsKey(roomId), {
    [playerId]: JSON.stringify({ cardId, submittedAt: nowMs() }),
  });

  const playersCount = await redis.hlen(playersKey(roomId));
  const submissionsCount = await redis.hlen(submissionsKey(roomId));
  if (playersCount > 0 && submissionsCount >= playersCount) {
    const updatedRoom: RoomData = {
      ...room,
      phase: "VOTING",
      updatedAt: nowMs(),
    };
    await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  }

  await Promise.all([
    redis.expire(submissionsKey(roomId), TTL_SECONDS),
    redis.expire(roomKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}

