const commands = {
  installWorkshop: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
yarn install --frozen-lockfile
cd ../workshop-harness
yarn install --frozen-lockfile`,
  doctor: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --replay --json`,
  claudeDoctor: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --executor claude-cli --json`,
  strandsDoctor: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --executor strands --provider bedrock --json`,
  adbtDoctor: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --replay --adbt-live --json`,
  step1: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/01-single-agent/index.ts run \\
  steps/01-single-agent/fixtures/phases.json \\
  --replay steps/01-single-agent/fixtures/demo-recording.json`,
  step2: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/02-verify-loop/index.ts run \\
  steps/02-verify-loop/fixtures/phases.json \\
  --replay steps/02-verify-loop/fixtures/retry-recording.json`,
  step3: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --replay steps/03-phases/fixtures/demo-recording.json \\
  --stop-after content`,
  step3Resume: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --replay steps/03-phases/fixtures/demo-recording.json \\
  --resume`,
  step4: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --replay steps/04-skills/fixtures/demo-recording.json`,
  step4Local: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --executor claude-cli --model sonnet`,
  step4Remote: `cd "$(git rev-parse --show-toplevel)/packages/mini-harness"
npx tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \\
  --region us-west-2`,
  memoryPrep: `REPO="$(git rev-parse --show-toplevel)"
WORKSHOP_INPUTS="/tmp/tv-build-pocket-cinema-inputs"
rm -rf "$WORKSHOP_INPUTS"
cp -R "$REPO/docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs" \\
  "$WORKSHOP_INPUTS"
cd "$REPO/packages/workshop-harness"`,
  memory: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts memory propose /tmp/tv-build-pocket-cinema-inputs \\
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \\
  --json`,
  applyMemory: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts memory apply /tmp/tv-build-pocket-cinema-inputs \\
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \\
  --yes --json`,
  plan: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema \\
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  --seed workshop-v1 --max-cost 3 --json`,
  port: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \\
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \\
  --yes --seed workshop-v1 --max-cost 3 --json`,
  portAdbtLive: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \\
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \\
  --adbt-live --yes --seed workshop-v1 --max-cost 3 --json`,
focusCheck: `REPO="$(git rev-parse --show-toplevel)"
cd "$REPO/packages/workshop-harness/out/<runId>/app"
node --import tsx tests/verify-tv-focus.ts
cat tv-focus-result.json`,
  adbt: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --replay --adbt-live --json`,
  vegaSetup: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts doctor --replay --adbt-live --json
vega --version
vega virtual-device start --gui`,
  vdaStart: `# Run this in a system terminal and leave it open.
vega virtual-device start --gui`,
  vdaCheck: `# Run this in a second system terminal.
vega --version
vega virtual-device status
vega exec vda devices -l`,
  vegaPlan: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts vega-run <runId> --plan --json`,
  vegaRun: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts vega-run <runId> \\
  --platform-replay ../../docs/workshops/agent-harness-react-native/fixtures/vega-lifecycle.json \\
  --yes --json`,
  vegaLive: `REPO="$(git rev-parse --show-toplevel)"
cd "$REPO/packages/workshop-harness/out/<runId>/app/apps/vega"
npm install
cd "$REPO/packages/workshop-harness"
npx tsx src/index.ts vega-run <runId> --yes --json`,
  beeSearch: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts context bee search \\
  "Pocket Cinema product decisions" --json`,
  beeSnapshot: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts context bee snapshot <conversationId> \\
  --out candidate-context.json --json`,
};

