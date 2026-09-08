// ==================== STATE ====================
let tokens = JSON.parse(localStorage.getItem('tonpump_tokens')) || [];
let currentToken = null;
let tradeMode = 'buy';
let chartInstance = null;
let walletConnected = false;
let walletAddress = null;
const API_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:8080';

// ==================== TON CONNECT ====================
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://your-domain.com/tonconnect-manifest.json',
    buttonRootId: 'ton-connect'
});

tonConnectUI.onStatusChange(wallet => {
    if (wallet) {
        walletConnected = true;
        walletAddress = wallet.account.address;
        document.getElementById('tradeBtn').textContent = tradeMode === 'buy' ? 'Buy Tokens' : 'Sell Tokens';
        updatePortfolio();
    } else {
        walletConnected = false;
        walletAddress = null;
        document.getElementById('tradeBtn').textContent = 'Connect Wallet to Trade';
    }
});

// ==================== WEBSOCKET (Live Trades) ====================
let ws;
function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === 'trade' && currentToken) {
            renderTrades();
            updateChart();
        }
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
}
connectWebSocket();

// ==================== NAVIGATION ====================
function showView(view) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-' + view).classList.remove('hidden');
    if (view === 'home') {
        document.getElementById('hero').classList.remove('hidden');
        renderTokens();
    } else {
        document.getElementById('hero').classList.add('hidden');
    }
    window.scrollTo(0, 0);
}

// ==================== TOKEN CREATION ====================
function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreview').classList.remove('hidden');
            document.getElementById('uploadPlaceholder').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function createToken(e) {
    e.preventDefault();
    const name = document.getElementById('tokenName').value;
    const ticker = document.getElementById('tokenTicker').value.toUpperCase();
    const desc = document.getElementById('tokenDesc').value;
    const image = document.getElementById('imagePreview').src;

    const token = {
        id: Date.now().toString(),
        name,
        ticker,
        description: desc,
        image: image || 'https://placehold.co/100x100/1a1a2e/cyan?text=' + ticker[0],
        marketCap: 0,
        price: 0.000001,
        holders: 1,
        volume: 0,
        curveProgress: 0,
        createdAt: new Date().toISOString(),
        trades: [],
        graduated: false,
        contractAddress: null // Will be set after on-chain deployment
    };

    tokens.unshift(token);
    localStorage.setItem('tonpump_tokens', JSON.stringify(tokens));
    showToast('Token Launched!', `${ticker} is now live on the bonding curve`);
    showView('home');
    document.getElementById('createForm').reset();
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('uploadPlaceholder').classList.remove('hidden');
}

