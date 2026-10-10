import { getDb } from '@shopinbos/db';
import { deviceRegisterSchema } from '@shopinbos/validation';
import { handler, ok, parseJson } from '@/lib/api/respond';
import { requireClaims } from '@/lib/auth/claims';
import { getOrCreateUser } from '@/server/users';

/** POST /api/me/devices — register or move an Expo push token to the signed-in user. */
export const POST = handler(async (req: Request) => {
  const claims = await requireClaims(req);
  const input = await parseJson(req, deviceRegisterSchema);
  const user = await getOrCreateUser(claims);
  const device = await getDb().device.upsert({
    where: { expoPushToken: input.expoPushToken },
    update: { userId: user.id, app: input.app, platform: input.platform, lastSeenAt: new Date() },
    create: { userId: user.id, ...input },
  });
  return ok({ id: device.id });
});
