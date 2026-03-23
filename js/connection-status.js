// Connection Status Indicator Component
class ConnectionStatus {
    constructor(containerId = 'connection-status') {
        this.container = document.getElementById(containerId);
        this.marketDataService = null;
        this.status = {
            finnhub: 'disconnected',
            polygon: 'disconnected'
        };
        
        this.init();
    }

    init() {
        if (!this.container) {
            // Create status container if it doesn't exist
            this.createStatusContainer();
        }
        
        this.render();
    }

    createStatusContainer() {
        const statusContainer = document.createElement('div');
        statusContainer.id = 'connection-status';
        statusContainer.className = 'connection-status';
        
        // Add to navigation or header
        const nav = document.querySelector('.nav-right') || document.querySelector('nav');
        if (nav) {
            nav.appendChild(statusContainer);
            this.container = statusContainer;
        }
    }

    setMarketDataService(marketDataService) {
        this.marketDataService = marketDataService;
        
        // Subscribe to connection status updates
        this.marketDataService.subscribeToSymbol('connection', (data) => {
            this.updateStatus(data.provider, data.status);
        });
        
        // Get initial status
        this.updateConnectionStatus();
    }

    updateStatus(provider, status) {
        this.status[provider] = status;
        this.render();
    }

    updateConnectionStatus() {
        if (this.marketDataService) {
            const connectionStatus = this.marketDataService.getConnectionStatus();
            Object.entries(connectionStatus).forEach(([provider, info]) => {
                this.status[provider] = info.status;
            });
            this.render();
        }
    }

    render() {
        if (!this.container) return;
        
        const overallStatus = this.getOverallStatus();
        
        this.container.innerHTML = `
            <div class="connection-indicator ${overallStatus}">
                <div class="status-dot"></div>
                <span class="status-text">${this.getStatusText(overallStatus)}</span>
                <div class="status-details">
                    ${Object.entries(this.status).map(([provider, status]) => `
                        <div class="provider-status ${status}">
                            <span class="provider-name">${provider}</span>
                            <span class="provider-status-text">${status}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getOverallStatus() {
        const statuses = Object.values(this.status);
        
        if (statuses.some(s => s === 'connected')) {
            return 'connected';
        } else if (statuses.some(s => s === 'connecting')) {
            return 'connecting';
        } else {
            return 'disconnected';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'connected': return 'Live Data';
            case 'connecting': return 'Connecting...';
            case 'disconnected': return 'Offline';
            default: return 'Unknown';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionStatus;
} else {
    window.ConnectionStatus = ConnectionStatus;
}