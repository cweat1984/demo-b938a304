// SANITIZED BACKUP COPY: the original throwaway dev keypair (wrapped with the owner PIN) was removed so the PIN
// cannot be brute-forced from this archive. Regenerate a fresh dev keypair wrapped with a SYNTHETIC test PIN before
// running guest-pass E2E tests locally. Same shape as the original so the app still type-checks and builds.
export const DEV_GUEST_KEYS: { pub: JsonWebKey; wrap: { s: string; iv: string; it: number; ct: string }; allKey: string } = {"pub":{"key_ops":["verify"],"ext":true,"kty":"EC","x":"","y":"","crv":"P-256"},"wrap":{"s":"","iv":"","it":600000,"ct":""},"allKey":""}
