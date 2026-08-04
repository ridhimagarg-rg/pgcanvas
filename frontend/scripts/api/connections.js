async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    }

    const options = { method, headers }
    if (body) options.body = JSON.stringify(body)

    const res = await fetch(`${CONFIG.API_URL}${endpoint}`, options)
    const data = await res.json()

    if (res.status === 401) {
        logout()
        return null
    }

    return { ok: res.ok, status: res.status, data }
}

const ConnectionsAPI = {
    getAll: () => apiRequest('/api/connections'),
    create: (body) => apiRequest('/api/connections', 'POST', body),
    update: (id, body) => apiRequest(`/api/connections/${id}`, 'PUT', body),
    delete: (id) => apiRequest(`/api/connections/${id}`, 'DELETE'),
    test: (body) => apiRequest('/api/connections/test', 'POST', body),
}
