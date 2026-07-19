# Solana devnet setup

Replay uses a dedicated Solana devnet wallet for TxLINE's free-tier subscription.
This wallet is development-only and must never receive mainnet assets.

## Project wallet

- Network: `devnet`
- CLI config: `.solana/config.yml`
- Local keypair: `.solana/devnet-wallet.json`

The `.solana/` directory is gitignored. The keypair file is local secret material
and must never be committed, logged, pasted into support messages, or deployed.

The public address is intentionally not stored in Git. Resolve it locally with
`solana address` when it is needed. The JSON keypair file is the only local
recovery material; back it up only if this disposable devnet subscription must
survive loss of the development machine.

## Commands

Run these from the repository root:

```bash
solana config get --config .solana/config.yml
solana address --config .solana/config.yml
solana balance --config .solana/config.yml
```

If the wallet needs additional test SOL:

```bash
solana airdrop 1 --config .solana/config.yml
```

The public Solana faucet may rate-limit CLI requests. In that case, copy the
address returned by `solana address --config .solana/config.yml` into the
[official web faucet](https://faucet.solana.com/). Devnet SOL has no monetary
value.

## TxLINE subscription

The project uses TxLINE devnet service level `1`, a four-week duration, and an
empty selected-leagues list.

- On-chain price: `0` TxL units per week
- Sampling interval reported by the pricing matrix: `0` seconds
- Subscription transaction: retained only in the ignored local state file
- Guest JWT and activated API token: stored locally in
  `.solana/txline-devnet.json`

The credential state file is owner-readable only and excluded from Git. Wallet
addresses, transaction signatures, JWTs, and API tokens must not be copied into
tracked documentation or shared logs.

## Verified API access

The project-local verifier completed successfully against
`https://txline-dev.txodds.com`:

- Fixtures snapshot: `8` records
- Odds snapshot: fixture `18143850`, `2` records
- Scores snapshot: fixture `18257739`, `2` records
- Historical score replay: fixture `18241006`, `964` records
- Odds stream: authenticated HTTP `200` Server-Sent Events connection
- Scores stream: authenticated HTTP `200` Server-Sent Events connection

Run the checks again with:

```bash
pnpm txline:verify
```
