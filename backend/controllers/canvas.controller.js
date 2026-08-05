const pool = require('../db/pool');
const { Client } = require('pg');

async function getClient(connectionId, userId) {
    const result = await pool.query(
        'SELECT * FROM connections WHERE connection_id = $1 AND user_id = $2',
        [connectionId, userId]
    )
    if (result.rows.length === 0) throw new Error('Connection not found')

    const conn = result.rows[0]
    const client = new Client({
        host: conn.host,
        port: conn.port,
        database: conn.database_name,
        user: conn.username,
        password: conn.password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    })
    await client.connect()
    return { client, conn }
};

const getSchema = async (req, res) => {
    const { connectionId } = req.params
    let client

    try {
        const result = await getClient(connectionId, req.user.user_id)
        client = result.client

        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `)

        const tables = []
        for (const row of tablesResult.rows) {
            const columnsResult = await client.query(`
                SELECT 
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
                    fk.foreign_table_name,
                    fk.foreign_column_name
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
                    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
                ) pk ON c.column_name = pk.column_name
                LEFT JOIN (
                    SELECT
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
                ) fk ON c.column_name = fk.column_name
                WHERE c.table_name = $1 AND c.table_schema = 'public'
                ORDER BY c.ordinal_position
            `, [row.table_name])

            tables.push({
                table_name: row.table_name,
                columns: columnsResult.rows
            })
        }

        await pool.query(
            'UPDATE connections SET total_tables = $1, last_accessed = NOW() WHERE connection_id = $2',
            [tables.length, connectionId]
        )

        res.status(200).json({ tables })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message || 'Internal server error' })
    } finally {
        if (client) await client.end()
    }
};

const getTableData = async (req, res) => {
    const { connectionId, tableName } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    const sortColumn = req.query.sort || null
    const sortOrder = req.query.order === 'desc' ? 'DESC' : 'ASC'
    const filterColumn = req.query.filterCol || null
    const filterValue = req.query.filterVal || null
    let client

    try {
        const result = await getClient(connectionId, req.user.user_id)
        client = result.client

        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')

        let query = `SELECT * FROM "${safeName}"`
        const params = []

        if (filterColumn && filterValue) {
            const safeCol = filterColumn.replace(/[^a-zA-Z0-9_]/g, '')
            params.push(`%${filterValue}%`)
            query += ` WHERE "${safeCol}"::text ILIKE $${params.length}`
        }

        if (sortColumn) {
            const safeSort = sortColumn.replace(/[^a-zA-Z0-9_]/g, '')
            query += ` ORDER BY "${safeSort}" ${sortOrder}`
        }

        const countResult = await client.query(`SELECT COUNT(*) FROM "${safeName}"`)
        const total = parseInt(countResult.rows[0].count)

        params.push(limit)
        params.push(offset)
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`

        const dataResult = await client.query(query, params)

        res.status(200).json({
            rows: dataResult.rows,
            total,
            page,
            limit,
            total_pages: Math.ceil(total / limit)
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message || 'Internal server error' })
    } finally {
        if (client) await client.end()
    }
};

const createRecord = async (req, res) => {
    const { connectionId, tableName } = req.params
    const record = req.body
    let client

    try {
        const result = await getClient(connectionId, req.user.user_id)
        client = result.client

        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
        const keys = Object.keys(record)
        const values = Object.values(record)
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
        const columns = keys.map(k => `"${k}"`).join(', ')

        const insertResult = await client.query(
            `INSERT INTO "${safeName}" (${columns}) VALUES (${placeholders}) RETURNING *`,
            values
        )
        res.status(201).json({ row: insertResult.rows[0] })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message || 'Internal server error' })
    } finally {
        if (client) await client.end()
    }
};

const updateRecord = async (req, res) => {
    const { connectionId, tableName, primaryKey } = req.params
    const { columnName, record } = req.body
    let client

    try {
        const result = await getClient(connectionId, req.user.user_id)
        client = result.client

        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
        const keys = Object.keys(record)
        const values = Object.values(record)
        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')

        values.push(primaryKey)
        const updateResult = await client.query(
            `UPDATE "${safeName}" SET ${setClause} WHERE "${columnName}" = $${values.length} RETURNING *`,
            values
        )
        res.status(200).json({ row: updateResult.rows[0] })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message || 'Internal server error' })
    } finally {
        if (client) await client.end()
    }
};

const deleteRecord = async (req, res) => {
    const { connectionId, tableName, primaryKey } = req.params
    const { columnName } = req.body
    let client

    try {
        const result = await getClient(connectionId, req.user.user_id)
        client = result.client

        const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
        await client.query(
            `DELETE FROM "${safeName}" WHERE "${columnName}" = $1`,
            [primaryKey]
        )
        res.status(200).json({ message: 'Record deleted successfully' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: err.message || 'Internal server error' })
    } finally {
        if (client) await client.end()
    }
};

module.exports = { getSchema, getTableData, createRecord, updateRecord, deleteRecord };
