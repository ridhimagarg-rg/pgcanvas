function requireAuth() {
    const token = localStorage.getItem('token')
    if (!token) {
        window.location.href = '/index.html'
        return null
    }
    return JSON.parse(localStorage.getItem('user'))
}

function getToken() {
    return localStorage.getItem('token')
}

function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/index.html'
}
