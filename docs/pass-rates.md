# Pass Rates

No pass-rate table is published yet. Publish one only after a funded, fixed-size batch has run and the artifact bundle is committed or linked.

## Required Labels

Every published number must state:

- `seedPolicy: fixed` means the batch measures pipeline variance at one design point.
- `seedPolicy: random` means the batch estimates the deployment distribution, including injected creative variance.
- Harness commit, template commits, model identities, judge identity, Node version, and Claude CLI version.
- Batch budget and whether any planned runs were skipped for budget.

## Stopping Rule

Choose batch size before running. Do not keep launching extra batches until a result becomes significant. Comparisons are valid only between two pre-registered batches, and environment drift must be refused or labeled as a confounded comparison.
