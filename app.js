/* ——— Pagination ——— */
const PAGE_SIZE = 50;
let ALL = [];
let filtered = [];
let page = 1;

/* ——— CSV PARSER ——— */
function parseCSV(csv){
  const rows = [];
  let row = [], cell = "", q = false;

  for (let i = 0; i < csv.length; i++){
    const c = csv[i];

    if (c === '"'){
      if (q && csv[i+1] === '"'){ cell += '"'; i++; }
      else q = !q;
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

  return rows.map(r => {
    let arr = r.slice();
    if (arr.length > header.length){
      const head = arr.slice(0,last);
      const tail = arr.slice(last).join(',');
      arr = [...head, tail];
    }
    while (arr.length < header.length) arr.push('');

    const o = {};
    header.forEach((h,i)=> o[h] = String(arr[i] || '').trim());
    return o;
  });
}

/* ——— Loader ——— */
async function loadCSV(path){
  const res = await fetch(path);
  return parseCSV(await res.text());
}

/* ——— Normalizers ——— */
function normalizeStatus(s){
  s = (s||'').toLowerCase();
  if (s.includes('no')) return 'No Stock';
  if (s.includes('low')) return 'Low Stock';
  if (s.includes('avail')) return 'Available';
  return '';
}

/* ——— Search Filter ——— */
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

/* ——— Summary by Plant ——— */
function summarizeByPlant(rows){
  const map = {};
  rows.forEach(r=>{
    const st = normalizeStatus(r.stock_status);
    if (!st || !r.site) return;
    if (!map[r.site]) map[r.site] = {A:0,L:0,N:0};

    if (st === 'Available') map[r.site].A++;
    else if (st === 'Low Stock') map[r.site].L++;
    else if (st === 'No Stock') map[r.site].N++;
  });

  return Object.entries(map).map(([site,v])=>{
    const total = v.A+v.L+v.N;
    const pct = total ? (v.A/total)*100 : 0;
    return {site, ...v, total, pct};
  }).sort((a,b)=> b.pct - a.pct);
}

function renderSummary(rows){
  const wrap = document.getElementById('summaryByPlant');
  const data = summarizeByPlant(rows);
  wrap.innerHTML = data.map(d=>`
    <div class="summary-row">
      <div class="summary-plant">${d.site}</div>
      <div class="summary-bar"><div class="summary-fill" style="width:${d.pct}%"></div></div>
      <div class="summary-pct">${d.pct.toFixed(1)}%</div>
    </div>
  `).join('');
}

/* ——— Table Render ——— */
function render(){
  const tbody = document.querySelector('#grid tbody');
  const start = (page-1)*PAGE_SIZE;
  const pageRows = filtered.slice(start, start+PAGE_SIZE);

  tbody.innerHTML = pageRows.map(r=>`
    <tr>
      <td>${r.site}</td>
      <td>${r.material_no}</td>
      <td>${r.category}</td>
      <td>${r.description}</td>
      <td>${r.long_text}</td>
      <td><span class="status ${normalizeStatus(r.stock_status).replace(' ','')}">
        ${normalizeStatus(r.stock_status)}
      </span></td>
    </tr>
  `).join('');

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  document.getElementById('page').textContent = `${page} / ${pages}`;

  prev.disabled = (page <= 1);
  next.disabled = (page >= pages);

  document.getElementById("count").textContent = `${filtered.length} items`;
}

/* ——— Init ——— */
document.getElementById('q').addEventListener('input', applyFilters);
document.getElementById('prev').onclick = ()=>{ if (page>1){ page--; render(); } };
document.getElementById('next').onclick = ()=>{ page++; render(); };

(async function(){
  ALL = await loadCSV("data.csv");
  filtered = ALL;
  renderSummary(filtered);
  render();
})();
