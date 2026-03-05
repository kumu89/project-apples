import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  handKey,
  normalizeRoomId,
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
  const hostToken = getBearerToken(request);

  if (!roomId || roomId.length !== 5 || !targetPlayerId) {
    return NextResponse.json(
      { error: "5桁のルームIDと対象は必須です。" },
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
  if (targetPlayerId === room.hostId) {
    return NextResponse.json(
      { error: "ホストは退出させられません。" },
      { status: 409 },
    );
  }

  const tokensRaw = (await redis.hgetall(tokensKey(roomId))) ?? {};
  const tokensToDelete = Object.entries(tokensRaw)
    .filter(([, playerId]) => playerId === targetPlayerId)
    .map(([token]) => token);

  const ops: Array<Promise<unknown>> = [
    redis.hdel(playersKey(roomId), targetPlayerId),
    redis.hdel(submissionsKey(roomId), targetPlayerId),
    redis.hdel(votesKey(roomId), targetPlayerId),
    redis.del(handKey(roomId, targetPlayerId)),
  ];

  if (tokensToDelete.length > 0) {
    ops.push(redis.hdel(tokensKey(roomId), ...tokensToDelete));
  }

  await Promise.all(ops);

  return NextResponse.json({ ok: true });
}
