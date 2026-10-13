import {createHash, createHmac} from 'node:crypto';
export const artifactSHA = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function signGithubResult(body, key) {
  if (!/^[a-f0-9]{64}$/.test(key ?? '')) throw new Error('per-worker-signing-key-required');
  return {body, signature: createHmac('sha256', key).update(JSON.stringify(body)).digest('hex')};
}
