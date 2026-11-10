const SUPABASE_URL = "https://vhiijraiwcfwnmdjjihx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jWXIzNiA_epaxz8T9a4hvQ_cQWFHwCr";   // anon key only. NEVER put the service key here.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
const MSG = {
  invalid: "That email and code don't match. Check both and try again.",
  voted: "This code has already been used to vote.",
  locked: "Too many wrong tries. Please contact the election committee.",
  closed: "Voting isn't open right now.",
  bad_ballot: "Something was wrong with your ballot. Please reload and try again.",
  error: "Couldn't reach the server. Try again in a moment."
};
let email = "", code = "", candidates = [], ranking = [];

function show(id){ document.querySelectorAll(".screen").forEach(s => s.hidden = s.id !== id); }
function say(el, text, err = true){ el.textContent = text; el.classList.toggle("err", err); }

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  email = $("email").value.trim().toLowerCase(); code = $("code").value.trim();
  say($("loginMsg"), "Checking…", false);
  const { data, error } = await db.rpc("verify_voter", { p_email: email, p_code: code });
  if (error) return say($("loginMsg"), MSG.error);
  if (data.status !== "ok") return say($("loginMsg"), MSG[data.status] || MSG.error);
  candidates = data.candidates; $("batchName").textContent = data.batch + " election. ";
  render(); show("ballot");
});

function render(){
  const pool = $("pool"), ranked = $("ranked");
  pool.innerHTML = ranked.innerHTML = "";
  const item = (c, extra) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "name"; b.type = "button";
    b.append(c.name);
    if (c.bio) { const s = document.createElement("small"); s.textContent = c.bio; b.append(s); }
    li.append(b);
    return { li, b };
  };
  candidates.filter(c => !ranking.includes(c.id)).forEach(c => {
    const { li, b } = item(c);
    b.title = "Add to my ranking";
    b.onclick = () => { ranking.push(c.id); render(); };
    pool.append(li);
  });
  ranking.forEach((id, i) => {
    const c = candidates.find(x => x.id === id);
    const { li, b } = item(c);
    b.disabled = true;
    const btn = (t, label, fn, off) => {
      const x = document.createElement("button");
      x.type = "button"; x.className = "mini"; x.textContent = t; x.ariaLabel = label + " " + c.name;
      x.disabled = off; x.onclick = fn; li.append(x);
    };
    const move = d => () => { [ranking[i], ranking[i + d]] = [ranking[i + d], ranking[i]]; render(); };
    btn("↑", "Move up", move(-1), i === 0);
    btn("↓", "Move down", move(1), i === ranking.length - 1);
    btn("✕", "Remove", () => { ranking.splice(i, 1); render(); });
    ranked.append(li);
  });
  $("empty").hidden = ranking.length > 0;
  $("submit").disabled = ranking.length === 0;
}

$("submit").addEventListener("click", async () => {
  if (!confirm(`Cast your vote with ${ranking.length} ranked candidate(s)? This can't be undone.`)) return;
  $("submit").disabled = true; say($("ballotMsg"), "Saving your vote…", false);
  const { data, error } = await db.rpc("cast_vote", { p_email: email, p_code: code, p_ranking: ranking });
  if (error || data !== "ok") { $("submit").disabled = false; return say($("ballotMsg"), MSG[data] || MSG.error); }
  email = code = ""; ranking = []; show("done");
});
