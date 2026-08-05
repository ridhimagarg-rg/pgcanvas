const user = requireAuth();
document.getElementById('user-name').textContent   = user.name;
document.getElementById('user-role').textContent   = user.role;
document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();
document.getElementById('logout-btn').addEventListener('click', logout);

const params       = new URLSearchParams(window.location.search);
const connectionId = params.get('id');
if (!connectionId) window.location.href = 'dashboard.html';

let schema         = [];
let nodePositions  = {};
let currentTable   = null;
let deletingRowKey = null;

let modalTable        = null;
let modalPage         = 1;
let modalTotalPages   = 1;
let modalTotalRows    = 0;
let modalData         = [];
let modalPKColumn     = null;
let modalFilterTimeout;

const canvasArea      = document.getElementById('canvas-area');
const canvasInner     = document.getElementById('canvas-inner');
const svgEl           = d3.select('#relations-svg');
const minimapEl       = document.getElementById('minimap');
const minimapCanvas   = document.getElementById('minimap-canvas');
const minimapViewport = document.getElementById('minimap-viewport');

const zoomBehavior = d3.zoom()
    .scaleExtent([0.15, 2.5])
    .filter(event => {
        if (event.type === 'wheel') return true
        return !event.target.closest('.table-node')
    })
    .on('zoom', (event) => {
        const { x, y, k } = event.transform
        canvasInner.style.transform = `translate(${x}px, ${y}px) scale(${k})`
        document.getElementById('zoom-level').textContent = Math.round(k * 100) + '%'
        canvasArea.classList.toggle('panning', event.sourceEvent?.type === 'mousemove')
        drawRelations(event.transform)
        updateMinimap(event.transform)
    })

const canvasSelection = d3.select(canvasArea).call(zoomBehavior);

function currentTransform() {
    return d3.zoomTransform(canvasArea)
};

canvasArea.addEventListener('mouseup', () => canvasArea.classList.remove('panning'));

document.getElementById('zoom-in-btn').addEventListener('click', () => {
    canvasSelection.transition().duration(200).call(zoomBehavior.scaleBy, 1.2)
});
document.getElementById('zoom-out-btn').addEventListener('click', () => {
    canvasSelection.transition().duration(200).call(zoomBehavior.scaleBy, 1 / 1.2)
});
document.getElementById('fit-screen-btn').addEventListener('click', fitScreen);

async function loadSchema() {
    try {
        const res  = await fetch(`${CONFIG.API_URL}/api/canvas/${connectionId}/schema`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        })
        const data = await res.json()
        if (!res.ok) { alert('Failed to load schema: ' + (data.error || 'Unknown error')); return }

        schema = data.tables

        const connRes  = await fetch(`${CONFIG.API_URL}/api/connections`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        })
        const connData = await connRes.json()
        if (connRes.ok) {
            const conn = connData.connections.find(c => String(c.connection_id) === String(connectionId));
            if (conn) {
                document.getElementById('connection-name-display').textContent = conn.connection_name;
                document.getElementById('toolbar-conn-name').textContent = conn.connection_name;
            }
        }

        renderSidebarTableList();
        renderTableNodes();
        setTimeout(() => {
            drawRelations(currentTransform())
            fitScreen()
            updateMinimap(currentTransform())
        }, 150);

    } catch (err) {
        alert('Error loading schema. Please go back and try again.');
    }
};

function renderSidebarTableList() {
    const container = document.getElementById('table-names');
    container.innerHTML = schema.map(t => `
        <div class="table-name-item flex items-center gap-2 px-2 py-1.5 rounded-md text-[0.82rem] cursor-pointer text-[#555] transition-all"
             data-table="${t.table_name}">
            <span class="item-dot w-1.5 h-1.5 rounded-full bg-[#0694a2] opacity-40 shrink-0"></span>
            ${t.table_name}
        </div>`).join('')

    container.querySelectorAll('.table-name-item').forEach(item => {
        item.addEventListener('click', () => openSidePanel(item.dataset.table))
    })
};

