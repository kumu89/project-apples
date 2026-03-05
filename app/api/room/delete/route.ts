import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  dealtRedKey,
  handKey,
  normalizeRoomId,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  votesKey,
  type PlayerData,
  type RoomData,
} from "@/lib/room";

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

  const playersRaw = (await redis.hgetall(playersKey(roomId))) ?? {};
  const playerIds = Object.entries(playersRaw)
    .map(([playerId, value]) =>
      safeJsonParse<PlayerData>(value) ? playerId : null,
    )
    .filter((playerId): playerId is string => Boolean(playerId));

  const ops: Array<Promise<unknown>> = [
    redis.del(roomKey(roomId)),
    redis.del(playersKey(roomId)),
    redis.del(tokensKey(roomId)),
    redis.del(submissionsKey(roomId)),
    redis.del(votesKey(roomId)),
    redis.del(dealtRedKey(roomId)),
  ];

  for (const playerId of playerIds) {
    ops.push(redis.del(handKey(roomId, playerId)));
  }

  await Promise.all(ops);

  return NextResponse.json({ ok: true });
}
