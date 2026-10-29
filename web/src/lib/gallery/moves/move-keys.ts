// Local Omarchy layer: the keys of Move to <library> (gallery/moves). Each page makes its own library's key under the
// owner's session, with exactly the permissions its side needs (MOVE-TO-LIBRARY.md, Keys), and hands it straight to
// the mover: the secret goes from Kioku's answer into the request body and into nothing else, no state, no log, no
// address. After a 202 the mover owns the key and deletes it with the key itself when the move ends. Before that the
// page deletes it: at once on any other answer, and on no answer at all unless the mover reports that it holds it.
// Keys a crash or a power cut left behind are deleted too, but only with the mover's answer in hand.
import { createApiKey, deleteApiKey, getApiKeys, Permission } from '@immich/sdk';
import { moveStatus, unanswered, type MoveKey, type MoveSide, type MoveStatus } from './mover';

/** Every move key has this name, which the leftover clean-up looks for. */
export const MOVE_KEY_NAME = 'Kioku move (temporary)';

/** The source's key: list a person's photos, read and download them and their edits, put them in the trash. */
export const SOURCE_PERMISSIONS: readonly Permission[] = [
  Permission.AssetRead,
  Permission.AssetDownload,
  Permission.AssetEditGet,
  Permission.AssetDelete,
  Permission.UserRead,
  Permission.ApiKeyDelete,
];

/**
 * The destination's key: upload, set the details, read back, edit, stack and watch the queues. It queues no job and
 * reads no stack, and neither key has a person or face permission.
 */
export const DESTINATION_PERMISSIONS: readonly Permission[] = [
  Permission.AssetUpload,
  Permission.AssetRead,
  Permission.AssetUpdate,
  Permission.AssetDownload,
  Permission.AssetEditGet,
  Permission.AssetEditCreate,
  Permission.StackCreate,
  Permission.QueueRead,
  Permission.UserRead,
  Permission.ApiKeyDelete,
];

export const permissionsFor = (side: MoveSide) => (side === 'source' ? SOURCE_PERMISSIONS : DESTINATION_PERMISSIONS);

/** A move key younger than this may be on its way to the mover from another tab, so it is never a leftover. */
export const LEFTOVER_AGE_MS = 10 * 60_000;

/** The keys the mover holds for this library, as it reports them (a key id, never a secret). */
export const keysInUse = (moves: readonly MoveStatus[]) =>
  moves.map(({ key }) => key).filter((key): key is string => !!key);

/**
 * Deletes this library's leftover move keys: named as move keys, older than 10 minutes, and not one the mover holds.
 * `inUse` comes from the mover's own answer; without one, nothing is deleted. Returns how many went.
 */
export const deleteLeftoverMoveKeys = async (inUse: readonly string[], now = Date.now()): Promise<number> => {
  const keys = await getApiKeys();
  const leftovers = keys.filter(
    ({ id, name, createdAt }) =>
      name === MOVE_KEY_NAME && now - Date.parse(createdAt) > LEFTOVER_AGE_MS && !inUse.includes(id),
  );
  const deleted = await Promise.all(
    leftovers.map(({ id }) =>
      deleteApiKey({ id })
        .then(() => true)
        .catch(() => false),
    ),
  );
  return deleted.filter(Boolean).length;
};

/** Whether the mover reports that it holds this key for this library's side of the move. */
const moverHolds = async (move: string, keyId: string) => {
  try {
    const status = await moveStatus(move);
    return status.key === keyId;
  } catch {
    return false;
  }
};

/**
 * Makes this side's key for `move` and hands it over with `send`, which posts it to the mover. The key's secret lives
 * only inside this call. A 202 leaves the key with the mover; any other answer deletes it at once; no answer at all
 * deletes it unless the mover then reports that it holds it. The answer, or the error, goes back to the caller.
 */
export const handOverMoveKey = async <T>(
  side: MoveSide,
  move: string,
  send: (key: MoveKey) => Promise<T>,
): Promise<T> => {
  const created = await createApiKey({
    apiKeyCreateDto: { name: MOVE_KEY_NAME, permissions: [...permissionsFor(side)] },
  });
  try {
    return await send({ id: created.id, secret: created.secret });
  } catch (error) {
    if (!unanswered(error) || !(await moverHolds(move, created.id))) {
      await deleteApiKey({ id: created.id }).catch(() => undefined);
    }
    throw error;
  }
};