document.getElementById('table-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.table-name-item').forEach(item => {
        item.style.display = item.dataset.table.toLowerCase().includes(q) ? '' : 'none'
    })
    document.querySelectorAll('.table-node').forEach(node => {
        node.classList.toggle('dimmed', q.length > 0 && !node.dataset.table.toLowerCase().includes(q))
    })
    drawRelations(currentTransform());
});

const MAX_COLS_SHOWN = 5;

function renderTableNodes() {
    const container = document.getElementById('tables-container');
    container.innerHTML = '';

    const cols   = Math.max(1, Math.ceil(Math.sqrt(schema.length)));
    const nodeW  = 240;
    const gapX   = 70;
    const gapY   = 60;

    schema.forEach((table, i) => {
        const col = i % cols
        const row = Math.floor(i / cols);
        const x   = col * (nodeW + gapX) + 40;
        const estimatedH = 46 + Math.min(table.columns.length, MAX_COLS_SHOWN) * 26 + (table.columns.length > MAX_COLS_SHOWN ? 26 : 0);
        const y   = row * (estimatedH + gapY) + 40;

        nodePositions[table.table_name] = { x, y };

        const visibleCols = table.columns.slice(0, MAX_COLS_SHOWN)
        const hiddenCount = table.columns.length - MAX_COLS_SHOWN

        const node = document.createElement('div')
        node.className   = 'table-node absolute bg-white border-2 border-[#e8ecf0] rounded-xl min-w-[220px] max-w-[260px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] cursor-pointer select-none hover:border-[#b2e0e6] hover:shadow-[0_4px_16px_rgba(6,148,162,0.12)]'
        node.dataset.table = table.table_name
        node.style.left    = x + 'px'
        node.style.top     = y + 'px'

        node.innerHTML = `
            <div class="bg-[#0694a2] text-white px-3.5 py-2.5 rounded-t-[10px] font-semibold text-[0.88rem]">
                ${table.table_name}
            </div>
            <div class="py-1.5 pb-2">
                ${visibleCols.map(col => `
                    <div class="flex items-center gap-1.5 px-3 py-[3px] text-[0.78rem]">
                        ${col.is_primary_key        ? '<span class="bg-[#fef9c3] text-[#854d0e] text-[0.6rem] px-1 py-0.5 rounded font-bold shrink-0">PK</span>' : ''}
                        ${col.foreign_table_name    ? '<span class="bg-[#dbeafe] text-[#1d4ed8] text-[0.6rem] px-1 py-0.5 rounded font-bold shrink-0">FK</span>' : ''}
                        ${!col.is_primary_key && !col.foreign_table_name ? '<span class="w-[22px] shrink-0"></span>' : ''}
                        <span class="font-medium flex-1 text-[#333] truncate">${col.column_name}</span>
                        <span class="text-[#aaa] text-[0.7rem] whitespace-nowrap ml-1">${shortType(col.data_type)}</span>
                    </div>`).join('')}
                ${hiddenCount > 0 ? `
                    <div class="px-3 py-1 text-[0.72rem] text-[#0694a2] font-medium">+${hiddenCount} more columns...</div>
                ` : ''}
            </div>`

        node.addEventListener('click', () => openSidePanel(table.table_name))
        attachD3Drag(node, table.table_name);
        container.appendChild(node);
    });
};

