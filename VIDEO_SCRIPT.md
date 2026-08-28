# Doorman Video Script

Target length: 2:20–2:45. Never exceed 3:00.

## Reset

Use the human-only `Reset board` control. Confirm the sample items are back, Activity is empty,
no approval card is visible, and `delete_item` is `UNAVAILABLE`.

## Run

- **0:00–0:15:** “A tool being available does not mean every invocation should be authorized.”
- **0:15–0:35:** Show the board and Capabilities: `list_items`, `add_item`, `update_item`, and
  `request_approval` available; `delete_item` unavailable. Mention WebMCP is the structured tool
  surface, not a button scraper.
- **0:35–0:55:** Ask the agent to list items and add “buy milk”. Show the item tagged `agent` and
  the `ALLOWED / executed` receipt.
- **0:55–1:20:** Ask it to update a sample or human item. Show `DENIED`,
  `not_owned_by_agent_session`, and `not_executed`.
- **1:20–1:35:** Point out that `delete_item` is not registered, not merely disabled in the UI.
- **1:35–1:55:** Have the agent call `request_approval`. Show the pending human card.
- **1:55–2:10:** Click `Approve once`. Show `delete_item` appear as `AVAILABLE` and the
  capability surface change.
- **2:10–2:25:** Have the agent delete the approved item. Show the receipt, `approval consumed`,
  and `delete_item` disappear.
- **2:25–2:40:** “Registered is not authorized. Available is not exercised. Doorman makes that
  difference visible.”

Do not explain ISyCo, cells, internal architecture, or claim that Doorman is a security sandbox.
