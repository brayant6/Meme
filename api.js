require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Get all tokens
app.get('/api/tokens', (req, res) => {
    const tokens = db.getAllTokens();
    res.json(tokens);
});

// Get single token
app.get('/api/tokens/:address', (req, res) => {
    const token = db.getToken(req.params.address);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json(token);
});

// Get trades for token
app.get('/api/tokens/:address/trades', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const trades = db.getTrades(req.params.address, limit);
    res.json(trades);
});

app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
});
