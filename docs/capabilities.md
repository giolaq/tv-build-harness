# Tested Capabilities

`tested` means a committed automated test or key-free fixture covers the contract. `live` means the path additionally requires local platform infrastructure.

| Capability | Claude CLI | Agent SDK | Strands | Android TV | Web | Vega |
| --- | --- | --- | --- | --- | --- | --- |
| Phase pipeline | tested | tested | tested | n/a | n/a | n/a |
| JSON events | tested | tested | tested | tested | n/a | tested |
| Record and replay | tested | tested | tested | n/a | n/a | n/a |
| Build | live | live | live | unit-tested, live required | tested | unit-tested, live required |
| Device QA | live | live | live | unit-tested, live required | n/a | live required |

Do not upgrade a capability to a stronger claim without adding its acceptance path to CI or a documented keyed/platform release run.
