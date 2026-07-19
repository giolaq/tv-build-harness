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
  memory: `cd packages/workshop-harness
npx tsx src/index.ts memory propose \\
  ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
  --from ../../docs/workshops/agent-harness-react-native/fixtures/bee-context/snapshot.json \\
  --json`,
  applyMemory: `npx tsx src/index.ts memory apply \\
  ../../docs/workshops/agent-harness-react-native/fixtures/pocket-cinema-inputs \\
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
  vegaPlan: `cd packages/workshop-harness
npx tsx src/index.ts vega-run <runId> --plan --json`,
  vegaRun: `npx tsx src/index.ts vega-run <runId> --yes --json`,
  beeSearch: `cd packages/workshop-harness
npx tsx src/index.ts context bee search \\
  "Pocket Cinema product decisions" --json`,
  beeSnapshot: `npx tsx src/index.ts context bee snapshot <conversationId> \\
  --out candidate-context.json --json`,
};

const modules = [
  {
    id: "welcome", number: "00", nav: "Start here", time: "15 minutes", title: "Build the loop, then prove it on TV",
    lead: "Build an agent harness one pressure at a time, then use it to adapt one React Native flow for Vega TV. Bring your app or use Pocket Cinema.",
    body: `${flow([["Plan","Bound the work"],["Execute","Change one concern"],["Verify","Collect evidence"],["Retry","Use exact failures"]])}
      <h2>Choose your path</h2><div class="grid"><article><h3>Use Pocket Cinema</h3><p>The reliable path, with deliberate TV adaptation gaps.</p><code>apps/workshop-pocket-cinema</code></article><article><h3>Bring your React Native app</h3><p>Choose one bounded screen or flow. It must work locally and contain no secrets.</p><code>launch → screen → action → back</code></article></div>
      <h2>Preflight</h2><div class="checklist">${["Node 18+, Yarn 1.22, and Git are installed","Repository dependencies are installed","My source is clean and contains no production secrets","Claude Code, Strands credentials, or replay is ready","Vega SDK 0.22 and VDA are ready, or I will use replay","The instructor supplied a pinned ADBT version"].map(item=>`<label><input type="checkbox">${item}</label>`).join("")}</div>
      ${command("Run the workshop doctor","doctor")}${note("Blocked?","Use recordings and checkpoints. Device or model setup must not block the harness lesson.")}`
  },
  {
    id:"single-agent", number:"01", nav:"Single agent", time:"25 minutes", title:"Start with one agent call",
    lead:"Make the smallest useful boundary visible: prompt, model, response, and files. Then name everything it cannot prove.",
    body:`${command("Run Step 1 without a key","step1")}<h2>Inspect</h2>${tasks(["Open <code>steps/01-single-agent/index.ts</code>.","Find the model and file-writing boundaries.","List the claims made without independent evidence.","Record baseline duration and replay cost."])}${note("Pressure introduced","A successful response is not a trustworthy development system.")}`
  },
  {
    id:"verify", number:"02", nav:"Verify and retry", time:"30 minutes", title:"Close the first loop",
    lead:"Run mechanical checks, feed the exact failure into one retry, and stop after the bounded attempt.",
    body:`${command("Replay a failure and repair","step2")}${expected(`content: verify failed: Pattern "Kitchen Stories" not found\ncontent: Fixed the missing required show title after verification feedback.`)}
      ${table(["Signal","Meaning","Action"],[["Check passes","Phase contract satisfied","Commit"],["Check fails","Evidence is missing","Retry once with failure"],["Retry fails","Bounded attempt exhausted","Stop and report"]])}`
  },
  {
    id:"phases", number:"03", nav:"Phases and checkpoints", time:"35 minutes", title:"Turn the task into a pipeline",
    lead:"Separate concerns, commit successful phases, checkpoint execution state, and resume without repeating completed work.",
    body:`${command("Run the phased harness","step3")}${diagram(["scaffold","checkpoint","content","checkpoint","polish","report"])}${tasks(["Open the checkpoint and identify the next phase.","Inspect summaries and accumulated cost.","Kill the instructor demo between phases and resume it.","Explain why execution state is not product truth."])}`
  },
  {
    id:"skills", number:"04", nav:"Tools and skills", time:"30 minutes", title:"Separate knowledge, capability, and execution",
    lead:"A skill tells the agent what matters. A tool gives it capability. An executor owns the model call. The pipeline stays independent.",
    body:`${command("Run the final stage with replay","step4")}${command("Use local Claude Code","step4Local")}${command("Use a remote model through Strands","step4Remote")}<div class="grid"><article><h3>Skill</h3><p>Reusable domain procedure injected only where relevant.</p></article><article><h3>Tool</h3><p>Narrow, testable capability with explicit side effects.</p></article><article><h3>Executor</h3><p>Replay, Claude Code, or Strands behind one interface.</p></article><article><h3>Recorder</h3><p>A replayable tap at the executor boundary.</p></article></div><p><a href="https://github.com/giolaq/tv-build-harness/blob/main/packages/mini-harness/ISOMORPHISM.md">Compare teaching and production modules</a>.</p>`
  },
  {
    id:"memory", number:"05", nav:"Project memory", time:"20 minutes", title:"Make durable context inspectable",
    lead:"Project decisions enter the harness only after review. Checkpoints, recordings, memory, and external context remain different artifacts.",
    body:`${command("Review a synthetic Bee snapshot","memory")}${command("Apply after human approval","applyMemory")}${table(["Artifact","Question it answers"],[["Inputs","What are we building?"],["Project memory","What approved facts persist?"],["Checkpoint","Where can this run resume?"],["Recording","What did the executor exchange?"],["Bee snapshot","Which context was proposed?"]])}`
  },
  {
    id:"plan", number:"06", nav:"Plan the port", time:"20 minutes", title:"Inspect before the agent edits",
    lead:"Plan is read-only: discover the app, classify Vega risk, select approved memory, fix the seed and cap, and show every phase.",
    body:`${command("Plan Pocket Cinema","plan")}<h2>Review before approval</h2>${table(["Classification","Meaning"],[["portable","Reusable as-is"],["replace","Needs a Vega implementation"],["manual","Needs a developer decision"],["out_of_scope","Not attempted here"]])}${tasks(["Confirm source and the selected vertical slice.","Challenge unsupported-dependency findings.","Read approved project context.","Show phases, seed, and the $3 cap to the human."])}${note("Plan spends nothing","It does not edit, copy, call a model, or run Vega. Execution requires a separate run --yes.","warning")}`
  },
  {
    id:"port", number:"07", nav:"Port to Vega", time:"35 minutes", title:"Run the guarded Vega port",
    lead:"Copy the app, run three bounded concerns, verify each patch, roll failures back, and commit successful phases.",
    body:`${command("Run the canonical key-free port","port")}${diagram(["tv_product_spec","verify + commit","vega_port","verify + commit","tv_behavior","guarded app"])}<h2>Inspect the evidence</h2>${tasks(["<code>portability-report.json</code>: what moves and what changes.","<code>port-result.json</code>: attempts, checks, summaries, and cost.","<code>out/&lt;runId&gt;/app</code>: the guarded source copy.","Git log: one commit per verified concern.","Original app: unchanged and clean."])}${note("Checkpoint","Compare with <code>checkpoints/vega-buildable/app</code>.")}`
  },
  {
    id:"tv", number:"08", nav:"TV behavior", time:"25 minutes", title:"Verify behavior a compiler cannot see",
    lead:"A valid build can still be unusable from a remote. Test transitions, not screenshots alone.",
    body:`<div class="remote"><button>↑</button><button>←</button><button class="ok">OK</button><button>→</button><button>↓</button></div>${table(["Transition","Expected evidence"],[["Launch","Featured action has visible initial focus"],["Down","Focus enters the first rail"],["Left / right","Movement respects boundaries"],["Select","Details opens for the focused card"],["Back","Originating card regains focus"]])}${expected(`focus_restore failed: expected card "paper" after BACK,\nobserved featured action "signal".`)}${tasks(["Open <code>TV_VERIFICATION.md</code>.","Find <code>hasTVPreferredFocus</code> and each <code>onFocus</code>.","Explain why screenshots cannot prove reachability or restoration."])}`
  },
  {
    id:"vega", number:"09", nav:"Build on Vega", time:"20 minutes", title:"Hand the guarded port to Vega",
    lead:"ADBT supplies Vega knowledge and diagnostics. Kepler/VDA execute the guarded apps/vega package. The harness records platform evidence.",
    body:`${command("Show the platform plan","vegaPlan")}${command("Build after confirmation","vegaRun")}<h2>Collect</h2>${tasks(["ADBT package and Vega SDK versions.","VDA image and device status.","Kepler build output and failure class.","Launch logs and stable screenshots.","D-pad transitions and remaining blockers."])}<figure class="terminal"><img src="../../tui-screenshot.png" alt="TV Build terminal showing a phased run"><figcaption>The full harness uses the same observable phase discipline.</figcaption></figure>${note("Build is not completion","Live VDA and D-pad evidence are the final gate.","warning")}`
  },
  {
    id:"bee", number:"10", nav:"Bee context", time:"20 minutes", title:"Add conversation context without hidden memory",
    lead:"Bee is optional. Search, select, snapshot, review, and approve. The run remains reproducible with Bee disconnected.",
    body:`${diagram(["Bee search","select","snapshot","review","approve","project memory"])}${command("Search Bee","beeSearch")}${command("Create a selected snapshot","beeSnapshot")}${note("No Bee or no consent?","Use <code>fixtures/bee-context/snapshot.json</code>. The file provider is first-class.")}${tasks(["Verify source ids, timestamps, query, and summary hash.","Keep raw private transcripts out of Git.","Prove the approved snapshot works with Bee disconnected."])}`
  },
  {
    id:"finish", number:"11", nav:"Take it home", time:"15 minutes", title:"Replace TV, keep the loop",
    lead:"The workshop succeeds when you can remove Vega knowledge and retain the development system.",
    body:`<div class="takeaway"><code>plan → scoped context → executor → tools → verify → retry → checkpoint → report</code></div><h2>Your next harness</h2>${tasks(["Name one bounded development outcome.","Choose the smallest phase sequence.","Write down what the model does not know.","Give every phase a mechanical check.","Define what to record, cap, approve, and resume.","Replace the TV skill and Vega adapter with your domain."])}<div class="links"><a href="worksheet.md">Worksheet</a><a href="IMPLEMENTATION_STATUS.md">Rehearsal gaps</a><a href="instructor-guide.md">Instructor guide</a></div>${note("You built a development system","The agent is one replaceable component inside it.","success")}`
  }
];

const storageKey = "past-the-vibes-progress-v1";
const linksHost = document.getElementById("module-links");
const content = document.getElementById("content");

linksHost.innerHTML = modules.map(m => `<button class="module-link" data-module="${m.id}"><span>${m.number}</span>${m.nav}</button>`).join("");

function showModule(id, updateHash=true) {
  const module = modules.find(item => item.id === id) || modules[0];
  content.innerHTML = `<section class="module"><div class="module-head"><div><p class="step">Module ${module.number} · ${module.time}</p><h1>${module.title}</h1></div><label class="complete"><input type="checkbox" id="complete-module"> Complete</label></div><p class="lead">${module.lead}</p>${module.body}</section>`;
  document.querySelectorAll(".module-link").forEach(link => link.classList.toggle("active", link.dataset.module === module.id));
  document.getElementById("complete-module").checked = progress().has(module.id);
  document.getElementById("complete-module").addEventListener("change", event => setComplete(module.id, event.target.checked));
  document.querySelectorAll(".copy").forEach(button => button.addEventListener("click", () => copyCommand(button.dataset.command)));
  if (updateHash) history.replaceState(null,"",`#${module.id}`);
  document.title = `${module.nav} · Past the Vibes`;
  content.focus({preventScroll:true}); window.scrollTo({top:0,behavior:"smooth"});
}

