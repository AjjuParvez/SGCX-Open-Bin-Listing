/* ========= Pagination ========= */
const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

/* ========= CSV PARSER (robust to quotes, commas, CRLF) ========= */
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

  // Trim header cells
  const header = rows.shift().map(h => String(h||'').trim());
  const last = header.length - 1;

  // Normalize rows to header width
  const out = rows.map(r=>{
    let arr = r.slice();
    if (arr.length > header.length){
      const head = arr.slice(0,last);
      const tail = arr.slice(last).join(',');
      arr = [...head, tail];
    }
    while (arr.length < header.length) arr.push('');
    const o = {};
    header.forEach((h,i)=> o[h] = String(arr[i] ?? '').trim());
    return o;
  });

  return out;
}

/* ========= Loader ========= */
async function loadCSV(path){
  const res = await fetch(path);
  const txt = await res.text();
  return parseCSV(txt);
}

/* ========= Normalizers & helpers ========= */
function normalizeStatus(s){
  s = (s||'').toLowerCase();
  if (s.includes('no'))  return 'No Stock';
  if (s.includes('low')) return 'Low Stock';
  if (s.includes('avail')) return 'Available';
  return '';
}

/** Your CSV headers:
 * "Site Location", "Status", "Material", "Category ", "Description", "Long text"
 * We map them to the app fields used everywhere else.
 */
function mapRow(r){
  // Allow for small header typos/extra spaces
  const by = (name) => {
    const keys = Object.keys(r);
    const norm = name.toLowerCase().replace(/\s+/g,'');
    const k = keys.find(k => k && k.toLowerCase().replace(/\s+/g,'') === norm);
    return k ? r[k] : '';
  };

  return {
    site: by('Site Location'),
    stock_status: by('Status'),
    material_no: by('Material'),
    category: by('Category'),
    description: by('Description'),
    long_text: by('Long text'),
  };
}

/* ========= Search filter ========= */
function applyFilters(){
  const q = (document.getElementById('q').value || '').toLowerCase();
  filtered = ALL.filter(r =>
    (r.material_no||'').toLowerCase().includes(q) ||
    (r.description||'').toLowerCase().includes(q) ||
    (r.long_text||'').toLowerCase().includes(q) ||
    (r.site||'').toLowerCase().includes(q)
  );
  page = 1;
  renderSummary(filtered);
  render();
}

/* ========= Summary by Plant ========= */
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
  wrap.innerHTML = data.map(d=>`
    <div class="summary-row">
      <div class="summary-plant">${d.site}</div>
      <div class="summary-bar"><div class="summary-fill" style="width:${d.pct.toFixed(1)}%"></div></div>
      <div class="summary-pct">${d.pct.toFixed(1)}%</div>
      <div class="summary-sub">
        <span class="a">A:${d.A}</span> | <span class="l">L:${d.L}</span> | <span class="n">N:${d.N}</span> &nbsp; Total: ${d.total}
      </div>
    </div>
  `).join('');
}

/* ========= Table render ========= */
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
}

/* ========= Init ========= */
document.getElementById('q').addEventListener('input', applyFilters);
document.getElementById('prev').onclick = ()=>{ if (page>1){ page--; render(); } };
document.getElementById('next').onclick = ()=>{ const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); if (page < pages){ page++; render(); } };

(async function init(){
  // IMPORTANT: your CSV file name contains a space.
  // Use URL-encoded path so GitHub Pages can fetch it.
  const raw = await loadCSV('./Open%20Bin.csv');

  // Map CSV columns to app schema
  ALL = raw.map(mapRow);

  // Timestamps (optional: lastUpdate is "now")
  const now = new Date();
  document.getElementById('lastUpdate').textContent = `Now: ${now.toLocaleString()}`;

  // Initial state
  filtered = ALL;
  renderSummary(filtered);
  render();
})();
``
