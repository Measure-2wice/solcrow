import { readFileSync } from "node:fs";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

const idl = JSON.parse(readFileSync(new URL("../idls/anchor_escrow.json", import.meta.url), "utf8"));
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const U64_MAX = (1n << 64n) - 1n;
const ESCROW_ACCOUNT_SIZE = 82;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parseU64(value, fieldName) {
  if (typeof value === "bigint") {
    if (value < 0n || value > U64_MAX) {
      throw new HttpError(400, `${fieldName} is outside the u64 range`);
    }
    return value;
  }

  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : value;
  if (typeof text !== "string" || !/^(0|[1-9]\d*)$/.test(text)) {
    throw new HttpError(400, `${fieldName} must be a non-negative integer string`);
  }

  const parsed = BigInt(text);
  if (parsed > U64_MAX) {
    throw new HttpError(400, `${fieldName} exceeds the u64 limit`);
  }
  return parsed;
}

function publicKey(value, fieldName) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${fieldName} must be a base58 public key`);
  }
  try {
    const pk = new PublicKey(value);
    if (typeof pk.toBuffer !== "function" && typeof pk.toBytes === "function") {
      pk.toBuffer = function () {
        const bytes = this.toBytes();
        return Buffer.from(bytes);
      };
    }
    return pk;
  } catch {
    throw new HttpError(400, `${fieldName} must be a valid base58 public key`);
  }
}

function toBytes(pubkey) {
  if (typeof pubkey?.toBytes === "function") {
    return pubkey.toBytes();
  }
  if (typeof pubkey?.toBuffer === "function") {
    return pubkey.toBuffer();
  }
  return Buffer.from(pubkey);
}

function findProgramAddressSync(seeds, programId) {
  if (typeof PublicKey.findProgramAddressSync === "function") {
    return PublicKey.findProgramAddressSync(seeds, programId);
  }
  if (typeof PublicKey.createProgramAddressSync === "function") {
    for (let bump = 255; bump >= 0; bump -= 1) {
      try {
        const address = PublicKey.createProgramAddressSync([...seeds, Buffer.from([bump])], programId);
        return [address, bump];
      } catch {
        // try next bump
      }
    }
    throw new Error("Unable to find a viable program address");
  }
  throw new Error("No PDA derivation method available");
}

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { execFileSync } = require("node:child_process");

function computeProgramAddressSync(seeds, programId) {
  if (typeof PublicKey.findProgramAddressSync === "function") {
    return PublicKey.findProgramAddressSync(seeds, programId);
  }
  if (typeof PublicKey.createProgramAddressSync === "function") {
    for (let bump = 255; bump >= 0; bump -= 1) {
      try {
        const address = PublicKey.createProgramAddressSync([...seeds, Buffer.from([bump])], programId);
        return [address, bump];
      } catch {
        // try next bump
      }
    }
    throw new Error("Unable to find a viable program address");
  }
  const seedBuffers = seeds.map((s) => (Buffer.isBuffer(s) ? s : Buffer.from(s)));
  const programAddress = typeof programId === "string" ? programId : (programId.toBase58 ? programId.toBase58() : new PublicKey(programId).toBase58());
  try {
    // Use sync exec to call async function
    const { execFileSync } = require("node:child_process");
    const script = `
const {getProgramDerivedAddress}=require('@solana/addresses');
const {PublicKey}=require('@solana/web3.js');
const seeds=${JSON.stringify(seedBuffers.map(b=>Array.from(b)))};
const sb = seeds.map(a=>Buffer.from(a));
getProgramDerivedAddress({programAddress:${JSON.stringify(programAddress)},seeds:sb}).then(r=>{
  process.stdout.write(r[0]+'|'+r[1]);
}).catch(e=>{
  process.exit(1);
});
`;
    const out = execFileSync(process.execPath, ["-e", script], { encoding: "utf8" });
    const line = out.trim();
    if (line.includes("|")) {
      const [addr, bump] = line.split("|");
      return [new PublicKey(addr), parseInt(bump)];
    }
  } catch (e) {
    // fall through
  }
  try {
    const script2 = `
