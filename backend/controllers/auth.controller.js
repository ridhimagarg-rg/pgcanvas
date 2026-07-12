const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const register = async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }
    try{
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role',
            [name, email, password_hash, role || 'Staff']
        );
        const token = jwt.sign(
            { user_id: newUser.rows[0].user_id, email: newUser.rows[0].email, role: newUser.rows[0].role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        return res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                user_id: newUser.rows[0].user_id,
                name: newUser.rows[0].name,
                email: newUser.rows[0].email,
                role: newUser.rows[0].role
            }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try{
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        const match = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!match) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        const token = jwt.sign(
            { user_id: result.rows[0].user_id, email: result.rows[0].email, role: result.rows[0].role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        return res.status(200).json({
            message: 'User logged in successfully',
            token,
            user: {
                user_id: result.rows[0].user_id,
                name: result.rows[0].name,
                email: result.rows[0].email,
                role: result.rows[0].role
            }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { register, login };
