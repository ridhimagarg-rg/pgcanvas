const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { Client } = require('pg');
const auth = require('../middleware/auth.middleware');

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT connection_id, connection_name, host, port, database_name, username, total_tables, last_accessed FROM connections WHERE user_id = $1 ORDER BY last_accessed DESC NULLS LAST',
            [req.user.user_id]
        );
        res.status(200).json({ connections: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/', async (req, res) => {
    const { connection_name, host, port, database_name, username, password } = req.body;
    if (!connection_name || !host || !port || !database_name || !username || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO connections (user_id, connection_name, host, port, database_name, username, password)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING connection_id, connection_name, host, port, database_name, username, total_tables, last_accessed`,
            [req.user.user_id, connection_name, host, port, database_name, username, password]
        );
        res.status(201).json({ connection: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { connection_name, host, port, database_name, username, password } = req.body;
    try {
        const existing = await pool.query(
            'SELECT * FROM connections WHERE connection_id = $1 AND user_id = $2',
            [id, req.user.user_id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        const result = await pool.query(
            `UPDATE connections SET
                connection_name = COALESCE($1, connection_name),
                host = COALESCE($2, host),
                port = COALESCE($3, port),
                database_name = COALESCE($4, database_name),
                username = COALESCE($5, username),
                password = COALESCE($6, password)
             WHERE connection_id = $7 AND user_id = $8
             RETURNING connection_id, connection_name, host, port, database_name, username`,
            [connection_name, host, port, database_name, username, password, id, req.user.user_id]
        );
        res.status(200).json({ connection: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await pool.query(
            'SELECT * FROM connections WHERE connection_id = $1 AND user_id = $2',
            [id, req.user.user_id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Connection not found' });
        }
        await pool.query('DELETE FROM connections WHERE connection_id = $1', [id]);
        res.status(200).json({ message: 'Connection deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/test', async (req, res) => {
    const { host, port, database_name, username, password } = req.body;
    const client = new Client({
        host, port,
        database: database_name,
        user: username,
        password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });
    try {
        await client.connect();
        const result = await client.query(`
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        await client.end();
        res.status(200).json({ success: true, message: 'Connection successful', table_count: parseInt(result.rows[0].table_count) });
    } catch (err) {
        res.status(400).json({ success: false, error: 'Could not connect. Please check your credentials.' });
    }
});

module.exports = router;