// ==================== TOKEN LISTING ====================
function renderTokens(filter = 'all', search = '') {
    const grid = document.getElementById('tokenGrid');
    const empty = document.getElementById('emptyState');
    let filtered = tokens;

    if (filter === 'trending') filtered = tokens.filter(t => t.volume > 0).sort((a,b) => b.volume - a.volume);
    else if (filter === 'new') filtered = tokens.slice(0, 10);
    else if (filter === 'graduated') filtered = tokens.filter(t => t.graduated);

    if (search) {
        filtered = filtered.filter(t => 
            t.name.toLowerCase().includes(search.toLowerCase()) || 
            t.ticker.toLowerCase().includes(search.toLowerCase())
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    grid.innerHTML = filtered.map(token => `
        <div class="token-card glass rounded-2xl p-5 border border-white/5 cursor-pointer transition-all duration-300" onclick="openToken('${token.id}')">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                    <img src="${token.image}" class="w-12 h-12 rounded-full object-cover border border-white/10">
                    <div>
                        <h3 class="font-bold text-white">${token.name}</h3>
                        <p class="text-xs text-cyan-400 font-mono">${token.ticker}</p>
                    </div>
                </div>
                ${token.graduated ? '<span class="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">Graduated</span>' : ''}
            </div>
            <p class="text-sm text-gray-400 line-clamp-2 mb-4 h-10">${token.description}</p>
            <div class="space-y-3">
                <div>
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-gray-500">Bonding Curve</span>
                        <span class="text-cyan-400">${token.curveProgress.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-white/5 rounded-full h-1.5">
                        <div class="bonding-curve rounded-full" style="width: ${token.curveProgress}%"></div>
                    </div>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Market Cap</span>
                    <span class="font-semibold">$${formatNumber(token.marketCap)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Volume</span>
                    <span class="font-semibold text-cyan-400">$${formatNumber(token.volume)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function filterTokens(type) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/30');
        btn.classList.add('text-gray-400', 'border-white/5');
    });
    const active = document.querySelector(`[data-filter="${type}"]`);
    active.classList.remove('text-gray-400', 'border-white/5');
    active.classList.add('bg-cyan-500/20', 'text-cyan-400', 'border-cyan-500/30');
    renderTokens(type, document.getElementById('searchInput').value);
}

function searchTokens(query) {
    const activeFilter = document.querySelector('.filter-btn.bg-cyan-500\\/20')?.dataset.filter || 'all';
    renderTokens(activeFilter, query);
}

// ==================== TOKEN DETAIL ====================
function openToken(id) {
    currentToken = tokens.find(t => t.id === id);
    if (!currentToken) return;

    document.getElementById('detailImage').src = currentToken.image;
    document.getElementById('detailName').textContent = currentToken.name;
    document.getElementById('detailTicker').textContent = '$' + currentToken.ticker;
    document.getElementById('detailDesc').textContent = currentToken.description;
    document.getElementById('detailMarketCap').textContent = '$' + formatNumber(currentToken.marketCap);
    document.getElementById('detailPrice').textContent = '$' + currentToken.price.toFixed(8);
    document.getElementById('detailHolders').textContent = currentToken.holders;
    document.getElementById('detailVolume').textContent = '$' + formatNumber(currentToken.volume);
    document.getElementById('curvePercent').textContent = currentToken.curveProgress.toFixed(1) + '%';
    document.getElementById('curveBar').style.width = currentToken.curveProgress + '%';
    document.getElementById('receiveSymbol').textContent = currentToken.ticker;

    if (currentToken.graduated) {
        document.getElementById('detailBadge').textContent = 'Graduated';
        document.getElementById('detailBadge').className = 'px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30';
    } else {
        document.getElementById('detailBadge').textContent = 'Active';
        document.getElementById('detailBadge').className = 'px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    }

    renderTrades();
    renderChart();
    showView('detail');
}

function renderTrades() {
    const list = document.getElementById('tradesList');
    if (!currentToken.trades.length) {
        list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No trades yet</p>';
        return;
    }
    list.innerHTML = currentToken.trades.slice().reverse().map(trade => `
        <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div class="flex items-center gap-2">
                <span class="text-xs ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'} font-semibold">${trade.type.toUpperCase()}</span>
                <span class="text-xs text-gray-500">${timeAgo(trade.time)}</span>
            </div>
            <div class="text-right">
                <p class="text-sm font-medium">${trade.amount} TON</p>
                <p class="text-xs text-gray-500">${trade.tokens} ${currentToken.ticker}</p>
            </div>
        </div>
    `).join('');
}

function renderChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const labels = [];
    const data = [];
    let price = currentToken.price * 0.5;
    for (let i = 0; i < 20; i++) {
        labels.push(i);
        price = price * (1 + (Math.random() - 0.4) * 0.1);
        data.push(price);
    }
    data[data.length - 1] = currentToken.price;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: data,
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34, 211, 238, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { 
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#6b7280', callback: v => '$' + v.toFixed(6) }
                }
            }
        }
    });
}

function updateChart() {
    if (chartInstance && currentToken) {
        renderChart();
    }
}

// ==================== TRADING ====================
function setTradeMode(mode) {
    tradeMode = mode;
    document.getElementById('buyTab').className = mode === 'buy' 
        ? 'flex-1 py-2 rounded-lg font-semibold bg-cyan-500 text-white transition'
        : 'flex-1 py-2 rounded-lg font-semibold text-gray-400 hover:text-white transition';
    document.getElementById('sellTab').className = mode === 'sell'
        ? 'flex-1 py-2 rounded-lg font-semibold bg-red-500 text-white transition'
        : 'flex-1 py-2 rounded-lg font-semibold text-gray-400 hover:text-white transition';
    
    const btn = document.getElementById('tradeBtn');
    btn.className = mode === 'buy'
        ? 'w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white hover:opacity-90 transition shadow-lg shadow-cyan-500/25'
        : 'w-full py-4 bg-gradient-to-r from-red-500 to-orange-600 rounded-xl font-bold text-white hover:opacity-90 transition shadow-lg shadow-red-500/25';
    
    btn.textContent = walletConnected 
        ? (mode === 'buy' ? 'Buy Tokens' : 'Sell Tokens')
        : 'Connect Wallet to Trade';
    
    calculateOutput();
}

function calculateOutput() {
    const amount = parseFloat(document.getElementById('tradeAmount').value) || 0;
    if (!currentToken) return;
    
    const rate = tradeMode === 'buy' ? currentToken.price : currentToken.price * 0.98;
    const output = amount / rate;
    document.getElementById('receiveAmount').value = output > 0 ? output.toFixed(4) : '';
    
    const impact = Math.min(amount / 10, 15);
    document.getElementById('priceImpact').textContent = '~' + impact.toFixed(1) + '%';
    document.getElementById('priceImpact').className = impact > 5 ? 'text-red-400' : 'text-yellow-400';
    
    const fee = amount * 0.01;
    document.getElementById('platformFee').textContent = fee > 0 ? fee.toFixed(4) + ' TON' : '0 TON';
}

async function executeTrade() {
    if (!walletConnected) {
        tonConnectUI.openModal();
        return;
    }

    const amount = parseFloat(document.getElementById('tradeAmount').value);
    if (!amount || amount <= 0) {
        showToast('Error', 'Please enter a valid amount', 'error');
        return;
    }

    const btn = document.getElementById('tradeBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Processing...';
    btn.disabled = true;

    // Simulate on-chain delay
    await new Promise(r => setTimeout(r, 1500));

    const tokensReceived = tradeMode === 'buy' 
        ? (amount / currentToken.price).toFixed(2)
        : (amount * currentToken.price).toFixed(2);

    currentToken.trades.push({
        type: tradeMode,
        amount: amount,
        tokens: tokensReceived,
        time: new Date().toISOString()
    });

    if (tradeMode === 'buy') {
        currentToken.marketCap += amount * 10;
        currentToken.volume += amount;
        currentToken.curveProgress = Math.min((currentToken.marketCap / 69000) * 100, 100);
        currentToken.price *= 1.02;
    } else {
        currentToken.marketCap = Math.max(0, currentToken.marketCap - amount * 10);
        currentToken.volume += amount;
        currentToken.price *= 0.98;
    }

    if (currentToken.curveProgress >= 100 && !currentToken.graduated) {
        currentToken.graduated = true;
        showToast('🎓 Graduated!', `${currentToken.ticker} has graduated to DeDust DEX!`);
    }

    const idx = tokens.findIndex(t => t.id === currentToken.id);
    tokens[idx] = currentToken;
    localStorage.setItem('tonpump_tokens', JSON.stringify(tokens));

    openToken(currentToken.id);
    showToast('Trade Executed!', `${tradeMode === 'buy' ? 'Bought' : 'Sold'} ${amount} TON worth of ${currentToken.ticker}`);
    
    btn.textContent = originalText;
    btn.disabled = false;
    document.getElementById('tradeAmount').value = '';
    document.getElementById('receiveAmount').value = '';
}

// ==================== PORTFOLIO ====================
function updatePortfolio() {
    if (!walletConnected) return;
    
    const content = document.getElementById('portfolioContent');
    const userTokens = tokens.filter(t => t.trades.some(tr => tr.type === 'buy')).slice(0, 5);
    
    if (userTokens.length === 0) {
        content.innerHTML = `
            <div class="text-5xl mb-4">📭</div>
            <h3 class="text-lg font-semibold text-gray-300 mb-2">No holdings yet</h3>
            <p class="text-gray-500">Start trading to build your portfolio</p>
        `;
        return;
    }

    content.innerHTML = `
        <div class="text-left space-y-4">
            <div class="flex items-center justify-between pb-4 border-b border-white/5">
                <span class="text-gray-400">Wallet</span>
                <span class="font-mono text-sm text-cyan-400">${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}</span>
            </div>
            ${userTokens.map(t => `
                <div class="flex items-center justify-between py-2">
                    <div class="flex items-center gap-3">
                        <img src="${t.image}" class="w-10 h-10 rounded-full">
                        <div>
                            <p class="font-semibold">${t.ticker}</p>
                            <p class="text-xs text-gray-500">${t.name}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold text-cyan-400">$${formatNumber(t.marketCap)}</p>
                        <p class="text-xs text-gray-500">MCap</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ==================== UTILS ====================
function formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function timeAgo(iso) {
    const sec = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec/60) + 'm ago';
    return Math.floor(sec/3600) + 'h ago';
}

function showToast(title, message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    
    const icon = document.getElementById('toastIcon');
    if (type === 'error') {
        icon.className = 'w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400';
        icon.textContent = '!';
    } else {
        icon.className = 'w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400';
        icon.textContent = '✓';
    }

    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
}

// ==================== INIT ====================
renderTokens();
