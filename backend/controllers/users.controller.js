const pool = require('../db/pool')

const getMe = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1',
            [req.user.user_id]
        )
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })
        res.status(200).json({ user: result.rows[0] })
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' })
    }
}

const getAllUsers = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' })
    }
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role, is_active FROM users ORDER BY user_id ASC'
        )
        res.status(200).json({ users: result.rows })
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' })
    }
}

const updateRole = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' })
    }
    const { id } = req.params
    const { role } = req.body
    const validRoles = ['Admin', 'Faculty', 'Staff']
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' })
    }
    try {
        const result = await pool.query(
            'UPDATE users SET role = $1 WHERE user_id = $2 RETURNING user_id, name, email, role',
            [role, id]
        )
        res.status(200).json({ user: result.rows[0] })
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' })
    }
}

const updateStatus = async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' })
    }
    const { id } = req.params
    const { is_active } = req.body
    try {
        const result = await pool.query(
            'UPDATE users SET is_active = $1 WHERE user_id = $2 RETURNING user_id, name, email, role, is_active',
            [is_active, id]
        )
        res.status(200).json({ user: result.rows[0] })
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' })
    }
}

module.exports = { getMe, getAllUsers, updateRole, updateStatus }
