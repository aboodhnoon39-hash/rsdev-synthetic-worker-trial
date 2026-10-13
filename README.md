# RS-Dev | Synthetic GitHub Actions Trial (Public-safe subset)

Only synthetic JavaScript fixtures and the minimal trial worker are included. No user's private repository, customer files, application receiver/consumer, live logs, account identifiers, access keys, or model weights. The `taskID` is an opaque synthetic trial reference, not an API credential.

## Verification and restrictions

- Manually triggered `workflow_dispatch` only; the job is blocked unless `approved=true` and repository Actions variable `RS_ZERO_SPEND_VERIFIED=yes`.
- Public repo + standard `ubuntu-24.04` GitHub-hosted runner; verify actual account billing settings, Actions eligibility, and storage usage first. Larger runners or extra products must remain disabled. Artifact retention: 1 day. One run only.
- In repository environment `rs-dev-synthetic-trial` configure secret `RS_EXTERNAL_SIGNING_KEY` as 64 hexadecimal characters (32 random bytes). Never commit or paste it in chat.
- Set workflow input `packet_sha256` to the canonical JSON SHA-256 of tasks/PACKET.json as emitted by `JSON.stringify(JSON.parse(file))`, **not** the raw file SHA-256. See `node -e` command below.
- Set `node_image` to the *verified official Docker Hub Node 24 image* digest as `node@sha256:<64 lowercase hex>`. Verify from an official source and current manifest list first. No invented digest and no unpinned tag.
- Keep all keys outside the repo. Do not grant write permissions to GitHub Actions, trigger broad automations, or upload real project code.
- Docker container is network-disabled, rootless UID 65534, read-only filesystem with only the test input/output mounts.
- A passing run proves **only fixed isolated execution**, not an AI coder, AI Planner, or end-to-end consumer connection.

## Packet canonical hash

Run in the repository checkout using Node:

```bash
node -e "const f=require('fs');const c=require('crypto');const p=JSON.parse(f.readFileSync('tasks/PACKET.json','utf8'));console.log(c.createHash('sha256').update(JSON.stringify(p)).digest('hex'))"
```

## Next step after one successful GitHub run

Use the *private local* result consumer from the original staged-project, with an authorized GitHub read connection and a local task binding matching `taskID`, `attemptID`, `generation`, `repository`, `runID`, `runAttempt`, and verified Node image. Do not publish that consumer or local credentials in a public repository. Do not represent this public bundle as implementing a complete live cloud dispatch or result import.

## Stop conditions

Do not start if owner authorization, public-only synthetic scope, verified $0 spending, verified digest, or signing secret is missing. Never run GitHub Actions automatically/repeatedly. Never touch the main RS-Dev service on port 4194 or accept/merge a review automatically.
