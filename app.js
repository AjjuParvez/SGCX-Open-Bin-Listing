const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

/* -----------------------------------------------------------
   ROBUST CSV PARSER (Fixes Long Text containing commas)
------------------------------------------------------------*/
function parseCSV(csv){
  const rows = [];
  let row = [], cell = "", q = false;

  for (let i = 0; i < csv.length; i++){
    const c = csv[i];

    if (c === '"'){
      // Handle escaped ""
      if (q && csv[i+1] === '"'){ cell += '"'; i++; }
      else { q = !q; }
      continue;
    }

    if (c === ',' && !q){
      row.push(cell);
      cell = "";
      continue;
    }

    if ((c === '\n' || c === '\r') && !q){
      if (row.length || cell){
        row.push(cell);
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += c;
  }

  // Last row
  if (row.length || cell){
    row.push(cell);
    rows.push(row);
  }

  // Header
  const header = rows.shift().map(h => h.trim());
  const lastIndex = header.length - 1;

  // Combine extra columns into Long text
  return rows.map(r => {
    let arr = r.slice();

    if (arr.length > header.length){
      const start = arr.slice(0, lastIndex);
      const end = arr.slice(lastIndex).join(',');
      arr = [...start, end];
    }

    while (arr.length < header.length){
      arr.push("");
    }

    const obj = {};
    header.forEach((h, i) => {
      obj[h] = (arr[i] || "").trim();
    });

    return obj;
  });
}

/* -----------------------------------------------------------
   CSV LOADER
------------------------------------------------------------*/
async function loadCSV(path){
  const res = await fetch(path);
  return parseCSV(await res.text());
}

/* -----------------------------------------------------------
   PLANT NORMALIZER
------------------------------------------------------------*/
function extractPlant(raw){
  const s = (raw || "").toUpperCase();
  const out = [];

  if (s.includes("JUR")) out.push("JUR");
  if (s.includes("PAC")) out.push("PAC");
  if (s.includes("SCP")) out.push("SCP");
  if (s.includes("SAR2")) out.push("SAR2");

  return out.length ? out : [""];
}

/* -----------------------------------------------------------
   STATUS NORMALIZER
------------------------------------------------------------*/
function normalizeStatus(s){
  s = (s || "").toLowerCase();
  if (s.includes("no")) return "No Stock";
  if (s.includes("low")) return "Low Stock";
  if (s.includes("avail")) return "Available";
  return "";
}

/* -----------------------------------------------------------
   SEARCH ONLY (Filters removed)
------------------------------------------------------------*/
function applyFilters(){
  const q = document.getElementById("q").value.toLowerCase();

  filtered = ALL.filter(r =>
    r.material_no.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.long_text.toLowerCase().includes(q)
  );

  page = 1;
  render();
}

/* -----------------------------------------------------------
   SUMMARY: Available % by Plant
------------------------------------------------------------*/
function summarizeByPlant(rows){
  const map = {};

  rows.forEach(r => {
    const st = normalizeStatus(r.stock_status);
    if (!st || !r.site) return;

    if (!map[r.site]) map[r.site] = {A:0, L:0, N:0};

    if (st === "Available") map[r.site].A++;
    if (st === "Low Stock") map[r.site].L++;
    if (st === "No Stock") map[r.site].N++;
  });

  return Object.entries(map).map(([site, v]) => {
    const total = v.A + v.L + v.N;
    const pct = total ? (v.A / total) * 100 : 0;
    return { site, ...v, total, pct };
  }).sort((a, b) => b.pct - a.pct);
}

function renderSummary(rows){
  const wrap = document.getElementById("summaryByPlant");
  const data = summarizeByPlant(rows);

  wrap.innerHTML = data.map(d => `
    <div class="summary-row">
      <div class="summary-plant">${d.site}</div>
      <div class="summary-bar">
        <div class="summary-fill" style="width:${d.pct.toFixed(1)}%"></div>
      </div>
      <div class="summary-pct">${d.pct.toFixed(1)}%</div>
      <div class="summary-sub">
        <span class="a">A:${d.A}</span> |
        <span class="l">L:${d.L}</span> |
        <span class="n">N:${d.N}</span>
        &nbsp; Total: ${d.total}
      </div>
    </div>
  `).join("");
}

/* -----------------------------------------------------------
   TABLE RENDER
------------------------------------------------------------*/
function render(){
  const tbody = document.querySelector("#grid tbody");
  const start = (page - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td data-col="Site">${r.site}</td>
      <td data-col="Material No.">${r.material_no}</td>
      <td data-col="Category">${r.category}</td>
      <td data-col="Description">${r.description}</td>
      <td data-col="Long text">${r.long_text}</td>
      <td data-col="Status">
        <span class="status ${normalizeStatus(r.stock_status).replace(" ","")}">
          ${normalizeStatus(r.stock_status)}
        </span>
      </td>
    </tr>
  `).join("");

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  document.getElementById("page").textContent = `${page} / ${pages}`;
  document.getElementById("prev").disabled = page <= 1;
  document.getElementById("next").disabled = page >= pages;
  document.getElementById("count").textContent = `${filtered.length} items`;

  renderSummary(filtered);
}

/* -----------------------------------------------------------
   HEADER TIMESTAMPS
------------------------------------------------------------*/
function updateTimestamps(){
  document.getElementById("lastUpdate").textContent =
    "Last Update: " + new Date().toLocaleString();

  setInterval(() => {
    document.getElementById("currentDate").textContent =
      "Now: " + new Date().toLocaleString();
  }, 1000);
}

/* -----------------------------------------------------------
   INIT
------------------------------------------------------------*/
async function init(){
  const raw = await loadCSV("stock.csv");

  let expanded = [];
  raw.forEach(r => {
    const plants = extractPlant(r["Site Location"]);
    plants.forEach(p => {
      expanded.push({
        site: p,
        stock_status: r["Stock Status"] || "",
        material_no: r["Material No."] || "",
        category: r["Category"] || "",
        description: r["Description"] || "",
        long_text: r["Long text"] || ""
      });
    });
  });

  ALL = expanded;
  filtered = expanded;

  document.getElementById("q").addEventListener("input", applyFilters);

  document.getElementById("prev").onclick = () => {
    if (page > 1){ page--; render(); }
  };

  document.getElementById("next").onclick = () => {
    const pages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page < pages){ page++; render(); }
  };

  render();
  updateTimestamps();
}

/* -----------------------------------------------------------*/
document.addEventListener("DOMContentLoaded", init);