function shortType(type) {
    if (!type) return '';
    const t = type.toLowerCase();
    if (t.includes('character varying') || t.includes('varchar')) return 'varchar';
    if (t.includes('integer') || t === 'int4' || t === 'int') return 'integer';
    if (t.includes('timestamp')) return 'timestamp';
    if (t.includes('boolean')) return 'boolean';
    if (t.includes('numeric') || t.includes('decimal')) return 'numeric';
    if (t.includes('text')) return 'text';
    if (t.includes('date')) return 'date';
    return type;
}
;
function attachD3Drag(el, tableName) {
    let moved = false;

    const drag = d3.drag()
        .on('start', (event) => {
            moved = false
            d3.select(el).raise()
            event.sourceEvent.stopPropagation()
        })
        .on('drag', (event) => {
            moved = true
            const k = currentTransform().k
            nodePositions[tableName].x += event.dx / k
            nodePositions[tableName].y += event.dy / k
            el.style.left = nodePositions[tableName].x + 'px'
            el.style.top  = nodePositions[tableName].y + 'px'
            drawRelations(currentTransform())
            updateMinimap(currentTransform())
        })
        .on('end', (event) => {
            if (moved) event.sourceEvent.stopPropagation();
        })

    d3.select(el).call(drag)
};

function drawRelations(transform) {
    const t = transform || currentTransform();
    const canvasRect = canvasArea.getBoundingClientRect();

    svgEl.selectAll('path.relation-line').remove();

    schema.forEach(table => {
        table.columns.forEach(col => {
            if (!col.foreign_table_name) return;

            const fromNode = document.querySelector(`.table-node[data-table="${table.table_name}"]`);
            const toNode   = document.querySelector(`.table-node[data-table="${col.foreign_table_name}"]`);
            if (!fromNode || !toNode) return;
            if (fromNode.classList.contains('dimmed') || toNode.classList.contains('dimmed')) return;

            const fromRect = fromNode.getBoundingClientRect();
            const toRect   = toNode.getBoundingClientRect();

            const x1 = (fromRect.right  - canvasRect.left - t.x) / t.k;
            const y1 = (fromRect.top    + fromRect.height / 2 - canvasRect.top  - t.y) / t.k;
            const x2 = (toRect.left     - canvasRect.left - t.x) / t.k;
            const y2 = (toRect.top      + toRect.height   / 2 - canvasRect.top  - t.y) / t.k;

            let sx1 = x1, sx2 = x2
            let fromSideRight = true
            if (fromRect.right < toRect.left) {
                sx1 = (fromRect.right  - canvasRect.left - t.x) / t.k
                sx2 = (toRect.left     - canvasRect.left - t.x) / t.k
            } else {
                sx1 = (fromRect.left   - canvasRect.left - t.x) / t.k
                sx2 = (toRect.right    - canvasRect.left - t.x) / t.k
                fromSideRight = false
            }

            const cy1 = y1;
            const cy2 = y2;
            const dx  = Math.abs(sx2 - sx1) * 0.5;
            const cpx1 = fromSideRight ? sx1 + dx : sx1 - dx;
            const cpx2 = fromSideRight ? sx2 - dx : sx2 + dx;

            svgEl.append('path')
                .attr('class', 'relation-line')
                .attr('d', `M ${sx1} ${cy1} C ${cpx1} ${cy1}, ${cpx2} ${cy2}, ${sx2} ${cy2}`)
                .attr('marker-end', 'url(#arrow)')
        })
    })
};

function fitScreen() {
    const nodes = document.querySelectorAll('.table-node')
    if (!nodes.length) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach(node => {
        const l = parseFloat(node.style.left) || 0
        const t = parseFloat(node.style.top)  || 0
        minX = Math.min(minX, l)
        minY = Math.min(minY, t)
        maxX = Math.max(maxX, l + node.offsetWidth)
        maxY = Math.max(maxY, t + node.offsetHeight)
    })

    const rect    = canvasArea.getBoundingClientRect()
    const padding = 60
    const k = Math.min(
        (rect.width  - padding * 2) / (maxX - minX || 1),
        (rect.height - padding * 2) / (maxY - minY || 1),
        1
    )
    const x = (rect.width  - (maxX - minX) * k) / 2 - minX * k
    const y = (rect.height - (maxY - minY) * k) / 2 - minY * k

    canvasSelection.transition().duration(400)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(k))
};

const MM_W = 180;
const MM_H = 120;

