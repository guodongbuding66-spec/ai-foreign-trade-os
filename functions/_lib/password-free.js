const encoder = new TextEncoder();

export const PASSWORD_ALGORITHM = 'PBKDF2-SHA256-PEPPERED-v1';
export const PASSWORD_ITERATIONS = 30000;

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function pepperedInput(password, pepper) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(String(pepper)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`aftos-password-v1:${password}`)
  ));
}

async function constantTimeEqual(a, b) {
  const aa = encoder.encode(String(a));
  const bb = encoder.encode(String(b));
  if (aa.length !== bb.length) return false;
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(aa, bb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export async function hashPasswordForFreePlan(password, pepper, saltValue = null, iterations = PASSWORD_ITERATIONS) {
  if (!pepper) throw new Error('PASSWORD_PEPPER_MISSING');
  const salt = saltValue ? fromBase64Url(saltValue) : randomBytes(16);
  const input = await pepperedInput(password, pepper);
  const baseKey = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256
  );
  return {
    hash: toBase64Url(new Uint8Array(bits)),
    salt: toBase64Url(salt),
    iterations,
    algorithm: PASSWORD_ALGORITHM
  };
}

export async function verifyPasswordForFreePlan(password, credential, pepper) {
  if (!credential || credential.password_algorithm !== PASSWORD_ALGORITHM) return false;
  const derived = await hashPasswordForFreePlan(
    password, pepper, credential.password_salt, Number(credential.password_iterations)
  );
  return constantTimeEqual(derived.hash, credential.password_hash);
}