const modules = [
  {
    id: "welcome", number: "00", nav: "Start here", time: "20 minutes", title: "Set up the workshop and understand the runtime",
    lead: "Complete this page before lesson 1. Stop troubleshooting after 10 minutes and use replay. A live model or Vega device must never block the workshop.",
    objective: "Choose a reliable workshop path and explain where Strands, ADBT, the harness, and Git each fit.",
    evidence: "A successful replay run, one chosen execution path, and a completed readiness checklist.",
    body: `${flow([["ADBT MCP","Approved Vega context"],["Strands","Read and propose"],["Harness","Write and check"],["Git","Commit evidence"]])}
      ${note("What is Strands Agents SDK?","It is the TypeScript agent runtime used by the live remote path. The production workshop harness pins 1.10.0; the staged mini-harness and general TV Build harness currently pin 1.7.0. It provides the model loop, provider adapters, typed tools, structured output, limits, cancellation, and usage metrics.")}
      ${table(["Strands supplies","The harness owns"],[["Agent loop and model providers","Phase order and approval"],["Read-only typed tools","Protected file writes"],["Validated patch output","Checks, retry, and Git commits"],["MCP client and metrics","Cost cap, replay, and report"]])}
      <p>The port agent can only list, read, and search the guarded app. The harness calls ADBT MCP itself, selects two migration workflows, and injects that context only into <code>vega_port</code>. The model gets no shell or write tool. Replay uses the same phase and evidence contracts without contacting a model or MCP server.</p>

      <h2>1. Check the basics</h2>
      ${steps(["Install Node.js 20 or newer, Yarn 1.22, and Git.","Clone this repository and open a terminal anywhere inside it.","Choose Pocket Cinema unless your own React Native app already runs."])}
      <div class="grid"><article><h3>Pocket Cinema</h3><p>Recommended. Every exercise, recording, and checkpoint supports this app.</p><code>apps/workshop-pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working flow: launch → screen → action → back. Switch to Pocket Cinema if discovery takes more than 10 minutes.</p><code>launch → screen → action → back</code></article></div>
      <h3>Bring-your-own-app safety check</h3>
      <div class="checklist">${["The app runs before the workshop","Git status is clean","It contains no production secrets or private data","It contains no protected media","It can be shared with the chosen model provider"].map(item => `<label><input type="checkbox">${item}</label>`).join("")}</div>

      <h2>2. Install both workshop packages</h2>
      ${command("Install the mini-harness and workshop harness","installWorkshop")}

      <h2>3. Run the setup check</h2>
      ${command("Check the key-free replay path","doctor")}
      <p>You are ready when the command reports <code>state: ready</code>. Model and Vega checks are optional in replay mode.</p>
      ${command("Optional: check live ADBT with everything else replayed","adbtDoctor")}

      <h2>4. Choose one execution path</h2>
      ${table(["Path","Use it when","Needs"],[["Replay","Recommended for the workshop and every fallback","Nothing beyond the installed packages"],["Claude Code","You want a local live coding-agent run","Claude Code installed and authenticated"],["Strands + Bedrock","You want the in-process remote executor","AWS credentials and Bedrock model access"]])}
      ${command("Replay: run one model recording","step1")}
      ${command("Claude Code: check the local executor","claudeDoctor")}
      ${command("Strands: check Bedrock credentials","strandsDoctor")}
      ${note("Choose one path","You do not need all three. If a live path fails, save the error, choose replay, and continue.")}

      <h2>5. Optional Vega and VDA setup</h2>
      <p>Skip this section when you plan to use lifecycle replay. For the live path, install Vega SDK <code>0.22.5875</code> and create a Vega Virtual Device.</p>
      <p>The harness starts pinned ADBT <code>1.0.5</code> as a stdio MCP server. It discovers the tools, calls <code>list_documents</code>, reads two approved port workflows, and disconnects. You do not run <code>init-context</code>.</p>
      ${command("Check ADBT and start VDA in a system terminal","vegaSetup")}
      <p>Keep that terminal open. In a second system terminal, run:</p>
      ${command("Confirm the SDK and attached device","vdaCheck")}
      ${note("Live Vega is ready only when","The SDK prints 0.22.5875, virtual-device status reports running: true, and devices -l lists an attached device.","success")}
      ${fallback("Try one repair for no more than 10 minutes. Then use replay. Do not spend workshop time repairing a model account or device.")}

      <h2>Setup complete</h2>
      <div class="checklist">${["Node 20+, Yarn 1.22, and Git are installed","Both workshop packages are installed","One replay run completed","I chose replay, Claude Code, or Strands","I chose Pocket Cinema or checked my own app","I understand that Vega device work is optional","I can explain what Strands supplies and what the harness owns"].map(item => `<label><input type="checkbox">${item}</label>`).join("")}</div>
      ${knowledgeCheck("What is the most important boundary in this workshop?","The model can inspect and propose, but the harness controls approval, protected writes, verification, retries, cost, commits, and reports. ADBT supplies selected platform knowledge; it does not take over the run.")}
      ${done("Both packages are installed, one replay succeeds, one execution path is chosen, and you know which app you will use.")}`
  },
  {
    id: "single-agent", number: "01", nav: "One model call", time: "15 minutes", title: "Start with one model call",
    lead: "Run the smallest example against a React Native app and identify what it cannot prove.",
    objective: "Locate the model boundary and distinguish generated output from verified output.",
    evidence: "Three concrete claims that the one-call script cannot prove by itself.",
    body: `${concept("Why this step exists","A model can produce plausible files, but plausibility is not evidence. Start with the smallest possible agent so its missing guarantees are easy to see.")}${note("One app from the first minute","Every mini-harness step begins with a reduced Pocket Cinema React Native app. The later port changes platform concerns, but phase → skill → executor → check stays the same.")}${predict("Before you run it, name one bug that could hide inside React Native output that looks complete.")}${command("Run Step 1 with replay","step1")}<h2>Trace the model boundary</h2>${steps(["Open <code>steps/01-single-agent/index.ts</code>.","Find where it copies the starter app, builds the prompt, reads the model response, and writes files.","Open <code>out/src/App.tsx</code> and <code>out/src/components/ShowCard.tsx</code>.","Write down three claims that need an independent check: compile, catalog content, and remote focus are good examples."])}${knowledgeCheck("Why is this an agent script, but not yet a reliable harness?","It has a model call and side effects, but no independent verification, bounded retry, checkpoint, approval gate, or durable evidence.")}${done("You can point to the model boundary and name three missing React Native checks.")}${fallback("The replay is the complete exercise. No live model is needed.")}`
  },
  {
    id: "verify", number: "02", nav: "Check and retry", time: "20 minutes", title: "Turn a failure into a useful retry",
    lead: "Run a mechanical check and send its exact failure into one bounded retry.",
    objective: "Trace a requirement through a failed check, a contextual retry, and a passing result.",
    evidence: "The failed grep message appears in the retry request and the second attempt passes.",
    body: `${concept("Why this step exists","A retry is useful only when it carries new information. The check turns a vague failure into precise context the next attempt can act on.")}${predict("The recording contains two content responses. Predict which catalog requirement the first response misses.")}${command("Replay the failed check and repair","step2")}${expected(`Pattern "Kitchen Stories" not found in out/src/catalog.ts`)}<h2>Follow the evidence</h2>${steps(["Find the failed <code>grep</code> check in the output.","Open <code>steps/02-verify-loop/verify.ts</code> and locate that check.","Find the same failure text in the retry request.","Open <code>out/src/catalog.ts</code> and confirm the second attempt passes the original check."])}${knowledgeCheck("Why pass the exact failure into the retry instead of saying try again?","The exact failure narrows the problem, preserves the original requirement, and makes the retry explainable. A generic retry mostly buys another guess.")}${done("You can trace requirement → failed check → retry → passing React Native source.")}${fallback("Use the committed retry recording. Do not replace this exercise with a live call.")}`
  },
  {
    id: "phases", number: "03", nav: "Phases and resume", time: "25 minutes", title: "Split the work and resume it",
    lead: "Use phases for small changes, commits for verified code, and checkpoints for run progress.",
    objective: "Explain the different jobs of a phase, a checkpoint, and a Git commit.",
    evidence: "A paused run resumes at focus, while the Git log keeps one commit per completed phase.",
    body: `${concept("Why this step exists","Long agent runs fail. Small phases limit the damage, checkpoints remember orchestration progress, and commits preserve code that already passed its checks.")}${predict("The run stops after content. Which phase should resume next, and which phases must not run again?")}${command("Pause after the content phase","step3")}${expected(`Paused after content.\ncheckpoint.json: { "nextPhase": 2 }`)}<h2>Inspect before resuming</h2>${steps(["Open <code>out/checkpoint.json</code>.","Use <code>phases.json</code> to confirm index 2 is <code>focus</code>.","Open the Git log and find commits for screen and content."])}${command("Resume the same run","step3Resume")}<h2>Compare the result</h2>${steps(["Confirm only focus ran after resume.","Open the final checkpoint and Git log.","Explain what progress belongs in the checkpoint and what evidence belongs in Git."])}${knowledgeCheck("Why keep both a checkpoint and per-phase commits?","The checkpoint tells the engine where to continue. Git records the exact verified code state for each completed phase. They answer different recovery questions.")}${done("The second command runs only focus, without repeating screen or content.")}${fallback("Read <code>fixtures/resume/README.md</code>, then repeat the two replay commands.")}`
  },
  {
    id: "skills", number: "04", nav: "Skills and executors", time: "20 minutes", title: "Separate knowledge from model access",
    lead: "A skill supplies domain instructions. An executor calls the model. The pipeline should not depend on one provider.",
    objective: "Separate domain knowledge, model execution, tools, and deterministic pipeline control.",
    evidence: "You can point to the file that owns each responsibility in both the mini and production harnesses.",
    body: `${concept("Four responsibilities","Skills teach domain knowledge. Phase context assembles the task. An executor talks to a model. Tools expose narrow capabilities. The pipeline decides when side effects are allowed.")}${predict("Where should a D-pad focus rule live: the executor, a skill, a read tool, or a verification check?")}${command("Run Step 4 with replay","step4")}<h2>Map the teaching harness</h2>${steps(["Open <code>phases.json</code> and find <code>react-native-screen</code> and <code>tv-focus</code>.","Follow them through <code>skills.ts</code>, <code>pipeline-engine.ts</code>, and <code>executor.ts</code>.","In <code>model-runtime.ts</code>, compare <code>injectSkillText()</code> with <code>createSkillsPlugin()</code>.","Notice that the React Native target is unchanged; only knowledge delivery and model access have become explicit.","Compare every module with <code>packages/mini-harness/ISOMORPHISM.md</code>."])}${skillDelivery()}${strandsConstructs()}${fullHarnessStrandsConstructs()}<h2>Inspect the production Strands boundary</h2>${steps(["Open <code>packages/workshop-harness/src/port-tools.ts</code> and match each <code>tool()</code> field to the first table.","Open <code>port-contract.ts</code> and find the Zod schema passed as <code>structuredOutputSchema</code>.","Open <code>port-executor.ts</code> and trace <code>new Agent()</code> → <code>invoke()</code> → <code>AgentResult</code>.","Open <code>packages/harness/src/strands-phase-executor.ts</code> and trace <code>stream()</code> events into logs and usage.","Confirm the workshop port agent has no write or shell tool. Its pipeline owns both."])}${knowledgeCheck("Why use AgentSkills with Strands but prompt injection with Claude CLI?","Strands can expose skill metadata and let the agent progressively activate instructions through a plugin. The CLI subprocess has no shared in-process plugin, so the executor sends the selected instructions directly in its prompt.")}<h2>Optional live comparison</h2>${command("Use local Claude Code","step4Local")}${command("Use Strands with Bedrock","step4Remote")}<div class="links"><a href="strands-constructs.md">Open the Strands reference</a></div>${done("You can trace one React Native phase skill through Claude prompt injection or Strands AgentSkills, then separate both from pipeline controls.")}${fallback("Replay shows the same module boundaries without credentials.")}`
  },
  {
    id: "memory", number: "05", nav: "Project memory", time: "15 minutes", title: "Review facts before saving them",
    lead: "Use a disposable input copy. Proposed context becomes project memory only after you review it.",
    objective: "Turn selected source material into small, reviewable project facts with provenance.",
    evidence: "The saved PROJECT_CONTEXT.md separates decisions, facts, questions, and source ids.",
    body: `${concept("Why this step exists","Project context should be small, attributable, and approved. A raw transcript is too noisy, too private, and too easy for an agent to misread as instruction.")}${predict("What could go wrong if the harness imported every remembered sentence automatically?")}${command("Create a disposable input copy","memoryPrep")}${command("Create a memory proposal","memory")}<h2>Review before applying</h2>${steps(["Read every proposed fact.","Check that each fact names its source.","Keep open questions separate from decisions.","Reject anything private, temporary, or ambiguous."])}${command("Apply the reviewed proposal","applyMemory")}<h2>Inspect the saved context</h2>${steps(["Open <code>/tmp/tv-build-pocket-cinema-inputs/PROJECT_CONTEXT.md</code>.","Confirm the source ids survived the transformation.","Confirm the committed fixture in the repository is unchanged."])}${knowledgeCheck("Why is the proposal step an approval gate rather than another model phase?","The human owns what becomes durable project truth. The model may summarize candidate facts, but it cannot silently promote them into trusted context.")}${done("Every saved fact has a source and the repository fixture is unchanged.")}${fallback("Use the synthetic Bee snapshot. Live Bee access is not required.")}`
  },
  {
    id: "plan", number: "06", nav: "Plan and port", time: "35 minutes", title: "Inspect first, then change a guarded copy",
    lead: "Review scope, checks, ADBT context, seed, and cost before approving a port. The source app stays untouched.",
    objective: "Follow the complete port boundary from plan approval to a checked, committed app copy.",
    evidence: "The report links approved ADBT context, a typed patch, check results, cost, and Git commits.",
    body: `${concept("The production loop","The plan is the human approval boundary. ADBT supplies approved Vega knowledge. Strands proposes a typed patch from read-only project tools. The harness applies it, checks it, retries once, and commits only verified work.")}${flow([["ADBT MCP","Load approved workflows"],["Context","Inject into vega_port"],["Model","Propose a typed patch"],["Checks","Write, commit, or retry"]])}${predict("Which phase needs ADBT context, and why should the model not receive every document the MCP server can expose?")}${command("Plan the Pocket Cinema port","plan")}<h2>Review the plan before approval</h2>${steps(["Confirm the source app and target flow.","Read the portability findings.","Check that ADBT is assigned only to <code>vega_port</code>.","Check the six-stage plan, fixed seed, and $3 cap.","Notice that the sixth stage is the separate Vega lifecycle in lesson 8."])}${command("Run with recorded model and ADBT context","port")}<h2>Build an evidence chain</h2>${steps(["Copy the <code>runId</code> from the output.","Open <code>out/&lt;runId&gt;/adbt-port-context.json</code> and find the workflow names and hashes.","Open <code>port-result.json</code> and confirm <code>adbt.mode: replay</code>.","Open <code>app/NextSteps.md</code> and find ADBT sources and unsupported mappings.","Inspect the guarded app, report, and Git log.","Confirm <code>apps/workshop-pocket-cinema</code> is unchanged."])}${knowledgeCheck("Why does the harness choose the ADBT documents instead of giving the model unrestricted MCP access?","Selection keeps context relevant, reviewable, and reproducible. It also prevents a tool-capable model from fetching unrelated instructions or changing the evidence set between runs.")}<h2>Optional: use ADBT MCP live</h2>${command("Check the native MCP path","adbtDoctor")}${command("Run the port with runtime ADBT","portAdbtLive")}${mcpConstructs()}${note("What changes","The harness uses Strands <code>McpClient</code> to discover and call two named tools, records approved excerpts and hashes, then disconnects. The model remains replayed.")}${done("You can trace each MCP construct from connection through approved context, a typed proposal, checks, a verified commit, and the final report.")}${fallback("Use the recorded ADBT context. A live port stops with exit 3 when ADBT is unavailable; it never continues with unsupported assumptions.")}`
  },
  {
    id: "tv", number: "07", nav: "Test remote behavior", time: "20 minutes", title: "Test the flow, not one screenshot",
    lead: "Trace focus through launch, movement, Select, and Back. A passing build cannot prove this behavior.",
    objective: "Express TV navigation as observable state transitions instead of visual impressions.",
    evidence: "tv-focus-result.json records launch, movement, selection, and focus restoration after Back.",
    body: `${concept("Why this step exists","TV quality is temporal. A screenshot can show where focus is now, but not whether focus moved correctly, respected boundaries, opened the right screen, or returned to the same card.")}<div class="remote" aria-label="TV remote direction pad"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>${table(["Action","Expected result"],[["Launch","Featured action has focus"],["Down","Focus enters the first rail"],["Left / right","Focus stops at list boundaries"],["Select","Details opens for the focused card"],["Back","The same card regains focus"]])}${predict("Which transition is most likely to pass a screenshot review but fail for a real remote user?")}${command("Run the executable focus check","focusCheck")}<h2>Compare passing and failing evidence</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from lesson 6.","Read <code>tv-focus-result.json</code> as a sequence, not a score.","Open <code>fixtures/focus-failure/README.md</code> and find the failed Back transition.","Trace the focus state and restoration code in the guarded app."])}${knowledgeCheck("Why is Back part of the focus contract?","Returning to a screen without restoring the user's prior focus loses navigation context. The UI may look correct while the remote interaction is broken.")}${done("The focus check passes the full transition sequence and writes <code>tv-focus-result.json</code>.")}${fallback("Run the same check in <code>checkpoints/vega-buildable/app</code>. No device is required.")}`
  },
  {
    id: "vega", number: "08", nav: "Run the Vega lifecycle", time: "25 minutes", title: "Hand the guarded app to Vega tools",
    lead: "The key-free replay teaches the complete lifecycle. A live Vega SDK and VDA run is optional device evidence.",
    objective: "Distinguish reproducible lifecycle rehearsal from evidence produced by a real Vega device.",
    evidence: "Eight lifecycle gates pass, with evidenceMode clearly labeled replay or live.",
    body: `${concept("Two kinds of evidence","Replay proves that everyone can study the lifecycle and its contracts. A live VDA run proves that this app completed those commands on an attached device. Keep those claims separate.")}${note("Current rehearsal status","SDK 0.22.5875 builds and validates the app. Live install, launch, logs, and screenshots still require a VDA target that remains attached.","warning")}<div class="links"><a href="live-rehearsal.md">Read the rehearsal record</a></div>${predict("If the SDK build passes but the device list is empty, which lifecycle gates must the harness refuse to claim?")}${command("Show the Vega plan","vegaPlan")}${command("Run the key-free lifecycle replay","vegaRun")}<h2>Inspect all eight gates</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from lesson 6.","Confirm SDK version and device status were checked before build.","Find build, install, launch, logs, capture, and pull results.","Check <code>checks[0].passed</code> and <code>evidenceMode: replay</code>.","Explain why replay evidence is not device certification."])}${knowledgeCheck("What turns lifecycle output into trustworthy evidence?","The harness records the exact command, outcome, artifact, and evidence mode for each gate. A successful process exit alone is not enough when no device is attached.")}<h2>Optional live device run</h2>${command("Check the native ADBT MCP path","adbt")}${note("No agent configuration change","The harness owns the pinned ADBT MCP connection. It does not run <code>init-context</code> or edit Claude configuration.")}${command("Start VDA and keep this terminal open","vdaStart")}${command("Confirm the SDK and attached device","vdaCheck")}${command("Run with Vega SDK and VDA","vegaLive")}<h2>Claim live evidence only when</h2>${steps(["The SDK reports <code>0.22.5875</code>.","VDA reports <code>running: true</code> and lists an attached device.","Build, install, launch, logs, capture, and pull all pass.","The result says <code>evidenceMode: live</code> and the screenshot came from the device."])}${done("Replay is complete when all eight recorded gates pass. Live testing is complete only when the live evidence checklist also passes.")}${fallback("An empty device list is a failure even with exit 0. Try one repair, then use replay or <code>checkpoints/complete/</code>.")}`
  },
  {
    id: "bee", number: "09", nav: "Optional Bee context", time: "15 minutes", title: "Import selected context, not a transcript",
    lead: "Run this only when Bee is configured and participants consent. The synthetic fixture is the normal workshop path.",
    objective: "Select useful context without turning a private conversation into unreviewed agent memory.",
    evidence: "A scrubbed snapshot has source ids, dates, a query, a summary, and a stable hash.",
    body: `${concept("Why this step is optional","Conversation search can recover useful decisions, but it also crosses a privacy boundary. Use it only with consent, select the smallest useful excerpt, and store a scrubbed snapshot rather than a transcript.")}${predict("Which fields would let a reviewer verify where a summarized fact came from without storing the full conversation?")}${command("Search Bee","beeSearch")}${command("Save one selected snapshot","beeSnapshot")}<h2>Review the boundary</h2>${steps(["Check source ids, dates, query, summary, and hash.","Review the snapshot before proposing memory.","Never commit a raw private transcript.","Disconnect Bee and confirm the approved snapshot still works."])}${knowledgeCheck("Why should the snapshot work after Bee is disconnected?","The run becomes reproducible and reviewable without a live private-data dependency. The snapshot is the approved input; Bee is only a discovery source.")}${done("Every approved fact has a source and can be reused without Bee.")}${fallback("Use <code>fixtures/bee-context/snapshot.json</code> or skip this optional module.")}`
  },
  {
    id: "finish", number: "10", nav: "Build your own", time: "15 minutes", title: "Design one harness for your work",
    lead: "Keep the pipeline and replace the TV skill, Vega commands, and D-pad checks with your domain.",
    objective: "Draft the smallest useful harness for one task in your own engineering domain.",
    evidence: "A worksheet names the phases, checks, approval point, budget, and evidence the run must retain.",
    body: `<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div>${concept("Transfer the pattern","The reusable idea is not TV or Vega. It is a bounded workflow that gives a model strong context, limits its authority, checks each result, and leaves evidence another developer can inspect.")}<h2>Draft your harness</h2>${steps(["Open <code>worksheet.md</code>.","Name one outcome that can finish in one session.","Choose the fewest useful phases.","Give every phase one independent, mechanical check.","Define the approval point, cost limit, stop conditions, and saved evidence.","Name your replacement for the TV skill, Vega adapter, and D-pad check."])}${knowledgeCheck("What is the smallest useful first version of your harness?","One repeatable task, a short phase sequence, one strong prior, one independent check per phase, a bounded retry, and a report. Add tools only when a proven gap needs them.")}${done("Another developer can follow your worksheet, inspect the evidence, and knows when the harness must stop.")}<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a></div>`
  }
];

