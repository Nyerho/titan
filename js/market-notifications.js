// Market Notifications System
class MarketNotifications {
    constructor() {
        this.notifications = [];
        this.notificationContainer = null;
        this.intervalId = null;
        this.currentIndex = 0;
        this.isActive = true;
        
        // Sample market updates - in production, this would come from your API
        this.marketUpdates = [
            { symbol: 'EUR/USD', price: '1.0845', change: '+0.12%', type: 'forex' },
            { symbol: 'GBP/USD', price: '1.2634', change: '-0.08%', type: 'forex' },
            { symbol: 'BTC/USD', price: '$42,350', change: '+2.45%', type: 'crypto' },
            { symbol: 'GOLD', price: '$2,045.30', change: '+0.75%', type: 'commodity' },
            { symbol: 'S&P 500', price: '4,785.2', change: '+0.35%', type: 'index' },
            { symbol: 'NASDAQ', price: '15,234.8', change: '+0.82%', type: 'index' },
            { symbol: 'USD/JPY', price: '149.85', change: '+0.25%', type: 'forex' },
            { symbol: 'ETH/USD', price: '$2,580', change: '+1.85%', type: 'crypto' }
        ];
        
        this.init();
    }
    
    init() {
        this.createNotificationContainer();
        this.startNotifications();
        this.setupEventListeners();
    }
    
    createNotificationContainer() {
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'market-notifications-container';
        this.notificationContainer.className = 'market-notifications-container';
        document.body.appendChild(this.notificationContainer);
    }
    
    createNotification(marketData) {
        const notification = document.createElement('div');
        notification.className = 'market-notification';
        
        const changeClass = marketData.change.startsWith('+') ? 'positive' : 'negative';
        const icon = this.getMarketIcon(marketData.type);
        
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-header">
                    <span class="market-icon">${icon}</span>
                    <span class="market-symbol">${marketData.symbol}</span>
                    <button class="notification-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="notification-body">
                    <span class="market-price">${marketData.price}</span>
                    <span class="market-change ${changeClass}">${marketData.change}</span>
                </div>
            </div>
        `;
        
        return notification;
    }
    
    getMarketIcon(type) {
        const icons = {
            'forex': '💱',
            'crypto': '₿',
            'commodity': '🥇',
            'index': '📈',
            'stock': '📊'
        };
        return icons[type] || '📈';
    }
    
    showNotification(marketData) {
        const notification = this.createNotification(marketData);
        
        // Add animation classes
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        
        this.notificationContainer.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 100);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.transform = 'translateX(100%)';
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
        
        // Limit number of notifications on screen
        const notifications = this.notificationContainer.children;
        if (notifications.length > 3) {
            notifications[0].remove();
        }
    }
    
    startNotifications() {
        // Show first notification after 3 seconds
        setTimeout(() => {
            this.showNextNotification();
        }, 3000);
        
        // Then show notifications every 8-12 seconds
        this.intervalId = setInterval(() => {
            if (this.isActive) {
                this.showNextNotification();
            }
        }, this.getRandomInterval());
    }
    
    showNextNotification() {
        if (this.marketUpdates.length === 0) return;
        
        const marketData = this.marketUpdates[this.currentIndex];
        this.showNotification(marketData);
        
        this.currentIndex = (this.currentIndex + 1) % this.marketUpdates.length;
    }
    
    getRandomInterval() {
        // Random interval between 8-12 seconds
        return Math.floor(Math.random() * 4000) + 8000;
    }
    
    setupEventListeners() {
        // Pause notifications when user is inactive
        let inactivityTimer;
        
        const resetInactivityTimer = () => {
            clearTimeout(inactivityTimer);
            this.isActive = true;
            
            inactivityTimer = setTimeout(() => {
                this.isActive = false;
            }, 300000); // 5 minutes of inactivity
        };
        
        document.addEventListener('mousemove', resetInactivityTimer);
        document.addEventListener('keypress', resetInactivityTimer);
        document.addEventListener('scroll', resetInactivityTimer);
        
        // Initial timer
        resetInactivityTimer();
    }
    
    updateMarketData(newData) {
        this.marketUpdates = newData;
        this.currentIndex = 0;
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isActive = false;
    }
    
    resume() {
        if (!this.intervalId) {
            this.startNotifications();
        }
        this.isActive = true;
    }
}

// Initialize notifications when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.marketNotifications = new MarketNotifications();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarketNotifications;
}