function updateMinimap(transform) {
    const t       = transform || currentTransform()
    const ctx     = minimapCanvas.getContext('2d')
    const dpr     = window.devicePixelRatio || 1

    minimapCanvas.width  = MM_W * dpr
    minimapCanvas.height = MM_H * dpr
    minimapCanvas.style.width  = MM_W + 'px'
    minimapCanvas.style.height = MM_H + 'px'
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, MM_W, MM_H)

    const nodes = document.querySelectorAll('.table-node')
    if (!nodes.length) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
        const x = parseFloat(node.style.left) || 0;
        const y = parseFloat(node.style.top)  || 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + node.offsetWidth);
        maxY = Math.max(maxY, y + node.offsetHeight);
    });

    const pad     = 10;
    const worldW  = (maxX - minX) || 1;
    const worldH  = (maxY - minY) || 1;
    const scaleX  = (MM_W - pad * 2) / worldW;
    const scaleY  = (MM_H - pad * 2) / worldH;
    const mmScale = Math.min(scaleX, scaleY);

    const offX = pad + ((MM_W - pad * 2) - worldW * mmScale) / 2;
    const offY = pad + ((MM_H - pad * 2) - worldH * mmScale) / 2;

    nodes.forEach(node => {
        const nx = parseFloat(node.style.left) || 0;
        const ny = parseFloat(node.style.top)  || 0;
        const nw = node.offsetWidth;
        const nh = node.offsetHeight;

        const rx = offX + (nx - minX) * mmScale;
        const ry = offY + (ny - minY) * mmScale;
        const rw = nw * mmScale;
        const rh = nh * mmScale;

        ctx.fillStyle = '#e0f5f7';
        ctx.strokeStyle = '#0694a2';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0694a2';
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, Math.min(6, rh * 0.25), 2);
        ctx.fill();
    });

    const canvasRect = canvasArea.getBoundingClientRect();

    const vpLeft   = (-t.x) / t.k;
    const vpTop    = (-t.y) / t.k;
    const vpWidth  = canvasRect.width  / t.k;
    const vpHeight = canvasRect.height / t.k;

    const vx = offX + (vpLeft - minX) * mmScale;
    const vy = offY + (vpTop  - minY) * mmScale;
    const vw = vpWidth  * mmScale;
    const vh = vpHeight * mmScale;

    minimapViewport.style.left   = Math.max(0, vx) + 'px';
    minimapViewport.style.top    = Math.max(0, vy) + 'px';
    minimapViewport.style.width  = Math.min(MM_W, vw) + 'px';
    minimapViewport.style.height = Math.min(MM_H, vh) + 'px';
};

minimapEl.addEventListener('click', (e) => {
    const rect     = minimapEl.getBoundingClientRect()
    const nodes    = document.querySelectorAll('.table-node')
    if (!nodes.length) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach(node => {
        const x = parseFloat(node.style.left) || 0
        const y = parseFloat(node.style.top)  || 0
        minX = Math.min(minX, x); minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + node.offsetWidth)
        maxY = Math.max(maxY, y + node.offsetHeight)
    })

    const pad     = 10;
    const worldW  = (maxX - minX) || 1;
    const worldH  = (maxY - minY) || 1;
    const scaleX  = (MM_W - pad * 2) / worldW;
    const scaleY  = (MM_H - pad * 2) / worldH;
    const mmScale = Math.min(scaleX, scaleY);
    const offX    = pad + ((MM_W - pad * 2) - worldW * mmScale) / 2;
    const offY    = pad + ((MM_H - pad * 2) - worldH * mmScale) / 2;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const worldX = (clickX - offX) / mmScale + minX;
    const worldY = (clickY - offY) / mmScale + minY;

    const k      = currentTransform().k;
    const canvRect = canvasArea.getBoundingClientRect();
    const newX   = canvRect.width  / 2 - worldX * k;
    const newY   = canvRect.height / 2 - worldY * k;

    canvasSelection.transition().duration(300)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(newX, newY).scale(k));
});

