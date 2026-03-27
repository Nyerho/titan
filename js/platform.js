// Advanced Trading Platform JavaScript

class TradingPlatform {
    constructor() {
        this.currentSymbol = 'EUR/USD';
        this.currentTimeframe = '1H';
        this.positions = [];
        this.orders = [];
        this.marketData = new Map();
        this.portfolio = {
            balance: 50000,
            equity: 52350,
            margin: 1250,
            freeMargin: 51100,
            marginLevel: 4188,
            totalPnL: 2350
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
        // Initialize market data service first
        await this.marketDataService.init();
        
        this.initMarketOverview();
        this.initWatchlist();
        this.initOrderForm();
        this.initChart();
        this.initTradingPanels();
        this.initPortfolioSummary();
        this.initMarketDepth();
        this.initQuickActions();
        this.startRealTimeUpdates();
        this.updateAccountInfo();
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

        if (verified) return true;

        this.showNotification('Verify your email or phone number to trade', 'warning');
        try { authManager?.ensureVerificationBanner?.(); } catch (e) {}
        return false;
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
        this.marketDataService.subscribeToSymbol(symbol, (data) => {
            this.handleRealTimeUpdate(data);
        });
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
        const addSymbolBtn = document.querySelector('.add-symbol');
        if (addSymbolBtn) {
            addSymbolBtn.addEventListener('click', () => {
                this.showAddSymbolDialog();
            });
        }
    }

    initOrderForm() {
        // Order mode toggle
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.orderMode = e.target.dataset.mode;
                this.toggleAdvancedOptions();
            });
        });

        // Enhanced BUY/SELL button handling
        document.querySelectorAll('.order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const orderType = e.target.textContent.trim();
                const activeTab = document.querySelector('.tab-btn.active')?.textContent || 'market';
                
                // Get form data
                const volume = document.getElementById('volume')?.value || '0.01';
                const symbol = this.currentSymbol || 'EUR/USD';
                
                // Create order object
                const order = {
                    id: Date.now(),
                    symbol: symbol,
                    type: orderType.toLowerCase(),
                    orderMode: activeTab.toLowerCase(),
                    volume: parseFloat(volume),
                    price: this.getCurrentPrice(symbol),
                    timestamp: new Date().toISOString()
                };
                
                this.ensureUserVerifiedForTrading().then((ok) => {
                    if (!ok) return;
                    this.executeOrder(order);
                    this.showNotification(`${orderType} order executed for ${volume} ${symbol}`, 'success');
                });
            });
        });

        // Order tabs (Buy/Sell)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const orderType = e.target.textContent.toLowerCase();
                this.updateOrderFormFields(orderType);
                this.updateOrderButton();
            });
        });

        // Order type change
        const orderTypeSelect = document.getElementById('orderType');
        if (orderTypeSelect) {
            orderTypeSelect.addEventListener('change', (e) => {
                const priceInput = document.getElementById('price');
                if (priceInput) {
                    priceInput.style.display = e.target.value === 'market' ? 'none' : 'block';
                }
            });
        }

        // Form submission
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.placeOrder(new FormData(orderForm));
            });
        }

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
    }

    getCurrentPrice(symbol) {
        const prices = {
            'EUR/USD': 1.0856,
            'GBP/USD': 1.2634,
            'USD/JPY': 149.85,
            'AUD/USD': 0.6542
        };
        return prices[symbol] || 1.0000;
    }

    updatePositionsTable() {
        const positionsContainer = document.getElementById('positions');
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
        const ordersContainer = document.getElementById('orders');
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

    closePosition(positionId) {
        this.positions = this.positions.filter(p => p.id !== positionId);
        this.updatePositionsTable();
        this.updateAccountInfo();
        this.showNotification('Position closed successfully', 'success');
    }

    cancelOrder(orderId) {
        this.orders = this.orders.filter(o => o.id !== orderId);
        this.updateOrdersTable();
        this.showNotification('Order cancelled successfully', 'info');
    }

    closeAllPositions() {
        if (this.positions.length === 0) {
            this.showNotification('No positions to close', 'warning');
            return;
        }
        
        this.positions = [];
        this.updatePositionsTable();
        this.updateAccountInfo();
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

    async updateAccountInfo() {
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
        } catch (error) {
            console.error('Error updating account info:', error);
            // Fallback to demo data
            this.setDemoAccountData();
        }
    }
    
    // Get user data from authentication service
    async getUserData() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            return this.getDemoUserData();
        }
        
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
        const token = localStorage.getItem('authToken');
        if (!token) {
            return this.portfolio; // Use demo data
        }
        
        try {
            const response = await fetch('/api/account/summary', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error fetching account data:', error);
        }
        
        return this.portfolio; // Fallback to demo data
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
        const elements = {
            'account-balance': this.formatCurrency(this.portfolio.balance),
            'account-equity': this.formatCurrency(this.portfolio.equity),
            'account-margin': this.formatCurrency(this.portfolio.margin),
            'account-free-margin': this.formatCurrency(this.portfolio.freeMargin)
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                element.classList.remove('loading');
            }
        });
        
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
        this.currentSymbol = symbol;
        document.querySelector('.chart-header h2').textContent = symbol;
        this.updateOrderButton();
        this.updateChartSymbol(symbol);
    }
    
    // Function to update chart symbol
    updateChartSymbol(symbol) {
        // For TradingView widget, we need to reload with new symbol
        const chartContainer = document.getElementById('trading-chart');
        const symbolMap = {
            'EURUSD': 'FX:EURUSD',
            'GBPUSD': 'FX:GBPUSD',
            'USDJPY': 'FX:USDJPY',
            'USDCHF': 'FX:USDCHF',
            'AUDUSD': 'FX:AUDUSD',
            'USDCAD': 'FX:USDCAD',
            'NZDUSD': 'FX:NZDUSD'
        };
        
        const tvSymbol = symbolMap[symbol] || 'FX:EURUSD';
        
        // Recreate TradingView widget with new symbol
        chartContainer.innerHTML = `
            <div class="tradingview-widget-container" style="height:100%;width:100%">
              <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
              <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
              {
              "autosize": true,
              "symbol": "${tvSymbol}",
              "interval": "15",
              "timezone": "Etc/UTC",
              "theme": "light",
              "style": "1",
              "locale": "en",
              "enable_publishing": false,
              "backgroundColor": "rgba(255, 255, 255, 1)",
              "gridColor": "rgba(15, 23, 42, 0.12)",
              "hide_top_toolbar": false,
              "hide_legend": false,
              "save_image": false,
              "calendar": false,
              "hide_volume": false,
              "support_host": "https://www.tradingview.com"
              }
              </script>
            </div>
        `;
    }
    
    // Update symbol selector event listener
    setupSymbolSelector() {
        const symbolSelector = document.getElementById('symbol-selector');
        if (symbolSelector) {
            symbolSelector.addEventListener('change', (e) => {
                const selectedSymbol = e.target.value;
                this.currentSymbol = selectedSymbol;
                this.updateChartSymbol(selectedSymbol);
                this.loadMarketData(selectedSymbol);
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
        this.updateAccountInfo();
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
        // Order mode toggle
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.orderMode = e.target.dataset.mode;
                this.toggleAdvancedOptions();
            });
        });

        // Enhanced BUY/SELL button handling
        document.querySelectorAll('.order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const orderType = e.target.textContent.trim();
                const activeTab = document.querySelector('.tab-btn.active')?.textContent || 'market';
                
                // Get form data
                const volume = document.getElementById('volume')?.value || '0.01';
                const symbol = this.currentSymbol || 'EUR/USD';
                
                // Create order object
                const order = {
                    id: Date.now(),
                    symbol: symbol,
                    type: orderType.toLowerCase(),
                    orderMode: activeTab.toLowerCase(),
                    volume: parseFloat(volume),
                    price: this.getCurrentPrice(symbol),
                    timestamp: new Date().toISOString()
                };
                
                this.ensureUserVerifiedForTrading().then((ok) => {
                    if (!ok) return;
                    this.executeOrder(order);
                    this.showNotification(`${orderType} order executed for ${volume} ${symbol}`, 'success');
                });
            });
        });

        // Order tabs (Buy/Sell)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const orderType = e.target.textContent.toLowerCase();
                this.updateOrderFormFields(orderType);
                this.updateOrderButton();
            });
        });

        // Order type change
        const orderTypeSelect = document.getElementById('orderType');
        if (orderTypeSelect) {
            orderTypeSelect.addEventListener('change', (e) => {
                const priceInput = document.getElementById('price');
                if (priceInput) {
                    priceInput.style.display = e.target.value === 'market' ? 'none' : 'block';
                }
            });
        }

        // Form submission
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.placeOrder(new FormData(orderForm));
            });
        }

        // Setup responsive handlers with enhanced mobile support
        this.setupResponsiveHandlers();
        
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
    }

    getCurrentPrice(symbol) {
        const prices = {
            'EUR/USD': 1.0856,
            'GBP/USD': 1.2634,
            'USD/JPY': 149.85,
            'AUD/USD': 0.6542
        };
        return prices[symbol] || 1.0000;
    }

    updatePositionsTable() {
        const positionsContainer = document.getElementById('positions');
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
        const ordersContainer = document.getElementById('orders');
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

    closePosition(positionId) {
        this.positions = this.positions.filter(p => p.id !== positionId);
        this.updatePositionsTable();
        this.updateAccountInfo();
        this.showNotification('Position closed successfully', 'success');
    }

    cancelOrder(orderId) {
        this.orders = this.orders.filter(o => o.id !== orderId);
        this.updateOrdersTable();
        this.showNotification('Order cancelled successfully', 'info');
    }

    closeAllPositions() {
        if (this.positions.length === 0) {
            this.showNotification('No positions to close', 'warning');
            return;
        }
        
        this.positions = [];
        this.updatePositionsTable();
        this.updateAccountInfo();
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
        // Update balance display
        const balanceEl = document.querySelector('.balance .value');
        if (balanceEl) {
            balanceEl.textContent = `$${this.portfolio.balance.toLocaleString()}`;
        }

        // Update P&L display
        const pnlEl = document.querySelector('.pnl .value');
        if (pnlEl) {
            pnlEl.textContent = `$${this.portfolio.totalPnL.toFixed(2)}`;
            pnlEl.className = `value ${this.portfolio.totalPnL >= 0 ? 'positive' : 'negative'}`;
        }

        // Update equity display
        const equityEl = document.querySelector('.equity .value');
        if (equityEl) {
            equityEl.textContent = `$${this.portfolio.equity.toLocaleString()}`;
        }
    }

    switchSymbol(symbol) {
        this.currentSymbol = symbol;
        document.querySelector('.chart-header h2').textContent = symbol;
        this.updateOrderButton();
        this.renderChart();
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
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.platform = new TradingPlatform();
        window.platform.init();
    } catch (error) {
        console.error('Failed to initialize trading platform:', error);
    }
});
