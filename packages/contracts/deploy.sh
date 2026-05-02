#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy Rivus StreamManager to Stellar Testnet
# Usage: ./deploy.sh
# =============================================================================
set -euo pipefail

command -v stellar >/dev/null 2>&1 || {
  echo "[ERROR] Stellar CLI not found."
  echo "  cargo install --locked stellar-cli --features opt"
  exit 1
}

NETWORK="testnet"
WASM_PATH="target/wasm32-unknown-unknown/release/stream_manager.optimized.wasm"
SOURCE_ACCOUNT="deployer"

echo "[1/3] Building..."
stellar contract build
stellar contract optimize --wasm "target/wasm32-unknown-unknown/release/stream_manager.wasm"

echo "[2/3] Uploading WASM..."
WASM_HASH=$(stellar contract upload \
  --network "$NETWORK" \
  --source "$SOURCE_ACCOUNT" \
  --wasm "$WASM_PATH")
echo "WASM Hash: $WASM_HASH"

echo "[3/3] Deploying..."
CONTRACT_ID=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$SOURCE_ACCOUNT" \
  --wasm-hash "$WASM_HASH")
echo "Contract ID: $CONTRACT_ID"

echo ""
echo "======================================================"
echo " Rivus StreamManager deployed!"
echo " Contract ID: $CONTRACT_ID"
echo "======================================================"
echo ""
echo "Add to packages/sdk/.env and packages/indexer/.env:"
echo "  STREAM_MANAGER_CONTRACT_ID=$CONTRACT_ID"