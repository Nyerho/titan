// Advanced Trading Platform JavaScript

class TradingPlatform {
    constructor() {
        this.currentSymbol = 'EUR/USD';
        this.currentTimeframe = '1H';
        this.positions = [];
        this.orders = [];
        this.marketData = new Map();
        this.demoPriceCache = new Map();
        this.symbolUpdateHandler = (data) => this.handleRealTimeUpdate(data);
        this.lastSubscribedSymbol = null;
        this.portfolio = {
            balance: 0,
            equity: 0,
            margin: 0,
            freeMargin: 0,
            marginLevel: 0,
            totalPnL: 0
        };
        this.marketOverview = {
            sp500: { value: 4185.47, change: 0.85 },
            nasdaq: { value: 12845.78, change: 1.24 },
            dow: { value: 33875.12, change: 0.45 },
            vix: { value: 18.45, change: -2.15 }
        };
        this.activeTab = 'positions';
        this.orderMode = 'simple';
        this.watchlistTab = 'forex';
        this.tradingService = new TradingService();
        
        // Initialize market data service
        this.marketDataService = new MarketDataService();
        this.realTimeData = new Map();
        this.userProfileService = null;
    }

    async init() {
        this.initMarketOverview();
        this.initWatchlist();
        this.initOrderForm();
        this.initChart();
        this.initSymbolControls();
        this.initTradingPanels();
        this.initPortfolioSummary();
        this.initMarketDepth();
        this.initQuickActions();
        this.startRealTimeUpdates();

        try {
            await this.marketDataService.init();
        } catch (e) {
            this.showNotification('Market data service unavailable - using demo prices', 'warning');
        }
        await this.refreshAccountInfo();
        await this.loadInitialData();
        
        // Subscribe to current symbol updates
        this.subscribeToSymbol(this.currentSymbol);
        
        // Initialize user profile integration
        await this.initializeUserProfile();
    }

    async ensureUserVerifiedForTrading() {
        try {
            if (localStorage.getItem('tt_demo_mode') === '1') return true;
        } catch (e) {}

        const authManager = window.authManager;
        if (!authManager?.getCurrentUser && !authManager?.currentUser) {
            this.showNotification('Please log in to trade', 'warning');
            try { window.location.href = 'auth.html'; } catch (e) {}
            return false;
        }
        const user = authManager?.getCurrentUser?.() || null;
        if (!user) {
            this.showNotification('Please log in to trade', 'warning');
            try { window.location.href = 'auth.html'; } catch (e) {}
            return false;
        }

        let verified = false;
        try {
            if (typeof authManager?.isUserVerified === 'function') {
                verified = await authManager.isUserVerified();
            } else {
                try { await user?.reload?.(); } catch (e) {}
                verified = !!user?.emailVerified || !!user?.phoneNumber;
            }
        } catch (e) {}

        if (verified) {
            const dbService = window.FirebaseDatabaseService;
            if (dbService?.getUserEntitlements) {
                try {
                    const entitlementsResult = await dbService.getUserEntitlements(user.uid);
                    const propAccount = entitlementsResult?.success ? entitlementsResult.data?.propAccount : null;
                    if (propAccount && propAccount.status === 'breached') {
                        this.showNotification('Prop account breached. Trading disabled.', 'warning');
                        return false;
                    }
                } catch (e) {}
            }
            return true;
        }

        this.showNotification('Verify your email or phone number to trade', 'warning');
        try { authManager?.ensureVerificationBanner?.(); } catch (e) {}
        return false;
    }

    async ensureTradingBalanceInitializedForTrading() {
        try {
            if (localStorage.getItem('tt_demo_mode') === '1') return true;
        } catch (e) {}

        const authManager = window.authManager;
        const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
        const dbService = window.FirebaseDatabaseService;
        if (!user?.uid || !dbService) return true;

        try {
            if (dbService.getUserEntitlements) {
                const entitlementsResult = await dbService.getUserEntitlements(user.uid);
                const propAccount = entitlementsResult?.success ? entitlementsResult.data?.propAccount : null;
                if (propAccount && propAccount.status !== 'breached') return true;
            }
        } catch (e) {}

        try {
            if (dbService.getUserTradingBalance) {
                const balanceResult = await dbService.getUserTradingBalance(user.uid);
                if (balanceResult?.success && balanceResult.initialized === false) {
                    this.showNotification('Transfer funds from wallet to trading before placing trades.', 'warning');
                    return false;
                }
            }
        } catch (e) {}

        return true;
    }

    async applyTradeResultToBackend(profit) {
        const authManager = window.authManager;
        const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
        const dbService = window.FirebaseDatabaseService;
        if (!user?.uid || !dbService) return;

        const pnl = Number(profit || 0);
        if (!Number.isFinite(pnl) || pnl === 0) return;

        try {
            if (dbService.getUserEntitlements) {
                const entitlementsResult = await dbService.getUserEntitlements(user.uid);
                const propAccount = entitlementsResult?.success ? entitlementsResult.data?.propAccount : null;
                if (propAccount && propAccount.status !== 'breached' && dbService.applyPropTradeResult) {
                    const res = await dbService.applyPropTradeResult(user.uid, pnl);
                    if (res?.success && res.propAccount?.status === 'breached') {
                        this.showNotification('Prop rules violated. Account breached.', 'warning');
                    }
                    return;
                }
            }

            if (dbService.applyBalanceDelta) {
                const res = await dbService.applyBalanceDelta(user.uid, pnl);
                if (res && res.success === false && res.error === 'trading_balance_not_initialized') {
                    this.showNotification('Transfer funds from wallet to trading before P&L can be applied.', 'warning');
                }
            }
        } catch (e) {}
    }
    
    // Load initial market data
    async loadInitialData() {
        try {
            // Load real market data for watchlist symbols
            const symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USD', 'ETH/USD', 'XAU/USD'];
            
            for (const symbol of symbols) {
                await this.loadSymbolData(symbol);
            }
            
            // Update market overview with real data
            await this.updateMarketOverview();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showNotification('Using demo data - API connection failed', 'warning');
        }
    }
    
    // Load real data for a specific symbol
    async loadSymbolData(symbol) {
        try {
            const data = await this.marketDataService.getQuote(symbol);
            if (data) {
                this.realTimeData.set(symbol, data);
                this.updateWatchlistItem(data);
            }
        } catch (error) {
            console.error(`Error loading data for ${symbol}:`, error);
        }
    }
    
    // Update market overview with real indices data
    async updateMarketOverview() {
        try {
            const indices = {
                'SPX': 'sp500',
                'IXIC': 'nasdaq', 
                'DJI': 'dow',
                'VIX': 'vix'
            };
            
            for (const [symbol, key] of Object.entries(indices)) {
                const data = await this.marketDataService.getQuote(symbol);
                if (data) {
                    this.marketOverview[key] = {
                        value: data.price,
                        change: data.changePercent
                    };
                }
            }
            
            this.updateMarketOverviewDisplay();
        } catch (error) {
            console.error('Error updating market overview:', error);
        }
    }

    // Subscribe to real-time updates for a symbol
    subscribeToSymbol(symbol) {
        if (!symbol) return;

        if (this.lastSubscribedSymbol && this.lastSubscribedSymbol !== symbol) {
            try {
                this.marketDataService.unsubscribeFromSymbol(this.lastSubscribedSymbol, this.symbolUpdateHandler);
            } catch (e) {}
        }

        this.marketDataService.subscribeToSymbol(symbol, this.symbolUpdateHandler);
        this.lastSubscribedSymbol = symbol;
    }

    // Handle real-time market data updates
    handleRealTimeUpdate(data) {
        this.realTimeData.set(data.symbol, data);
        
        // Update UI elements
        this.updatePriceDisplay(data);
        this.updateWatchlistItem(data);
        
        if (data.symbol === this.currentSymbol) {
            this.updateChart();
        }
        
        // Show notification for significant price changes
        if (Math.abs(data.changePercent) > 1) {
            this.showNotification(
                `${data.symbol}: ${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`,
                data.changePercent > 0 ? 'success' : 'error'
            );
        }
    }

    // Update price display in the UI
    updatePriceDisplay(data) {
        const priceElement = document.querySelector(`[data-symbol="${data.symbol}"] .price`);
        if (priceElement) {
            priceElement.textContent = data.price.toFixed(data.symbol.includes('/') ? 4 : 2);
        }
        
        const changeElement = document.querySelector(`[data-symbol="${data.symbol}"] .change`);
        if (changeElement) {
            changeElement.textContent = `${data.change > 0 ? '+' : ''}${data.change.toFixed(4)} (${data.changePercent.toFixed(2)}%)`;
            changeElement.className = `change ${data.change > 0 ? 'positive' : 'negative'}`;
        }
    }

    // Update watchlist item with real data
    updateWatchlistItem(data) {
        const item = document.querySelector(`[data-symbol="${data.symbol}"]`);
        if (item) {
            const priceEl = item.querySelector('.price');
            const changeEl = item.querySelector('.change');
            
            if (priceEl) {
                priceEl.textContent = data.price.toFixed(data.symbol.includes('/') ? 4 : 2);
            }
            
            if (changeEl) {
                changeEl.textContent = `${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(2)}%`;
                changeEl.className = `change ${data.changePercent > 0 ? 'positive' : 'negative'}`;
            }
        }
    }

