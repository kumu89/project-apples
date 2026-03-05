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
    | { roomId?: string }
    | null;
  const roomId = normalizeRoomId(body?.roomId ?? "");
  const playerToken = getBearerToken(request);

  if (!roomId || roomId.length !== 5) {
    return NextResponse.json(
      { error: "5桁のルームIDが必要です。" },
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

  const playerId = await redis.hget<string>(tokensKey(roomId), playerToken);
  if (!playerId) {
    return NextResponse.json({ error: "トークンが無効です。" }, { status: 403 });
  }
  if (playerId === room.hostId) {
    return NextResponse.json(
      { error: "ホストは退出できません。ルーム削除を使用してください。" },
      { status: 409 },
    );
  }

  await Promise.all([
    redis.hdel(playersKey(roomId), playerId),
    redis.hdel(tokensKey(roomId), playerToken),
    redis.hdel(submissionsKey(roomId), playerId),
    redis.hdel(votesKey(roomId), playerId),
    redis.del(handKey(roomId, playerId)),
  ]);

  return NextResponse.json({ ok: true });
}
