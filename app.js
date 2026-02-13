/* ===============================
   Open Bin – FINAL app.js
   =============================== */
const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

/* ---------- Normalize raw text (TSV->CSV, header repair) ---------- */
function normalizeInput(text){
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Fix the broken header you pasted:  "Site Location\n"
  text = text.replace(/^"Site Location\s*\n"\s*/,'Site Location\t');

  // Detect delimiter by sampling; convert TSV to CSV if tabs dominate
  const head = text.split('\n').slice(0,3).join('\n');
  const tabs   = (head.match(/\t/g) || []).length;
  const commas = (head.match(/,/g)  || []).length;
  if (tabs > commas){
    text = text.replace(/\t/g, ',');
  }
  return text;
}

/* ---------- Robust CSV parser (quotes + overflow glued into last column) ---------- */
function parseCSV(csvRaw){
  const csv = normalizeInput(csvRaw);
  const rows = [];
  let row = [], cell = "", q = false;

  for (let i = 0; i < csv.length; i++){
    const c = csv[i];

    if (c === '"'){
      if (q && csv[i+1] === '"'){ cell += '"'; i++; }
      else { q = !q; }
      continue;
    }
    if (c === ',' && !q){ row.push(cell); cell = ""; continue; }
    if (c === '\n' && !q){
      if (row.length || cell){ row.push(cell); rows.push(row); }
      row = []; cell = ""; continue;
    }
    cell += c;
  }
  if (row.length || cell){ row.push(cell); rows.push(row); }

  if (!rows.length) return [];

  let header = rows.shift().map(h => String(h||'').trim().replace(/^"+|"+$/g,''));
  const last = header.length - 1;

  return rows.map(r=>{
    let arr = r.slice();
    if (arr.length > header.length){
      const head = arr.slice(0, last);
      const tail = arr.slice(last).join(',');
      arr = head.concat([tail]);
    }
    while (arr.length < header.length) arr.push("");

    arr = arr.map(v => String(v||'').replace(/^"+|"+$/g,'').trim());
    const obj = {};
    header.forEach((h,i)=> obj[h] = arr[i] || "");
    return obj;
  });
}

/* ---------- Header mapping helper ---------- */
function pick(obj, candidates){
  const keys = Object.keys(obj);
  for (const want of candidates){
    const norm = want.toLowerCase().replace(/\s+/g,'');
    const found = keys.find(k => k && k.toLowerCase().replace(/\s+/g,'') === norm);
    if (found) return obj[found] ?? '';
  }
  const fuzzy = keys.find(k => /long/i.test(k) && /text/i.test(k));
  return fuzzy ? (obj[fuzzy] ?? '') : '';
}

/* ---------- Normalizers ---------- */
function extractPlant(raw){
  const s = (raw || '').toUpperCase();
  const out = [];
  if (s.includes('JUR'))  out.push('JUR');
  if (s.includes('PAC'))  out.push('PAC');
  if (s.includes('SCP'))  out.push('SCP');
  if (s.includes('SAR2')) out.push('SAR2');
  return out.length ? out : [''];
}
function normalizeStatus(s){
  s = (s || '').toLowerCase();
  if (s.includes('no'))   return 'No Stock';
  if (s.includes('low'))  return 'Low Stock';
  if (s.includes('avail'))return 'Available';
  return '';
}

/* ---------- Search ---------- */
function applyFilters(){
  const q = (document.getElementById('q').value || '').toLowerCase();
  filtered = ALL.filter(r =>
    (r.material_no||'').toLowerCase().includes(q) ||
    (r.description||'').toLowerCase().includes(q) ||
    (r.long_text||'').toLowerCase().includes(q)
  );
  page = 1;
  render();
}