const storageKey = "past-the-vibes-progress-v3";
const linksHost = document.getElementById("module-links");
const content = document.getElementById("content");

linksHost.innerHTML = modules.map(module => `<button class="module-link" data-module="${module.id}"><span>${module.number}</span>${module.nav}</button>`).join("");

function showModule(id, updateHash = true) {
  if (id === "port") id = "plan";
  const module = modules.find(item => item.id === id) || modules[0];
  content.innerHTML = `<section class="module"><div class="module-head"><div><p class="step">Step ${module.number} · ${module.time}</p><h1>${module.title}</h1></div><label class="complete"><input type="checkbox" id="complete-module"> Done</label></div><p class="lead">${module.lead}</p>${lessonBrief(module)}${module.body}${lessonNavigation(module)}</section>`;
  document.querySelectorAll(".module-link").forEach(link => link.classList.toggle("active", link.dataset.module === module.id));
  document.querySelector(`.module-link[data-module="${module.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  document.getElementById("complete-module").checked = progress().has(module.id);
  document.getElementById("complete-module").addEventListener("change", event => setComplete(module.id, event.target.checked));
  document.querySelectorAll(".copy").forEach(button => button.addEventListener("click", () => copyCommand(button.dataset.command)));
  document.querySelectorAll("[data-go-module]").forEach(button => button.addEventListener("click", () => showModule(button.dataset.goModule)));
  if (updateHash) history.replaceState(null, "", `#${module.id}`);
  document.title = `${module.nav} | Past the Vibes`;
  content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function progress() {
  try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); }
  catch { return new Set(); }
}

