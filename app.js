const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

// LOAD CSV
async function loadCSV(path){
  const res = await fetch(path);
  return parseCSV(await res.text());
}

// PARSE CSV
function parseCSV(csv){
  const rows=[], header=[];
  let row=[], cell="", q=false;
  for(let c of csv){
    if(c === '"'){ q=!q; continue; }
    if(c === ',' && !q){ row.push(cell); cell=""; continue; }
    if((c==='\n' || c==='\r') && !q){
      if(row.length||cell){ row.push(cell); rows.push(row); }
      row=[]; cell=""; continue;
    }
    cell+=c;
  }
  if(row.length||cell){ row.push(cell); rows.push(row); }

  const hdr = rows.shift();
  return rows.map(r => Object.fromEntries(hdr.map((h,i)=>[h.trim(), (r[i]||"").trim()])));
}

// CLEAN PLANTS
function extractPlant(raw){
  const s = raw.toUpperCase();
  const out = [];
  if(s.includes("JUR")) out.push("JUR");
  if(s.includes("PAC")) out.push("PAC");
  if(s.includes("SCP")) out.push("SCP");
  if(s.includes("SAR2")) out.push("SAR2");
  return out.length ? out : [""];
}

// NORMALIZE STATUS
function normalizeStatus(s){
  s = s.toLowerCase();
  if(s.includes("no")) return "No Stock";
  if(s.includes("low")) return "Low Stock";
  if(s.includes("avail")) return "Available";
  return "";
}

// FILTER
function applyFilters(){
  const q = qVal("q");
  const site = qVal("site");
  const cat = qVal("category");
  const st = qVal("status");

  filtered = ALL.filter(r=>{
    const okQ = !q || [
      r.material_no, r.description, r.long_text
    ].some(v => (v||"").toLowerCase().includes(q));

    const okSite = !site || r.site===site;
    const okCat = !cat || r.category===cat;
    const okSt = !st || normalizeStatus(r.stock_status)===st;

    return okQ && okSite && okCat && okSt;
  });

  page = 1;
  render();
}

function qVal(id){ return document.getElementById(id).value.toLowerCase(); }

// SUMMARY CALC
function summarizeByPlant(rows){
  const map = {};
  rows.forEach(r=>{
    const st = normalizeStatus(r.stock_status);
    if(!st || !r.site) return;
    if(!map[r.site]) map[r.site]={A:0,L:0,N:0};

    if(st==="Available") map[r.site].A++;
    else if(st==="Low Stock") map[r.site].L++;
    else if(st==="No Stock") map[r.site].N++;
  });

  return Object.entries(map).map(([site,v])=>{
    const t = v.A+v.L+v.N;
    const pct = t ? (v.A/t)*100 : 0;
    return {site, ...v, total:t, pct};
  }).sort((a,b)=>b.pct-a.pct);
}

// RENDER SUMMARY
function renderSummary(rows){
  const wrap = document.getElementById("summaryByPlant");
  const data = summarizeByPlant(rows);

  wrap.innerHTML = data.map(d=>`
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

// TABLE RENDER
function render(){
  const tbody = document.querySelector("#grid tbody");
  const start = (page-1)*PAGE_SIZE;
  const rows = filtered.slice(start, start+PAGE_SIZE);

  tbody.innerHTML = rows.map(r=>`
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

  const pages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  document.getElementById("page").textContent = `${page} / ${pages}`;
  document.getElementById("prev").disabled = page<=1;
  document.getElementById("next").disabled = page>=pages;
  document.getElementById("count").textContent = `${filtered.length} items`;

  renderSummary(filtered);
}

// INIT
async function init(){
  const raw = await loadCSV("stock.csv");

  let expanded = [];
  raw.forEach(r=>{
    const plants = extractPlant(r["Site Location"]||"");
    plants.forEach(p=>{
      expanded.push({
        site:p,
        stock_status:r["Stock Status"]||"",
        material_no:r["Material No."]||"",
        category:r["Category"]||"",
        description:r["Description"]||"",
        long_text:r["Long text"]||""
      });
    });
  });

  ALL = expanded;
  filtered = expanded;

  const sites = [...new Set(ALL.map(r=>r.site))].sort();
  const cats  = [...new Set(ALL.map(r=>r.category))].sort();

  document.getElementById("site").innerHTML = `<option value="">All</option>` + 
    sites.map(s=>`<option>${s}</option>`).join("");

  document.getElementById("category").innerHTML = `<option value="">All</option>` + 
    cats.map(c=>`<option>${c}</option>`).join("");

  ["q","site","category","status"].forEach(id=>{
    document.getElementById(id).addEventListener("input", applyFilters);
    document.getElementById(id).addEventListener("change", applyFilters);
  });

  document.getElementById("prev").onclick = ()=>{ if(page>1){ page--; render(); } };
  document.getElementById("next").onclick = ()=>{ 
    const pages = Math.ceil(filtered.length/PAGE_SIZE);
    if(page<pages){ page++; render(); } 
  };

  render();
}

document.addEventListener("DOMContentLoaded", init);