function openSidePanel(tableName) {
    currentTable = tableName
    const tableData = schema.find(t => t.table_name === tableName)
    if (!tableData) return

    document.querySelectorAll('.table-node').forEach(n => n.classList.remove('selected', 'highlighted'))
    const selectedNode = document.querySelector(`.table-node[data-table="${tableName}"]`)
    if (selectedNode) selectedNode.classList.add('selected')

    const refsTo = tableData.columns.filter(c => c.foreign_table_name).map(c => c.foreign_table_name)
    schema.forEach(t => {
        const node = document.querySelector(`.table-node[data-table="${t.table_name}"]`)
        if (!node || t.table_name === tableName) return
        if (refsTo.includes(t.table_name)) node.classList.add('highlighted')
    })

    document.querySelectorAll('.table-name-item').forEach(item => {
        item.classList.toggle('active', item.dataset.table === tableName)
    })

    document.getElementById('sp-title').textContent   = tableName
    document.getElementById('sp-columns').textContent = `${tableData.columns.length} columns`
    document.getElementById('sp-records').textContent = ''  // loaded lazily when modal opens

    const schemaList = document.getElementById('sp-schema-list')
    schemaList.innerHTML = tableData.columns.map(col => `
        <div class="flex items-center gap-2 py-2 border-b border-[#f8fafc] text-[0.82rem]">
            ${col.is_primary_key     ? '<span class="bg-[#fef9c3] text-[#854d0e] text-[0.6rem] px-1 py-0.5 rounded font-bold shrink-0">PK</span>' : ''}
            ${col.foreign_table_name ? '<span class="bg-[#dbeafe] text-[#1d4ed8] text-[0.6rem] px-1 py-0.5 rounded font-bold shrink-0">FK</span>' : ''}
            ${!col.is_primary_key && !col.foreign_table_name ? '<span class="w-[22px] shrink-0"></span>' : ''}
            <span class="font-semibold flex-1 text-[#333]">${col.column_name}</span>
            <span class="text-[#999] text-[0.75rem]">${col.data_type}</span>
        </div>`).join('')

    const referencedBy = []
    schema.forEach(t => {
        t.columns.forEach(c => {
            if (c.foreign_table_name === tableName) {
                referencedBy.push(`${t.table_name}.${c.column_name}`)
            }
        })
    })
    const references = tableData.columns
        .filter(c => c.foreign_table_name)
        .map(c => `${c.foreign_table_name}.${c.foreign_column_name || c.column_name}`)

    let relHTML = ''
    if (referencedBy.length) {
        relHTML += `<div class="text-[0.78rem] text-[#555] font-semibold mb-1">Referenced by:</div>`
        relHTML += referencedBy.map(r => `
            <div class="flex items-center gap-1.5 text-[0.78rem] text-[#666] mb-0.5">
                <span class="text-[#0694a2]">•</span> ${r}
            </div>`).join('')
    }
    if (references.length) {
        relHTML += `<div class="text-[0.78rem] text-[#555] font-semibold mb-1 ${referencedBy.length ? 'mt-3' : ''}">References:</div>`
        relHTML += references.map(r => `
            <div class="flex items-center gap-1.5 text-[0.78rem] text-[#666] mb-0.5">
                <span class="text-[#0694a2]">•</span> ${r}
            </div>`).join('')
    }
    if (!referencedBy.length && !references.length) {
        relHTML = `<div class="text-[0.78rem] text-[#999]">None</div>`;
    }
    document.getElementById('sp-rel-content').innerHTML = relHTML;

    document.getElementById('side-panel').classList.remove('hidden');
};

document.getElementById('sp-close').addEventListener('click', () => {
    document.getElementById('side-panel').classList.add('hidden');
    document.querySelectorAll('.table-node').forEach(n => n.classList.remove('selected', 'highlighted'));
    document.querySelectorAll('.table-name-item').forEach(i => i.classList.remove('active'));
    currentTable = null;
});