    initMarketOverview() {
        const marketStats = document.querySelector('.market-stats');
        if (marketStats) {
            Object.entries(this.marketOverview).forEach(([key, data]) => {
                const stat = marketStats.querySelector(`[data-market="${key}"]`);
                if (stat) {
                    stat.querySelector('.value').textContent = data.value.toLocaleString();
                    const changeEl = stat.querySelector('.change');
                    if (changeEl) {
                        changeEl.textContent = `${data.change > 0 ? '+' : ''}${data.change}%`;
                        changeEl.className = `change ${data.change > 0 ? 'positive' : 'negative'}`;
                    }
                }
            });
        }
    }

    initWatchlist() {
        // Watchlist tab switching
        document.querySelectorAll('.watchlist-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.watchlist-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.watchlistTab = e.target.dataset.category;
                this.loadWatchlistData(this.watchlistTab);
            });
        });

        // Watchlist item clicks
        document.querySelectorAll('.watchlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const symbol = e.currentTarget.dataset.symbol;
                if (symbol) {
                    this.switchSymbol(symbol);
                }
            });
        });

        // Add symbol functionality
        const addSymbolBtn = document.querySelector('.add-symbol-btn');
        if (addSymbolBtn) {
            addSymbolBtn.addEventListener('click', () => {
                this.showAddSymbolDialog();
            });
        }
    }

    showAddSymbolDialog() {
        const value = window.prompt('Enter a symbol (e.g. EURUSD, BTCUSDT, AAPL, NASDAQ:AAPL)');
        if (!value) return;
        this.applySymbol(value);
    }

    initOrderForm() {
        const buyBtn = document.getElementById('buy-btn');
        const sellBtn = document.getElementById('sell-btn');
        const placeOrderBtn = document.getElementById('place-order-btn');
        const priceInput = document.getElementById('price-input');
        const volumeInput = document.getElementById('volume-input');
        const slInput = document.getElementById('sl-input');
        const tpInput = document.getElementById('tp-input');
        const symbolSelect = document.getElementById('symbol-select');
        const activeOrderTab = () => document.querySelector('.order-tab.active')?.getAttribute('data-type') || 'market';

        const submitOrder = async (side) => {
            if (!(await this.ensureUserVerifiedForTrading())) return;
            if (!(await this.ensureTradingBalanceInitializedForTrading())) return;
            const symbol = (symbolSelect && symbolSelect.value) || this.currentSymbol || 'EUR/USD';
            const volume = parseFloat((volumeInput && volumeInput.value) || '0.01');
            const orderType = activeOrderTab();
            const price = orderType === 'market'
                ? this.getCurrentPrice(symbol)
                : parseFloat((priceInput && priceInput.value) || '0');
            if (!Number.isFinite(volume) || volume <= 0) {
                this.showNotification('Please enter a valid volume', 'warning');
                return;
            }
            if (orderType !== 'market' && (!Number.isFinite(price) || price <= 0)) {
                this.showNotification('Please enter a valid price for limit/stop orders', 'warning');
                return;
            }
            const order = {
                id: Date.now(),
                symbol,
                type: String(side || 'buy').toLowerCase(),
                orderType,
                volume,
                price,
                stopLoss: slInput && slInput.value ? parseFloat(slInput.value) : null,
                takeProfit: tpInput && tpInput.value ? parseFloat(tpInput.value) : null,
                timestamp: new Date().toISOString()
            };
            if (orderType === 'market') {
                this.executeOrder(order);
            } else {
                this.orders.push(order);
                this.updateOrdersTable();
            }
            this.showNotification(`${order.type.toUpperCase()} ${orderType} order placed for ${volume} ${symbol}`, 'success');
        };

        if (buyBtn) buyBtn.addEventListener('click', (e) => { e.preventDefault(); submitOrder('buy'); });
        if (sellBtn) sellBtn.addEventListener('click', (e) => { e.preventDefault(); submitOrder('sell'); });
        if (placeOrderBtn) placeOrderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const activeSide = document.querySelector('.order-type-btn.active')?.getAttribute('data-type') || 'buy';
            submitOrder(activeSide);
        });

        // Stop loss and take profit toggles
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const targetId = e.target.id.replace('Enable', '') + 'Input';
                const targetInput = document.getElementById(targetId);
                if (targetInput) {
                    targetInput.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        });
    }

    initChart() {
        // Timeframe buttons
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTimeframe = e.target.dataset.timeframe;
                this.updateChart(this.currentTimeframe);
            });
        });

        // Chart tools
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setChartTool(e.target.dataset.tool);
            });
        });

        this.renderChart();
    }

    initTradingPanels() {
        // Panel tab switching
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.panel-content').forEach(content => {
                    content.classList.add('hidden');
                });
                
                const targetPanel = document.getElementById(e.target.dataset.panel);
                if (targetPanel) {
                    targetPanel.classList.remove('hidden');
                }
                
                this.activeTab = e.target.dataset.panel;
                this.loadPanelData(this.activeTab);
            });
        });

        // Initialize with positions tab
        this.loadPanelData('positions');
    }

    initPortfolioSummary() {
        this.updatePortfolioSummary();
    }

    initMarketDepth() {
        this.updateMarketDepth();
    }

    initQuickActions() {
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleQuickAction(action);
            });
        });
    }

    toggleAdvancedOptions() {
        const advancedOptions = document.querySelector('.advanced-options');
        if (advancedOptions) {
            if (this.orderMode === 'advanced') {
                advancedOptions.classList.add('show');
            } else {
                advancedOptions.classList.remove('show');
            }
        }
    }

    loadWatchlistData(category) {
        const watchlistData = {
            forex: [
                { symbol: 'EUR/USD', price: 1.0856, change: 0.12, mini: true },
                { symbol: 'GBP/USD', price: 1.2634, change: -0.08, mini: false },
                { symbol: 'USD/JPY', price: 149.85, change: 0.25, mini: true },
                { symbol: 'AUD/USD', price: 0.6542, change: -0.15, mini: false }
            ],
            indices: [
                { symbol: 'S&P 500', price: 4185.47, change: 0.85, mini: true },
                { symbol: 'NASDAQ', price: 12845.78, change: 1.24, mini: true },
                { symbol: 'DOW', price: 33875.12, change: 0.45, mini: false }
            ],
            commodities: [
                { symbol: 'GOLD', price: 1985.45, change: -0.32, mini: false },
                { symbol: 'SILVER', price: 24.78, change: 0.18, mini: true },
                { symbol: 'OIL', price: 78.92, change: 1.45, mini: true }
            ]
        };

        const watchlistContainer = document.querySelector('.watchlist-items');
        if (watchlistContainer && watchlistData[category]) {
            watchlistContainer.innerHTML = watchlistData[category].map(item => `
                <div class="watchlist-item" data-symbol="${item.symbol}">
                    <div class="symbol">${item.symbol}</div>
                    <div class="price">${item.price}</div>
                    <div class="change ${item.change > 0 ? 'positive' : 'negative'}">
                        ${item.change > 0 ? '+' : ''}${item.change}%
                    </div>
                    ${item.mini ? '<div class="mini-chart"></div>' : ''}
                </div>
            `).join('');

            // Re-attach event listeners
            this.initWatchlist();
        }
    }

    loadPanelData(panel) {
        switch (panel) {
            case 'positions':
                this.updatePositionsTable();
                break;
            case 'orders':
                this.updateOrdersTable();
                break;
            case 'history':
                this.loadTradeHistory();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
        }
    }

    loadTradeHistory() {
        const historyContainer = document.getElementById('history');
        if (historyContainer) {
            const historyData = [
                { symbol: 'EUR/USD', type: 'Buy', volume: 0.1, openPrice: 1.0845, closePrice: 1.0856, pnl: 11.0, time: '2024-01-15 14:30' },
                { symbol: 'GBP/USD', type: 'Sell', volume: 0.05, openPrice: 1.2650, closePrice: 1.2634, pnl: 8.0, time: '2024-01-15 13:15' },
                { symbol: 'USD/JPY', type: 'Buy', volume: 0.2, openPrice: 149.60, closePrice: 149.85, pnl: 50.0, time: '2024-01-15 12:00' }
            ];

            historyContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Type</th>
                            <th>Volume</th>
                            <th>Open Price</th>
                            <th>Close Price</th>
                            <th>P&L</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyData.map(trade => `
                            <tr>
                                <td>${trade.symbol}</td>
                                <td class="${trade.type.toLowerCase()}">${trade.type}</td>
                                <td>${trade.volume}</td>
                                <td>${trade.openPrice}</td>
                                <td>${trade.closePrice}</td>
                                <td class="${trade.pnl > 0 ? 'positive' : 'negative'}">$${trade.pnl.toFixed(2)}</td>
                                <td>${trade.time}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    loadAnalytics() {
        const analyticsContainer = document.getElementById('analytics');
        if (analyticsContainer) {
            analyticsContainer.innerHTML = `
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <div class="title">Total Trades</div>
                        <div class="value">247</div>
                        <div class="change positive">+12 this week</div>
                    </div>
                    <div class="analytics-card">
                        <div class="title">Win Rate</div>
                        <div class="value">68.4%</div>
                        <div class="change positive">+2.1%</div>
                    </div>
                    <div class="analytics-card">
                        <div class="title">Avg. Profit</div>
                        <div class="value">$45.20</div>
                        <div class="change positive">+$3.15</div>
                    </div>
                    <div class="analytics-card">
                        <div class="title">Max Drawdown</div>
                        <div class="value">-$1,250</div>
                        <div class="change negative">-$150</div>
                    </div>
                </div>
                <div class="performance-chart">
                    <p>Performance Chart Placeholder</p>
                    <small>Advanced charting integration would go here</small>
                </div>
            `;
        }
    }

    updatePortfolioSummary() {
        const portfolioItems = {
            balance: this.portfolio.balance,
            equity: this.portfolio.equity,
            margin: this.portfolio.margin,
            freeMargin: this.portfolio.freeMargin,
            marginLevel: this.portfolio.marginLevel
        };

        Object.entries(portfolioItems).forEach(([key, value]) => {
            const element = document.querySelector(`[data-portfolio="${key}"] .value`);
            if (element) {
                if (key === 'marginLevel') {
                    element.textContent = `${value.toFixed(2)}%`;
                } else {
                    element.textContent = `$${value.toLocaleString()}`;
                }
            }
        });

        // Update P&L change
        const pnlChange = document.querySelector('[data-portfolio="totalPnL"] .change');
        if (pnlChange) {
            pnlChange.textContent = `${this.portfolio.totalPnL > 0 ? '+' : ''}$${this.portfolio.totalPnL.toFixed(2)}`;
            pnlChange.className = `change ${this.portfolio.totalPnL > 0 ? 'positive' : 'negative'}`;
        }
    }

    updateMarketDepth() {
        const bidsContainer = document.querySelector('.bids');
        const asksContainer = document.querySelector('.asks');

        const bids = [
            { price: 1.0854, volume: 2.5 },
            { price: 1.0853, volume: 1.8 },
            { price: 1.0852, volume: 3.2 },
            { price: 1.0851, volume: 1.1 },
            { price: 1.0850, volume: 2.7 }
        ];

        const asks = [
            { price: 1.0857, volume: 1.9 },
            { price: 1.0858, volume: 2.3 },
            { price: 1.0859, volume: 1.5 },
            { price: 1.0860, volume: 2.8 },
            { price: 1.0861, volume: 1.7 }
        ];

        if (bidsContainer) {
            bidsContainer.innerHTML = `
                <h5>Bids</h5>
                ${bids.map(bid => `
                    <div class="depth-row">
                        <span class="depth-price">${bid.price}</span>
                        <span class="depth-volume">${bid.volume}M</span>
                    </div>
                `).join('')}
            `;
        }

        if (asksContainer) {
            asksContainer.innerHTML = `
                <h5>Asks</h5>
                ${asks.map(ask => `
                    <div class="depth-row">
                        <span class="depth-price">${ask.price}</span>
                        <span class="depth-volume">${ask.volume}M</span>
                    </div>
                `).join('')}
            `;
        }
    }

    handleQuickAction(action) {
        switch (action) {
            case 'closeAll':
                this.closeAllPositions();
                break;
            case 'cancelAll':
                this.cancelAllOrders();
                break;
            case 'alerts':
                this.showAlertsDialog();
                break;
            case 'news':
                this.showNewsDialog();
                break;
        }
    }

    renderChart() {
        const chartContainer = document.querySelector('.chart-area');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="advanced-chart">
                    <div class="chart-info">
                        <div class="price-display">
                            <span class="current-price">1.0856</span>
                            <span class="price-change positive">+0.0012 (+0.11%)</span>
                        </div>
                        <div class="chart-indicators">
                            <div class="indicator">
                                <span class="label">High:</span>
                                <span class="value">1.0867</span>
                            </div>
                            <div class="indicator">
                                <span class="label">Low:</span>
                                <span class="value">1.0834</span>
                            </div>
                            <div class="indicator">
                                <span class="label">Volume:</span>
                                <span class="value">2.4M</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="priceChart" width="800" height="300"></canvas>
                    <div class="chart-tools">
                        <button class="tool-btn active" data-tool="crosshair"><i class="fas fa-crosshairs"></i></button>
                        <button class="tool-btn" data-tool="trendline"><i class="fas fa-chart-line"></i></button>
                        <button class="tool-btn" data-tool="rectangle"><i class="far fa-square"></i></button>
                        <button class="tool-btn" data-tool="fibonacci"><i class="fas fa-wave-square"></i></button>
                    </div>
                </div>
            `;

            this.drawChart();
        }
    }

    drawChart() {
        const canvas = document.getElementById('priceChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Generate sample candlestick data
        const candleData = this.generateCandleData(50);
        const candleWidth = width / candleData.length;

        // Draw grid
        this.drawGrid(ctx, width, height);

        // Draw candlesticks
        candleData.forEach((candle, index) => {
            const x = index * candleWidth + candleWidth / 2;
            this.drawCandle(ctx, x, candle, height, candleWidth * 0.8);
        });

        // Draw moving averages
        this.drawMovingAverage(ctx, candleData, width, height, 20, '#00d4ff');
        this.drawMovingAverage(ctx, candleData, width, height, 50, '#ff6b35');
    }

    generateCandleData(count) {
        const data = [];
        let price = 1.0856;
        
        for (let i = 0; i < count; i++) {
            const change = (Math.random() - 0.5) * 0.01;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * 0.005;
            const low = Math.min(open, close) - Math.random() * 0.005;
            
            data.push({ open, high, low, close });
            price = close;
        }
        
        return data;
    }

    drawGrid(ctx, width, height) {
        ctx.strokeStyle = '#2d2d44';
        ctx.lineWidth = 1;
        
        // Horizontal lines
        for (let i = 0; i <= 10; i++) {
            const y = (height / 10) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = (width / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    drawCandle(ctx, x, candle, height, width) {
        const { open, high, low, close } = candle;
        const priceRange = 0.02;
        const minPrice = 1.075;
        
        const openY = height - ((open - minPrice) / priceRange) * height;
        const closeY = height - ((close - minPrice) / priceRange) * height;
        const highY = height - ((high - minPrice) / priceRange) * height;
        const lowY = height - ((low - minPrice) / priceRange) * height;
        
        const isGreen = close > open;
        ctx.fillStyle = isGreen ? '#28a745' : '#dc3545';
        ctx.strokeStyle = isGreen ? '#28a745' : '#dc3545';
        
        // Draw wick
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();
        
        // Draw body
        const bodyHeight = Math.abs(closeY - openY);
        const bodyY = Math.min(openY, closeY);
        ctx.fillRect(x - width/2, bodyY, width, bodyHeight || 1);
    }

    drawMovingAverage(ctx, data, width, height, period, color) {
        if (data.length < period) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const candleWidth = width / data.length;
        const priceRange = 0.02;
        const minPrice = 1.075;
        
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
            const avg = sum / period;
            const x = i * candleWidth + candleWidth / 2;
            const y = height - ((avg - minPrice) / priceRange) * height;
            
            if (i === period - 1) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }

    async placeOrder(formData) {
        if (!await this.ensureUserVerifiedForTrading()) return;
        const order = {
            id: Date.now(),
            symbol: this.currentSymbol,
            type: document.querySelector('.tab-btn.active').textContent.toLowerCase(),
            volume: parseFloat(formData.get('volume')),
            orderType: formData.get('orderType'),
            price: formData.get('price') ? parseFloat(formData.get('price')) : this.getCurrentPrice(this.currentSymbol),
            stopLoss: formData.get('stopLoss') ? parseFloat(formData.get('stopLoss')) : null,
            takeProfit: formData.get('takeProfit') ? parseFloat(formData.get('takeProfit')) : null,
            timestamp: new Date().toISOString()
        };

        if (order.orderType === 'market') {
            this.executeOrder(order);
        } else {
            this.orders.push(order);
            this.updateOrdersTable();
        }

        this.showNotification(`${order.type.toUpperCase()} order placed for ${order.volume} ${order.symbol}`, 'success');
    }

    executeOrder(order) {
        const position = {
            id: order.id,
            symbol: order.symbol,
            type: order.type,
            volume: order.volume,
            openPrice: order.price,
            currentPrice: order.price,
            pnl: 0,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
            timestamp: order.timestamp
        };

        this.positions.push(position);
        this.updatePositionsTable();
        this.updateAccountInfo();

        try {
            const authManager = window.authManager;
            const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
            const dbService = window.FirebaseDatabaseService;
            if (user?.uid && dbService?.createTrade) {
                dbService.createTrade(user.uid, {
                    source: 'manual',
                    symbol: order.symbol,
                    type: order.type,
                    amount: order.volume,
                    entryPrice: order.price,
                    status: 'open',
                    timestamp: new Date()
                });
            }
        } catch (e) {}
    }

    getCurrentPrice(symbol) {
        const key = String(symbol || '').trim().toUpperCase();
        if (!key) return 1.0;

        const real = this.realTimeData?.get?.(key) || this.realTimeData?.get?.(symbol);
        if (real && typeof real.price === 'number' && Number.isFinite(real.price)) {
            return real.price;
        }

        if (this.demoPriceCache.has(key)) return this.demoPriceCache.get(key);

        const hash = Array.from(key).reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0);
        const n = Math.abs(hash);

        let base = 100;
        if (key.includes('/') && key.length === 7) base = 1.0 + (n % 10000) / 10000;
        if (key.includes('JPY') && key.includes('/')) base = 100 + (n % 8000) / 100;
        if (key.includes('XAU')) base = 1800 + (n % 8000) / 10;
        if (key.includes('BTC')) base = 20000 + (n % 500000) / 10;
        if (key.includes('ETH')) base = 1000 + (n % 200000) / 100;
        if (key === 'US100' || key === 'NAS100') base = 14000 + (n % 800000) / 100;
        if (key === 'GER40') base = 14000 + (n % 400000) / 100;
        if (key === 'UK100') base = 7000 + (n % 200000) / 100;

        const price = Number(base.toFixed(key.includes('/') && key.length === 7 ? 5 : 2));
        this.demoPriceCache.set(key, price);
        return price;
    }

    updatePositionsTable() {
        const positionsContainer = document.getElementById('positions-list');
        if (positionsContainer) {
            if (this.positions.length === 0) {
                positionsContainer.innerHTML = '<p class="no-data">No open positions</p>';
                return;
            }

            positionsContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Type</th>
                            <th>Volume</th>
                            <th>Open Price</th>
                            <th>Current Price</th>
                            <th>P&L</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.positions.map(position => `
                            <tr>
                                <td>${position.symbol}</td>
                                <td class="${position.type}">${position.type.toUpperCase()}</td>
                                <td>${position.volume}</td>
                                <td>${position.openPrice.toFixed(4)}</td>
                                <td>${position.currentPrice.toFixed(4)}</td>
                                <td class="${position.pnl >= 0 ? 'positive' : 'negative'}">$${position.pnl.toFixed(2)}</td>
                                <td><button class="close-btn" onclick="platform.closePosition(${position.id})">Close</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    updateOrdersTable() {
        const ordersContainer = document.getElementById('history-list');
        if (ordersContainer) {
            if (this.orders.length === 0) {
                ordersContainer.innerHTML = '<p class="no-data">No pending orders</p>';
                return;
            }

            ordersContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Type</th>
                            <th>Volume</th>
                            <th>Order Type</th>
                            <th>Price</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.orders.map(order => `
                            <tr>
                                <td>${order.symbol}</td>
                                <td class="${order.type}">${order.type.toUpperCase()}</td>
                                <td>${order.volume}</td>
                                <td>${order.orderType.toUpperCase()}</td>
                                <td>${order.price.toFixed(4)}</td>
                                <td class="pending">Pending</td>
                                <td><button class="cancel-btn" onclick="platform.cancelOrder(${order.id})">Cancel</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    async closePosition(positionId) {
        const position = this.positions.find((p) => p.id === positionId);
        const pnl = position ? Number(position.pnl || 0) : 0;
        this.positions = this.positions.filter(p => p.id !== positionId);
        this.updatePositionsTable();
        await this.applyTradeResultToBackend(pnl);
        await this.refreshAccountInfo();
        this.showNotification('Position closed successfully', 'success');
    }

    cancelOrder(orderId) {
        this.orders = this.orders.filter(o => o.id !== orderId);
        this.updateOrdersTable();
        this.showNotification('Order cancelled successfully', 'info');
    }

    async closeAllPositions() {
        if (this.positions.length === 0) {
            this.showNotification('No positions to close', 'warning');
            return;
        }

        const pnl = this.positions.reduce((sum, p) => sum + Number(p.pnl || 0), 0);
        this.positions = [];
        this.updatePositionsTable();
        await this.applyTradeResultToBackend(pnl);
        await this.refreshAccountInfo();
        this.showNotification('All positions closed', 'success');
    }

    cancelAllOrders() {
        if (this.orders.length === 0) {
            this.showNotification('No orders to cancel', 'warning');
            return;
        }
        
        this.orders = [];
        this.updateOrdersTable();
        this.showNotification('All orders cancelled', 'info');
    }

    async refreshAccountInfo() {
        try {
            // Get user data from authentication service
            const userData = await this.getUserData();
            const accountData = await this.getAccountData();
            
            // Update user name
            const userNameEl = document.getElementById('current-user-name');
            if (userNameEl && userData) {
                userNameEl.textContent = userData.displayName || userData.firstName + ' ' + userData.lastName;
            }
            
            // Update account balance and portfolio data
            if (accountData) {
                this.portfolio = {
                    balance: accountData.balance || 0,
                    equity: accountData.equity || accountData.balance || 0,
                    margin: accountData.margin || 0,
                    freeMargin: accountData.freeMargin || accountData.balance || 0,
                    marginLevel: accountData.marginLevel || 0,
                    totalPnL: accountData.totalPnL || 0
                };
                
                this.updatePortfolioDisplay();
            }

            this.startBalanceListener();
        } catch (error) {
            console.error('Error updating account info:', error);
            // Fallback to demo data
            this.setDemoAccountData();
        }
    }
    
    // Get user data from authentication service
    async getUserData() {
        const authManager = window.authManager;
        const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
        if (user) {
            const displayName =
                user.displayName ||
                (user.email ? user.email.split('@')[0] : '') ||
                'Trader';

            return {
                displayName,
                firstName: displayName.split(' ')[0] || displayName,
                lastName: displayName.split(' ').slice(1).join(' ') || '',
                email: user.email || '',
                accountType: 'Live'
            };
        }

        const token = localStorage.getItem('authToken');
        if (!token) return this.getDemoUserData();
        
        try {
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
        
        return this.getDemoUserData();
    }
    
    // Get account data from trading service
    async getAccountData() {
        const authManager = window.authManager;
        const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
        const dbService = window.FirebaseDatabaseService;

        if (user && dbService?.getUserTradingBalance) {
            try {
                const balanceResult = await dbService.getUserTradingBalance(user.uid);
                const balance = balanceResult.success ? Number(balanceResult.balance || 0) : 0;
                const equity = balance * 1.025;
                const margin = balance * 0.05;
                const freeMargin = balance - margin;
                return {
                    balance,
                    equity,
                    margin,
                    freeMargin,
                    marginLevel: 0,
                    totalPnL: this.portfolio.totalPnL || 0
                };
            } catch (_) {
                return {
                    balance: 0,
                    equity: 0,
                    margin: 0,
                    freeMargin: 0,
                    marginLevel: 0,
                    totalPnL: this.portfolio.totalPnL || 0
                };
            }
        }
        return {
            balance: 0,
            equity: 0,
            margin: 0,
            freeMargin: 0,
            marginLevel: 0,
            totalPnL: this.portfolio.totalPnL || 0
        };
    }
    
    // Demo user data for development/testing
    getDemoUserData() {
        return {
            displayName: 'Demo Trader',
            firstName: 'Demo',
            lastName: 'Trader',
            email: 'demo@centraltrading.com',
            accountType: 'Demo'
        };
    }
    
    // Set demo account data
    setDemoAccountData() {
        const userNameEl = document.getElementById('current-user-name');
        if (userNameEl) {
            userNameEl.textContent = 'Demo Trader';
        }
        
        this.updatePortfolioDisplay();
    }
    
    // Update portfolio display with current data
    updatePortfolioDisplay() {
        // Update P&L display
        const pnlEl = document.querySelector('.pnl .value');
        if (pnlEl) {
            pnlEl.textContent = `$${this.portfolio.totalPnL.toFixed(2)}`;
            pnlEl.className = `value ${this.portfolio.totalPnL >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Update legacy elements for backward compatibility
        const balanceEl = document.querySelector('.balance .value');
        if (balanceEl) {
            balanceEl.textContent = `$${this.portfolio.balance.toLocaleString()}`;
        }
        
        const equityEl = document.querySelector('.equity .value');
        if (equityEl) {
            equityEl.textContent = `$${this.portfolio.equity.toLocaleString()}`;
        }
    }
    
    // Format currency values
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount || 0);
    }

    switchSymbol(symbol) {
        this.applySymbol(symbol);
    }
    
    // Function to update chart symbol
    updateChartSymbol(tvSymbolOrInternal) {
        const chartContainer = document.getElementById('trading-chart');
        if (!chartContainer) return;

        const tvSymbol = String(tvSymbolOrInternal || '').includes(':')
            ? String(tvSymbolOrInternal)
            : this.getTradingViewSymbol(tvSymbolOrInternal);

        chartContainer.innerHTML = '';

        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container';
        widgetContainer.style.height = '100%';
        widgetContainer.style.width = '100%';

        const widget = document.createElement('div');
        widget.className = 'tradingview-widget-container__widget';
        widget.style.height = 'calc(100% - 32px)';
        widget.style.width = '100%';
        widget.id = 'tradingview_chart';

        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.async = true;

        const config = {
            autosize: true,
            symbol: tvSymbol,
            interval: '15',
            timezone: 'Etc/UTC',
            theme: 'light',
            style: '1',
            locale: 'en',
            enable_publishing: false,
            backgroundColor: 'rgba(255, 255, 255, 1)',
            gridColor: 'rgba(15, 23, 42, 0.12)',
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: false,
            calendar: false,
            hide_volume: false,
            support_host: 'https://www.tradingview.com',
            container_id: 'tradingview_chart'
        };
        script.text = JSON.stringify(config);

        widgetContainer.appendChild(widget);
        widgetContainer.appendChild(script);
        chartContainer.appendChild(widgetContainer);
    }
    
    // Update symbol selector event listener
    setupSymbolSelector() {
        const symbolSelector = document.getElementById('symbol-selector');
        if (symbolSelector) {
            symbolSelector.addEventListener('change', (e) => {
                const selectedSymbol = e.target.value;
                this.applySymbol(selectedSymbol);
            });
        }
    }

    updateOrderButton() {
        const orderBtn = document.querySelector('.order-btn');
        if (orderBtn) {
            orderBtn.textContent = `${this.orderType.toUpperCase()} ${this.currentSymbol}`;
            orderBtn.className = `order-btn ${this.orderType}-btn`;
        }
    }

    updateChart(timeframe) {
        // Simulate chart update for different timeframes
        this.renderChart();
        this.showNotification(`Chart updated to ${timeframe} timeframe`, 'info');
    }

    startRealTimeUpdates() {
        setInterval(() => {
            this.updatePositionsPnL();
            this.updatePriceDisplay();
        }, 2000);
    }

    updatePositionsPnL() {
        this.positions.forEach(position => {
            const currentPrice = this.getCurrentPrice(position.symbol) + (Math.random() - 0.5) * 0.01;
            position.currentPrice = currentPrice;
            
            const priceDiff = position.type === 'buy' 
                ? currentPrice - position.openPrice
                : position.openPrice - currentPrice;
            
            position.pnl = priceDiff * position.volume * 100000; // Assuming standard lot size
        });
        
        this.updatePositionsTable();
        this.updatePortfolioDisplay();
    }

    startBalanceListener() {
        const authManager = window.authManager;
        const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
        const dbService = window.FirebaseDatabaseService;
        if (!user?.uid || !dbService?.subscribeToUserTradingBalance) return;

        if (this._balanceUnsubscribe) return;

        this._balanceUnsubscribe = dbService.subscribeToUserTradingBalance(user.uid, (balance) => {
            const nextBalance = Number(balance || 0);
            const equity = nextBalance * 1.025;
            const margin = nextBalance * 0.05;
            const freeMargin = nextBalance - margin;
            this.portfolio.balance = nextBalance;
            this.portfolio.equity = equity;
            this.portfolio.margin = margin;
            this.portfolio.freeMargin = freeMargin;
            this.updatePortfolioDisplay();
        });
    }

    initSymbolControls() {
        const symbolSelect = document.getElementById('symbol-select');
        if (symbolSelect) {
            symbolSelect.addEventListener('change', (e) => {
                const value = e.target.value;
                this.applySymbol(value);
            });
        }

        const symbolInput = document.getElementById('symbol-input');
        if (symbolInput) {
            symbolInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.applySymbol(symbolInput.value);
                }
            });
        }

        const applyBtn = document.getElementById('symbol-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applySymbol(symbolInput ? symbolInput.value : '');
            });
        }
    }

    applySymbol(rawInput) {
        const normalized = this.normalizeSymbolInput(rawInput);
        if (!normalized) return;

        const { internalSymbol, tvSymbol, displaySymbol } = normalized;
        this.currentSymbol = internalSymbol;

        const symbolInput = document.getElementById('symbol-input');
        if (symbolInput) symbolInput.value = '';

        const symbolSelect = document.getElementById('symbol-select');
        if (symbolSelect) {
            const existing = Array.from(symbolSelect.options).some((o) => o.value === displaySymbol);
            if (!existing) {
                const opt = document.createElement('option');
                opt.value = displaySymbol;
                opt.textContent = displaySymbol;
                symbolSelect.insertBefore(opt, symbolSelect.firstChild);
            }
            symbolSelect.value = displaySymbol;
        }

        this.updateOrderButton();
        this.updateChartSymbol(tvSymbol);
        this.subscribeToSymbol(internalSymbol);
        this.loadSymbolData(internalSymbol);
    }

    normalizeSymbolInput(rawInput) {
        const input = String(rawInput || '').trim();
        if (!input) return null;

        if (input.includes(':')) {
            const parts = input.split(':');
            const symbolPart = (parts[1] || '').trim();
            const internalSymbol = symbolPart ? symbolPart.toUpperCase() : input.toUpperCase();
            return { internalSymbol, tvSymbol: input.toUpperCase(), displaySymbol: input.toUpperCase() };
        }

        const upper = input.toUpperCase();

        if (/^[A-Z]{6}$/.test(upper)) {
            const internalSymbol = `${upper.slice(0, 3)}/${upper.slice(3)}`;
            return { internalSymbol, tvSymbol: this.getTradingViewSymbol(internalSymbol), displaySymbol: internalSymbol };
        }

        if (/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/.test(upper)) {
            return { internalSymbol: upper, tvSymbol: this.getTradingViewSymbol(upper), displaySymbol: upper };
        }

        if (/^[A-Z0-9]{2,12}USDT$/.test(upper)) {
            const base = upper.replace(/USDT$/, '');
            const internalSymbol = `${base}/USD`;
            return { internalSymbol, tvSymbol: `BINANCE:${upper}`, displaySymbol: upper };
        }

        if (upper === 'BTCUSD' || upper === 'BTC/USD') {
            return { internalSymbol: 'BTC/USD', tvSymbol: 'BINANCE:BTCUSDT', displaySymbol: 'BTC/USD' };
        }

        if (upper === 'ETHUSD' || upper === 'ETH/USD') {
            return { internalSymbol: 'ETH/USD', tvSymbol: 'BINANCE:ETHUSDT', displaySymbol: 'ETH/USD' };
        }

        if (upper === 'XAUUSD' || upper === 'XAU/USD') {
            return { internalSymbol: 'XAU/USD', tvSymbol: 'OANDA:XAUUSD', displaySymbol: 'XAU/USD' };
        }

        // If it's a likely stock ticker (1-5 letters), default to NASDAQ
        if (/^[A-Z]{1,5}$/.test(upper)) {
            return { internalSymbol: upper, tvSymbol: `NASDAQ:${upper}`, displaySymbol: upper };
        }

        return { internalSymbol: upper, tvSymbol: this.getTradingViewSymbol(upper), displaySymbol: upper };
    }

    getTradingViewSymbol(internalSymbol) {
        const symbol = String(internalSymbol || '').trim().toUpperCase();
        if (!symbol) return 'FX:EURUSD';

        if (symbol.includes(':')) return symbol;

        if (symbol.includes('/') && symbol.length === 7) {
            const [base, quote] = symbol.split('/');
            const forexCodes = new Set(['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','CNH','NOK','SEK','TRY','ZAR','MXN']);
            const cryptoCodes = new Set(['BTC','ETH','SOL','ADA','XRP','BNB','DOGE','DOT','LINK','LTC','AVAX','MATIC']);
            if (forexCodes.has(base) && forexCodes.has(quote)) {
                return `FX:${symbol.replace('/', '')}`;
            }
            if (cryptoCodes.has(base) && (quote === 'USD' || quote === 'USDT')) {
                return `BINANCE:${base}USDT`;
            }
            return `FX:${symbol.replace('/', '')}`;
        }

        if (symbol === 'BTC/USD') return 'BINANCE:BTCUSDT';
        if (symbol === 'ETH/USD') return 'BINANCE:ETHUSDT';
        if (symbol === 'XAU/USD') return 'OANDA:XAUUSD';

        if (symbol === 'US100') return 'OANDA:NAS100USD';
        if (symbol === 'NAS100') return 'OANDA:NAS100USD';
        if (symbol === 'GER40') return 'OANDA:DE40EUR';
        if (symbol === 'UK100') return 'OANDA:UK100GBP';

        if (/^[A-Z]{1,5}$/.test(symbol)) {
            return `NASDAQ:${symbol}`;
        }

        return symbol;
    }

    // Backwards-compat shim for older calls
    async loadMarketData(symbol) {
        return this.loadSymbolData(symbol);
    }

    updatePriceDisplay() {
        const priceDisplay = document.querySelector('.current-price');
        const changeDisplay = document.querySelector('.price-change');
        
        if (priceDisplay && changeDisplay) {
            const newPrice = this.getCurrentPrice(this.currentSymbol) + (Math.random() - 0.5) * 0.01;
            const change = newPrice - this.getCurrentPrice(this.currentSymbol);
            
            priceDisplay.textContent = newPrice.toFixed(4);
            changeDisplay.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(4)} (${((change / newPrice) * 100).toFixed(2)}%)`;
            changeDisplay.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    // Add method to update form fields based on order type
    updateOrderFormFields(orderType) {
        const priceField = document.getElementById('price');
        const priceContainer = priceField?.parentElement;
        
        if (orderType === 'market') {
            if (priceContainer) priceContainer.style.display = 'none';
        } else {
            if (priceContainer) priceContainer.style.display = 'block';
            if (priceField) priceField.placeholder = orderType === 'limit' ? 'Limit Price' : 'Stop Price';
        }
    }
    
    // New method for user profile integration
    async initializeUserProfile() {
        // Wait for user to be loaded
        const svc = window.userProfileService || this.userProfileService;
        if (svc && typeof svc.isUserLoggedIn === 'function' && svc.isUserLoggedIn()) {
            const profile = typeof svc.getCurrentUserProfile === 'function' ? svc.getCurrentUserProfile() : null;
            if (profile) {
                // Update portfolio with real user data
                this.portfolio = {
                    balance: profile.balance || 0,
                    equity: profile.equity || 0,
                    margin: profile.margin || 0,
                    freeMargin: profile.freeMargin || 0,
                    marginLevel: profile.marginLevel || 0,
                    totalPnL: profile.totalPnL || 0
                };
                
                this.updatePortfolioDisplay();
            }
        }
    }

    // Enhanced order form handling
    initOrderForm() {
        const buyBtn = document.getElementById('buy-btn');
        const sellBtn = document.getElementById('sell-btn');
        const placeOrderBtn = document.getElementById('place-order-btn');

        const volumeInput = document.getElementById('volume-input') || document.getElementById('volume');
        const priceInput = document.getElementById('price-input') || document.getElementById('price');
        const slInput = document.getElementById('sl-input');
        const tpInput = document.getElementById('tp-input');
        const symbolInput = document.getElementById('symbol-select') || document.getElementById('symbol');
        const priceGroup = document.getElementById('price-group') || (priceInput ? priceInput.closest('.form-group') : null);

        const getOrderType = () => {
            const tab = document.querySelector('.order-tab.active');
            if (tab) return tab.getAttribute('data-type') || 'market';
            const select = document.getElementById('orderType');
            if (select && select.value) return String(select.value).toLowerCase();
            const activeTabBtn = document.querySelector('.tab-btn.active');
            if (activeTabBtn) return (activeTabBtn.textContent || '').trim().toLowerCase() || 'market';
            return 'market';
        };

        const getSymbol = () => {
            if (symbolInput) {
                const v = (symbolInput.value || '').trim();
                if (v) return v;
            }
            return this.currentSymbol || 'EUR/USD';
        };

        const getVolume = () => {
            const raw = (volumeInput && volumeInput.value) ? String(volumeInput.value).trim() : '0.01';
            const v = Number(raw || '0.01');
            return Number.isFinite(v) ? v : 0.01;
        };

        const submitOrder = async (side) => {
            if (!(await this.ensureUserVerifiedForTrading())) return;
            if (!(await this.ensureTradingBalanceInitializedForTrading())) return;

            const symbol = getSymbol();
            const volume = getVolume();
            const orderType = getOrderType();
            const isMarket = orderType === 'market';
            const price = isMarket ? this.getCurrentPrice(symbol) : Number((priceInput && priceInput.value) || 0);

            if (!Number.isFinite(volume) || volume <= 0) {
                this.showNotification('Please enter a valid volume', 'warning');
                return;
            }
            if (!isMarket && (!Number.isFinite(price) || price <= 0)) {
                this.showNotification('Please enter a valid price for limit/stop orders', 'warning');
                return;
            }

            const order = {
                id: Date.now(),
                symbol,
                type: String(side || 'buy').toLowerCase(),
                orderType,
                volume,
                price,
                stopLoss: slInput && slInput.value ? Number(slInput.value) : null,
                takeProfit: tpInput && tpInput.value ? Number(tpInput.value) : null,
                timestamp: new Date().toISOString()
            };

            if (isMarket) {
                this.executeOrder(order);
            } else {
                this.orders.push(order);
                this.updateOrdersTable();
            }

            this.showNotification(`${order.type.toUpperCase()} ${orderType} order placed for ${volume} ${symbol}`, 'success');
        };

        const bindClick = (el, handler) => {
            if (!el) return;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                handler(e);
            });
        };

        bindClick(buyBtn, () => submitOrder('buy'));
        bindClick(sellBtn, () => submitOrder('sell'));
        bindClick(placeOrderBtn, () => {
            const activeSide = document.querySelector('.order-type-btn.active')?.getAttribute('data-type') || 'buy';
            submitOrder(activeSide);
        });

        document.querySelectorAll('.order-type-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.order-type-btn').forEach((b) => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        document.querySelectorAll('.order-tab').forEach((tab) => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.order-tab').forEach((t) => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const type = e.currentTarget.getAttribute('data-type') || 'market';
                if (priceGroup) priceGroup.style.display = type === 'market' ? 'none' : 'block';
            });
        });

        document.querySelectorAll('.order-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const text = (e.currentTarget.textContent || '').trim().toLowerCase();
                const side = text.includes('sell') ? 'sell' : 'buy';
                submitOrder(side);
            });
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const orderType = (e.target.textContent || '').toLowerCase();
                this.updateOrderFormFields(orderType);
                this.updateOrderButton();
            });
        });

        const orderTypeSelect = document.getElementById('orderType');
        if (orderTypeSelect) {
            orderTypeSelect.addEventListener('change', (e) => {
                if (priceInput) {
                    priceInput.style.display = e.target.value === 'market' ? 'none' : 'block';
                }
            });
        }

        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.placeOrder(new FormData(orderForm));
            });
        }

        this.setupResponsiveHandlers();

        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const targetId = e.target.id.replace('Enable', '') + 'Input';
                const targetInput = document.getElementById(targetId);
                if (targetInput) {
                    targetInput.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        });
    }

    setupResponsiveHandlers() {
        const orderForm = document.getElementById('orderForm');
        if (!orderForm) return;

        const volumeInput = document.getElementById('volume');
        const symbolInput = document.getElementById('symbol');
        const priceInput = document.getElementById('price');

        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

        if (volumeInput) {
            volumeInput.addEventListener('blur', () => {
                const next = clamp(parseFloat(volumeInput.value || '0.01'), 0.01, 100);
                volumeInput.value = String(Number.isFinite(next) ? next : 0.01);
            });
        }

        if (symbolInput) {
            symbolInput.addEventListener('change', () => {
                const next = (symbolInput.value || '').trim().toUpperCase();
                if (next) {
                    this.currentSymbol = next.includes('/') ? next : next;
                    this.subscribeToSymbol(this.currentSymbol);
                }
            });
        }

        if (priceInput) {
            priceInput.addEventListener('focus', () => {
                if (!priceInput.value) {
                    const price = this.getCurrentPrice(this.currentSymbol);
                    if (price) priceInput.value = String(price);
                }
            });
        }

        const onResize = () => {
            const isMobile = window.innerWidth <= 768;
            document.body.classList.toggle('tt-mobile', isMobile);
        };

        window.addEventListener('resize', onResize);
        onResize();
    }

    initChart() {
        // Timeframe buttons
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentTimeframe = e.target.dataset.timeframe;
                this.updateChart(this.currentTimeframe);
            });
        });

        // Chart tools
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setChartTool(e.target.dataset.tool);
            });
        });

        this.renderChart();
    }

    initTradingPanels() {
        // Panel tab switching
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.panel-content').forEach(content => {
                    content.classList.add('hidden');
                });
                
                const targetPanel = document.getElementById(e.target.dataset.panel);
                if (targetPanel) {
                    targetPanel.classList.remove('hidden');
                }
                
                this.activeTab = e.target.dataset.panel;
                this.loadPanelData(this.activeTab);
            });
        });

        // Initialize with positions tab
        this.loadPanelData('positions');
    }

    initPortfolioSummary() {
        this.updatePortfolioSummary();
    }

    initMarketDepth() {
        this.updateMarketDepth();
    }

    initQuickActions() {
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleQuickAction(action);
            });
        });
    }

    toggleAdvancedOptions() {
        const advancedOptions = document.querySelector('.advanced-options');
        if (advancedOptions) {
            if (this.orderMode === 'advanced') {
                advancedOptions.classList.add('show');
            } else {
                advancedOptions.classList.remove('show');
            }
        }
    }

    loadWatchlistData(category) {
        const watchlistData = {
            forex: [
                { symbol: 'EUR/USD', price: 1.0856, change: 0.12, mini: true },
                { symbol: 'GBP/USD', price: 1.2634, change: -0.08, mini: false },
                { symbol: 'USD/JPY', price: 149.85, change: 0.25, mini: true },
                { symbol: 'AUD/USD', price: 0.6542, change: -0.15, mini: false }
            ],
            indices: [
                { symbol: 'S&P 500', price: 4185.47, change: 0.85, mini: true },
                { symbol: 'NASDAQ', price: 12845.78, change: 1.24, mini: true },
                { symbol: 'DOW', price: 33875.12, change: 0.45, mini: false }
            ],
            commodities: [
                { symbol: 'GOLD', price: 1985.45, change: -0.32, mini: false },
                { symbol: 'SILVER', price: 24.78, change: 0.18, mini: true },
                { symbol: 'OIL', price: 78.92, change: 1.45, mini: true }
            ]
        };

        const watchlistContainer = document.querySelector('.watchlist-items');
        if (watchlistContainer && watchlistData[category]) {
            watchlistContainer.innerHTML = watchlistData[category].map(item => `
                <div class="watchlist-item" data-symbol="${item.symbol}">
                    <div class="symbol">${item.symbol}</div>
                    <div class="price">${item.price}</div>
                    <div class="change ${item.change > 0 ? 'positive' : 'negative'}">
                        ${item.change > 0 ? '+' : ''}${item.change}%
                    </div>
                    ${item.mini ? '<div class="mini-chart"></div>' : ''}
                </div>
            `).join('');

            // Re-attach event listeners
            this.initWatchlist();
        }
    }

    loadPanelData(panel) {
        switch (panel) {
            case 'positions':
                this.updatePositionsTable();
                break;
            case 'orders':
                this.updateOrdersTable();
                break;
            case 'history':
                this.loadTradeHistory();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
        }
    }

    loadTradeHistory() {
        const historyContainer = document.getElementById('history');
        if (historyContainer) {
            const historyData = [
                { symbol: 'EUR/USD', type: 'Buy', volume: 0.1, openPrice: 1.0845, closePrice: 1.0856, pnl: 11.0, time: '2024-01-15 14:30' },
                { symbol: 'GBP/USD', type: 'Sell', volume: 0.05, openPrice: 1.2650, closePrice: 1.2634, pnl: 8.0, time: '2024-01-15 13:15' },
                { symbol: 'USD/JPY', type: 'Buy', volume: 0.2, openPrice: 149.60, closePrice: 149.85, pnl: 50.0, time: '2024-01-15 12:00' }
            ];

            historyContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Type</th>
                            <th>Volume</th>
                            <th>Open Price</th>
                            <th>Close Price</th>
                            <th>P&L</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyData.map(trade => `
                            <tr>
                                <td>${trade.symbol}</td>
                                <td class="${trade.type.toLowerCase()}">${trade.type}</td>
                                <td>${trade.volume}</td>
                                <td>${trade.openPrice}</td>
                                <td>${trade.closePrice}</td>
                                <td class="${trade.pnl > 0 ? 'positive' : 'negative'}">$${trade.pnl.toFixed(2)}</td>
                                <td>${trade.time}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    loadAnalytics() {
        const analyticsContainer = document.getElementById('analytics');
        if (analyticsContainer) {
            analyticsContainer.innerHTML = `
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <div class="title">Total Trades</div>
                        <div class="value">247</div>
                        <div class="change positive">+12 this week</div>
                    </div>
                    <div class="analytics-card">
                        <div class="title">Win Rate</div>
                        <div class="value">68.4%</div>
                        <div class="change positive">+2.1%</div>
                    </div>
                    <div class="analytics-card">
                        <div class="title">Avg. Profit</div>
                        <div class="value">$45.20</div>
                        <div class="change positive">+$3.15</div>
                    </div>
                    <div class="analytics-card">
                        <div class="title">Max Drawdown</div>
                        <div class="value">-$1,250</div>
                        <div class="change negative">-$150</div>
                    </div>
                </div>
                <div class="performance-chart">
                    <p>Performance Chart Placeholder</p>
                    <small>Advanced charting integration would go here</small>
                </div>
            `;
        }
    }

    updatePortfolioSummary() {
        const portfolioItems = {
            balance: this.portfolio.balance,
            equity: this.portfolio.equity,
            margin: this.portfolio.margin,
            freeMargin: this.portfolio.freeMargin,
            marginLevel: this.portfolio.marginLevel
        };

        Object.entries(portfolioItems).forEach(([key, value]) => {
            const element = document.querySelector(`[data-portfolio="${key}"] .value`);
            if (element) {
                if (key === 'marginLevel') {
                    element.textContent = `${value.toFixed(2)}%`;
                } else {
                    element.textContent = `$${value.toLocaleString()}`;
                }
            }
        });

        // Update P&L change
        const pnlChange = document.querySelector('[data-portfolio="totalPnL"] .change');
        if (pnlChange) {
            pnlChange.textContent = `${this.portfolio.totalPnL > 0 ? '+' : ''}$${this.portfolio.totalPnL.toFixed(2)}`;
            pnlChange.className = `change ${this.portfolio.totalPnL > 0 ? 'positive' : 'negative'}`;
        }
    }

    updateMarketDepth() {
        const bidsContainer = document.querySelector('.bids');
        const asksContainer = document.querySelector('.asks');

        const bids = [
            { price: 1.0854, volume: 2.5 },
            { price: 1.0853, volume: 1.8 },
            { price: 1.0852, volume: 3.2 },
            { price: 1.0851, volume: 1.1 },
            { price: 1.0850, volume: 2.7 }
        ];

        const asks = [
            { price: 1.0857, volume: 1.9 },
            { price: 1.0858, volume: 2.3 },
            { price: 1.0859, volume: 1.5 },
            { price: 1.0860, volume: 2.8 },
            { price: 1.0861, volume: 1.7 }
        ];

        if (bidsContainer) {
            bidsContainer.innerHTML = `
                <h5>Bids</h5>
                ${bids.map(bid => `
                    <div class="depth-row">
                        <span class="depth-price">${bid.price}</span>
                        <span class="depth-volume">${bid.volume}M</span>
                    </div>
                `).join('')}
            `;
        }

        if (asksContainer) {
            asksContainer.innerHTML = `
                <h5>Asks</h5>
                ${asks.map(ask => `
                    <div class="depth-row">
                        <span class="depth-price">${ask.price}</span>
                        <span class="depth-volume">${ask.volume}M</span>
                    </div>
                `).join('')}
            `;
        }
    }

    handleQuickAction(action) {
        switch (action) {
            case 'closeAll':
                this.closeAllPositions();
                break;
            case 'cancelAll':
                this.cancelAllOrders();
                break;
            case 'alerts':
                this.showAlertsDialog();
                break;
            case 'news':
                this.showNewsDialog();
                break;
        }
    }

    renderChart() {
        const chartContainer = document.querySelector('.chart-area');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="advanced-chart">
                    <div class="chart-info">
                        <div class="price-display">
                            <span class="current-price">1.0856</span>
                            <span class="price-change positive">+0.0012 (+0.11%)</span>
                        </div>
                        <div class="chart-indicators">
                            <div class="indicator">
                                <span class="label">High:</span>
                                <span class="value">1.0867</span>
                            </div>
                            <div class="indicator">
                                <span class="label">Low:</span>
                                <span class="value">1.0834</span>
                            </div>
                            <div class="indicator">
                                <span class="label">Volume:</span>
                                <span class="value">2.4M</span>
                            </div>
                        </div>
                    </div>
                    <canvas id="priceChart" width="800" height="300"></canvas>
                    <div class="chart-tools">
                        <button class="tool-btn active" data-tool="crosshair"><i class="fas fa-crosshairs"></i></button>
                        <button class="tool-btn" data-tool="trendline"><i class="fas fa-chart-line"></i></button>
                        <button class="tool-btn" data-tool="rectangle"><i class="far fa-square"></i></button>
                        <button class="tool-btn" data-tool="fibonacci"><i class="fas fa-wave-square"></i></button>
                    </div>
                </div>
            `;

            this.drawChart();
        }
    }

    drawChart() {
        const canvas = document.getElementById('priceChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Generate sample candlestick data
        const candleData = this.generateCandleData(50);
        const candleWidth = width / candleData.length;

        // Draw grid
        this.drawGrid(ctx, width, height);

        // Draw candlesticks
        candleData.forEach((candle, index) => {
            const x = index * candleWidth + candleWidth / 2;
            this.drawCandle(ctx, x, candle, height, candleWidth * 0.8);
        });

        // Draw moving averages
        this.drawMovingAverage(ctx, candleData, width, height, 20, '#00d4ff');
        this.drawMovingAverage(ctx, candleData, width, height, 50, '#ff6b35');
    }

    generateCandleData(count) {
        const data = [];
        let price = 1.0856;
        
        for (let i = 0; i < count; i++) {
            const change = (Math.random() - 0.5) * 0.01;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random() * 0.005;
            const low = Math.min(open, close) - Math.random() * 0.005;
            
            data.push({ open, high, low, close });
            price = close;
        }
        
        return data;
    }

    drawGrid(ctx, width, height) {
        ctx.strokeStyle = '#2d2d44';
        ctx.lineWidth = 1;
        
        // Horizontal lines
        for (let i = 0; i <= 10; i++) {
            const y = (height / 10) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = (width / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    drawCandle(ctx, x, candle, height, width) {
        const { open, high, low, close } = candle;
        const priceRange = 0.02;
        const minPrice = 1.075;
        
        const openY = height - ((open - minPrice) / priceRange) * height;
        const closeY = height - ((close - minPrice) / priceRange) * height;
        const highY = height - ((high - minPrice) / priceRange) * height;
        const lowY = height - ((low - minPrice) / priceRange) * height;
        
        const isGreen = close > open;
        ctx.fillStyle = isGreen ? '#28a745' : '#dc3545';
        ctx.strokeStyle = isGreen ? '#28a745' : '#dc3545';
        
        // Draw wick
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();
        
        // Draw body
        const bodyHeight = Math.abs(closeY - openY);
        const bodyY = Math.min(openY, closeY);
        ctx.fillRect(x - width/2, bodyY, width, bodyHeight || 1);
    }

    drawMovingAverage(ctx, data, width, height, period, color) {
        if (data.length < period) return;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const candleWidth = width / data.length;
        const priceRange = 0.02;
        const minPrice = 1.075;
        
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
            const avg = sum / period;
            const x = i * candleWidth + candleWidth / 2;
            const y = height - ((avg - minPrice) / priceRange) * height;
            
            if (i === period - 1) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }

    async placeOrder(formData) {
        if (!await this.ensureUserVerifiedForTrading()) return;
        const order = {
            id: Date.now(),
            symbol: this.currentSymbol,
            type: document.querySelector('.tab-btn.active').textContent.toLowerCase(),
            volume: parseFloat(formData.get('volume')),
            orderType: formData.get('orderType'),
            price: formData.get('price') ? parseFloat(formData.get('price')) : this.getCurrentPrice(this.currentSymbol),
            stopLoss: formData.get('stopLoss') ? parseFloat(formData.get('stopLoss')) : null,
            takeProfit: formData.get('takeProfit') ? parseFloat(formData.get('takeProfit')) : null,
            timestamp: new Date().toISOString()
        };

        if (order.orderType === 'market') {
            this.executeOrder(order);
        } else {
            this.orders.push(order);
            this.updateOrdersTable();
        }

        this.showNotification(`${order.type.toUpperCase()} order placed for ${order.volume} ${order.symbol}`, 'success');
    }

    executeOrder(order) {
        const position = {
            id: order.id,
            symbol: order.symbol,
            type: order.type,
            volume: order.volume,
            openPrice: order.price,
            currentPrice: order.price,
            pnl: 0,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
            timestamp: order.timestamp
        };

        this.positions.push(position);
        this.updatePositionsTable();
        this.updateAccountInfo();

        try {
            const authManager = window.authManager;
            const user = authManager?.getCurrentUser?.() || authManager?.currentUser || null;
            const dbService = window.FirebaseDatabaseService;
            if (user?.uid && dbService?.createTrade) {
                dbService.createTrade(user.uid, {
                    source: 'manual',
                    symbol: order.symbol,
                    type: order.type,
                    amount: order.volume,
                    entryPrice: order.price,
                    status: 'open',
                    timestamp: new Date()
                });
            }
        } catch (e) {}
    }

    getCurrentPrice(symbol) {
        const key = String(symbol || '').trim().toUpperCase();
        if (!key) return 1.0;

        const real = this.realTimeData?.get?.(key) || this.realTimeData?.get?.(symbol);
        if (real && typeof real.price === 'number' && Number.isFinite(real.price)) {
            return real.price;
        }

        if (this.demoPriceCache.has(key)) return this.demoPriceCache.get(key);

        const hash = Array.from(key).reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0);
        const n = Math.abs(hash);

        let base = 100;
        if (key.includes('/') && key.length === 7) base = 1.0 + (n % 10000) / 10000;
        if (key.includes('JPY') && key.includes('/')) base = 100 + (n % 8000) / 100;
        if (key.includes('XAU')) base = 1800 + (n % 8000) / 10;
        if (key.includes('BTC')) base = 20000 + (n % 500000) / 10;
        if (key.includes('ETH')) base = 1000 + (n % 200000) / 100;
        if (key === 'US100' || key === 'NAS100') base = 14000 + (n % 800000) / 100;
        if (key === 'GER40') base = 14000 + (n % 400000) / 100;
        if (key === 'UK100') base = 7000 + (n % 200000) / 100;

        const price = Number(base.toFixed(key.includes('/') && key.length === 7 ? 5 : 2));
        this.demoPriceCache.set(key, price);
        return price;
    }

    updatePositionsTable() {
        const positionsContainer = document.getElementById('positions-list') || document.getElementById('positions');
        if (positionsContainer) {
            if (this.positions.length === 0) {
                positionsContainer.innerHTML = '<p class="no-data">No open positions</p>';
                return;
            }

            positionsContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Type</th>
                            <th>Volume</th>
                            <th>Open Price</th>
                            <th>Current Price</th>
                            <th>P&L</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.positions.map(position => `
                            <tr>
                                <td>${position.symbol}</td>
                                <td class="${position.type}">${position.type.toUpperCase()}</td>
                                <td>${position.volume}</td>
                                <td>${position.openPrice.toFixed(4)}</td>
                                <td>${position.currentPrice.toFixed(4)}</td>
                                <td class="${position.pnl >= 0 ? 'positive' : 'negative'}">$${position.pnl.toFixed(2)}</td>
                                <td><button class="close-btn" onclick="platform.closePosition(${position.id})">Close</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    updateOrdersTable() {
        const ordersContainer = document.getElementById('history-list') || document.getElementById('orders');
        if (ordersContainer) {
            if (this.orders.length === 0) {
                ordersContainer.innerHTML = '<p class="no-data">No pending orders</p>';
                return;
            }

            ordersContainer.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Type</th>
                            <th>Volume</th>
                            <th>Order Type</th>
                            <th>Price</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.orders.map(order => `
                            <tr>
                                <td>${order.symbol}</td>
                                <td class="${order.type}">${order.type.toUpperCase()}</td>
                                <td>${order.volume}</td>
                                <td>${order.orderType.toUpperCase()}</td>
                                <td>${order.price.toFixed(4)}</td>
                                <td class="pending">Pending</td>
                                <td><button class="cancel-btn" onclick="platform.cancelOrder(${order.id})">Cancel</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    async closePosition(positionId) {
        const position = this.positions.find((p) => p.id === positionId);
        const pnl = position ? Number(position.pnl || 0) : 0;
        this.positions = this.positions.filter(p => p.id !== positionId);
        this.updatePositionsTable();
        await this.applyTradeResultToBackend(pnl);
        await this.refreshAccountInfo();
        this.showNotification('Position closed successfully', 'success');
    }

    cancelOrder(orderId) {
        this.orders = this.orders.filter(o => o.id !== orderId);
        this.updateOrdersTable();
        this.showNotification('Order cancelled successfully', 'info');
    }

    async closeAllPositions() {
        if (this.positions.length === 0) {
            this.showNotification('No positions to close', 'warning');
            return;
        }

        const pnl = this.positions.reduce((sum, p) => sum + Number(p.pnl || 0), 0);
        this.positions = [];
        this.updatePositionsTable();
        await this.applyTradeResultToBackend(pnl);
        await this.refreshAccountInfo();
        this.showNotification('All positions closed', 'success');
    }

    cancelAllOrders() {
        if (this.orders.length === 0) {
            this.showNotification('No orders to cancel', 'warning');
            return;
        }
        
        this.orders = [];
        this.updateOrdersTable();
        this.showNotification('All orders cancelled', 'info');
    }

    updateAccountInfo() {
        this.updatePortfolioDisplay();
        this.updatePortfolioSummary();
    }

    switchSymbol(symbol) {
        this.applySymbol(symbol);
    }

    updateOrderButton() {
        const orderBtn = document.querySelector('.order-btn');
        if (orderBtn) {
            orderBtn.textContent = `${this.orderType.toUpperCase()} ${this.currentSymbol}`;
            orderBtn.className = `order-btn ${this.orderType}-btn`;
        }
    }

    updateChart(timeframe) {
        // Simulate chart update for different timeframes
        this.renderChart();
        this.showNotification(`Chart updated to ${timeframe} timeframe`, 'info');
    }

    startRealTimeUpdates() {
        setInterval(() => {
            this.updatePositionsPnL();
            this.updatePriceDisplay();
        }, 2000);
    }

    updatePositionsPnL() {
        this.positions.forEach(position => {
            const currentPrice = this.getCurrentPrice(position.symbol) + (Math.random() - 0.5) * 0.01;
            position.currentPrice = currentPrice;
            
            const priceDiff = position.type === 'buy' 
                ? currentPrice - position.openPrice
                : position.openPrice - currentPrice;
            
            position.pnl = priceDiff * position.volume * 100000; // Assuming standard lot size
        });
        
        this.updatePositionsTable();
        this.updateAccountInfo();
    }

    updatePriceDisplay(data) {
        const priceDisplay = document.querySelector('.current-price');
        const changeDisplay = document.querySelector('.price-change');
        
        if (priceDisplay && changeDisplay) {
            const base = (data && data.symbol === this.currentSymbol && typeof data.price === 'number')
                ? data.price
                : this.getCurrentPrice(this.currentSymbol);

            const newPrice = base + (Math.random() - 0.5) * (String(this.currentSymbol).includes('/') ? 0.002 : Math.max(0.5, base * 0.001));
            const change = newPrice - base;

            const decimals = String(this.currentSymbol).includes('/') ? 4 : 2;
            priceDisplay.textContent = newPrice.toFixed(decimals);
            changeDisplay.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(decimals)} (${((change / newPrice) * 100).toFixed(2)}%)`;
            changeDisplay.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.platform = new TradingPlatform();
        window.platform.init();
    } catch (error) {
        console.error('Failed to initialize trading platform:', error);
    }
});
