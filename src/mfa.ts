import {
  createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual,
} from "node:crypto";

function mfaKey(): Buffer {
  const raw=process.env.OCEAN_MFA_KEY_HEX??"";
  if(!/^[a-fA-F0-9]{64}$/.test(raw))throw new Error("MFA encryption key is not configured");
  return Buffer.from(raw,"hex");
}
function aad(tenantId:string,userId:string):Buffer {
  return Buffer.from(`OCEAN:MFA:${tenantId}:${userId}`,"utf8");
}
export function newMfaSecret():Buffer {return randomBytes(20);}
export function sealMfaSecret(secret:Buffer,tenantId:string,userId:string) {
  const nonce=randomBytes(12), cipher=createCipheriv("aes-256-gcm",mfaKey(),nonce);
  cipher.setAAD(aad(tenantId,userId));
  const ciphertext=Buffer.concat([cipher.update(secret),cipher.final()]);
  return {ciphertext,nonce,tag:cipher.getAuthTag()};
}
export function unsealMfaSecret(
  value:{ciphertext:Buffer;nonce:Buffer;tag:Buffer},tenantId:string,userId:string,
):Buffer {
  const decipher=createDecipheriv("aes-256-gcm",mfaKey(),value.nonce);
  decipher.setAAD(aad(tenantId,userId));
  decipher.setAuthTag(value.tag);
  return Buffer.concat([decipher.update(value.ciphertext),decipher.final()]);
}
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(data:Buffer):string {
  let acc=0,bits=0,out="";
  for(const byte of data){
    acc=(acc<<8)|byte;bits+=8;
    while(bits>=5){bits-=5;out+=alphabet[(acc>>>bits)&31];}
    acc&=(1<<bits)-1;
  }
  if(bits>0)out+=alphabet[(acc<<(5-bits))&31];
  return out;
}
export function totpForStep(secret:Buffer,step:number):string {
  if(!Number.isSafeInteger(step)||step<0)throw new Error("Invalid TOTP time-step");
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest=createHmac("sha1",secret).update(counter).digest();
  const offset=digest[digest.length-1]!&15;
  const num=((digest[offset]!&127)<<24)|(digest[offset+1]!<<16)|
    (digest[offset+2]!<<8)|digest[offset+3]!;
  return String((num>>>0)%1_000_000).padStart(6,"0");
}
export function findTotpStep(
  secret:Buffer,
  otp:string,
  lastUsedStep:number,
  now=Date.now(),
):number|null {
  if(!/^\d{6}$/.test(otp))return null;
  const current=Math.floor(now/30_000);
  // RFC 6238 standard 30s period, +/- one step for clock drift.
  for(const step of [current-1,current,current+1]){
    if(step<0||step<=lastUsedStep)continue;
    const expect=Buffer.from(totpForStep(secret,step),"ascii");
    if(timingSafeEqual(expect,Buffer.from(otp,"ascii")))return step;
  }
  return null;
}
export function provisioningUri(secret:Buffer,email:string):string {
  const label=encodeURIComponent(`OCEAN CLOUD:${email}`);
  return `otpauth://totp/${label}?secret=${encodeBase32(secret)}&issuer=OCEAN%20CLOUD&algorithm=SHA1&digits=6&period=30`;
}
