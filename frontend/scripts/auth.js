// Tab switching
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    clearErrors();
})

registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
    clearErrors();
})

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = message;
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

document.getElementById('login-button').addEventListener('click', async () => {
    clearErrors();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();   

    if (!email || !password) {
        showError('login-error', 'Please fill in all fields');
        return;
    }

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })
        const data = await res.json();

        if (!res.ok) {
            showError('login-error', data.error || 'Login failed');
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/pages/dashboard.html';

    } catch (err) {
        showError('login-error', 'Something went wrong. Please try again.');
    }
})

document.getElementById('register-button').addEventListener('click', async () => {
    clearErrors()
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const role = document.getElementById('register-role').value;

    if (!name || !email || !password || !role) {
        showError('register-error', 'Please fill in all fields');
        return;
    }

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role })
        })
        const data = await res.json()

        if (!res.ok) {
            showError('register-error', data.error || 'Registration failed');
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/pages/dashboard.html';

    } catch (err) {
        showError('register-error', 'Something went wrong. Please try again.');
    }
})
