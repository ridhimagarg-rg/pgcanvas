require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/connections', require('./routes/connections.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/canvas', require('./routes/canvas.routes'));

app.get('/', (req, res) => {
    res.status(200).json({ message: 'pgCanvas server is running'})
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
});
