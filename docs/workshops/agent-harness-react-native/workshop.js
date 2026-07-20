const commands = {
  doctor: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
yarn install --frozen-lockfile
npx tsx src/index.ts doctor --replay --json`,
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
WORKSHOP_INPUTS="$(mktemp -d)/pocket-cinema-inputs"
cp -R "$REPO/docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs" \\
  "$WORKSHOP_INPUTS"
cd "$REPO/packages/workshop-harness"`,
  memory: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts memory propose "$WORKSHOP_INPUTS" \\
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \\
  --json`,
  applyMemory: `cd "$(git rev-parse --show-toplevel)/packages/workshop-harness"
npx tsx src/index.ts memory apply "$WORKSHOP_INPUTS" \\
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
  adbt: `npx -y @amazon-devices/amazon-devices-buildertools-mcp@1.0.5 \\
  check-status --agent claude-code-cli`,
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
    id: "welcome", number: "00", nav: "Start here", time: "10 minutes", title: "Choose your workshop path",
    lead: "You will build a small coding harness, use it on one React Native flow, and inspect a Vega handoff. Replay is the default and needs no model account or device.",
    body: `${flow([["Plan","State the work"],["Run","Change one concern"],["Check","Collect evidence"],["Retry","Use the failure"]])}
      <h2>Choose an app</h2><div class="grid"><article><h3>Pocket Cinema</h3><p>Recommended. Every exercise and replay supports this app.</p><code>apps/workshop-pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working screen flow with no secrets. Switch to Pocket Cinema if discovery takes more than 10 minutes.</p><code>launch → screen → action → back</code></article></div>
      <h2>Before you continue</h2><div class="checklist">${["Node 18+, Yarn 1.22, and Git are installed","Both workshop packages are installed","I chose Pocket Cinema or a clean working app","I will use replay, Claude Code, or Strands","I know Vega device work is optional"].map(item => `<label><input type="checkbox">${item}</label>`).join("")}</div>
      ${command("Run the setup check","doctor")}${done("The command reports success, or you have chosen replay.")}${fallback("Use replay and the committed checkpoints. Do not spend the workshop fixing accounts or devices.")}`
  },
  {
    id: "single-agent", number: "01", nav: "One model call", time: "15 minutes", title: "Start with one model call",
    lead: "Run the smallest example and identify what it cannot prove.",
    body: `${command("Run Step 1 with replay","step1")}<h2>Do this</h2>${steps(["Open <code>steps/01-single-agent/index.ts</code>.","Find the prompt, response, and file-writing code.","Write down three claims that need an independent check."])}${done("You can point to the model boundary and name three missing checks.")}${fallback("The replay is the complete exercise. No live model is needed.")}`
  },
  {
    id: "verify", number: "02", nav: "Check and retry", time: "20 minutes", title: "Turn a failure into a useful retry",
    lead: "Run a mechanical check and send its exact failure into one bounded retry.",
    body: `${command("Replay the failed check and repair","step2")}${expected(`Pattern "Kitchen Stories" not found`)}<h2>Do this</h2>${steps(["Find the failed <code>grep</code> check in the output.","Open <code>steps/02-verify-loop/verify.ts</code>.","Find the same failure text in the retry request.","Confirm the second attempt passes."])}${done("You can trace requirement → failed check → retry → passing result.")}${fallback("Use the committed retry recording. Do not replace this exercise with a live call.")}`
  },
  {
    id: "phases", number: "03", nav: "Phases and resume", time: "25 minutes", title: "Split the work and resume it",
    lead: "Use phases for small changes, commits for verified code, and checkpoints for run progress.",
    body: `${command("Pause after the content phase","step3")}${expected(`Paused after content.\ncheckpoint.json: { "nextPhase": 2 }`)}${command("Resume the same run","step3Resume")}<h2>Do this</h2>${steps(["Open <code>out/checkpoint.json</code> after the first command.","Use <code>phases.json</code> to confirm index 2 is <code>polish</code>.","Resume without deleting <code>out/</code>.","Open the Git log and find one commit per passing phase."])}${done("The first command stops early and the second runs only polish, without repeating scaffold or content.")}${fallback("Read <code>fixtures/resume/README.md</code>, then repeat the two replay commands.")}`
  },
  {
    id: "skills", number: "04", nav: "Skills and executors", time: "20 minutes", title: "Separate knowledge from model access",
    lead: "A skill supplies domain instructions. An executor calls the model. The pipeline should not depend on one provider.",
    body: `${command("Run Step 4 with replay","step4")}<h2>Do this</h2>${steps(["Open <code>skills.ts</code>, <code>phase-context.ts</code>, <code>executor.ts</code>, and <code>recorder.ts</code>.","Find where the skill text enters the prompt.","Find the common interface used by replay, Claude Code, and Strands.","Compare the teaching modules with <code>packages/mini-harness/ISOMORPHISM.md</code>."])}<h2>Optional live commands</h2>${command("Use local Claude Code","step4Local")}${command("Use Strands with Bedrock","step4Remote")}${done("You can change model providers without changing the phase loop or its checks.")}${fallback("Replay shows the same module boundaries without credentials.")}`
  },
  {
    id: "memory", number: "05", nav: "Project memory", time: "15 minutes", title: "Review facts before saving them",
    lead: "Use a disposable input copy. Proposed context becomes project memory only after you review it.",
    body: `${command("Create a disposable input copy","memoryPrep")}${command("Create a memory proposal","memory")}${command("Apply the reviewed proposal","applyMemory")}<h2>Do this</h2>${steps(["Read the proposal before applying it.","Check that each fact names its source.","Keep open questions separate from decisions.","Open <code>$WORKSHOP_INPUTS/PROJECT_CONTEXT.md</code> after applying."])}${done("Every saved fact has a source and the repository fixture is unchanged.")}${fallback("Use the synthetic Bee snapshot. Live Bee access is not required.")}`
  },
  {
    id: "plan", number: "06", nav: "Plan and port", time: "35 minutes", title: "Inspect first, then change a guarded copy",
    lead: "Review scope, checks, ADBT context, seed, and cost before approving a port. The source app stays untouched.",
    body: `${flow([["ADBT","Load Vega workflows"],["Context","Inject into vega_port"],["Model","Edit guarded copy"],["Checks","Commit or retry"]])}${command("Plan the Pocket Cinema port","plan")}<h2>Approve only after this review</h2>${steps(["Confirm the source app and target flow.","Read the portability findings.","Check that ADBT is assigned to <code>vega_port</code>.","Check the six-stage plan, fixed seed, and $3 cap.","Notice that the sixth stage is the separate Vega lifecycle in lesson 8."])}${command("Run with recorded model and ADBT context","port")}<h2>Inspect the runtime context</h2>${steps(["Copy the <code>runId</code> from the output.","Open <code>out/&lt;runId&gt;/adbt-port-context.json</code> and find the two workflow names and hashes.","Open <code>port-result.json</code> and confirm <code>adbt.mode: replay</code>.","Open <code>app/NextSteps.md</code> and find the ADBT sources and unsupported-mappings section.","Inspect the guarded app and its Git log.","Confirm <code>apps/workshop-pocket-cinema</code> is unchanged."])}<h2>Optional: call ADBT live, keep the model replayed</h2>${command("Check the runtime ADBT interface","adbtDoctor")}${command("Run the port with runtime ADBT","portAdbtLive")}${note("What changes","The harness calls pinned ADBT <code>list_documents</code> and <code>read_document</code> before <code>vega_port</code>. The model response remains recorded, so this exercise needs no model account.")}${done("You can trace ADBT workflow lookup to the vega_port context, NextSteps evidence, verified commit, and report.")}${fallback("Use the recorded ADBT context. A live port stops with exit 3 when ADBT is unavailable; it never continues with unsupported assumptions.")}`
  },
  {
    id: "tv", number: "07", nav: "Test remote behavior", time: "20 minutes", title: "Test the flow, not one screenshot",
    lead: "Trace focus through launch, movement, Select, and Back. A passing build cannot prove this behavior.",
    body: `<div class="remote"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>${table(["Action","Expected result"],[["Launch","Featured action has focus"],["Down","Focus enters the first rail"],["Left / right","Focus stops at list boundaries"],["Select","Details opens for the focused card"],["Back","The same card regains focus"]])}${command("Run the executable focus check","focusCheck")}<h2>Do this</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from lesson 6.","Read <code>tv-focus-result.json</code>.","Open <code>fixtures/focus-failure/README.md</code> and find the failed Back transition.","Trace the focus state and restoration code in the guarded app."])}${done("The focus check passes the full transition sequence and writes <code>tv-focus-result.json</code>.")}${fallback("Run the same check in <code>checkpoints/vega-buildable/app</code>. No device is required.")}`
  },
  {
    id: "vega", number: "08", nav: "Run the Vega lifecycle", time: "25 minutes", title: "Hand the guarded app to Vega tools",
    lead: "The key-free replay teaches the complete lifecycle. A live Vega SDK and VDA run is optional device evidence.",
    body: `${note("Current rehearsal status","SDK 0.22.5875 builds and validates the app. Live install, launch, logs, and screenshots still require a VDA target that remains attached.","warning")}<div class="links"><a href="live-rehearsal.md">Read the rehearsal record</a></div>${command("Show the Vega plan","vegaPlan")}${command("Run the key-free lifecycle replay","vegaRun")}<h2>Inspect all eight gates</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from lesson 6.","Confirm SDK version and device status were checked before build.","Find build, install, launch, logs, capture, and pull results.","Check <code>checks[0].passed</code> and <code>evidenceMode: replay</code>.","Do not present replay evidence as device certification."])}<h2>Optional live device run</h2>${command("Check the pinned ADBT setup","adbt")}${note("ADBT changes local configuration","Run <code>init-context</code> before the workshop only when you need live agent guidance. Review its changes to <code>CLAUDE.md</code> and your Claude configuration.")}${command("Start VDA and keep this terminal open","vdaStart")}${command("Confirm the SDK and attached device","vdaCheck")}${command("Run with Vega SDK and VDA","vegaLive")}<h2>Claim live evidence only when</h2>${steps(["The SDK reports <code>0.22.5875</code>.","VDA status reports <code>running: true</code> and the device list is not empty.","Build, install, launch, logs, capture, and pull all pass.","The result says <code>evidenceMode: live</code> and the screenshot is from the device."])}${done("Replay is complete when all eight recorded gates pass. Live device testing is complete only when the live evidence checklist also passes.")}${fallback("An empty device list is a failure even with exit 0. Try one repair, then use replay or <code>checkpoints/complete/</code>.")}`
  },
  {
    id: "bee", number: "09", nav: "Optional Bee context", time: "15 minutes", title: "Import selected context, not a transcript",
    lead: "Run this only when Bee is configured and participants consent. The synthetic fixture is the normal workshop path.",
    body: `${command("Search Bee","beeSearch")}${command("Save one selected snapshot","beeSnapshot")}<h2>Do this</h2>${steps(["Check the source ids, dates, query, summary, and hash.","Review the snapshot before proposing memory.","Never commit a raw private transcript.","Confirm the approved snapshot works with Bee disconnected."])}${done("Every approved fact has a source and can be reused without Bee.")}${fallback("Use <code>fixtures/bee-context/snapshot.json</code> or skip this optional module.")}`
  },
  {
    id: "finish", number: "10", nav: "Build your own", time: "15 minutes", title: "Design one harness for your work",
    lead: "Keep the pipeline and replace the TV skill, Vega commands, and D-pad checks with your domain.",
    body: `<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div><h2>Do this</h2>${steps(["Open <code>worksheet.md</code>.","Name one outcome that can finish in one session.","Choose the fewest useful phases.","Give every phase one independent check.","Define the approval point, cost limit, and saved evidence.","Name your replacement for the TV skill, Vega adapter, and D-pad check."])}${done("Another developer can follow your worksheet and knows when the harness must stop.")}<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a></div>`
  }
];

