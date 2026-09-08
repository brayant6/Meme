// Simple DB abstraction - swap PostgreSQL here in production
class MemoryDB {
    constructor() {
        this.tokens = new Map();
        this.trades = [];
        this.holders = new Map();
    }

    saveToken(token) {
        this.tokens.set(token.address, token);
    }

    getToken(address) {
        return this.tokens.get(address);
    }

    getAllTokens() {
        return Array.from(this.tokens.values());
    }

    addTrade(trade) {
        this.trades.push(trade);
        // Keep last 1000 trades
        if (this.trades.length > 1000) this.trades.shift();
    }

    getTrades(tokenAddress, limit = 50) {
        return this.trades
            .filter(t => t.tokenAddress === tokenAddress)
            .slice(-limit);
    }

    updateHolders(tokenAddress, holder, balance) {
        if (!this.holders.has(tokenAddress)) {
            this.holders.set(tokenAddress, new Map());
        }
        this.holders.get(tokenAddress).set(holder, balance);
    }
}

module.exports = new MemoryDB();
