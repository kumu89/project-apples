import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  normalizeRoomId,
  nowMs,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  votesKey,
  type RoomData,
} from "@/lib/room";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string; targetPlayerId?: string }
    | null;
  const roomId = normalizeRoomId(body?.roomId ?? "");
  const targetPlayerId = body?.targetPlayerId ?? "";
  const playerToken = getBearerToken(request);

  if (!roomId || roomId.length !== 5 || !targetPlayerId) {
    return NextResponse.json(
      { error: "5桁のルームIDと投票先は必須です。" },
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

  if (room.phase !== "VOTING") {
    return NextResponse.json(
      { error: "投票は終了しています。" },
      { status: 409 },
    );
  }

  const voterId = await redis.hget<string>(tokensKey(roomId), playerToken);
  if (!voterId) {
    return NextResponse.json({ error: "トークンが無効です。" }, { status: 403 });
  }
  if (voterId === targetPlayerId) {
    return NextResponse.json(
      { error: "自分のカードには投票できません。" },
      { status: 409 },
    );
  }

  const targetSubmission = await redis.hget<string>(
    submissionsKey(roomId),
    targetPlayerId,
  );
  if (!targetSubmission) {
    return NextResponse.json(
      { error: "投票先の提出がありません。" },
      { status: 409 },
    );
  }

  const existingVote = await redis.hget<string>(votesKey(roomId), voterId);
  if (existingVote) {
    return NextResponse.json(
      { error: "すでに投票済みです。" },
      { status: 409 },
    );
  }

  await redis.hset(votesKey(roomId), {
    [voterId]: JSON.stringify({ targetPlayerId }),
  });

  const playersCount = await redis.hlen(playersKey(roomId));
  const votesCount = await redis.hlen(votesKey(roomId));
  if (playersCount > 0 && votesCount >= playersCount) {
    const updatedRoom: RoomData = {
      ...room,
      phase: "RESULT",
      updatedAt: nowMs(),
    };
    await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  }

  await Promise.all([
    redis.expire(votesKey(roomId), TTL_SECONDS),
    redis.expire(roomKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}
