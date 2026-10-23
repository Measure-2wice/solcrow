// submit-make.mjs
import { readFileSync } from "node:fs";
import { Connection, Keypair, Transaction } from "@solana/web3.js";

const response = JSON.parse(readFileSync("make-response.json", "utf8"));
const secret = Uint8Array.from(
  JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf8")),
);
const maker = Keypair.fromSecretKey(secret);

if (maker.publicKey.toBase58() !== "4SusPAMEFc2Dom75zPqzNhf3XAQYeJCYXw1Fd1TMENkK") {
  throw new Error("Configured keypair is not the requested maker");
}

const connection = new Connection("http://localhost:8899", "confirmed");
const transaction = Transaction.from(
  Buffer.from(response.transaction, "base64"),
);

// Use one fresh blockhash for both submission and confirmation.
const latest = await connection.getLatestBlockhash("confirmed");
transaction.recentBlockhash = latest.blockhash;
transaction.lastValidBlockHeight = latest.lastValidBlockHeight;

const simulation = await connection.simulateTransaction(transaction);
if (simulation.value.err) {
  throw new Error(JSON.stringify({
    error: simulation.value.err,
    logs: simulation.value.logs,
  }));
}

transaction.sign(maker);

const signature = await connection.sendRawTransaction(transaction.serialize());
const confirmation = await connection.confirmTransaction({
  signature,
  blockhash: latest.blockhash,
  lastValidBlockHeight: latest.lastValidBlockHeight,
}, "confirmed");

if (confirmation.value.err) {
  throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
}

console.log(`Confirmed: ${signature}`);
