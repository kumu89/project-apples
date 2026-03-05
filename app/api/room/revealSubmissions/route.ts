import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  nowMs,
  normalizeRoomId,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
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

  if (room.phase !== "SELECT") {
    return NextResponse.json(
      { error: "手札選択は開始されていません。" },
      { status: 409 },
    );
  }

  const players = await redis.hlen(playersKey(roomId));
  const submissions = await redis.hlen(submissionsKey(roomId));

  if (players === 0 || submissions < players) {
    return NextResponse.json(
      { error: "まだ全員が提出していません。" },
      { status: 409 },
    );
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "VOTING",
    updatedAt: nowMs(),
  };

  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await Promise.all([
    redis.expire(roomKey(roomId), TTL_SECONDS),
    redis.expire(submissionsKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}

