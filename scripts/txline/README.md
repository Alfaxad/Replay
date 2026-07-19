# TxLINE devnet scripts

These scripts provision and verify RIVAL's TxLINE devnet access using the
official TxODDS devnet program and IDL.

```bash
pnpm txline:provision
pnpm txline:verify
```

Credentials are written to `.solana/txline-devnet.json`, which is excluded by
the repository's `.gitignore`. Scripts log transaction signatures, record
counts, and HTTP status only; they do not print the guest JWT or API token.

The IDL is copied from
[`txodds/tx-on-chain`](https://github.com/txodds/tx-on-chain/tree/main/examples/devnet)
at commit `3a1d6f0cfc34ce173f0778023d2332161359196d`.
