import { Connection } from "@solana/web3.js";
import * as kit from "@solana/kit";
import { createSolanaRpc } from "@solana/rpc";
import { createApp } from "./app.js";
import { EscrowService } from "./escrow-service.js";

const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl) {
  throw new Error("SOLANA_RPC_URL must be set explicitly");
}

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const connection = new Connection(rpcUrl, "confirmed");
const rpc = createSolanaRpc(rpcUrl);
// Expose kit RPC for compatibility
globalThis.__solanaKitRpc = rpc;
const app = createApp(new EscrowService(connection));
const server = app.listen(port, () => {
  console.log(`Escrow API listening on port ${port}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error("Failed to shut down the Escrow API cleanly", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
