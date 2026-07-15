# Tested Capabilities

`tested` means a committed automated test or key-free fixture covers the contract. `live` means the path additionally requires local platform infrastructure.

| Capability | Claude CLI | Agent SDK | Strands | Android TV | Web | Vega |
| --- | --- | --- | --- | --- | --- | --- |
| Phase pipeline | tested | tested | tested | n/a | n/a | n/a |
| JSON events | tested | tested | tested | tested | n/a | tested |
| Record and replay | tested | tested | tested | n/a | n/a | n/a |
| Build | live | live | live | unit-tested, live required | tested | unit-tested, live required |
| Device QA | live | live | live | unit-tested, live required | n/a | live required |

Android TV's tested contract covers Android CLI probing, agent-skill setup,
project/APK discovery, emulator start, deployment, screenshots, required/fallback
selection, paths containing spaces, and JSON lifecycle planning. A live run is
still required before claiming a specific SDK, emulator image, template, or
Android Studio version works end to end. Follow `docs/android-cli-workflow.md`.

Do not upgrade a capability to a stronger claim without adding its acceptance path to CI or a documented keyed/platform release run.
