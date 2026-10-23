#!/usr/bin/env bash
set -euo pipefail

MAKER="4SusPAMEFc2Dom75zPqzNhf3XAQYeJCYXw1Fd1TMENkK"
MINT="EVuRe33XDTXnZraGPCZu3qZDiN73qVdE6NCaXnyzkE5o"
MAKER_ATA="ENR2NmGdpwnH3WRR86nttbJGg6ZFpHCyeuKZHrL3ejVT"
# Use a fresh seed by default; callers may set SEED to a specific u64 value.
SEED="${SEED:-$(date +%s)$$}"
if [[ ! "$SEED" =~ ^(0|[1-9][0-9]*)$ ]]; then
  echo "SEED must be a non-negative decimal integer" >&2
  exit 1
fi
RESPONSE_FILE="make-response.json"

# Build v3 bytecode because the localhost validator has SBPF v3 enabled.
NO_DNA=1 anchor build --arch v3
solana program deploy ./target/deploy/anchor_escrow.so --url localhost

# The make instruction requires the maker's associated token account to exist.
if ! solana account "$MAKER_ATA" --url localhost >/dev/null 2>&1; then
  spl-token create-account "$MINT" \
    --owner "$MAKER" \
    --url localhost \
    --fee-payer ~/.config/solana/id.json
fi

# Ensure the maker has one token available for this escrow.
spl-token mint "$MINT" 1 \
  --recipient-owner "$MAKER" \
  --url localhost \
  --fee-payer ~/.config/solana/id.json

# The API builds but does not sign or submit the transaction.
curl --fail --silent --show-error \
  --output "$RESPONSE_FILE" \
  --write-out 'API response: HTTP %{http_code}\n' \
  -X POST http://localhost:3000/escrows/make/transaction \
  -H 'Content-Type: application/json' \
  -d "{
    \"maker\": \"$MAKER\",
    \"mint\": \"$MINT\",
    \"seed\": \"$SEED\",
    \"amount\": \"1000000000\"
  }"

# Simulates, signs with id.json, submits, and confirms the transaction.
node submit-make.mjs
