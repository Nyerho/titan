// Real-time market data simulation
class MarketData {
    constructor() {
        this.symbols = {
            'EUR/USD': { price: 1.0892, change: 0.0015 },
            'GBP/USD': { price: 1.2678, change: -0.0028 },
            'USD/JPY': { price: 150.45, change: 0.52 },
            'BTC/USD': { price: 67850, change: 2150 },
            'GOLD': { price: 2387.60, change: 18.30 },
            'USD/CAD': { price: 1.3542, change: -0.0012 },
            'AUD/USD': { price: 0.6634, change: 0.0019 },
            'ETH/USD': { price: 3420, change: 125 },
            'XRP/USD': { price: 0.5847, change: 0.0234 },
            'S&P 500': { price: 5487.03, change: 23.45 }
        };
        this.updateInterval = 2500; // 2.5 seconds for more dynamic feel
        this.startUpdates();
    }

    generateRandomChange(basePrice, maxChangePercent = 0.08) {
        const maxChange = basePrice * (maxChangePercent / 100);
        return (Math.random() - 0.5) * 2 * maxChange;
    }

    updatePrices() {
        Object.keys(this.symbols).forEach(symbol => {
            const data = this.symbols[symbol];
            const change = this.generateRandomChange(data.price);
            data.price += change;
            data.change = change;
            
            // Ensure realistic price bounds
            if (symbol === 'BTC/USD' && data.price < 30000) data.price = 30000;
            if (symbol === 'BTC/USD' && data.price > 100000) data.price = 100000;
            if (symbol === 'ETH/USD' && data.price < 1500) data.price = 1500;
            if (symbol === 'ETH/USD' && data.price > 5000) data.price = 5000;
            
            // Update DOM elements
            const tickerItem = document.querySelector(`[data-symbol="${symbol}"]`);
            if (tickerItem) {
                const priceElement = tickerItem.querySelector('.price');
                const changeElement = tickerItem.querySelector('.change');
                
                if (priceElement) {
                    if (symbol.includes('BTC') || symbol.includes('ETH')) {
                        priceElement.textContent = '$' + Math.round(data.price).toLocaleString();
                    } else if (symbol === 'GOLD') {
                        priceElement.textContent = '$' + data.price.toFixed(2);
                    } else if (symbol === 'S&P 500') {
                        priceElement.textContent = data.price.toFixed(2);
                    } else {
                        priceElement.textContent = data.price.toFixed(4);
                    }
                }
                
                if (changeElement) {
                    let changeText;
                    if (symbol.includes('BTC') || symbol.includes('ETH')) {
                        changeText = data.change > 0 ? `+$${Math.round(data.change)}` : `-$${Math.abs(Math.round(data.change))}`;
                    } else {
                        changeText = data.change > 0 ? `+${data.change.toFixed(4)}` : data.change.toFixed(4);
                    }
                    changeElement.textContent = changeText;
                    changeElement.className = `change ${data.change >= 0 ? 'positive' : 'negative'}`;
                }
            }
        });
    }

    startUpdates() {
        // Update ticker items with data attributes
        document.querySelectorAll('.ticker-item').forEach((item, index) => {
            const symbols = Object.keys(this.symbols);
            if (symbols[index]) {
                item.setAttribute('data-symbol', symbols[index]);
            }
        });

        // Start periodic updates
        setInterval(() => {
            this.updatePrices();
        }, this.updateInterval);
    }
}

// Initialize market data when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MarketData();
});

// Trading chart simulation (placeholder for real charting library)
class TradingChart {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.initChart();
    }

    initChart() {
        if (!this.container) return;
        
        // This would integrate with a real charting library like TradingView, Chart.js, or D3.js
        this.container.innerHTML = `
            <div class="chart-placeholder">
                <h3>Live Trading Chart</h3>
                <p>Real-time market data visualization would appear here</p>
                <div class="chart-controls">
                    <button class="chart-btn active">1M</button>
                    <button class="chart-btn">5M</button>
                    <button class="chart-btn">15M</button>
                    <button class="chart-btn">1H</button>
                    <button class="chart-btn">4H</button>
                    <button class="chart-btn">1D</button>
                </div>
            </div>
        `;
    }
}