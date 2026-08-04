const user = requireAuth()

if (user.role !== 'Admin') {
    window.location.href = 'dashboard.html'
}

document.getElementById('user-name').textContent = user.name
document.getElementById('user-role').textContent = user.role
document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase()
document.getElementById('logout-btn').addEventListener('click', logout)

async function loadUsers() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        })
        const data = await res.json()

        if (!res.ok) {
            document.getElementById('users-tbody').innerHTML =
                `<tr><td colspan="5" class="px-4 py-3 text-[#999]">Failed to load users.</td></tr>`
            return
        }

        document.getElementById('users-tbody').innerHTML = data.users.map(u => `
            <tr class="group">
                <td class="px-4 py-3 border-b border-[#f1f5f9] text-[#1a1a1a] group-last:border-0 group-hover:bg-[#f8fafc]">${u.name}</td>
                <td class="px-4 py-3 border-b border-[#f1f5f9] text-[#1a1a1a] group-last:border-0 group-hover:bg-[#f8fafc]">${u.email}</td>
                <td class="px-4 py-3 border-b border-[#f1f5f9] group-last:border-0 group-hover:bg-[#f8fafc]">
                    <select class="role-select px-2 py-1 border border-[#e8ecf0] rounded-md font-[Inter] text-[0.85rem] outline-none cursor-pointer" onchange="updateRole(${u.user_id}, this.value)">
                        ${['Admin','Faculty','Staff'].map(r =>
                            `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`
                        ).join('')}
                    </select>
                </td>
                <td class="px-4 py-3 border-b border-[#f1f5f9] group-last:border-0 group-hover:bg-[#f8fafc]">
                    <span class="status-badge status-${u.is_active ? 'active' : 'inactive'} px-2.5 py-0.5 rounded-full text-[0.78rem] font-semibold">
                        ${u.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-4 py-3 border-b border-[#f1f5f9] group-last:border-0 group-hover:bg-[#f8fafc]">
                    <button class="toggle-status-btn bg-transparent border border-[#e8ecf0] rounded-md px-2.5 py-1 text-[0.8rem] font-[Inter] cursor-pointer transition-all hover:bg-[#f8fafc]"
                        onclick="toggleStatus(${u.user_id}, ${u.is_active})">
                        ${u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>`).join('')
    } catch (err) {
        document.getElementById('users-tbody').innerHTML =
            `<tr><td colspan="5" class="px-4 py-3 text-[#999]">Error loading users.</td></tr>`
    }
}

window.updateRole = async (id, role) => {
    await fetch(`${CONFIG.API_URL}/api/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ role })
    })
}

window.toggleStatus = async (id, currentStatus) => {
    await fetch(`${CONFIG.API_URL}/api/users/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ is_active: !currentStatus })
    })
    loadUsers()
}

loadUsers()
