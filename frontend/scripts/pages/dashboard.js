const user = requireAuth()

document.getElementById('user-name').textContent = user.name
document.getElementById('user-role').textContent = user.role
document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase()

if (user.role === 'Admin') {
    document.getElementById('nav-admin').style.display = 'flex'
}

document.getElementById('logout-btn').addEventListener('click', logout)

let editingId = null
let deletingId = null

async function loadConnections() {
    const grid = document.getElementById('connections-grid')
    grid.innerHTML = '<div class="text-[#999] text-[0.9rem] py-5">Loading connections...</div>'

    const result = await ConnectionsAPI.getAll()

    if (!result || !result.ok) {
        grid.innerHTML = '<div class="text-[#999] text-[0.9rem] py-5">Failed to load connections.</div>'
        return
    }

    const connections = result.data.connections
    const count = connections.length
    document.getElementById('connections-count').textContent =
        `${count} saved database${count !== 1 ? 's' : ''}`

    if (count === 0) {
        grid.innerHTML = `
            <div class="text-center py-12 px-5 text-[#999]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" style="margin:0 auto 12px"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                <h3 class="text-base mb-2 text-[#666]">No connections yet</h3>
                <p>Click "Add Connection" to connect your first database.</p>
            </div>`
        return
    }

    grid.innerHTML = connections.map(c => {
        const lastAccessed = c.last_accessed
            ? new Date(c.last_accessed).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Never'

        const statusClass = c.last_accessed ? 'online' : 'offline'
        const statusLabel = c.last_accessed ? 'Connected' : 'Not tested'

        return `
        <div class="bg-white border border-[#e8ecf0] rounded-[14px] p-5 flex flex-col gap-3 transition-all duration-150 hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] hover:border-[#d0d8e0]">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-base font-bold text-[#1a1a1a] mb-0.5">${escapeHtml(c.connection_name)}</div>
                    <div class="conn-card-host text-[0.78rem] text-[#999]">${escapeHtml(c.host)}:${c.port}</div>
                </div>
                <span class="conn-status ${statusClass} flex items-center gap-1.5 text-[0.75rem] font-semibold px-2.5 py-0.5 rounded-full shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                    ${statusLabel}
                </span>
            </div>
            <div class="flex gap-4 text-[0.8rem] text-[#666]">
                <div class="flex flex-col gap-0.5">
                    <span class="conn-meta-label text-[0.7rem] text-[#aaa] uppercase">Database</span>
                    <span class="font-medium text-[#444]">${escapeHtml(c.database_name)}</span>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="conn-meta-label text-[0.7rem] text-[#aaa] uppercase">Tables</span>
                    <span class="font-medium text-[#444]">${c.total_tables != null ? c.total_tables : '—'}</span>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="conn-meta-label text-[0.7rem] text-[#aaa] uppercase">Last accessed</span>
                    <span class="font-medium text-[#444]">${lastAccessed}</span>
                </div>
            </div>
            <div class="flex gap-2 pt-1 border-t border-[#f1f5f9]">
                <a href="canvas.html?id=${c.connection_id}" class="flex-1 text-center bg-[#0694a2] text-white border-none px-3 py-1.5 rounded-lg text-[0.8rem] font-medium cursor-pointer transition-colors duration-150 hover:bg-[#07818f] no-underline">Open Canvas</a>
                <button class="bg-none text-[#666] border border-[#e8ecf0] px-3 py-1.5 rounded-lg text-[0.8rem] cursor-pointer transition-all duration-150 hover:bg-[#f8fafc] hover:text-[#1a1a1a]" onclick="openEdit(${c.connection_id})">Edit</button>
                <button class="bg-red-600 text-white border-none px-3 py-1.5 rounded-lg text-[0.8rem] cursor-pointer hover:bg-red-700" onclick="openDelete(${c.connection_id})">Delete</button>
            </div>
        </div>`
    }).join('')
}

