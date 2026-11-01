import test from "node:test";
import assert from "node:assert/strict";
import {
  validateHex,
  metadata,
  readBytes,
  validateJpeg,
} from "../src/validation.mjs";
import { capability, verifyCapability } from "../src/auth.mjs";
import worker from "../src/worker.mjs";
function record(address, type, data = []) {
  const values = [data.length, address >>> 8, address & 255, type, ...data];
  values.push(-values.reduce((a, b) => a + b, 0) & 255);
  return (
    ":" +
    values
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
function backup(size = 256 * 1024) {
  const lines = [];
  for (let offset = 0; offset < size; offset += 16) {
    if (offset % 65536 === 0) lines.push(record(0, 4, [8, offset / 65536]));
    lines.push(
      record(
        offset % 65536,
        0,
        new Array(Math.min(16, size - offset)).fill(255),
      ),
    );
  }
  lines.push(record(0, 1));
  return new TextEncoder().encode(lines.join("\n") + "\n");
}
test("accepts complete internal image and separately hashes file and decoded image", async () => {
  const file = backup();
  const result = await validateHex(file);
  assert.equal(result.decodedBytes, 256 * 1024);
  assert.match(result.hexFileSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(result.hexFileSha256, result.imageSha256);
});
test("rejects checksum corruption, missing EOF and incomplete image", async () => {
  const file = new TextDecoder().decode(backup());
  await assert.rejects(
    validateHex(new TextEncoder().encode(file.replace(/FF/, "FE"))),
  );
  await assert.rejects(
    validateHex(new TextEncoder().encode(file.replace(":00000001FF\n", ""))),
  );
  await assert.rejects(validateHex(backup(4096)));
});
test("rejects gaps, reordered records and extra data after EOF", async () => {
  const lines = new TextDecoder().decode(backup()).trim().split("\n");
  lines.splice(4, 1);
  await assert.rejects(validateHex(new TextEncoder().encode(lines.join("\n"))));
  await assert.rejects(
    validateHex(
      new TextEncoder().encode(
        new TextDecoder().decode(backup()) + record(0, 0, [0]),
      ),
    ),
  );
});
test("metadata accepts G473, H743 and custom models without capacity or target", () => {
  for (const mcu of ["STM32G473", "STM32H743", "APM32F405"]) {
    const value = metadata({
      brand: "A",
      model: "B",
      hardware: "未知",
      mcu,
      firmware: "4.5.5",
      note: "测试适用信息",
      shareConsent: true,
      experimentalConsent: true,
      capacity: "unsafe",
      target: "discard",
    });
    assert.equal(value.mcu, mcu);
    assert.equal(value.capacity, undefined);
    assert.equal(value.target, undefined);
  }
  assert.throws(() => metadata({}));
});
test("bounded reader rejects chunked bodies without content-length", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: new Uint8Array(11),
  });
  await assert.rejects(readBytes(request, 10));
});
test("upload capability cannot be used across submissions, roles or after expiry", async () => {
  const env = { SESSION_SECRET: "a".repeat(48) },
    id = "BK-1";
  const token = await capability(env, {
    id,
    role: "receipt",
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const request = new Request("https://example.test", {
    headers: { authorization: "Bearer " + token },
  });
  await verifyCapability(request, env, id, ["receipt"]);
  await assert.rejects(verifyCapability(request, env, "BK-2", ["receipt"]));
  await assert.rejects(verifyCapability(request, env, id, ["upload"]));
});
test("rejects SVG and pretend jpeg bytes", () => {
  assert.throws(() => validateJpeg(new TextEncoder().encode("<svg>")));
  assert.throws(() => validateJpeg(new Uint8Array(150)));
});
test("unknown origin and unauthenticated moderation cannot access storage", async () => {
  let touched = false;
  const env = {
    PUBLIC_ORIGIN: "https://backup.example.test",
    DB: {
      prepare() {
        touched = true;
        throw Error("unexpected");
      },
    },
  };
  const cross = await worker.fetch(
    new Request("https://backup.example.test/api/tickets", {
      method: "POST",
      headers: { origin: "https://evil.test" },
      body: "{}",
    }),
    env,
  );
  assert.equal(cross.status, 403);
  assert.equal(touched, false);
  const admin = await worker.fetch(
    new Request("https://backup.example.test/api/admin/submissions"),
    env,
  );
  assert.equal(admin.status, 401);
  assert.equal(touched, false);
});