function setComplete(id, checked) {
  const state = progress();
  checked ? state.add(id) : state.delete(id);
  localStorage.setItem(storageKey, JSON.stringify([...state]));
  renderProgress();
}

function renderProgress() {
  const state = progress();
  document.querySelectorAll(".module-link").forEach(link => link.classList.toggle("done", state.has(link.dataset.module)));
  document.getElementById("progress").value = state.size;
  document.getElementById("progress-label").textContent = `${state.size} of ${modules.length} complete`;
}

async function copyCommand(key) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(commands[key]);
    else fallbackCopy(commands[key]);
  } catch {
    fallbackCopy(commands[key]);
  }
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1200);
}

function fallbackCopy(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

document.querySelectorAll(".module-link").forEach(link => link.addEventListener("click", () => showModule(link.dataset.module)));
document.getElementById("reset-progress").addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  renderProgress();
  showModule(location.hash.slice(1) || "welcome", false);
});
renderProgress();
showModule(location.hash.slice(1) || "welcome", false);

function escape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function command(title, key) { return `<div class="command"><header><span>${title}</span><button class="copy" data-command="${key}">Copy command</button></header><pre><code>${escape(commands[key])}</code></pre></div>`; }
function steps(items) { return `<ol class="tasks">${items.map(item => `<li>${item}</li>`).join("")}</ol>`; }
function note(title, text, type = "") { return `<aside class="note ${type}"><strong>${title}</strong><br>${text}</aside>`; }
function concept(title, text) { return `<section class="concept"><p class="eyebrow">Concept</p><h2>${title}</h2><p>${text}</p></section>`; }
function predict(text) { return `<aside class="predict"><p class="eyebrow">Pause before running</p><strong>Make a prediction</strong><p>${text}</p></aside>`; }
function knowledgeCheck(question, answer) { return `<section class="knowledge"><p class="eyebrow">Check your understanding</p><details><summary>${question}</summary><p>${answer}</p></details></section>`; }
function done(text) { return note("You are done when", text, "success"); }
function fallback(text) { return note("If blocked", text, "warning"); }
function expected(text) { return `<div class="expected"><strong>Find this evidence</strong><pre><code>${escape(text)}</code></pre></div>`; }
function flow(items) { return `<div class="flow">${items.map((item, index) => `${index ? "<i>→</i>" : ""}<div><b>${item[0]}</b><span>${item[1]}</span></div>`).join("")}</div>`; }
function table(headers, rows) { return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
function skillDelivery() {
  return `<h2>One skill, two delivery paths</h2>
    ${table(["Executor","How the selected skill arrives"],[
      ["Claude CLI","<code>injectSkillText()</code> appends the complete skill body to the subprocess prompt."],
      ["Strands","<code>Skill</code> objects enter an <code>AgentSkills</code> plugin. Metadata appears first; the agent activates instructions with the <code>skills</code> tool."],
      ["Replay","No model runs. A recorded response replaces the live executor while the same phase plan remains visible."],
    ])}
    ${note("Why Strands gets three turns","With a selected skill, the mini agent needs room to discover the skill, activate it, and return JSON. Without skills it keeps the one-turn limit.")}`;
}
function strandsConstructs() {
  return `<h2>Strands constructs used here</h2>
    <p>Read this table from setup to result. These are the Strands APIs the workshop actually uses.</p>
    ${table(["Construct","What it does here","Where to find it"],[
      ["<code>Agent</code>","Runs the model-and-tool loop for one phase. <code>name</code> and <code>description</code> identify its job.","<code>port-executor.ts</code>"],
      ["<code>Model</code>, <code>BedrockModel</code>, <code>OpenAIModel</code>","Hide provider-specific model calls. OpenRouter uses <code>OpenAIModel</code> with an OpenAI-compatible base URL.","<code>model-factory.ts</code>"],
      ["<code>systemPrompt</code>","Sets durable operating rules: inspect first, use read-only evidence, and return a complete patch.","<code>port-executor.ts</code>"],
      ["<code>tool()</code>","Turns a named callback into a model-callable capability. The description tells the model when to use it.","<code>port-tools.ts</code>"],
      ["<code>inputSchema</code>","Uses Zod to validate tool arguments and type the callback input before project code runs.","<code>port-tools.ts</code>"],
      ["<code>tools</code>","Registers only list, read, and literal search. No write or shell capability enters the agent loop.","<code>port-executor.ts</code>"],
      ["<code>Skill</code>","Represents one selected mini-harness instruction with a name, description, and full body.","<code>model-runtime.ts</code>"],
      ["<code>AgentSkills</code>","Adds progressive skill disclosure and the model-callable <code>skills</code> activation tool.","<code>model-runtime.ts</code>"],
      ["<code>plugins</code>","Registers <code>AgentSkills</code> on the Strands agent. Claude CLI does not use this field.","<code>model-runtime.ts</code>"],
      ["<code>structuredOutputSchema</code>","Requires the final answer to match <code>{ summary, files }</code>. Strands validates it and can feed schema failures back to the model.","<code>port-contract.ts</code>"],
      ["<code>printer: false</code>","Disables Strands' automatic console renderer so the CLI keeps stdout reserved for versioned JSON events.","<code>port-executor.ts</code>"],
      ["<code>agent.invoke()</code>","Starts one bounded run with the assembled phase prompt.","<code>port-executor.ts</code>"],
      ["<code>limits.turns</code> / <code>limits.totalTokens</code>","Bound the loop. The mini-harness allows three turns with skills and one without; the port allows 8 turns and 40,000 tokens.","<code>port-executor.ts</code>, <code>model-runtime.ts</code>"],
      ["<code>cancelSignal</code>","Lets a native ten-minute <code>AbortSignal</code> cancel the invocation at Strands cancellation points.","<code>port-executor.ts</code>"],
      ["<code>AgentResult</code>","Carries validated <code>structuredOutput</code>, messages, stop state, and metrics after invocation.","returned by <code>invoke()</code>"],
      ["<code>StructuredOutputError</code>","Makes a missing structured patch an explicit executor failure.","<code>port-executor.ts</code>"],
      ["<code>metrics.accumulatedUsage</code>","Reports input and output tokens. The harness records them and applies its own cost rates.","<code>port-executor.ts</code>"],
    ])}
    ${note("Keep the boundary visible","Zod supplies schemas, native <code>AbortSignal</code> supplies cancellation, and the harness supplies cost policy and verification. Strands consumes those inputs and runs the bounded agent loop.")}`;
}
function fullHarnessStrandsConstructs() {
  return `<h2>What the full TV Build harness adds</h2>
    <p>The mini-harness already uses AgentSkills. The production executor adds another provider and streaming.</p>
    ${table(["Construct","What it adds"],[
      ["<code>AnthropicModel</code>","Adds the direct Anthropic provider behind the common <code>Model</code> interface."],
      ["<code>agent.stream()</code>","Returns progress events during a long phase, followed by its final <code>AgentResult</code>."],
      ["<code>AgentStreamEvent</code>","Types <code>modelMessageEvent</code>, <code>contentBlockEvent</code>, and <code>toolResultEvent</code> as they become logs, token updates, and UI messages."],
    ])}
    ${note("Features still outside the design","The repository does not use Strands hooks, Graph, Swarm, agent-as-tool, SDK session or memory managers, custom conversation managers, or SDK-provided write and shell tools.")}`;
}
function mcpConstructs() {
  return `<h2>Strands MCP constructs used here</h2>
    ${table(["Construct","Role in the ADBT path"],[
      ["<code>McpClient</code>","Strands client wrapper that connects lazily, exposes MCP tools, calls them, and cleans up the connection."],
      ["<code>applicationName</code> / <code>applicationVersion</code>","Identify TV Build Workshop to the MCP server during connection setup."],
      ["<code>listTools()</code>","Discovers executable tool objects, then the harness requires <code>list_documents</code> and <code>read_document</code> by name."],
      ["<code>callTool(tool, args, { signal })</code>","Calls a discovered tool with JSON arguments and a bounded cancellation signal."],
      ["<code>JSONValue</code>","Keeps MCP arguments and results inside the JSON-compatible contract."],
      ["<code>disconnect()</code>","Closes the child server and transport in <code>finally</code>, including failure paths."],
    ])}
    ${note("The transport is a separate layer","<code>StdioClientTransport</code> comes from the official Model Context Protocol SDK, not Strands. It starts pinned ADBT as a child process. The harness uses <code>McpClient</code> directly; it does not register ADBT as an unrestricted agent tool source.")}`;
}
function lessonBrief(module) { return `<section class="lesson-brief" aria-label="Lesson goals"><div><span>By the end, you can</span><p>${module.objective}</p></div><div><span>Evidence you will produce</span><p>${module.evidence}</p></div></section>`; }
function lessonNavigation(module) {
  const index = modules.indexOf(module);
  const previous = modules[index - 1];
  const next = modules[index + 1];
  return `<nav class="lesson-nav" aria-label="Lesson navigation">${previous ? `<button data-go-module="${previous.id}"><span>Previous</span>${previous.number} · ${previous.nav}</button>` : "<span></span>"}${next ? `<button class="next" data-go-module="${next.id}"><span>Next</span>${next.number} · ${next.nav}</button>` : `<button class="next" data-go-module="welcome"><span>Review</span>Return to setup</button>`}</nav>`;
}