document.getElementById('sp-view-data-btn').addEventListener('click', () => {
    if (!currentTable) return;
    openDataModal(currentTable);
})
;
function openDataModal(tableName) {
    modalTable      = tableName;
    modalPage       = 1;
    modalTotalPages = 1;
    modalData       = [];

    const tableData = schema.find(t => t.table_name === tableName);
    modalPKColumn   = tableData?.columns.find(c => c.is_primary_key)?.column_name || null;

    document.getElementById('modal-title').textContent = tableName;
    document.getElementById('modal-meta').textContent  = '';

    document.getElementById('modal-filter-col').innerHTML =
        '<option value="">All columns</option>' +
        (tableData?.columns || []).map(c => `<option value="${c.column_name}">${c.column_name}</option>`).join('')

    document.getElementById('modal-search').value = '';
    document.getElementById('data-modal-overlay').classList.remove('hidden');

    fetchModalData();
};

async function fetchModalData() {
    const loadingEl = document.getElementById('modal-loading');
    const emptyEl   = document.getElementById('modal-empty');
    const theadEl   = document.getElementById('modal-thead');
    const tbodyEl   = document.getElementById('modal-tbody');

    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    tbodyEl.innerHTML = '';
    theadEl.innerHTML = '';

    const filterCol = document.getElementById('modal-filter-col').value;
    const filterVal = document.getElementById('modal-search').value.trim();

    let url = `${CONFIG.API_URL}/api/canvas/${connectionId}/table/${modalTable}?page=${modalPage}&limit=9`;
    if (filterCol && filterVal) {
        url += `&filterCol=${encodeURIComponent(filterCol)}&filterVal=${encodeURIComponent(filterVal)}`;
    }

    try {
        const res  = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const data = await res.json();
        loadingEl.classList.add('hidden');

        if (!res.ok) {
            emptyEl.textContent = data.error || 'Failed to load data';
            emptyEl.classList.remove('hidden');
            return;
        }

        modalData       = data.rows;
        modalTotalPages = data.total_pages || 1;
        modalTotalRows  = data.total || 0;

        document.getElementById('modal-meta').textContent     = `${data.total} records  •  ${schema.find(t=>t.table_name===modalTable)?.columns.length || 0} columns`;
        document.getElementById('sp-records').textContent     = `${data.total} records`;
        document.getElementById('modal-showing').textContent  = `Showing ${(modalPage-1)*9+1}–${Math.min(modalPage*9, data.total)} of ${data.total} ${modalTable}`;
        document.getElementById('modal-page-info').textContent = `${modalPage}/${modalTotalPages}`;

        if (!data.rows.length) {
            emptyEl.classList.remove('hidden');
            return;
        }

        const cols = Object.keys(data.rows[0]);
        renderModalTable(data.rows, cols);

    } catch (err) {
        loadingEl.classList.add('hidden');
        emptyEl.textContent = 'Error loading data.';
        emptyEl.classList.remove('hidden');
    }
};

function renderModalTable(rows, cols) {
    const theadEl = document.getElementById('modal-thead');
    const tbodyEl = document.getElementById('modal-tbody');

    theadEl.innerHTML = `
        <tr>
            <th class="bg-[#f8fafc] px-4 py-2.5 text-left text-[0.75rem] font-semibold text-[#555] border-b border-[#e8ecf0] w-10">#</th>
            ${cols.map(c => `<th class="bg-[#f8fafc] px-4 py-2.5 text-left text-[0.75rem] font-semibold text-[#555] border-b border-[#e8ecf0] whitespace-nowrap">${c}</th>`).join('')}
            <th class="bg-[#f8fafc] px-4 py-2.5 text-left text-[0.75rem] font-semibold text-[#555] border-b border-[#e8ecf0]">Actions</th>
        </tr>`

    tbodyEl.innerHTML = rows.map((row, i) => renderModalRow(row, cols, i)).join('');
};

