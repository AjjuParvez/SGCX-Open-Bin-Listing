const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

// ---------------- CSV LOADER + PARSER ----------------
async function loadCSV(path){
  const res = await fetch(path);
  return parseCSV(await res.text());
}

function parseCSV(csv){
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < csv.length; i++){
    const c = csv[i];
    if (c === '"'){
      // handle escaped quote
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

  const hdr = rows.shift();
  return rows.map(r => Object.fromEntries(hdr.map((h,i)=>[String(h||'').trim(), String(r[i]||'').trim()])));
}

// --------------- HEADER NORMALIZATION ----------------
// Accept common variants so small header differences won’t break the app.
const EXPECTED = {
  site:      ['site location','site','site_location','plant','warehouse'],
  status:    ['stock status','status','stock_status'],
  material:  ['material no.','material no','material','material_no','matnr'],
  category:  ['category','cat'],
  description:['description','material description','desc'],
  longtext:  ['long text','longtext','long_text','long desc','longdesc']
};

function normalizeKey(k){
  const key = (k||'').trim().toLowerCase();
  for (const [std, variants] of Object.entries(EXPECTED)){
    if (variants.includes(key)) return std;
  }
  return null;
}

function normalizeRow(row){
  const out = {};
  for (const [k,v] of Object.entries(row)){
    const std = normalizeKey(k);
    if (std) out[std] = (v||'').toString().trim();
  }
  // Ensure keys exist
  out.site        = out.site        || '';
  out.status      = out.status      || '';
  out.material    = out.material    || '';
  out.category    = out.category    || '';
  out.description = out.description || '';
  out.longtext    = out.longtext    || '';
  return out;
}

// ----------------- PLANT & STATUS --------------------
function extractPlant(raw){
  const s = (raw || '').toUpperCase();
  const out = [];
  if (s.includes("JUR"))  out.push("JUR");
  if (s.includes("PAC"))  out.push("PAC");
  if (s.includes("SCP"))  out.push("SCP");
  if (s.includes("SAR2")) out.push("SAR2");
  return out.length ? out : [""];
}

function normalizeStatus(s){
  s = (s||'').toLowerCase();
  if (s.includes('no'))   return 'No Stock';
  if (s.includes('low'))  return 'Low Stock';
  if (s.includes('avail'))return 'Available';
  return '';
}

// ----------------- FILTER LOGIC ----------------------
function qVal(id){ return (document.getElementById(id).value || '').toLowerCase().trim(); }
const isAll = v => v === '' || v.toLowerCase() === 'all';

function applyFilters(){
  const q   = qVal('q');
  const siteSel = document.getElementById('site').value.trim();
  const catSel  = document.getElementById('category').value.trim();
  const stSel   = document.getElementById('status').value.trim();

  filtered = ALL.filter(r=>{
    const st = normalizeStatus(r.stock_status);
    const okQ = !q || [r.material_no, r.description, r.long_text]
                    .some(v => String(v||'').toLowerCase().includes(q));
    const okSite = isAll(siteSel) || r.site === siteSel;
    const okCat  = isAll(catSel)  || (r.category||'') === catSel;
    const okSt   = isAll(stSel)   || st === stSel;
    return okQ && okSite && okCat && okSt;
  });

  page = 1;
  render();
}

// --------------- SUMMARY (Available % by Plant) -------
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
    const total = v.A + v.L + v.N;
    const pct = total ? (v.A/total)*100 : 0;
    return {site, ...v, total, pct};
  }).sort((a,b)=> b.pct - a.pct || a.site.localeCompare(b.site));
}

function renderSummary(rows){
  const wrap = document.getElementById('summaryByPlant');
  const data = summarizeByPlant(rows);
  if (!wrap) return;
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
  `).join('');
}

// --------------- LEGEND PILLS (show %) ----------------
function updatePillPercents(rows){
  let A=0,L=0,N=0;
  rows.forEach(r=>{
    const st = normalizeStatus(r.stock_status);
    if (st === 'Available') A++;
    else if (st === 'Low Stock') L++;
    else if (st === 'No Stock') N++;
  });
  const T = A+L+N;
  const pct = n => T ? `${Math.round(n*100/T)}%` : '0%';

  const pills = document.querySelectorAll('.legend .pill');
  pills.forEach(p=>{
    const base = p.textContent.replace(/\d+%/g,'').trim().toLowerCase();
    if (base.startsWith('available')) p.textContent = `Available ${pct(A)}`;
    if (base.startsWith('low stock')) p.textContent = `Low Stock ${pct(L)}`;
    if (base.startsWith('no stock'))  p.textContent = `No Stock ${pct(N)}`;
  });
}

// ---------------- TABLE RENDER ------------------------
function render(){
  const tbody = document.querySelector('#grid tbody');
  const start = (page-1)*PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows.map(r=>`
    <tr>
      <td data-col="Site">${r.site}</td>
      <td data-col="Material No.">${r.material_no}</td>
      <td data-col="Category">${r.category}</td>
      <td data-col="Description">${r.description}</td>
      <td data-col="Long text">${r.long_text}</td>
      <td data-col="Status">
        <span class="status ${normalizeStatus(r.stock_status).replace(' ','')}">
          ${normalizeStatus(r.stock_status)}
        </span>
      </td>
    </tr>
  `).join('');

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  document.getElementById('page').textContent = `${page} / ${pages}`;
  document.getElementById('prev').disabled = page <= 1;
  document.getElementById('next').disabled = page >= pages;
  document.getElementById('count').textContent = `${filtered.length} items`;

  renderSummary(filtered);
  updatePillPercents(filtered);
}

// -------------------- INIT ----------------------------
async function init(){
  const rawRows = await loadCSV('stock.csv');

  // Normalize headers/keys
  const norm = rawRows.map(normalizeRow);

  // Expand multi-plant cells into multiple rows
  let expanded = [];
  norm.forEach(r=>{
    const plants = extractPlant(r.site);
    plants.forEach(p=>{
      expanded.push({
        site: p,
        stock_status: r.status,
        material_no: r.material,
        category: r.category,
        description: r.description,
        long_text: r.longtext
      });
    });
  });

  ALL = expanded;
  filtered = expanded;

  // Build filters
  const sites = [...new Set(ALL.map(r=>r.site).filter(Boolean))].sort();
  const cats  = [...new Set(ALL.map(r=>r.category).filter(Boolean))].sort();

  document.getElementById('site').innerHTML =
    `<option value="">All</option>` + sites.map(s=>`<option>${s}</option>`).join('');

  document.getElementById('category').innerHTML =
    `<option value="">All</option>` + cats.map(c=>`<option>${c}</option>`).join('');

  ['q','site','category','status'].forEach(id=>{
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  document.getElementById('prev').onclick = ()=>{ if(page>1){ page--; render(); } };
  document.getElementById('next').onclick = ()=>{
    const pages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page < pages){ page++; render(); }
  };

  render();
}

document.addEventListener('DOMContentLoaded', init);
``
