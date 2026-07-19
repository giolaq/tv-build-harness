const commands = {
  doctor: `cd packages/workshop-harness
yarn install --frozen-lockfile
npx tsx src/index.ts doctor --json`,
  step1: `cd packages/mini-harness
npx tsx steps/01-single-agent/index.ts run \\
  steps/01-single-agent/fixtures/phases.json \\
  --replay steps/01-single-agent/fixtures/demo-recording.json`,
  step2: `cd packages/mini-harness
npx tsx steps/02-verify-loop/index.ts run \\
  steps/02-verify-loop/fixtures/phases.json \\
  --replay steps/02-verify-loop/fixtures/retry-recording.json`,
  step3: `cd packages/mini-harness
npx tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --replay steps/03-phases/fixtures/demo-recording.json`,
  step3Resume: `npx tsx steps/03-phases/index.ts run \\
  steps/03-phases/fixtures/phases.json \\
  --replay steps/03-phases/fixtures/demo-recording.json \\
  --resume`,
  step4: `cd packages/mini-harness
npx tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --replay steps/04-skills/fixtures/demo-recording.json`,
  step4Local: `npx tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --executor claude-cli --model sonnet`,
  step4Remote: `npx tsx steps/04-skills/index.ts run \\
  steps/04-skills/fixtures/phases.json \\
  --executor strands --provider bedrock \\
  --model anthropic.claude-3-5-sonnet-20241022-v2:0 \\
  --region us-west-2`,
  memoryPrep: `rm -rf /tmp/pocket-cinema-inputs
cp -R docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  /tmp/pocket-cinema-inputs
cd packages/workshop-harness`,
  memory: `npx tsx src/index.ts memory propose /tmp/pocket-cinema-inputs \\
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \\
  --json`,
  applyMemory: `npx tsx src/index.ts memory apply /tmp/pocket-cinema-inputs \\
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \\
  --yes --json`,
  plan: `cd packages/workshop-harness
npx tsx src/index.ts plan ../../apps/workshop-pocket-cinema \\
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  --seed workshop-v1 --max-cost 3 --json`,
  port: `cd packages/workshop-harness
npx tsx src/index.ts run ../../apps/workshop-pocket-cinema \\
  --inputs ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  --replay ../../docs/workshops/agent-harness-react-native/fixtures/port-recording.json \\
  --yes --seed workshop-v1 --max-cost 3 --json`,
  adbt: `npx -y @amazon-devices/amazon-devices-buildertools-mcp@<pinned-version> \\
  check-status --agent claude-code-cli`,
  vegaPlan: `cd packages/workshop-harness
npx tsx src/index.ts vega-run <runId> --plan --json`,
  vegaRun: `npx tsx src/index.ts vega-run <runId> \\
  --yes --seed workshop-v1 --max-cost 10 --json`,
  beeSearch: `cd packages/workshop-harness
npx tsx src/index.ts context bee search \\
  "Pocket Cinema product decisions" --json`,
  beeSnapshot: `npx tsx src/index.ts context bee snapshot <conversationId> \\
  --out candidate-context.json --json`,
};

