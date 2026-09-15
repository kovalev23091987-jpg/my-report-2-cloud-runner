import fs from "node:fs";
import crypto from "node:crypto";
const [,,mode,input,keyHex,output]=process.argv;
if(!["encrypt","decrypt"].includes(mode)||!input||!keyHex||!output){console.error("usage: payload-crypto.mjs encrypt|decrypt INPUT 64HEXKEY OUTPUT");process.exit(2);}
if(!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("KEY_MUST_BE_32_BYTES_HEX");
const key=Buffer.from(keyHex,"hex"),MAGIC=Buffer.from("R2G4");
if(mode==="encrypt"){const plaintext=fs.readFileSync(input),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(MAGIC);const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]),tag=cipher.getAuthTag();fs.writeFileSync(output,Buffer.concat([MAGIC,iv,tag,ciphertext]));}
else{const blob=fs.readFileSync(input);if(blob.length<32||!blob.subarray(0,4).equals(MAGIC))throw new Error("INVALID_PAYLOAD_MAGIC");const iv=blob.subarray(4,16),tag=blob.subarray(16,32),ciphertext=blob.subarray(32),decipher=crypto.createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(MAGIC);decipher.setAuthTag(tag);fs.writeFileSync(output,Buffer.concat([decipher.update(ciphertext),decipher.final()]));}
