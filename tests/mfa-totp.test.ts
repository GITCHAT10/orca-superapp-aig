import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeBase32, findTotpStep, newMfaSecret, sealMfaSecret,
  totpForStep, unsealMfaSecret,
} from "../src/mfa.js";

test("RFC6238 SHA-1 six-digit standard vectors and anti-replay step control",()=>{
  const testSecret=Buffer.from("12345678901234567890","ascii");
  assert.equal(encodeBase32(testSecret),"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(totpForStep(testSecret,1),"287082"); // RFC 6238 time=59s
  assert.equal(totpForStep(testSecret,37037036),"081804"); // time=1111111109s
  const code=totpForStep(testSecret,1000);
  assert.equal(findTotpStep(testSecret,code,-1,1000*30000),1000);
  assert.equal(findTotpStep(testSecret,code,1000,1000*30000),null);
  assert.equal(findTotpStep(testSecret,"not-otp",-1,1000*30000),null);
  assert.equal(findTotpStep(testSecret,code,-1,1005*30000),null);
});

test("TOTP secrets are AES-GCM sealed to tenant and user identities",()=>{
  process.env.OCEAN_MFA_KEY_HEX="abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const secret=newMfaSecret();
  const tenant="a0b0c0d0-1111-2222-3333-444455556666";
  const user="ffffeeee-dddd-cccc-bbbb-aaaabbbbcccc";
  const sealed=sealMfaSecret(secret,tenant,user);
  assert.notEqual(sealed.ciphertext.toString("hex"),secret.toString("hex"));
  assert.deepEqual(unsealMfaSecret(sealed,tenant,user),secret);
  assert.throws(()=>unsealMfaSecret(sealed,tenant,"different-user"));
  assert.throws(()=>unsealMfaSecret(sealed,"different-tenant",user));
  const changed={...sealed,ciphertext:Buffer.from(sealed.ciphertext)};
  changed.ciphertext[0]=changed.ciphertext[0]!^1;
  assert.throws(()=>unsealMfaSecret(changed,tenant,user));
});
