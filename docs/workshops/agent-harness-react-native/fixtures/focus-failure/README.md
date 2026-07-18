# Focus Failure Fixture

Expected failure: after opening details from `Paper City`, pressing back returns home but initial focus replaces the originating-card focus.

Repair context:

```text
focus_restore failed: expected card "paper" after BACK, observed featured action "signal".
Read current navigation state, preserve unrelated work, and restore focus to the originating card.
```

Expected repaired path: `paper -> details -> BACK -> paper`.
