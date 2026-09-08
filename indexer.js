require('dotenv').config();
const { TonClient, Address } = require('@ton/ton');
const { Cell } = require('@ton/core');
const db = require('./db');
const WebSocket = require('ws');

// Config
const TON_ENDPOINT = process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
const TON_API_KEY = process.env.TON_API_KEY || '';
const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL_MS) || 4000;
const BONDING_CURVE_ADDRESS = process.env.BONDING_CURVE_ADDRESS;

// TON Client
const client = new TonClient({
    endpoint: TON_ENDPOINT,
    apiKey: TON_API_KEY,
});

// WebSocket for live frontend updates
const wss = new WebSocket.Server({ port: 8080 });
console.log('WebSocket server running on ws://localhost:8080');

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Operation codes (must match contract)
const OP_BUY = 0x12345678;
const OP_SELL = 0x12345679;
const OP_GRADUATE = 0x1234567a;

async function parseTransaction(tx) {
    try {
        const inMsg = tx.inMessage;
        if (!inMsg || !inMsg.body) return null;

        const slice = inMsg.body.beginParse();
        const op = slice.loadUint(32);

        const base = {
            hash: tx.hash().toString('hex'),
            time: tx.now * 1000,
            sender: inMsg.info.src.toString(),
            value: inMsg.info.value.coins.toString(),
        };

        if (op === OP_BUY) {
            const minTokensOut = slice.loadCoins();
            return {
                ...base,
                type: 'buy',
                minTokensOut: minTokensOut.toString(),
            };
        } else if (op === OP_SELL) {
            const tokenAmount = slice.loadCoins();
            const minTonOut = slice.loadCoins();
            return {
                ...base,
                type: 'sell',
                tokenAmount: tokenAmount.toString(),
                minTonOut: minTonOut.toString(),
            };
        }

        return null;
    } catch (e) {
        return null;
    }
}

async function scanBondingCurve() {
    if (!BONDING_CURVE_ADDRESS) {
        console.log('BONDING_CURVE_ADDRESS not set, skipping scan');
        return;
    }

    try {
        const address = Address.parse(BONDING_CURVE_ADDRESS);
        const transactions = await client.getTransactions(address, { limit: 20 });

        for (const tx of transactions) {
            const parsed = await parseTransaction(tx);
            if (parsed) {
                console.log(`[${parsed.type.toUpperCase()}] ${parsed.value} TON from ${parsed.sender.slice(0, 8)}...`);
                
                db.addTrade({
                    tokenAddress: BONDING_CURVE_ADDRESS,
                    ...parsed
                });

                broadcast({
                    event: 'trade',
                    data: parsed
                });
            }
        }

        // Update token state from contract
        // In production, call getState() getter here
    } catch (err) {
        console.error('Indexer error:', err.message);
    }
}

// Start polling
console.log('Starting TON Pump indexer...');
console.log('Endpoint:', TON_ENDPOINT);

setInterval(scanBondingCurve, POLLING_INTERVAL);
scanBondingCurve(); // Initial scan
