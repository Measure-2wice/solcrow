#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8899}"
API_URL="${API_URL:-http://localhost:3000}"
KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"

MAKER="${MAKER:-$(solana address -k "$KEYPAIR")}"
# Use a fresh seed by default; callers may set SEED to a specific u64 value.
SEED="${SEED:-$(date +%s)$$}"
if [[ ! "$SEED" =~ ^(0|[1-9][0-9]*)$ ]]; then
  echo "SEED must be a non-negative decimal integer" >&2
  exit 1
fi
RESPONSE_FILE="${RESPONSE_FILE:-$(pwd)/make-response.json}"

# Build v3 bytecode because the localhost validator has SBPF v3 enabled.
NO_DNA=1 anchor build --arch v3
solana program deploy ./target/deploy/anchor_escrow.so --url "$RPC_URL"

# Reuse the configured mint when it exists, otherwise create a fresh one.
if [[ -z "${MINT:-}" ]] || ! solana account "$MINT" --url "$RPC_URL" >/dev/null 2>&1; then
  MINT=$(spl-token create-token \
    --url "$RPC_URL" \
    --fee-payer "$KEYPAIR" | awk '/^Address:/ {print $2}')
  echo "Created mint: $MINT"
fi

# The make instruction requires the maker's associated token account to exist.
spl-token create-account "$MINT" \
  --owner "$MAKER" \
  --url "$RPC_URL" \
  --fee-payer "$KEYPAIR" >/dev/null 2>&1 || true

MAKER_ATA=$(spl-token accounts --owner "$MAKER" --url "$RPC_URL" --verbose \
  | awk -v mint="$MINT" '$2 == mint {print $3; exit}')
if [[ -z "$MAKER_ATA" ]]; then
  echo "Failed to locate the maker's associated token account for $MINT" >&2
  exit 1
fi

# Ensure the maker has enough tokens available for this escrow (1 token at 9 decimals).
spl-token mint "$MINT" 10 "$MAKER_ATA" \
  --url "$RPC_URL" \
  --fee-payer "$KEYPAIR"

# The API builds but does not sign or submit the transaction.
curl --fail --silent --show-error \
  --output "$RESPONSE_FILE" \
  --write-out 'API response: HTTP %{http_code}\n' \
  -X POST "$API_URL/escrows/make/transaction" \
  -H 'Content-Type: application/json' \
  -d "{
    \"maker\": \"$MAKER\",
    \"mint\": \"$MINT\",
    \"seed\": \"$SEED\",
    \"amount\": \"1000000000\"
  }"

# Simulates, signs with id.json, submits, and confirms the transaction.
node submit-make.mjs "$RESPONSE_FILE"
