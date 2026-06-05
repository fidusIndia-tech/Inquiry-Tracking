import crypto from "crypto";

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");
  return `pbkdf2:${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  if (!storedHash.startsWith("pbkdf2:")) {
    return storedHash === password;
  }

  const [, iterations, salt, expectedHash] = storedHash.split(":");
  const actualHash = crypto
    .pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, DIGEST)
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}
