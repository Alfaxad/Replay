# Solana devnet setup

RIVAL uses a dedicated Solana devnet wallet for TxLINE's free-tier subscription.
This wallet is development-only and must never receive mainnet assets.

## Project wallet

- Network: `devnet`
- Public address: `4GYcYFGzG8huh1iE3XVofTFf2R2hSnaHH7LgBT7KLYFY`
- CLI config: `.solana/config.yml`
- Local keypair: `.solana/devnet-wallet.json`

The `.solana/` directory is gitignored. The keypair file is local secret material
and must never be committed, logged, pasted into support messages, or deployed.

The wallet was generated silently, so the JSON keypair file is its only local
recovery material. This is acceptable for a disposable devnet wallet. Back it up
only if the devnet TxLINE subscription must survive loss of the development
machine.

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

The public Solana faucet may rate-limit CLI requests. In that case, use the
[official web faucet](https://faucet.solana.com/) with the public address above.
Devnet SOL has no monetary value.

## TxLINE subscription

Provisioned on July 18, 2026 using TxLINE devnet service level `1`, a four-week
duration, and an empty selected-leagues list.

- On-chain price: `0` TxL units per week
- Sampling interval reported by the pricing matrix: `0` seconds
- Subscription transaction:
  [`29B2NkPDoj2mx51dJWV5tqr75Y3Lp7GN4Ra1a3DzD62n9mjAwWQXCjW7eW3uD2Qon1bZSCSJz8Lg8szatAcs1pH6`](https://explorer.solana.com/tx/29B2NkPDoj2mx51dJWV5tqr75Y3Lp7GN4Ra1a3DzD62n9mjAwWQXCjW7eW3uD2Qon1bZSCSJz8Lg8szatAcs1pH6?cluster=devnet)
- Guest JWT and activated API token: stored locally in
  `.solana/txline-devnet.json`

The credential state file is owner-readable only and excluded from Git.

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
