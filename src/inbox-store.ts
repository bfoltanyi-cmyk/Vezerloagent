// A cég postafiókjából kinyert levelek titkosított tárolója (state/inbox.enc.json).
// A repó nyilvános, ezért ügyféladat csak titkosítva kerülhet bele: AES-256-GCM, a kulcs
// a tulajdonos jelmondatából (INBOX_PASSPHRASE titok) PBKDF2-vel. A vezérlőterem ugyanezzel
// a jelmondattal, a böngészőben fejti vissza.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const INBOX_FILE = "state/inbox.enc.json";
const ITERATIONS = 210_000;

export type EmailCategory = "ajanlatkeres" | "megrendeles" | "tamogatas" | "markazas" | "penzugy" | "jogi" | "partner" | "hirlevel" | "egyeb";

export interface InboxItem {
  id: string;
  uid: number;
  receivedAt: string;
  from: string;
  fromName: string;
  subject: string;
  category: EmailCategory;
  urgency: "magas" | "kozepes" | "alacsony";
  summary: string;
  company: string;
  contactName: string;
  phone: string;
  deadline: string;
  amounts: string[];
  products: string[];
  actions: string[];
  needsReply: boolean;
  attachments: string[];
  excerpt: string;
  taskId?: string;
}

export interface Inbox {
  lastUid: number;
  uidValidity?: string;
  next: number;
  items: InboxItem[];
}

export const emptyInbox = (): Inbox => ({ lastUid: 0, next: 1, items: [] });

interface Sealed {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

const keyCache = new Map<string, Buffer>();
function key(passphrase: string, salt: Buffer, iterations: number): Buffer {
  const k = `${crypto.createHash("sha256").update(passphrase).digest("base64")}:${salt.toString("base64")}:${iterations}`;
  let v = keyCache.get(k);
  if (!v) {
    v = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, "sha256");
    keyCache.set(k, v);
  }
  return v;
}

export function seal(obj: unknown, passphrase: string): Sealed {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(passphrase, salt, ITERATIONS), iv);
  // A WebCrypto a hitelesítő címkét a titkosított adat végén várja.
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: salt.toString("base64"), iv: iv.toString("base64"), data: data.toString("base64") };
}

export function open<T>(sealed: Sealed, passphrase: string): T {
  const salt = Buffer.from(sealed.salt, "base64");
  const raw = Buffer.from(sealed.data, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(passphrase, salt, sealed.iterations), Buffer.from(sealed.iv, "base64"));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8")) as T;
}

export function loadInbox(root: string, passphrase: string): Inbox {
  const f = path.join(root, INBOX_FILE);
  if (!fs.existsSync(f)) return emptyInbox();
  return open<Inbox>(JSON.parse(fs.readFileSync(f, "utf8")) as Sealed, passphrase);
}

export function saveInbox(root: string, inbox: Inbox, passphrase: string): void {
  const f = path.join(root, INBOX_FILE);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(seal(inbox, passphrase)) + "\n");
}

/** Egy levél az agenteknek: csak a feladatban hivatkozott levél, vagy vezetőnek bármelyik. */
export function readEmailFor(root: string, id: string, passphrase: string | undefined): string {
  if (!passphrase) throw new Error("A postafiók nincs beállítva (INBOX_PASSPHRASE).");
  const item = loadInbox(root, passphrase).items.find((x) => x.id === id);
  if (!item) throw new Error(`Nincs ilyen levél: ${id}`);
  return JSON.stringify(item, null, 2);
}
