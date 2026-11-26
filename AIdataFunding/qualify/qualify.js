// Alor Solutions data-licensing qualifier.
// Scores the answers in the browser, shows the right next step, and sends everything to a
// GoHighLevel inbound-webhook workflow, which creates the contact, tags it and sends the emails.
(function () {
  "use strict";

  var CONFIG = {
    // GHL: Automation > Workflows > "Data Licensing: Qualifier" > Inbound Webhook trigger.
    GHL_WEBHOOK_URL: "https://services.leadconnectorhq.com/hooks/lEqWwjtkibEh35SiVbMP/webhook-trigger/51feb30b-f15a-43d3-9d1b-b9f6942a4fd2"
  };

  var PRO_MIN_STAFF = { "Law firm": 6, "Accounting / CPA": 10, "Healthcare": 0, "Energy": 0, "Engineering": 0 };

  // Pure scoring, so it can be tested on its own.
  function score(a) {
    var staff = +a.desk_staff || 0, years = +a.years || 0, sys = (a.systems || []).length;
    var reasons = [], path = "";

    if (a.status === "Closed") {
      if (staff >= 50 && a.headcount_proof === "Yes") path = "Closed company (50+ desk staff)";
      else if (staff >= 50) { path = "Closed company (50+ desk staff)"; reasons.push("We need to confirm you can show your headcount."); }
    } else {
      if (staff >= 20 && years >= 3 && sys >= 5) path = "Standard (20+ desk staff, 3+ years, 5+ systems)";
      else if (a.industry in PRO_MIN_STAFF && staff >= PRO_MIN_STAFF[a.industry] && years >= 3 && sys >= 3)
        path = "Professional firm (" + a.industry + ")";
      else if (staff >= 20 && years >= 3 && sys >= 3) {
        path = "Standard, near miss"; reasons.push("You listed " + sys + " software tools; most buyers look for 5 or more.");
      }
      // 10-19 desk staff: held for a possible second licensing partner with a lower minimum.
      else if (staff >= 10 && years >= 3 && sys >= 3) {
        path = "Smaller team (10-19 desk staff), second partner";
        reasons.push("Your team size fits some of our licensed partners but not all, so we'd like to match you to the right one.");
      }
    }
    if (!path) return { outcome: "not_qualified", path: "None", reasons: [] };

    if (a.authorized !== "Yes") reasons.push("The introduction needs someone authorized to explore agreements for the company.");
    if (a.already_introduced === "Yes") reasons.push("You mentioned an earlier introduction, which we need to check first.");
    if (a.accounts === "Mostly personal") reasons.push("Data held in personal accounts may be hard to export.");

    return { outcome: reasons.length ? "review" : "qualified", path: path, reasons: reasons };
  }

  if (typeof module !== "undefined") { module.exports = { score: score }; return; }

  var form = document.getElementById("q");
  var steps = [].slice.call(form.querySelectorAll("fieldset[data-step]"));
  var dots = [].slice.call(document.querySelectorAll(".progress li"));
  var back = document.getElementById("back"), next = document.getElementById("next"), err = document.getElementById("err");
  var cur = 0;

  function show(i) {
    cur = i;
    steps.forEach(function (s, j) { s.hidden = j !== i; });
    dots.forEach(function (d, j) { d.classList.toggle("on", j <= i); });
    back.hidden = i === 0;
    next.textContent = i === steps.length - 1 ? "See my result" : "Continue";
    err.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function valid(step) {
    var bad = null;
    var fields = step.querySelectorAll("input[required], select[required], textarea[required]");
    for (var k = 0; k < fields.length; k++) {
      var f = fields[k];
      if (f.type === "radio") {
        if (!step.querySelector('input[name="' + f.name + '"]:checked')) { bad = f; break; }
      } else if (f.type === "checkbox") {
        if (!f.checked) { bad = f; break; }
      } else if (!f.checkValidity() || !f.value.trim()) { bad = f; break; }
    }
    if (!bad && step.dataset.step === "3" && !form.querySelectorAll('input[name="systems"]:checked').length) {
      err.textContent = "Tick at least one system your team uses.";
      err.hidden = false; return false;
    }
    if (bad) {
      err.textContent = bad.type === "email" ? "Enter a valid work email." :
        bad.type === "checkbox" ? "Both boxes need to be ticked to continue." : "Please answer every question on this step.";
      err.hidden = false;
      if (bad.focus) bad.focus();
      return false;
    }
    err.hidden = true; return true;
  }

  back.addEventListener("click", function () { if (cur > 0) show(cur - 1); });
  next.addEventListener("click", function () {
    if (!valid(steps[cur])) return;
    if (cur < steps.length - 1) show(cur + 1); else finish();
  });

  // "None of these" clears the other sensitivity boxes and vice versa.
  var none = document.getElementById("sens_none");
  form.querySelectorAll('input[name="sensitive"]').forEach(function (c) {
    c.addEventListener("change", function () {
      if (c === none && none.checked) form.querySelectorAll('input[name="sensitive"]').forEach(function (o) { if (o !== none) o.checked = false; });
      if (c !== none && c.checked) none.checked = false;
    });
  });

  // A tool / years / size row for each ticked system: the "manifest" buyers use to judge interest.
  var rows = document.getElementById("manifest_rows"), manifest = document.getElementById("manifest");
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_"); }
  function syncManifest() {
    var checked = [].slice.call(form.querySelectorAll('input[name="systems"]:checked')).map(function (c) { return c.value; });
    var keep = {};
    [].slice.call(rows.children).forEach(function (r) { keep[r.dataset.sys] = r; });
    rows.textContent = "";
    checked.forEach(function (sys) {
      var r = keep[sys];
      if (!r) {
        var id = slug(sys);
        r = document.createElement("div");
        r.className = "mrow"; r.dataset.sys = sys;
        var h = document.createElement("p"); h.className = "mname"; h.textContent = sys; r.appendChild(h);
        r.insertAdjacentHTML("beforeend",
          '<label>Tool<input id="m_' + id + '_tool" placeholder="e.g. HubSpot"></label>' +
          '<label>Years used<select id="m_' + id + '_years"><option value="">Choose</option><option>Under 1</option><option>1 to 3</option><option>3 to 5</option><option>Over 5</option></select></label>' +
          '<label>Rough size<input id="m_' + id + '_size" placeholder="e.g. 20 seats, 8,000 tickets"></label>');
      }
      rows.appendChild(r);
    });
    manifest.hidden = checked.length === 0;
  }
  form.querySelectorAll('input[name="systems"]').forEach(function (c) { c.addEventListener("change", syncManifest); });

  function val(name) {
    var el = form.elements[name];
    if (!el) return "";
    if (el instanceof RadioNodeList) return el.value || "";
    return (el.value || "").trim();
  }
  function all(name) { return [].slice.call(form.querySelectorAll('input[name="' + name + '"]:checked')).map(function (c) { return c.value; }); }
  function labelOf(id) { var s = document.getElementById(id); return s && s.selectedIndex > 0 ? s.options[s.selectedIndex].text : ""; }

  function collect() {
    var a = {
      first_name: val("first_name"), last_name: val("last_name"), title: val("title"), email: val("email"), phone: val("phone"),
      authorized: val("authorized"), company_name: val("company_name"), website: val("website"), location: val("location"),
      industry: val("industry"), status: val("status"), desk_staff: val("desk_staff"), years: val("years"),
      headcount_proof: val("headcount_proof"), systems: all("systems"), accounts: val("accounts"), workflow: val("workflow"),
      sensitive: all("sensitive"), contract_limits: val("contract_limits"), already_introduced: val("already_introduced"),
      off_limits: val("off_limits")
    };
    a.manifest = [].slice.call(rows.children).map(function (r) {
      var id = slug(r.dataset.sys);
      return { system: r.dataset.sys, tool: (document.getElementById("m_" + id + "_tool").value || "").trim(),
        years: document.getElementById("m_" + id + "_years").value, size: (document.getElementById("m_" + id + "_size").value || "").trim() };
    });
    return a;
  }

  function summary(a, s) {
    var m = a.manifest.map(function (x) {
      return "- " + x.system + ": " + (x.tool || "?") + " | " + (x.years || "?") + " yrs | " + (x.size || "?");
    }).join("\n");
    return [
      "RESULT: " + s.outcome.toUpperCase() + " (" + s.path + ")",
      s.reasons.length ? "Review: " + s.reasons.join(" ") : "",
      "",
      a.first_name + " " + a.last_name + ", " + a.title + " at " + a.company_name + " (" + (a.website || "no website") + "), " + a.location,
      "Authorized: " + a.authorized,
      "Industry: " + a.industry + " | Status: " + a.status + " | Desk staff: " + labelOf("desk_staff") + " | Software history: " + labelOf("years"),
      "Headcount proof: " + a.headcount_proof + " | Accounts: " + a.accounts,
      "",
      "MANIFEST (" + a.systems.length + " systems)",
      m,
      "",
      "Cross-tool workflow: " + (a.workflow || "not given"),
      "Sensitive data: " + (a.sensitive.join(", ") || "not answered"),
      "Contract limits: " + a.contract_limits + " | Already introduced: " + a.already_introduced,
      "Off-limits: " + (a.off_limits || "none given"),
      "",
      "Consent for Alor to submit to licensed partners: yes (" + new Date().toISOString() + ")"
    ].filter(function (l, i, arr) { return !(l === "" && arr[i - 1] === ""); }).join("\n");
  }

  // Rep attribution: a rep shares alorsolutions.com/data-licensing/?rep=CODE. The code is kept for
  // 60 days in this browser, so a client who comes back later is still credited to that rep.
  function repCode() {
    var code = "";
    try { code = (new URLSearchParams(location.search).get("rep") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40); } catch (e) {}
    try {
      if (code) localStorage.setItem("alor_rep", JSON.stringify({ code: code, at: Date.now() }));
      else {
        var saved = JSON.parse(localStorage.getItem("alor_rep") || "null");
        if (saved && Date.now() - saved.at < 60 * 864e5) code = saved.code;
      }
    } catch (e) {}
    return code;
  }
  var REP = repCode();

  var sent = false;
  function finish() {
    var a = collect(), s = score(a);
    var src = "";
    try { src = new URLSearchParams(location.search).get("utm_source") || document.referrer || "direct"; } catch (e) {}
    var payload = {
      first_name: a.first_name, last_name: a.last_name, email: a.email, phone: a.phone, company_name: a.company_name,
      website: a.website, title: a.title, location: a.location, industry: a.industry, company_status: a.status,
      desk_staff: labelOf("desk_staff"), software_years: labelOf("years"), system_count: a.systems.length,
      systems: a.systems.join(", "), sensitive_data: a.sensitive.join(", "), contract_limits: a.contract_limits,
      already_introduced: a.already_introduced, authorized: a.authorized,
      qualification: s.outcome, qualification_path: s.path, review_reasons: s.reasons.join(" "),
      summary: summary(a, s),
      consent_intro: "yes", consent_terms: "yes", consent_at: new Date().toISOString(), source: String(src).slice(0, 200),
      rep: REP || "house"
    };
    payload.summary = "Rep: " + payload.rep + "\n" + payload.summary;
    if (CONFIG.GHL_WEBHOOK_URL && !sent) {
      sent = true;
      fetch(CONFIG.GHL_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true })
        .catch(function () {});
    }

    form.hidden = true;
    document.querySelector(".progress").hidden = true;
    document.querySelector(".intro").hidden = true;
    var map = { qualified: "r_qualified", review: "r_review", not_qualified: "r_not" };
    if (s.outcome === "review" && s.reasons.length) document.getElementById("review_reason").textContent = s.reasons.join(" ");
    document.getElementById(map[s.outcome]).hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  show(0);
})();
