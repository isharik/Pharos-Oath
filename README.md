# PHAROS OATH

**Don't trust the transaction. Make it prove its intent.**

A lightweight, browser-native trust workspace for investigating Pharos Atlantic state and reviewing native transfers before a wallet signature. OATH is non-custodial: wallet prompts are sent directly to the user's EIP-1193 wallet provider.

## Run locally

The app is static HTML, CSS, and JavaScript and needs no build step or package install. Serve the project root over HTTP (wallet extensions and browser RPC calls generally do not work from a `file://` URL):

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. A modern browser and an EIP-1193 wallet such as MetaMask are needed for wallet connection and signing. Read-only investigations do not need a wallet.

The current Atlantic RPC default is configured in `src/app.js`. For another compatible endpoint, edit the `RPC` constant there. RPC availability and browser CORS policy depend on the endpoint operator.

## Implemented capabilities

- Responsive command center and twelve-section navigation.
- Direct JSON-RPC reads for network ID, latest block, gas price, native balance, bytecode, account transaction count, transactions, receipts, and gas estimation.
- Wallet connect, Atlantic network switch/add, and live native account reads.
- Address and transaction investigations with retrieved facts, explicit unknowns, and local report history.
- OATH Gate for a native PROS transfer: validates address and amount, applies local maximum/block/optional allowlist rules, verifies the wallet network, requests a gas estimate, displays the full preview, then calls the wallet to sign and submit only after the user explicitly approves.
- Transaction receipt polling after wallet submission.
- OATH Watch foreground polling every 20 seconds for native balance and nonce changes while the tab remains open.
- Browser-local policy settings and report history.
- User-provided brand image in `public/pharos-oath-brand.png`.

## Integration and deployment status

This repository is a functional client-side foundation, not a claim that the full challenge deployment has shipped. No backend, secrets, external service credentials, deployed contracts, or deployment account were supplied.

| Component | Status | Evidence / limitation |
|---|---|---|
| Pharos JSON-RPC | Implemented in client | Standard `eth_*` calls target the Atlantic RPC URL in `src/app.js`; chain ID is checked against 688689. Availability is runtime dependent. |
| Wallet signing | Implemented in client | EIP-1193 `eth_sendTransaction`; wallet alone signs. Native transfers only. |
| Investigation workflows | Implemented in client | Address, transaction, and network paths use live RPC and label unknowns. |
| Independent policy engine | Implemented in client | Deterministic local checks run again immediately before the wallet prompt. Browser-local only. |
| OATH Watch | Implemented in client | Foreground polling; stops when paused or the page closes. No background monitoring/indexer. |
| Pharos Chain MCP in deployed app | Not integrated | The coding environment exposes Pharos JSON-RPC tools to the assistant, but that MCP connection is not available to this standalone browser app. The app uses direct JSON-RPC instead. |
| Developer Docs MCP / SkillEngine | Not integrated | No connected endpoint or credentials are configured in this workspace. |
| AI model / autonomous server agent | Not integrated | OATH Core routes intent to deterministic RPC workflows; it does not pretend to be an LLM agent. |
| x402 marketplace | Not configured | Facilitator, accepted assets, recipient, and payment verification are absent. The UI reports this instead of issuing a fake 402 or claiming payment. |
| OATH Registry | Not deployed | No contract address or deployment credentials. Registry UI reports the limitation; no fabricated chain proof. |
| Public hosting / repository / demo | Not completed | No hosting, GitHub, or demo-video authorization/credentials were supplied. |

## Security notes

- The application never requests or stores seed phrases or private keys.
- Contract bytecode presence is not presented as a safety verdict. An address investigation returns `CAUTION` where code exists and `UNKNOWN` otherwise.
- A transaction receipt status is an observed execution outcome; a reverted status alone does not establish the cause.
- Wallet signing is always preceded by an OATH Gate preview and a fresh policy check. The wallet prompt is the final authorization boundary.
- Policies and reports live in this browser's local storage and can be cleared by the user or browser. They do not constrain transactions sent outside OATH.
- Watch checks only native balance and transaction count. It does not decode token approvals, events, or unusual behavior.
- Public RPC endpoints can be unavailable, rate-limited, or served by an untrusted operator. Configure a trusted endpoint before relying on reads.
- This client-only app does not provide server-side rate limiting, authenticated storage, prompt-injection defenses, or a secure x402 verifier.

## Acceptance snapshot

The local UI and core chain paths are implemented. Public product deployment, MCP and SkillEngine integrations, x402, the on-chain registry, and demo evidence remain incomplete until the required endpoints, configuration, and deployment access exist. Do not present this build as a complete 500-point challenge submission.

