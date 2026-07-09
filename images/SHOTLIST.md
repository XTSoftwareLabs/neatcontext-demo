# Screenshots

All screenshots are captured from the running NeatContext app (driven with
Playwright over the Electron DevTools protocol) and annotated with a highlight on
the key element of each step. The answer screenshots are real `gpt-5.4-mini` runs
that called the `Ops Demo Systems` extension tools against the local mock systems.

| File | Step | Highlight / key |
|---|---|---|
| `02-start-servers.png` | 2 | The incident URL to paste; all three mock systems listening on 7801–7803. |
| `03-open-neatcontext.png` | 3 | The model selector — your model; NeatContext only orchestrates it. |
| `04-extensions.png` | 4 | **Ops Demo Systems** enabled with its three `demo_*` read-only tools. |
| `05-payments-workspace.png` | 5 | The **Payments** chat tab: **only** the Payments profile and **only** its knowledge base. |
| `06-payments-answer.png` | 5 | Calls the demo extension; reasons from the **Payments** runbook → hand off. |
| `07-infra-tab.png` | 6 | A second **Infra** chat tab with its own profile + knowledge base; the Payments tab is untouched. |
| `08-infra-answer.png` | 6 | Same incident, in the Infra tab: searches **Infra's** runbooks → root cause = the 08:58 pgbouncer pool-size cut. |

Note: the answer runs use whatever model is configured in NeatContext; no model
endpoint URL is shown in any screenshot (only the model name in the top bar).
