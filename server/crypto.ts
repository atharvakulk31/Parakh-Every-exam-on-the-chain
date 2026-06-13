import crypto from "node:crypto";
import { db } from "./db.js";

const KEY = process.env.ENCRYPTION_KEY
  ? crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY).digest()
  : crypto.randomBytes(32);

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ─── SHA-256 hash chain ────────────────────────────────────────────────────

export interface ChainBlock {
  index: number;
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

const insertBlock = db.prepare(
  "INSERT INTO chain_blocks (idx, timestamp, event, data, prevHash, hash) VALUES (?, ?, ?, ?, ?, ?)"
);
const updateBlockData = db.prepare("UPDATE chain_blocks SET data = ? WHERE idx = ?");

// In-memory cache for performance — loaded once from DB on startup
const chain: ChainBlock[] = (db.prepare("SELECT * FROM chain_blocks ORDER BY idx").all() as any[]).map((r) => ({
  index: r.idx,
  timestamp: r.timestamp,
  event: r.event,
  data: JSON.parse(r.data) as Record<string, unknown>,
  prevHash: r.prevHash,
  hash: r.hash,
}));

function blockHash(b: Omit<ChainBlock, "hash">): string {
  return sha256(`${b.index}|${b.timestamp}|${b.event}|${JSON.stringify(b.data)}|${b.prevHash}`);
}

export function appendBlock(event: string, data: Record<string, unknown>): ChainBlock {
  const prev = chain[chain.length - 1];
  const partial = {
    index: chain.length,
    timestamp: new Date().toISOString(),
    event,
    data,
    prevHash: prev ? prev.hash : "0".repeat(64),
  };
  const block: ChainBlock = { ...partial, hash: blockHash(partial) };
  insertBlock.run(block.index, block.timestamp, block.event, JSON.stringify(block.data), block.prevHash, block.hash);
  chain.push(block);
  return block;
}

export function getChain(): ChainBlock[] {
  return chain;
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  brokenAt: number | null;
  checkedAt: string;
}

export function verifyChain(): ChainVerification {
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    const expectedPrev = i === 0 ? "0".repeat(64) : chain[i - 1].hash;
    const { hash, ...rest } = b;
    if (b.prevHash !== expectedPrev || blockHash(rest) !== hash) {
      return { valid: false, length: chain.length, brokenAt: i, checkedAt: new Date().toISOString() };
    }
  }
  return { valid: true, length: chain.length, brokenAt: null, checkedAt: new Date().toISOString() };
}

// ─── Tamper demo ───────────────────────────────────────────────────────────

let tamperedBackup: { index: number; data: Record<string, unknown> } | null = null;

export function tamperDemo(): { tampered: boolean; index: number | null } {
  if (tamperedBackup || chain.length < 2) return { tampered: !!tamperedBackup, index: tamperedBackup?.index ?? null };
  const idx = 1;
  tamperedBackup = { index: idx, data: { ...chain[idx].data } };
  chain[idx].data = { ...chain[idx].data, note: "MALICIOUSLY ALTERED" };
  updateBlockData.run(JSON.stringify(chain[idx].data), idx);
  return { tampered: true, index: idx };
}

export function restoreDemo(): { restored: boolean } {
  if (!tamperedBackup) return { restored: false };
  chain[tamperedBackup.index].data = tamperedBackup.data;
  updateBlockData.run(JSON.stringify(tamperedBackup.data), tamperedBackup.index);
  tamperedBackup = null;
  return { restored: true };
}

// Genesis block on first boot
if (chain.length === 0) {
  appendBlock("genesis", { system: "Parakh", note: "chain initialized" });
}