import('@solana/addresses').then(async m => {
  const {getProgramDerivedAddress}=m;
  const seeds=${JSON.stringify(seedBuffers.map(b=>Array.from(b)))};
  const sb = seeds.map(a=>new Uint8Array(a));
  const r = await getProgramDerivedAddress({programAddress:${JSON.stringify(programAddress)},seeds:sb});
  process.stdout.write(r[0]+'|'+r[1]);
}).catch(()=>process.exit(1));
`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script2], { encoding: "utf8" });
    const line = out.trim();
    if (line.includes("|")) {
      const [addr, bump] = line.split("|");
      return [new PublicKey(addr), parseInt(bump)];
    }
  } catch (e) {
    // fall through
  }
  throw new Error("Unable to find a viable program address");
}

export function deriveEscrowAddress(maker, seed, programId = new PublicKey(idl.address)) {
  const seedBytes = Buffer.alloc(8);
  seedBytes.writeBigUInt64LE(parseU64(seed, "seed"));
  try {
    const [address] = computeProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(toBytes(maker)), seedBytes],
      programId,
    );
    return address;
  } catch (err) {
    throw err;
  }
}

export function deriveAssociatedTokenAddress(owner, mint, tokenProgramId) {
  const [address] = computeProgramAddressSync(
    [Buffer.from(toBytes(owner)), Buffer.from(toBytes(tokenProgramId)), Buffer.from(toBytes(mint))],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

function instructionDiscriminator(name) {
  const instruction = idl.instructions.find((item) => item.name === name);
  if (!instruction) {
    throw new Error(`Instruction "${name}" is missing from the escrow IDL`);
  }
  return Buffer.from(instruction.discriminator);
}

function u64Bytes(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function escrowInstruction(name, keys, args = []) {
  return new TransactionInstruction({
    programId: new PublicKey(idl.address),
    keys,
    data: Buffer.concat([instructionDiscriminator(name), ...args]),
  });
}

function accountMeta(pubkey, isSigner = false, isWritable = false) {
  return { pubkey, isSigner, isWritable };
}

export class EscrowService {
  constructor(connection) {
    if (!(connection instanceof Connection)) {
      throw new TypeError("EscrowService requires a Solana web3.js Connection");
    }
    this.connection = connection;
    this.programId = new PublicKey(idl.address);
    // Support Kit RPC if available
    this.kitRpc = typeof globalThis !== "undefined" ? globalThis.__solanaKitRpc : undefined;
  }

  async #mintTokenProgram(mint) {
    const account = await this.connection.getAccountInfo(mint, "confirmed");
    if (!account) {
      throw new HttpError(404, "Mint account was not found");
    }
    if (!account.owner.equals(TOKEN_PROGRAM_ID) && !account.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new HttpError(400, "Mint is not owned by SPL Token or Token-2022");
    }
    if (account.data.length < 82 || account.data[45] !== 1) {
      throw new HttpError(400, "Mint account data is invalid or uninitialized");
    }
    return account.owner;
  }

  async #loadEscrow(maker, seed) {
    const escrowAddress = deriveEscrowAddress(maker, seed, this.programId);
    const account = await this.connection.getAccountInfo(escrowAddress, "confirmed");
    if (!account) {
      throw new HttpError(404, "Escrow was not found");
    }
    if (!account.owner.equals(this.programId)) {
      throw new HttpError(400, "Escrow account is not owned by this program");
    }
    const expectedDiscriminator = Buffer.from(idl.accounts[0].discriminator);
    if (account.data.length !== ESCROW_ACCOUNT_SIZE || !account.data.subarray(0, expectedDiscriminator.length).equals(expectedDiscriminator)) {
      throw new HttpError(400, "Escrow account data does not match the program IDL");
    }

    const data = account.data;
    const storedSeed = data.readBigUInt64LE(1);
    const storedMaker = new PublicKey(data.subarray(9, 41));
    if (storedSeed !== seed || !storedMaker.equals(maker)) {
      throw new HttpError(400, "Escrow account fields do not match its derived address");
    }
    return {
      address: escrowAddress,
      seed: storedSeed,
      maker: storedMaker,
      mint: new PublicKey(data.subarray(41, 73)),
      amount: data.readBigUInt64LE(73),
      bump: data[81],
    };
  }

  async #unsignedTransaction(instruction, feePayer, blockhash) {
    const transaction = new Transaction({
      feePayer,
      recentBlockhash: blockhash.blockhash,
    }).add(instruction);
    const serialized = await transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const buffer = Buffer.isBuffer(serialized) ? serialized : Buffer.from(serialized);
    return {
      transaction: buffer.toString("base64"),
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: Number(blockhash.lastValidBlockHeight),
      transactionVersion: "legacy",
    };
  }

  async #blockhash() {
    return this.connection.getLatestBlockhash("confirmed");
  }

  async getEscrow({ maker: makerInput, seed: seedInput }) {
    const maker = publicKey(makerInput, "maker");
    const seed = parseU64(seedInput, "seed");
    const escrow = await this.#loadEscrow(maker, seed);
    const tokenProgram = await this.#mintTokenProgram(escrow.mint);
    return {
      address: escrow.address.toBase58(),
      maker: escrow.maker.toBase58(),
      mint: escrow.mint.toBase58(),
      seed: escrow.seed.toString(),
      amount: escrow.amount.toString(),
      bump: escrow.bump,
      vault: deriveAssociatedTokenAddress(escrow.address, escrow.mint, tokenProgram).toBase58(),
      tokenProgram: tokenProgram.toBase58(),
    };
  }

  async buildMakeTransaction({ maker: makerInput, mint: mintInput, seed: seedInput, amount: amountInput }) {
    const maker = publicKey(makerInput, "maker");
    const mint = publicKey(mintInput, "mint");
    const seed = parseU64(seedInput, "seed");
    const amount = parseU64(amountInput, "amount");
    if (amount === 0n) {
      throw new HttpError(400, "amount must be greater than zero");
    }

    const escrow = deriveEscrowAddress(maker, seed, this.programId);
    if (await this.connection.getAccountInfo(escrow, "confirmed")) {
      throw new HttpError(409, "An escrow already exists for this maker and seed");
    }

    const tokenProgram = await this.#mintTokenProgram(mint);
    const instruction = escrowInstruction("make", [
      accountMeta(maker, true, true),
      accountMeta(escrow, false, true),
      accountMeta(mint),
      accountMeta(deriveAssociatedTokenAddress(maker, mint, tokenProgram), false, true),
      accountMeta(deriveAssociatedTokenAddress(escrow, mint, tokenProgram), false, true),
      accountMeta(ASSOCIATED_TOKEN_PROGRAM_ID),
      accountMeta(tokenProgram),
      accountMeta(SystemProgram.programId),
    ], [u64Bytes(seed), u64Bytes(amount)]);

    return this.#unsignedTransaction(instruction, maker, await this.#blockhash());
  }

  async buildTakeTransaction({ maker: makerInput, taker: takerInput, seed: seedInput }) {
    const maker = publicKey(makerInput, "maker");
    const taker = publicKey(takerInput, "taker");
    const seed = parseU64(seedInput, "seed");
    const escrow = await this.#loadEscrow(maker, seed);
    const tokenProgram = await this.#mintTokenProgram(escrow.mint);
    const instruction = escrowInstruction("take", [
      accountMeta(taker, true, true),
      accountMeta(maker, false, true),
      accountMeta(escrow.address, false, true),
      accountMeta(escrow.mint),
      accountMeta(deriveAssociatedTokenAddress(escrow.address, escrow.mint, tokenProgram), false, true),
      accountMeta(deriveAssociatedTokenAddress(taker, escrow.mint, tokenProgram), false, true),
      accountMeta(ASSOCIATED_TOKEN_PROGRAM_ID),
      accountMeta(tokenProgram),
      accountMeta(SystemProgram.programId),
    ]);
    return this.#unsignedTransaction(instruction, taker, await this.#blockhash());
  }

  async buildRefundTransaction({ maker: makerInput, seed: seedInput }) {
    const maker = publicKey(makerInput, "maker");
    const seed = parseU64(seedInput, "seed");
    const escrow = await this.#loadEscrow(maker, seed);
    const tokenProgram = await this.#mintTokenProgram(escrow.mint);
    const instruction = escrowInstruction("refund", [
      accountMeta(maker, true, true),
      accountMeta(escrow.address, false, true),
      accountMeta(escrow.mint),
      accountMeta(deriveAssociatedTokenAddress(escrow.address, escrow.mint, tokenProgram), false, true),
      accountMeta(deriveAssociatedTokenAddress(maker, escrow.mint, tokenProgram), false, true),
      accountMeta(ASSOCIATED_TOKEN_PROGRAM_ID),
      accountMeta(tokenProgram),
      accountMeta(SystemProgram.programId),
    ]);
    return this.#unsignedTransaction(instruction, maker, await this.#blockhash());
  }
}
