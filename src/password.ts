import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(32).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: hash.toString("hex") };
}
export async function verifyPassword(password: string, salt: string, hexHash: string) {
  const expected = Buffer.from(hexHash, "hex");
  if (expected.length !== 64) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(expected, actual);
}
export function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}