function progress() { try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { return new Set(); } }
function setComplete(id, checked) { const state=progress(); checked?state.add(id):state.delete(id); localStorage.setItem(storageKey,JSON.stringify([...state])); renderProgress(); }
function renderProgress() { const state=progress(); document.querySelectorAll(".module-link").forEach(link=>link.classList.toggle("done",state.has(link.dataset.module))); document.getElementById("progress").value=state.size; document.getElementById("progress-label").textContent=`${state.size} of ${modules.length} complete`; }
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

document.querySelectorAll(".module-link").forEach(link=>link.addEventListener("click",()=>showModule(link.dataset.module)));
document.getElementById("reset-progress").addEventListener("click",()=>{localStorage.removeItem(storageKey);renderProgress();showModule(location.hash.slice(1)||"welcome",false);});
renderProgress(); showModule(location.hash.slice(1)||"welcome",false);

function escape(value) { return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function command(title,key) { return `<div class="command"><header><span>${title}</span><button class="copy" data-command="${key}">Copy</button></header><pre><code>${escape(commands[key])}</code></pre></div>`; }
function tasks(items) { return `<ul class="tasks">${items.map(item=>`<li>${item}</li>`).join("")}</ul>`; }
function note(title,text,type="") { return `<aside class="note ${type}"><strong>${title}</strong><br>${text}</aside>`; }
function expected(text) { return `<div class="expected"><strong>Expected evidence</strong><pre><code>${escape(text)}</code></pre></div>`; }
function flow(items) { return `<div class="flow">${items.map((item,index)=>`${index?"<i>→</i>":""}<div><b>${item[0]}</b><span>${item[1]}</span></div>`).join("")}</div>`; }
function diagram(items) { return `<div class="diagram">${items.map((item,index)=>index%2?`<i>${item}</i>`:`<b>${item}</b>`).join("")}</div>`; }
function table(headers,rows) { return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
