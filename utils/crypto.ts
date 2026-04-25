import * as nacl from "tweetnacl";
import * as Crypto from "expo-crypto";

// tweetnacl has no built-in PRNG in React Native — wire it up to expo-crypto
nacl.setPRNG((output, length) => {
  const bytes = Crypto.getRandomBytes(length);
  for (let i = 0; i < length; i++) {
    output[i] = bytes[i];
  }
});

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.sign.keyPair();
}

export function signChallenge(challengeBytes: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(challengeBytes, secretKey);
}

export async function generateChallenge(): Promise<Uint8Array> {
  return await Crypto.getRandomBytesAsync(32);
}