const modules = [
  {
    id: "welcome", number: "00", nav: "Start here", time: "15 minutes", title: "Choose your workshop path",
    lead: "You will build a small coding harness, use it on one React Native flow, and inspect a Vega handoff. Replay is the default and needs no model account or device.",
    body: `${flow([["Plan","State the work"],["Run","Change one concern"],["Check","Collect evidence"],["Retry","Use the failure"]])}
      <h2>Choose an app</h2><div class="grid"><article><h3>Pocket Cinema</h3><p>Recommended. Every exercise and replay supports this app.</p><code>apps/workshop-pocket-cinema</code></article><article><h3>Your app</h3><p>Use one working screen flow with no secrets. Switch to Pocket Cinema if discovery takes more than 10 minutes.</p><code>launch → screen → action → back</code></article></div>
      <h2>Before you continue</h2><div class="checklist">${["Node 18+, Yarn 1.22, and Git are installed","Both workshop packages are installed","I chose Pocket Cinema or a clean working app","I will use replay, Claude Code, or Strands","I know Vega device work is optional"].map(item => `<label><input type="checkbox">${item}</label>`).join("")}</div>
      ${command("Run the setup check","doctor")}${done("The command reports success, or you have chosen replay.")}${fallback("Use replay and the committed checkpoints. Do not spend the workshop fixing accounts or devices.")}`
  },
  {
    id: "single-agent", number: "01", nav: "One model call", time: "25 minutes", title: "Start with one model call",
    lead: "Run the smallest example and identify what it cannot prove.",
    body: `${command("Run Step 1 with replay","step1")}<h2>Do this</h2>${steps(["Open <code>steps/01-single-agent/index.ts</code>.","Find the prompt, response, and file-writing code.","Write down three claims that need an independent check."])}${done("You can point to the model boundary and name three missing checks.")}${fallback("The replay is the complete exercise. No live model is needed.")}`
  },
  {
    id: "verify", number: "02", nav: "Check and retry", time: "30 minutes", title: "Turn a failure into a useful retry",
    lead: "Run a mechanical check and send its exact failure into one bounded retry.",
    body: `${command("Replay the failed check and repair","step2")}${expected(`Pattern "Kitchen Stories" not found`)}<h2>Do this</h2>${steps(["Find the failed <code>grep</code> check in the output.","Open <code>steps/02-verify-loop/verify.ts</code>.","Find the same failure text in the retry request.","Confirm the second attempt passes."])}${done("You can trace requirement → failed check → retry → passing result.")}${fallback("Use the committed retry recording. Do not replace this exercise with a live call.")}`
  },
  {
    id: "phases", number: "03", nav: "Phases and resume", time: "35 minutes", title: "Split the work and resume it",
    lead: "Use phases for small changes, commits for verified code, and checkpoints for run progress.",
    body: `${command("Run the phased example","step3")}${command("Resume the same run","step3Resume")}<h2>Do this</h2>${steps(["Open the checkpoint and find the next phase.","Find the saved summaries and total cost.","Open the generated Git log and find one commit per passing phase.","Explain why a checkpoint is not permanent product memory."])}${done("You can identify what resumes and what was already verified.")}${fallback("Read <code>fixtures/resume/README.md</code> and use the instructor checkpoint.")}`
  },
  {
    id: "skills", number: "04", nav: "Skills and executors", time: "30 minutes", title: "Separate knowledge from model access",
    lead: "A skill supplies domain instructions. An executor calls the model. The pipeline should not depend on one provider.",
    body: `${command("Run Step 4 with replay","step4")}<h2>Do this</h2>${steps(["Open <code>skills.ts</code>, <code>phase-context.ts</code>, <code>executor.ts</code>, and <code>recorder.ts</code>.","Find where the skill text enters the prompt.","Find the common interface used by replay, Claude Code, and Strands.","Compare the teaching modules with <code>packages/mini-harness/ISOMORPHISM.md</code>."])}<h2>Optional live commands</h2>${command("Use local Claude Code","step4Local")}${command("Use Strands with Bedrock","step4Remote")}${done("You can change model providers without changing the phase loop or its checks.")}${fallback("Replay shows the same module boundaries without credentials.")}`
  },
  {
    id: "memory", number: "05", nav: "Project memory", time: "20 minutes", title: "Review facts before saving them",
    lead: "Use a disposable input copy. Proposed context becomes project memory only after you review it.",
    body: `${command("Create a disposable input copy","memoryPrep")}${command("Create a memory proposal","memory")}${command("Apply the reviewed proposal","applyMemory")}<h2>Do this</h2>${steps(["Read the proposal before applying it.","Check that each fact names its source.","Keep open questions separate from decisions.","Open <code>/tmp/pocket-cinema-inputs/PROJECT_CONTEXT.md</code> after applying."])}${done("Every saved fact has a source and the repository fixture is unchanged.")}${fallback("Use the synthetic Bee snapshot. Live Bee access is not required.")}`
  },
  {
    id: "plan", number: "06", nav: "Plan the app change", time: "20 minutes", title: "Inspect the app before editing",
    lead: "Create a read-only plan for one screen flow. Check the scope, phases, seed, and cost before running.",
    body: `${command("Plan the Pocket Cinema port","plan")}<h2>Do this</h2>${steps(["Confirm the source app and target flow.","Read the portability findings.","Check the full phase sequence, fixed seed, and $3 cap.","Show the plan before approving execution."])}${done("You can explain what will change, what will not change, and what each phase checks.")}${fallback("Use Pocket Cinema and <code>checkpoints/audit-complete/</code>.")}`
  },
  {
    id: "port", number: "07", nav: "Run the TV port", time: "35 minutes", title: "Change a guarded copy",
    lead: "Run the recorded port, keep the source app untouched, and inspect one verified commit per concern.",
    body: `${command("Run the key-free port","port")}<h2>Do this</h2>${steps(["Copy the <code>runId</code> from the output.","Open <code>out/&lt;runId&gt;/portability-report.json</code> and <code>port-result.json</code>.","Inspect <code>out/&lt;runId&gt;/app</code> and its Git log.","Confirm <code>apps/workshop-pocket-cinema</code> is unchanged."])}${done("You have a runId, all five reported phases are complete, and the source app is clean.")}${fallback("Use <code>checkpoints/vega-buildable/</code> for the remaining exercises.")}`
  },
  {
    id: "tv", number: "08", nav: "Test remote behavior", time: "25 minutes", title: "Test the flow, not one screenshot",
    lead: "Trace focus through launch, movement, Select, and Back. A passing build cannot prove this behavior.",
    body: `<div class="remote"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>${table(["Action","Expected result"],[["Launch","Featured action has focus"],["Down","Focus enters the first rail"],["Left / right","Focus stops at list boundaries"],["Select","Details opens for the focused card"],["Back","The same card regains focus"]])}<h2>Do this</h2>${steps(["Open <code>checkpoints/vega-buildable/app/TV_VERIFICATION.md</code>.","Open <code>fixtures/focus-failure/README.md</code>.","Find the failed Back transition.","Find <code>hasTVPreferredFocus</code> and the <code>onFocus</code> handlers in the guarded app."])}${done("You can name the focus target after each remote action and show evidence when it is wrong.")}${fallback("Use the focus fixture. A virtual device is not required.")}`
  },
  {
    id: "vega", number: "09", nav: "Build on Vega", time: "20 minutes", title: "Hand the guarded app to Vega tools",
    lead: "ADBT supplies current Vega guidance. Kepler builds. VDA runs the app. The harness records the evidence.",
    body: `${command("Check the pinned ADBT setup","adbt")}${command("Show the Vega plan","vegaPlan")}${command("Run after approval","vegaRun")}<h2>Do this</h2>${steps(["Replace <code>&lt;runId&gt;</code> with the id from the port lesson.","Read the plan before running it.","Record SDK, ADBT, and VDA versions.","Inspect build, launch, logs, screenshots, and D-pad results.","Label failures as setup problems or app problems."])}${done("The Vega report contains repeatable build and device evidence.")}${fallback("Try one repair for 10 minutes, then use <code>checkpoints/complete/</code>.")}`
  },
  {
    id: "bee", number: "10", nav: "Optional Bee context", time: "20 minutes", title: "Import selected context, not a transcript",
    lead: "Run this only when Bee is configured and participants consent. The synthetic fixture is the normal workshop path.",
    body: `${command("Search Bee","beeSearch")}${command("Save one selected snapshot","beeSnapshot")}<h2>Do this</h2>${steps(["Check the source ids, dates, query, summary, and hash.","Review the snapshot before proposing memory.","Never commit a raw private transcript.","Confirm the approved snapshot works with Bee disconnected."])}${done("Every approved fact has a source and can be reused without Bee.")}${fallback("Use <code>fixtures/bee-context/snapshot.json</code> or skip this optional module.")}`
  },
  {
    id: "finish", number: "11", nav: "Build your own", time: "15 minutes", title: "Design one harness for your work",
    lead: "Keep the pipeline and replace the TV skill, Vega commands, and D-pad checks with your domain.",
    body: `<div class="takeaway"><code>plan → context → run → check → retry → checkpoint → report</code></div><h2>Do this</h2>${steps(["Open <code>worksheet.md</code>.","Name one outcome that can finish in one session.","Choose the fewest useful phases.","Give every phase one independent check.","Define the approval point, cost limit, and saved evidence.","Name your replacement for the TV skill, Vega adapter, and D-pad check."])}${done("Another developer can follow your worksheet and knows when the harness must stop.")}<div class="links"><a href="worksheet.md">Open the worksheet</a><a href="troubleshooting.md">Troubleshooting</a><a href="instructor-guide.md">Instructor guide</a></div>`
  }
];

const storageKey = "past-the-vibes-progress-v1";
const linksHost = document.getElementById("module-links");
const content = document.getElementById("content");

linksHost.innerHTML = modules.map(module => `<button class="module-link" data-module="${module.id}"><span>${module.number}</span>${module.nav}</button>`).join("");

function showModule(id, updateHash = true) {
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
