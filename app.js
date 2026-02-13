const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

/* ---------- Robust CSV parser ---------- */
function parseCSV(csv){
  const rows = [];
  let row=[], cell="", q=false;

  for(let i=0;i<csv.length;i++){
    const c = csv[i];

    if(c === '"'){
      if(q && csv[i+1] === '"'){ cell+='"'; i++; }
      else q = !q;
      continue;
    }
    if(c === ',' && !q){ row.push(cell); cell=""; continue; }
    if((c==='\n'||c==='\r') && !q){
      if(row.length||cell){ row.push(cell); rows.push(row); }
      row=[]; cell=""; continue;
    }
    cell += c;
  }
  if(row.length||cell){ row.push(cell); rows.push(row); }

  const header = rows.shift().map(h=>h.trim());
  const last = header.length - 1;

  return rows.map(r=>{
    let arr = r.slice();
    if(arr.length > header.length){
      const head = arr.slice(0,last);
      const tail = arr.slice(last).join(",");
      arr = [...head, tail];
    }
    while(arr.length < header.length) arr.push("");
    const o={}; header.forEach((h,i)=>o[h] = arr[i].trim());
    return o;
  });
}

async function loadCSV(path){
  const res = await fetch(path);
  return parseCSV(await res.text());
}

/* ---------- Helpers ---------- */
function normalizeStatus(s){
  s = s.toLowerCase();
  if(s.includes("no")) return "NoStock";
  if(s.includes("low")) return "LowStock";
  if(s.includes("avail")) return "Available";
  return "";
}
function extractPlant(raw){
  const s = raw.toUpperCase();
  const out=[];
  if(s.includes("JUR")) out.push("JUR");
  if(s.includes("PAC")) out.push("PAC");
  if(s.includes("SCP")) out.push("SCP");
  if(s.includes("SAR2")) out.push("SAR2");
  return out.length?out:[""];
}

/* ---------- Search ---------- */
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

/* ---------- Stacked Summary (Top) ---------- */
function summarize(rows){
  const map={};
  rows.forEach(r=>{
    const st = normalizeStatus(r.stock_status);
    if(!map[r.site]) map[r.site]={A:0,L:0,N:0};
    if(st==="Available") map[r.site].A++;
    if(st==="LowStock")  map[r.site].L++;
    if(st==="NoStock")   map[r.site].N++;
  });
  return Object.entries(map).map(([site,v])=>{
    const t = v.A+v.L+v.N;
    return {
      site,
      aPct: t?(v.A/t)*100:0,
      lPct: t?(v.L/t)*100:0,
      nPct: t?(v.N/t)*100:0,
      total:t
    };
  });
}

function renderSummaryTop(rows){
  const wrap = document.getElementById("summaryByPlantTop");
  const data = summarize(rows);
  wrap.innerHTML = data.map(d=>{
    return `
      <div class="stack-row">
        <div class="stack-plant">${d.site}</div>
        <div class="stack-bar">
          <span class="seg seg-a" style="width:${d.aPct}%"></span>
          <span class="seg seg-l" style="width:${d.lPct}%"></span>
          <span class="seg seg-n" style="width:${d.nPct}%"></span>
        </div>
        <div class="stack-pct">${d.aPct.toFixed(1)}%</div>
      </div>
    `;
  }).join("");
}

/* ---------- Render Table ---------- */
function render(){
  const tbody = document.querySelector("#grid tbody");
  const start = (page-1)*PAGE_SIZE;
  const rows = filtered.slice(start,start+PAGE_SIZE);

  tbody.innerHTML = rows.map(r=>`
    <tr>
      <td>${r.site}</td>
      <td>${r.material_no}</td>
      <td>${r.category}</td>
      <td>${r.description}</td>
      <td>${r.long_text}</td>
      <td><span class="status ${normalizeStatus(r.stock_status)}">${normalizeStatus(r.stock_status).replace(/([A-Z])/g,' $1')}</span></td>
    </tr>
  `).join("");

  const pages = Math.ceil(filtered.length/PAGE_SIZE);
  document.getElementById("page").textContent = `${page} / ${pages}`;
  document.getElementById("prev").disabled = page<=1;
  document.getElementById("next").disabled = page>=pages;
  document.getElementById("count").textContent = `${filtered.length} items`;

  renderSummaryTop(filtered);
}

/* ---------- Init ---------- */
async function init(){
  const raw = await loadCSV("stock.csv");
  let expanded=[];

  raw.forEach(r=>{
    const plants = extractPlant(r["Site Location"]);
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

  ALL=expanded;
  filtered=expanded;

  document.getElementById("q").addEventListener("input", applyFilters);
  document.getElementById("doSearch").addEventListener("click", applyFilters);

  document.getElementById("prev").onclick=()=>{ if(page>1){page--;render();} };
  document.getElementById("next").onclick=()=>{
    const pages=Math.ceil(filtered.length/PAGE_SIZE);
    if(page<pages){page++;render();}
  };

  render();
}

document.addEventListener("DOMContentLoaded", init);
