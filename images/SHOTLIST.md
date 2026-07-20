# Screenshots

The NeatContext-app screenshots are captured from the running app (driven with
Playwright over the Electron DevTools protocol) and annotated with a purple
highlight on the key element of each step. The answer screenshots (05, 07) show a
real, tool-calling run against the local mock systems through NeatContext's
`get_context` flow — the same context ChatGPT Desktop's Codex host receives.

| File | Step | Highlight / key |
|---|---|---|
| `01-start-servers.png` | 2 | The incident URL to paste; all three mock systems listening on 7801–7803. |
| `02-team-library.png` | 3 | **Team library** connected to this repo; both profiles, both knowledge folders, and the extension source discovered with **Team** badges — NeatContext never writes into it. |
| `03-install-extension.png` | 4 | The **Ops Demo Systems** card and its **Install** action — inert team source → validated managed snapshot; its three `demo_*` read-only tools. |
| `04-payments-context.png` | 5 | The **Payments** Context: one profile + one knowledge folder + the extension, **Ready to connect**, with the **ChatGPT Desktop → Connect** button. |
| `05-payments-answer.png` | 5 | The grounded run: calls the demo tools, reasons from the **Payments** runbook → hand off to Infra. |
| `06-infra-context.png` | 6 | A second **Infra** Context with its own profile + knowledge folder; the Payments Context is untouched. |
| `07-infra-answer.png` | 6 | Same incident, Infra Context: searches **Infra's** runbooks → root cause = the 08:58 pgbouncer pool-size cut. |
| `08-context-activity.png` | 7 | **Context Activity** for a Context: the session ChatGPT Desktop opened and the `get_context` / `demo_*` tool calls, kept locally. |

Notes:
- NeatContext hosts no model and stores no model credential; no model endpoint or
  key appears in any screenshot. The Codex host inside ChatGPT Desktop brings the
  model under your own account.
- The answer shots were produced through the same NeatContext `get_context` +
  extension-tool flow the Codex host uses, so they faithfully represent the
  grounded answer a connected ChatGPT Desktop session returns.
</content>