function renderModalRow(row, cols, index) {
    const rowNum = (modalPage - 1) * 9 + index + 1;
    const pk     = row[modalPKColumn];
    return `
        <tr id="modal-row-${index}" data-pk="${pk}" class="hover:bg-[#fafafa] border-b border-[#f8fafc]">
            <td class="px-4 py-2.5 text-[0.75rem] text-[#bbb]">${rowNum}</td>
            ${cols.map(c => `<td class="px-4 py-2.5 text-[0.8rem] text-[#333] max-w-[160px] truncate" title="${escapeHtml(String(row[c] ?? ''))}">${escapeHtml(String(row[c] ?? 'null'))}</td>`).join('')}
            <td class="px-4 py-2.5 whitespace-nowrap">
                <button class="text-[0.72rem] text-[#0694a2] font-medium px-2 py-1 rounded hover:bg-[#e6f7f9] border-none bg-transparent cursor-pointer" onclick="startModalEdit(${index})">Edit</button>
                <button class="text-[0.72rem] text-red-500 font-medium px-2 py-1 rounded hover:bg-red-50 border-none bg-transparent cursor-pointer" onclick="openDeleteRow('${pk}')">Del</button>
            </td>
        </tr>`
};

window.startModalEdit = (index) => {
    const row   = modalData[index];
    if (!row) return;
    const cols  = Object.keys(row);
    const trEl  = document.getElementById(`modal-row-${index}`);
    if (!trEl) return;
    const rowNum = (modalPage - 1) * 9 + index + 1;

    trEl.innerHTML = `
        <td class="px-4 py-2 text-[0.75rem] text-[#bbb]">${rowNum}</td>
        ${cols.map(c => {
            const isPK = c === modalPKColumn
            return `<td class="px-2 py-1.5 bg-[#f0f9fa]">
                <input class="inline-input" data-col="${c}" value="${escapeHtml(String(row[c] ?? ''))}"
                    ${isPK ? 'readonly' : ''}>
            </td>`
        }).join('')}
        <td class="px-4 py-2 whitespace-nowrap bg-[#f0f9fa]">
            <button class="text-[0.72rem] text-green-600 font-medium px-2 py-1 rounded hover:bg-green-50 border-none bg-transparent cursor-pointer" onclick="saveModalEdit(${index})">Save</button>
            <button class="text-[0.72rem] text-[#999] font-medium px-2 py-1 rounded hover:bg-[#f1f5f9] border-none bg-transparent cursor-pointer" onclick="cancelModalEdit(${index})">✕</button>
        </td>`

    trEl.querySelector('input:not([readonly])')?.focus();
};

window.cancelModalEdit = (index) => {
    const row  = modalData[index]
    if (!row) return
    const cols = Object.keys(row)
    const trEl = document.getElementById(`modal-row-${index}`)
    if (!trEl) return
    trEl.outerHTML = renderModalRow(row, cols, index)
};

