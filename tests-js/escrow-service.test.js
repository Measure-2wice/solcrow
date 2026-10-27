import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import test from "node:test";
import { createServer } from "node:http";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createApp } from "../src/app.js";
import {
  deriveAssociatedTokenAddress,
  deriveEscrowAddress,
  EscrowService,
  HttpError,
  parseU64,
} from "../src/escrow-service.js";

const maker = new PublicKey("11111111111111111111111111111111");
const mint = new PublicKey("So11111111111111111111111111111111111111112");
const tokenProgram = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const programId = new PublicKey("38es8xcEeKMcwoGjG8iapa5JN7rs9zCCGKLRtUo9uKmS");
const idl = JSON.parse(readFileSync(new URL("../idls/anchor_escrow.json", import.meta.url), "utf8"));
const blockhash = PublicKey.default.toBase58();

test("parseU64 accepts decimal strings without unsafe number coercion", () => {
  assert.equal(parseU64("18446744073709551615", "seed"), 18446744073709551615n);
  assert.equal(parseU64(42, "seed"), 42n);
});

test("parseU64 rejects malformed and out-of-range values", () => {
  for (const value of ["-1", "1.5", "01", "1e3", 9007199254740992, "18446744073709551616"]) {
    assert.throws(() => parseU64(value, "seed"), { status: 400 });
  }
});

test("PDA derivation is stable and associated accounts include the token program", () => {
  assert.equal(
    deriveEscrowAddress(maker, "42").toBase58(),
    deriveEscrowAddress(maker, 42).toBase58(),
  );
  assert.notEqual(
    deriveEscrowAddress(maker, "42").toBase58(),
    deriveEscrowAddress(maker, "43").toBase58(),
  );
  assert.equal(
    deriveAssociatedTokenAddress(maker, mint, tokenProgram).toBase58(),
    deriveAssociatedTokenAddress(maker, mint, tokenProgram).toBase58(),
  );
});

test("service builds unsigned make, take, and refund transactions from escrow state", async () => {
  const seed = 42n;
  const escrowAddress = deriveEscrowAddress(maker, seed.toString());
  const escrowData = Buffer.alloc(82);
  escrowData[0] = idl.accounts[0].discriminator[0];
  escrowData.writeBigUInt64LE(seed, 1);
  maker.toBuffer().copy(escrowData, 9);
  mint.toBuffer().copy(escrowData, 41);
  escrowData.writeBigUInt64LE(1_000_000n, 73);
  escrowData[81] = 255;

  const mintData = Buffer.alloc(82);
  mintData[45] = 1;
  const connection = new Connection("http://127.0.0.1:8899");
  connection.getAccountInfo = async (address) => {
    if (address.equals(escrowAddress)) {
      return { owner: programId, data: escrowData };
    }
    if (address.equals(mint)) {
      return { owner: tokenProgram, data: mintData };
    }
    return null;
  };
  connection.getLatestBlockhash = async () => ({ blockhash, lastValidBlockHeight: 999 });
  const service = new EscrowService(connection);

  const make = await service.buildMakeTransaction({
    maker: maker.toBase58(),
    mint: mint.toBase58(),
    seed: "7",
    amount: "1000000",
  });
  let makeTransaction = Transaction.from(Buffer.from(make.transaction, "base64"));
  const makeData = Buffer.isBuffer(makeTransaction.instructions[0].data) ? makeTransaction.instructions[0].data : Buffer.from(makeTransaction.instructions[0].data);
  assert.equal(make.transactionVersion, "legacy");
  assert.equal(make.lastValidBlockHeight, 999);
  assert.equal(makeTransaction.feePayer.toBase58(), maker.toBase58());
  assert.deepEqual(
    [...makeData.subarray(0, 8)],
    idl.instructions.find(({ name }) => name === "make").discriminator,
  );
  assert.equal(makeData.readBigUInt64LE(8), 7n);
  assert.equal(makeData.readBigUInt64LE(16), 1_000_000n);
  assert.equal(makeTransaction.instructions[0].keys.length, 8);

  const take = await service.buildTakeTransaction({
    maker: maker.toBase58(),
    taker: maker.toBase58(),
    seed: seed.toString(),
  });
  let takeTransaction = Transaction.from(Buffer.from(take.transaction, "base64"));
  const takeData = Buffer.isBuffer(takeTransaction.instructions[0].data) ? takeTransaction.instructions[0].data : Buffer.from(takeTransaction.instructions[0].data);
  assert.equal(takeTransaction.instructions[0].keys.length, 9);
  assert.deepEqual(
    [...takeData],
    idl.instructions.find(({ name }) => name === "take").discriminator,
  );

  const refund = await service.buildRefundTransaction({
    maker: maker.toBase58(),
    seed: seed.toString(),
  });
  let refundTransaction = Transaction.from(Buffer.from(refund.transaction, "base64"));
  const refundData = Buffer.isBuffer(refundTransaction.instructions[0].data) ? refundTransaction.instructions[0].data : Buffer.from(refundTransaction.instructions[0].data);
  assert.equal(refundTransaction.instructions[0].keys.length, 8);
  assert.deepEqual(
    [...refundData],
    idl.instructions.find(({ name }) => name === "refund").discriminator,
  );

  const escrow = await service.getEscrow({ maker: maker.toBase58(), seed: seed.toString() });
  assert.equal(escrow.address, escrowAddress.toBase58());
  assert.equal(escrow.amount, "1000000");
  assert.equal(escrow.mint, mint.toBase58());
  assert.equal(escrow.vault, deriveAssociatedTokenAddress(escrowAddress, mint, tokenProgram).toBase58());
});

test("REST API returns health and maps service errors to HTTP responses", async (context) => {
  const app = createApp({
    getEscrow: async () => {
      throw new HttpError(404, "Escrow was not found");
    },
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const url = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${url}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const missing = await fetch(`${url}/escrows/${maker.toBase58()}/42`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Escrow was not found" });
});
