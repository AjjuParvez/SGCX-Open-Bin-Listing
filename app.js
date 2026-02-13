const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

/* ---------- Robust CSV parser: glue overflow into last column (Long text) ---------- */
function parseCSV(csv){
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
    if ((c === '\n' || c === '\r') && !q){
      if (row.length || cell){ row.push(cell); rows.push(row); }
      row = []; cell = ""; continue;
    }
    cell += c;
  }
  if (row.length || cell){ row.push(cell); rows.push(row); }

  const header = rows.shift().map(h => String(h||'').trim());
  const last = header.length - 1;

  return rows.map(r=>{
    let arr = r.slice();
    if (arr.length > header.length){
      const head = arr.slice(0,last);
      const tail = arr.slice(last).join(',');
      arr = [...head, tail];
    }
    while (arr.length < header.length) arr.push('');
    const o = {}; header.forEach((h,i)=> o[h] = String(arr[i] ?? '').trim());
    return o;
  });
}

async function loadCSV(path){
  const res = await fetch(path);
  return parseCSV(await res.text());
}

/* ---------- Pick helper (header variations) ---------- */
function pick(obj, candidates){
  const keys = Object.keys(obj);
  for (const want of candidates){
    const norm = want.toLowerCase().replace(/\s+/g,'');
    const found = keys.find(k => k && k.toLowerCase().replace(/\s+/g,'') === norm);
    if (found) return obj[found] ?? '';
  }
  const fuzzy = keys.find(k => k && /long/i.test(k) && /text/i.test(k));
  return fuzzy ? (obj[fuzzy] ?? '') : '';
}

/* ---------- Normalizers ---------- */
function extractPlant(raw){
  const s = (raw||'').toUpperCase();
  const out = [];
  if (s.includes('JUR'))  out.push('JUR');
  if (s.includes('PAC'))  out.push('PAC');
  if (s.includes('SCP'))  out.push('SCP');
  if (s.includes('SAR2')) out.push('SAR2');
  return out.length ? out : [''];
}
function normalizeStatus(s){
  s = (s||'').toLowerCase();
  if (s.includes('no'))  return 'No Stock';
  if (s.includes('low')) return 'Low Stock';
  if (s.includes('avail')) return 'Available';
  return '';
}

/* ---------- Search-only ---------- */
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

/* ---------- Stacked bar summary (right sidebar) ---------- */
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

  // return sites with segment widths
  return Object.entries(map).map(([site,v])=>{
    const t = v.A + v.L + v.N;
    const aPct = t ? (v.A/t)*100 : 0;
    const lPct = t ? (v.L/t)*100 : 0;
    const nPct = t ? (v.N/t)*100 : 0;
    return { site, ...v, total:t, aPct, lPct, nPct };
  }).sort((a,b)=> b.aPct - a.aPct || a.site.localeCompare(b.site));
}

function renderSummary(rows){
  const wrap = document.getElementById('summaryByPlant');
  const data = summarizeByPlant(rows);
  wrap.innerHTML = data.map(d=>{
    const a = d.aPct.toFixed(1), l = d.lPct.toFixed(1), n = d.nPct.toFixed(1);
    return `
      <div class="stack-row" title="${d.site}: A ${a}% • L ${l}% • N ${n}% (Total ${d.total})">
        <div class="stack-plant">${d.site}</div>
        <div class="stack-bar">
          <span class="seg seg-a" style="width:${a}%"></span>
          <span class="seg seg-l" style="width:${l}%"></span>
          <span class="seg seg-n" style="width:${n}%"></span>
        </div>
        <div class="stack-pct">${a}%</div>
      </div>
    `;
  }).join('');
}

/* ---------- Table render ---------- */
function render(){
  const tbody = document.querySelector('#grid tbody');
  const start = (page-1)*PAGE_SIZE;
  const pageRows = filtered.slice(start, start+PAGE_SIZE);

  tbody.innerHTML = pageRows.map(r=>`
    <tr>
      <td data-col="Site">${r.site}</td>
      <td data-col="Material No.">${r.material_no}</td>
      <td data-col="Category">${r.category}</td>
      <td data-col="Description">${r.description}</td>
      <td data-col="Long text">${r.long_text}</td>
      <td data-col="Status"><span class="status ${normalizeStatus(r.stock_status).replace(' ','')}">${normalizeStatus(r.stock_status)}</span></td>
    </tr>
  `).join('');

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  document.getElementById('page').textContent = `${page} / ${pages}`;
  document.getElementById('prev').disabled = page<=1;
  document.getElementById('next').disabled = page>=pages;
  document.getElementById('count').textContent = `${filtered.length} items`;

  renderSummary(filtered);
}

/* ---------- Timestamps ---------- */
function updateTimestamps(){
  document.getElementById('lastUpdate').textContent = 'Last Update: ' + new Date().toLocaleString();
  setInterval(()=>{ document.getElementById('currentDate').textContent = 'Now: ' + new Date().toLocaleString(); }, 1000);
}

/* ---------- INIT ---------- */
async function init(){
  const raw = await loadCSV('stock.csv');

  // Normalize headers and expand multi-plant rows
  let expanded = [];
  raw.forEach(r=>{
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
        stock_status: status || '',
        material_no:  (mat||'').trim(),
        category:     (cat||'').trim(),
        description:  (desc||'').trim(),
        long_text:    (ltxt||'').trim()
      });
    });
  });

  ALL = expanded;
  filtered = expanded;

  // Search actions
  document.getElementById('q').addEventListener('input', applyFilters);
  document.getElementById('doSearch').addEventListener('click', applyFilters);

  // Pager
  document.getElementById('prev').onclick = ()=>{ if(page>1){ page--; render(); } };
  document.getElementById('next').onclick = ()=>{
    const pages = Math.ceil(filtered.length / PAGE_SIZE);
    if(page < pages){ page++; render(); }
  };

  render();
  updateTimestamps();
}

document.addEventListener('DOMContentLoaded', init);