function escapeHtml(str) {
    if (!str) return ''
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

// Modal
function openModal(title) {
    document.getElementById('modal-title').textContent = title
    document.getElementById('modal-overlay').classList.remove('hidden')
    document.getElementById('modal-error').textContent = ''
    document.getElementById('test-result').className = 'hidden'
    document.getElementById('test-result').textContent = ''
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden')
    editingId = null
    clearModalFields()
}

function clearModalFields() {
    document.getElementById('conn-name').value = ''
    document.getElementById('conn-host').value = ''
    document.getElementById('conn-port').value = '6543'
    document.getElementById('conn-database').value = ''
    document.getElementById('conn-username').value = ''
    document.getElementById('conn-password').value = ''
}

document.getElementById('add-connection-btn').addEventListener('click', () => {
    editingId = null
    openModal('Add Connection')
})

document.getElementById('modal-close').addEventListener('click', closeModal)
document.getElementById('cancel-btn').addEventListener('click', closeModal)

document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal()
})

window.openEdit = async (id) => {
    const result = await ConnectionsAPI.getAll()
    if (!result || !result.ok) return
    const conn = result.data.connections.find(c => c.connection_id === id)
    if (!conn) return

    editingId = id
    document.getElementById('conn-name').value = conn.connection_name
    document.getElementById('conn-host').value = conn.host
    document.getElementById('conn-port').value = conn.port
    document.getElementById('conn-database').value = conn.database_name
    document.getElementById('conn-username').value = conn.username
    document.getElementById('conn-password').value = ''
    openModal('Edit Connection')
}

window.openDelete = (id) => {
    deletingId = id
    document.getElementById('delete-overlay').classList.remove('hidden')
}

document.getElementById('delete-cancel-btn').addEventListener('click', () => {
    document.getElementById('delete-overlay').classList.add('hidden')
    deletingId = null
})

document.getElementById('delete-confirm-btn').addEventListener('click', async () => {
    if (!deletingId) return
    const result = await ConnectionsAPI.delete(deletingId)
    if (result && result.ok) {
        document.getElementById('delete-overlay').classList.add('hidden')
        deletingId = null
        loadConnections()
    }
})

document.getElementById('test-btn').addEventListener('click', async () => {
    const body = {
        host: document.getElementById('conn-host').value.trim(),
        port: parseInt(document.getElementById('conn-port').value),
        database_name: document.getElementById('conn-database').value.trim(),
        username: document.getElementById('conn-username').value.trim(),
        password: document.getElementById('conn-password').value
    }

    const testResult = document.getElementById('test-result')
    testResult.textContent = 'Testing connection...'
    testResult.className = 'px-3.5 py-2.5 rounded-lg text-[0.85rem] mt-2'

    const result = await ConnectionsAPI.test(body)
    if (result && result.ok) {
        testResult.textContent = `✓ Connected successfully! Found ${result.data.table_count} tables.`
        testResult.className = 'px-3.5 py-2.5 rounded-lg text-[0.85rem] mt-2 success'
    } else {
        testResult.textContent = result?.data?.error || 'Connection failed. Check your credentials.'
        testResult.className = 'px-3.5 py-2.5 rounded-lg text-[0.85rem] mt-2 error'
    }
})

document.getElementById('save-btn').addEventListener('click', async () => {
    const body = {
        connection_name: document.getElementById('conn-name').value.trim(),
        host: document.getElementById('conn-host').value.trim(),
        port: parseInt(document.getElementById('conn-port').value),
        database_name: document.getElementById('conn-database').value.trim(),
        username: document.getElementById('conn-username').value.trim(),
        password: document.getElementById('conn-password').value
    }

    const errorEl = document.getElementById('modal-error')

    if (!body.connection_name || !body.host || !body.port || !body.database_name || !body.username || !body.password) {
        errorEl.textContent = 'Please fill in all fields'
        return
    }

    let result
    if (editingId) {
        result = await ConnectionsAPI.update(editingId, body)
    } else {
        result = await ConnectionsAPI.create(body)
    }

    if (result && result.ok) {
        closeModal()
        loadConnections()
    } else {
        errorEl.textContent = result?.data?.error || 'Failed to save connection'
    }
})

loadConnections()