const storageKey = "past-the-vibes-progress-v2";
const linksHost = document.getElementById("module-links");
const content = document.getElementById("content");

linksHost.innerHTML = modules.map(module => `<button class="module-link" data-module="${module.id}"><span>${module.number}</span>${module.nav}</button>`).join("");

function showModule(id, updateHash = true) {
  if (id === "port") id = "plan";
  const module = modules.find(item => item.id === id) || modules[0];
  content.innerHTML = `<section class="module"><div class="module-head"><div><p class="step">Step ${module.number} · ${module.time}</p><h1>${module.title}</h1></div><label class="complete"><input type="checkbox" id="complete-module"> Done</label></div><p class="lead">${module.lead}</p>${module.body}</section>`;
  document.querySelectorAll(".module-link").forEach(link => link.classList.toggle("active", link.dataset.module === module.id));
  document.getElementById("complete-module").checked = progress().has(module.id);
  document.getElementById("complete-module").addEventListener("change", event => setComplete(module.id, event.target.checked));
  document.querySelectorAll(".copy").forEach(button => button.addEventListener("click", () => copyCommand(button.dataset.command)));
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
function done(text) { return note("You are done when", text, "success"); }
function fallback(text) { return note("If blocked", text, "warning"); }
function expected(text) { return `<div class="expected"><strong>Find this evidence</strong><pre><code>${escape(text)}</code></pre></div>`; }
function flow(items) { return `<div class="flow">${items.map((item, index) => `${index ? "<i>→</i>" : ""}<div><b>${item[0]}</b><span>${item[1]}</span></div>`).join("")}</div>`; }
function table(headers, rows) { return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
