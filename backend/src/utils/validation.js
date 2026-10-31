/**
 * Input checks shared by the auth controller and the User model.
 */

/** Longest address the mail standards allow. */
export const MAX_EMAIL_LENGTH = 254;

/** bcrypt only reads the first 72 bytes, so longer passwords add nothing. */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * name@domain.tld, with a top-level domain of two or more characters. The
 * character classes never overlap at a boundary (@ and . split the parts), so
 * matching takes linear time. The previous pattern nested quantifiers and
 * could block the server for seconds on a crafted 30-character input.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export const isValidEmail = (value) =>
  typeof value === "string" &&
  value.length <= MAX_EMAIL_LENGTH &&
  EMAIL_PATTERN.test(value);
