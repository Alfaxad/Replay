import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const WALLET_PATH = path.join(REPO_ROOT, ".solana/devnet-wallet.json");
const STATE_PATH = path.join(REPO_ROOT, ".solana/txline-devnet.json");
const IDL_PATH = path.join(SCRIPT_DIR, "idl/txoracle.json");

const RPC_URL = "https://api.devnet.solana.com";
const API_ORIGIN = "https://txline-dev.txodds.com";
const PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TOKEN_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readState() {
  return fs.existsSync(STATE_PATH) ? readJson(STATE_PATH) : {};
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(STATE_PATH, 0o600);
}

function numeric(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value.toNumber === "function") return value.toNumber();
  return Number(value?.toString?.() ?? value);
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  }

  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

async function main() {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error(`Missing devnet wallet at ${WALLET_PATH}`);
  }

  const walletBytes = Uint8Array.from(readJson(WALLET_PATH));
  const payer = Keypair.fromSecretKey(walletBytes);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const idl = readJson(IDL_PATH);
  const program = new anchor.Program(idl, provider);

  if (!program.programId.equals(PROGRAM_ID)) {
    throw new Error(`IDL program mismatch: ${program.programId.toBase58()}`);
  }

  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  console.log("Local devnet wallet loaded.");
  console.log(`Devnet balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  console.log(`TxLINE program: ${program.programId.toBase58()}`);

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  const pricingMatrix = await program.account.pricingMatrix.fetch(pricingMatrixPda);
  const selectedRow = pricingMatrix.rows.find(
    (row) => numeric(row.rowId) === SERVICE_LEVEL_ID,
  );

  if (!selectedRow) {
    throw new Error(`Service level ${SERVICE_LEVEL_ID} is not present on devnet`);
  }

  const pricePerWeek = numeric(selectedRow.pricePerWeekToken);
  const samplingIntervalSec = numeric(selectedRow.samplingIntervalSec);
  console.log(
    `Verified service level ${SERVICE_LEVEL_ID}: price/week=${pricePerWeek} TxL units, sampling=${samplingIntervalSec}s`,
  );

  if (pricePerWeek !== 0) {
    throw new Error("Refusing subscription because the selected devnet tier is not free");
  }

  const userTokenAccount = getAssociatedTokenAddressSync(
    TOKEN_MINT,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  let state = readState();
  const replaceConsumedActivation = process.argv.includes("--replace-consumed-activation");
  if (replaceConsumedActivation && state.subscriptionTx && !state.apiToken) {
    state = {
      ...state,
      previousSubscriptionTxs: [
        ...(state.previousSubscriptionTxs ?? []),
        {
          txSig: state.subscriptionTx,
          subscribedAt: state.subscribedAt,
          note: "Activation succeeded but the plaintext token was not persisted",
        },
      ],
    };
    delete state.subscriptionTx;
    delete state.subscribedAt;
    writeState(state);
    console.log("Archived the consumed activation transaction; creating a replacement subscription");
  }
  if (!state.associatedTokenAccountTx) {
    const tokenAccountInfo = await connection.getAccountInfo(userTokenAccount, "confirmed");
    if (!tokenAccountInfo) {
      const createAccountTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          userTokenAccount,
          payer.publicKey,
          TOKEN_MINT,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
      const signature = await sendAndConfirmTransaction(
        connection,
        createAccountTransaction,
        [payer],
        { commitment: "confirmed" },
      );
      console.log("Created Token-2022 account.");
      state = { ...state, associatedTokenAccountTx: signature };
      writeState(state);
    }
  }

  if (!state.subscriptionTx) {
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_treasury_v2")],
      program.programId,
    );
    const tokenTreasuryVault = getAssociatedTokenAddressSync(
      TOKEN_MINT,
      tokenTreasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    console.log(
      `Submitting free subscription: level=${SERVICE_LEVEL_ID}, weeks=${DURATION_WEEKS}, leagues=[]`,
    );
    const signature = await program.methods
      .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
      .accounts({
        user: payer.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: TOKEN_MINT,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Subscription confirmed.");
    state = {
      ...state,
      network: "devnet",
      wallet: payer.publicKey.toBase58(),
      serviceLevelId: SERVICE_LEVEL_ID,
      durationWeeks: DURATION_WEEKS,
      selectedLeagues: SELECTED_LEAGUES,
      subscriptionTx: signature,
      subscribedAt: new Date().toISOString(),
    };
    writeState(state);
  } else {
    console.log("Using existing subscription state.");
  }

  const guest = await postJson(`${API_ORIGIN}/auth/guest/start`, {});
  if (typeof guest.token !== "string" || guest.token.length === 0) {
    throw new Error("Guest session response did not contain a token");
  }

  const activationMessage = `${state.subscriptionTx}:${SELECTED_LEAGUES.join(",")}:${guest.token}`;
  const walletSignature = Buffer.from(
    nacl.sign.detached(new TextEncoder().encode(activationMessage), payer.secretKey),
  ).toString("base64");

  const activation = await postJson(
    `${API_ORIGIN}/api/token/activate`,
    {
      txSig: state.subscriptionTx,
      walletSignature,
      leagues: SELECTED_LEAGUES,
    },
    { Authorization: `Bearer ${guest.token}` },
  );
  const apiToken = activation.token ?? activation;
  if (typeof apiToken !== "string" || apiToken.length === 0) {
    throw new Error("Activation response did not contain an API token");
  }

  state = {
    ...state,
    jwt: guest.token,
    apiToken,
    activatedAt: new Date().toISOString(),
  };
  writeState(state);
  console.log(`API activation succeeded; credentials saved to ${path.relative(REPO_ROOT, STATE_PATH)}`);
}

main().catch((error) => {
  console.error(`TxLINE provisioning failed: ${error.message}`);
  process.exitCode = 1;
});