/* ---------- Stacked bars (TOP-RIGHT) ---------- */
function summarizeByPlant(rows){
  const map = {};
  rows.forEach(r=>{
    const st = normalizeStatus(r.stock_status);
    if (!st || !r.site) return;
    if (!map[r.site]) map[r.site] = {A:0,L:0,N:0};
    if (st === 'Available') map[r.site].A++;
    else if (st === 'Low Stock') map[r.site].L++;
    else if (st === 'No Stock')  map[r.site].N++;
  });
  return Object.entries(map).map(([site,v])=>{
    const t = v.A + v.L + v.N;
    return {
      site,
      aPct: t ? (v.A/t)*100 : 0,
      lPct: t ? (v.L/t)*100 : 0,
      nPct: t ? (v.N/t)*100 : 0,
      total: t
    };
  }).sort((a,b)=> b.aPct - a.aPct || a.site.localeCompare(b.site));
}

function renderSummaryTop(rows){
  const wrap = document.getElementById('summaryByPlantTop');
  if (!wrap) return;
  const data = summarizeByPlant(rows);
  wrap.innerHTML = data.map(d=>`
    <div class="stack-row" title="${d.site}: A ${d.aPct.toFixed(1)}% • L ${d.lPct.toFixed(1)}% • N ${d.nPct.toFixed(1)}% (Total ${d.total})">
      <div class="stack-plant">${d.site}</div>
      <div class="stack-bar">
        <span class="seg seg-a" style="width:${d.aPct}%;"></span>
        <span class="seg seg-l" style="width:${d.lPct}%;"></span>
        <span class="seg seg-n" style="width:${d.nPct}%;"></span>
      </div>
      <div class="stack-pct">${d.aPct.toFixed(1)}%</div>
    </div>
  `).join('');
}

/* ---------- Render table (ORDER CHANGED) ---------- */
function render(){
  const tbody = document.querySelector('#grid tbody');
  const start = (page-1)*PAGE_SIZE;
  const rows = filtered.slice(start, start+PAGE_SIZE);

  tbody.innerHTML = rows.map(r=>`
    <tr>
      <td>${r.site}</td>
      <td><span class="status ${normalizeStatus(r.stock_status).replace(/\s/g,'')}">${normalizeStatus(r.stock_status)}</span></td>
      <td>${r.material_no}</td>
      <td>${r.category}</td>
      <td>${r.description}</td>
      <td>${r.long_text}</td>
    </tr>
  `).join('');

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  document.getElementById('page').textContent = `${page} / ${pages}`;
  document.getElementById('prev').disabled = page<=1;
  document.getElementById('next').disabled = page>=pages;
  document.getElementById('count').textContent = `${filtered.length} items`;

  renderSummaryTop(filtered);
}

/* ---------- Init ---------- */
async function init(){
  const rawText = await (await fetch('stock.csv')).text();
  const parsed  = parseCSV(rawText);

  let expanded = [];
  parsed.forEach(r=>{
    const site   = pick(r, ['Site Location','Site']);
    const status = pick(r, ['Stock Status','Status']);
    const mat    = pick(r, ['Material No.','Material No','Material']);
    const cat    = pick(r, ['Category','Cat']);
    const desc   = pick(r, ['Description','Material Description','Desc']);
    const ltxt   = pick(r, ['Long text','Long Text','Longtext','Long_text','Long Desc','Longdesc']);

    const plants = extractPlant(site);
    plants.forEach(p=>{
      expanded.push({
        site: p,
        stock_status: (status||'').trim(),
        material_no:  (mat||'').trim(),
        category:     (cat||'').trim(),
        description:  (desc||'').trim(),
        long_text:    (ltxt||'').trim()
      });
    });
  });

  ALL = expanded;
  filtered = expanded;

  // Search wiring
  document.getElementById('q').addEventListener('input', applyFilters);
  document.getElementById('doSearch').addEventListener('click', applyFilters);

  // Pager
  document.getElementById('prev').onclick = ()=>{ if(page>1){ page--; render(); } };
  document.getElementById('next').onclick = ()=>{
    const pages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page < pages){ page++; render(); }
  };

  render()
     // Show "Welcome to SGCX-SGMM" only once per browser (until site data is cleared)
if (!localStorage.getItem('sgcx_welcomed')) {
  alert('Welcome to SGCX-SGMM');
  localStorage.setItem('sgcx_welcomed', '1');
};
}

document.addEventListener('DOMContentLoaded', init);
