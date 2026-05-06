import crypto from 'node:crypto';

// Friendly = no zero/oh/one/lowercase-L/uppercase-i to avoid lookalike
// confusion when the user reads the password from a WhatsApp message
// or prints it on paper.
export const FRIENDLY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generate a cryptographically random password from a "friendly" alphabet
 * (no lookalike characters). Default length is 12.
 *
 * Throws if length is below the system's 8-char minimum.
 */
export function randomFriendlyPassword(length = 12): string {
  if (length < 8) {
    throw new Error(`Password length must be at least 8 (got ${length})`);
  }
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += FRIENDLY_ALPHABET[bytes[i] % FRIENDLY_ALPHABET.length];
  }
  return out;
}