window.saveModalEdit = async (index) => {
    const trEl = document.getElementById(`modal-row-${index}`);
    if (!trEl) return;

    const record = {};
    trEl.querySelectorAll('.inline-input').forEach(input => {
        record[input.dataset.col] = input.value
    });

    const pkValue = modalData[index][modalPKColumn]

    try {
        const res = await fetch(
            `${CONFIG.API_URL}/api/canvas/${connectionId}/table/${modalTable}/${pkValue}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ columnName: modalPKColumn, record })
            }
        );
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Failed to update row'); return };
        modalData[index] = data.row;
        const cols = Object.keys(data.row);
        trEl.outerHTML = renderModalRow(data.row, cols, index);
    } catch {
        alert('Something went wrong while saving.');
    }
};

document.getElementById('modal-add-row-btn').addEventListener('click', () => {
    if (!modalTable) return;
    const tableData = schema.find(t => t.table_name === modalTable);
    if (!tableData) return;
    const tbodyEl = document.getElementById('modal-tbody');
    if (!tbodyEl || document.getElementById('modal-new-row')) return;

    const editableCols = tableData.columns.filter(c => !c.is_primary_key);
    const tr = document.createElement('tr');
    tr.id = 'modal-new-row'
    tr.className = 'bg-[#f0f9fa]'
    tr.innerHTML = `
        <td class="px-4 py-2 text-[0.75rem] text-[#bbb]">*</td>
        ${editableCols.map(c => `
            <td class="px-2 py-1.5">
                <input class="inline-input" data-col="${c.column_name}" placeholder="${c.is_nullable === 'YES' ? 'optional' : 'required'}">
            </td>`).join('')}
        <td class="px-4 py-2 whitespace-nowrap">
            <button class="text-[0.72rem] text-green-600 font-medium px-2 py-1 rounded hover:bg-green-50 border-none bg-transparent cursor-pointer" onclick="saveModalNewRow()">Save</button>
            <button class="text-[0.72rem] text-[#999] font-medium px-2 py-1 rounded hover:bg-[#f1f5f9] border-none bg-transparent cursor-pointer" onclick="cancelModalNewRow()">✕</button>
        </td>`

    tbodyEl.insertBefore(tr, tbodyEl.firstChild);
    tr.querySelector('.inline-input')?.focus();
});

window.saveModalNewRow = async () => {
    const tr = document.getElementById('modal-new-row');
    if (!tr) return;

    const record = {}
    tr.querySelectorAll('.inline-input').forEach(input => {
        if (input.value !== '') record[input.dataset.col] = input.value
    });

    try {
        const res = await fetch(
            `${CONFIG.API_URL}/api/canvas/${connectionId}/table/${modalTable}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(record)
            }
        )
        const data = await res.json()
        if (!res.ok) { alert(data.error || 'Failed to add row'); return }
        fetchModalData();
    } catch {
        alert('Something went wrong while adding row.');
    }
};

window.cancelModalNewRow = () => {
    document.getElementById('modal-new-row')?.remove()
};

document.getElementById('modal-close').addEventListener('click', closeDataModal)
document.getElementById('data-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('data-modal-overlay')) closeDataModal()
});
function closeDataModal() {
    document.getElementById('data-modal-overlay').classList.add('hidden')
    modalTable = null
};

document.getElementById('modal-prev').addEventListener('click', () => {
    if (modalPage > 1) { modalPage--; fetchModalData() }
});
document.getElementById('modal-next').addEventListener('click', () => {
    if (modalPage < modalTotalPages) { modalPage++; fetchModalData() }
});

document.getElementById('modal-search').addEventListener('input', () => {
    clearTimeout(modalFilterTimeout)
    modalFilterTimeout = setTimeout(() => { modalPage = 1; fetchModalData() }, 400)
});
document.getElementById('modal-filter-col').addEventListener('change', () => {
    modalPage = 1; fetchModalData()
});

window.openDeleteRow = (key) => {
    deletingRowKey = key;
    document.getElementById('delete-row-overlay').classList.remove('hidden');
};

document.getElementById('delete-row-cancel').addEventListener('click', () => {
    document.getElementById('delete-row-overlay').classList.add('hidden');
    deletingRowKey = null;
});

document.getElementById('delete-row-confirm').addEventListener('click', async () => {
    if (!deletingRowKey || !modalPKColumn || !modalTable) return;
    try {
        const res = await fetch(
            `${CONFIG.API_URL}/api/canvas/${connectionId}/table/${modalTable}/${deletingRowKey}`,
            {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ columnName: modalPKColumn })
            }
        )
        if (res.ok) {
            document.getElementById('delete-row-overlay').classList.add('hidden')
            deletingRowKey = null
            fetchModalData()
        } else {
            const data = await res.json()
            alert(data.error || 'Failed to delete row')
        }
    } catch {
        alert('Something went wrong.');
    }
});

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
};

loadSchema();
