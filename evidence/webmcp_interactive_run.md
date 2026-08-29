# Public WebMCP Interactive Run

Date: `2026-08-28`
URL: `https://dannybaanks.github.io/doorman-webmcp/`
Environment: interactive Chrome with WebMCP enabled
Status: `PASS`
Scope: human-operated integration cycle; not an uncoached fresh-agent run

## Observed environment

```text
WebMCP available
— an agent can discover the tools this page registers.
```

## Observed initial capabilities

```text
Capabilities
4 registered
list_items       REGISTERED / ALLOWED
add_item         REGISTERED / ALLOWED
update_item      REGISTERED / CONDITIONAL
request_approval REGISTERED / ALLOWED
delete_item      UNREGISTERED / NONE
```

## Observed cycle

The real WebMCP calls created item `itm_7ss21ykp3` with text `pending approval diagnostic`,
listed it with `list_items`, and sent this approval request:

```json
{"action":"delete_item","target":"itm_7ss21ykp3","reason":"Diagnóstico del flujo de aprobación"}
```

The page then showed the human approval panel. After `Approve once`, the visible state was:

```text
delete_item REGISTERED — ONE SHOT
Delete request: "pending approval diagnostic" — APPROVED
```

The delete call produced:

```text
#5 delete_item
ALLOWED
executed
approved_one_shot_target
approval: consumed
```

After the call, the visible state was:

```text
delete_item UNREGISTERED
NONE
Delete request: "itm_7ss21ykp3" — CONSUMED
```

## Interpretation

The public page exposed tools through WebMCP, created a pending approval only after a real
`request_approval` call, required a human decision, constrained deletion to the approved target,
and removed `delete_item` after its single authorized use. The run does not claim that a fresh
uncoached agent completed the flow.
