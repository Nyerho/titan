// Enhanced WebSocket Manager for Real-time Market Data
class WebSocketManager {
    constructor() {
        this.connections = new Map();
        this.subscribers = new Map();
        this.connectionStatus = new Map();
        this.reconnectAttempts = new Map();
        this.maxReconnectAttempts = 5;
        this.baseReconnectDelay = 1000;
        this.heartbeatInterval = 30000; // 30 seconds
        this.heartbeatTimers = new Map();
        this.messageQueue = new Map();
        this.isInitialized = false;
        
        // Connection configurations
        this.providers = {
            finnhub: {
                url: 'wss://ws.finnhub.io',
                apiKey: null,
                symbolMapping: {
                    'EUR/USD': 'OANDA:EUR_USD',
                    'GBP/USD': 'OANDA:GBP_USD',
                    'USD/JPY': 'OANDA:USD_JPY',
                    'BTC/USD': 'BINANCE:BTCUSDT',
                    'ETH/USD': 'BINANCE:ETHUSDT',
                    'AAPL': 'AAPL',
                    'GOOGL': 'GOOGL',
                    'MSFT': 'MSFT',
                    'TSLA': 'TSLA'
                }
            },
            polygon: {
                url: 'wss://socket.polygon.io/stocks',
                apiKey: null,
                symbolMapping: {
                    'AAPL': 'AAPL',
                    'GOOGL': 'GOOGL',
                    'MSFT': 'MSFT',
                    'TSLA': 'TSLA'
                }
            }
        };
        
        this.providers.finnhub.apiKey = this.getApiKey('FINNHUB_API_KEY');
        this.providers.polygon.apiKey = this.getApiKey('POLYGON_API_KEY');
        
        this.subscribedSymbols = new Set();
        this.statusCallbacks = new Set();
    }

    getApiKey(keyName) {
        try {
            if (typeof window !== 'undefined' && window.API_CONFIG && typeof window.API_CONFIG.getApiKey === 'function') {
                return window.API_CONFIG.getApiKey(keyName);
            }
        } catch (e) {}
        return null;
    }

    // Initialize WebSocket connections
    async init() {
        console.log('🚀 Initializing Enhanced WebSocket Manager...');
        
        try {
            // Initialize primary connection (Finnhub)
            if (this.providers.finnhub.apiKey) {
                await this.connectProvider('finnhub');
            }
            
            // Initialize secondary connection (Polygon) for redundancy
            if (this.providers.polygon.apiKey) {
                await this.connectProvider('polygon');
            }
            
            if (!this.connections.size) {
                this.notifyStatusChange('failed', 'No WebSocket API keys configured');
                return false;
            }
            
            this.isInitialized = true;
            this.notifyStatusChange('initialized', true);
            
            console.log('✅ WebSocket Manager initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize WebSocket Manager:', error);
            this.notifyStatusChange('error', error.message);
            return false;
        }
    }

    // Connect to a specific provider
    async connectProvider(providerName) {
        const config = this.providers[providerName];
        if (!config) {
            throw new Error(`Unknown provider: ${providerName}`);
        }
        
        if (!config.apiKey) {
            throw new Error(`Missing API key for provider: ${providerName}`);
        }

        return new Promise((resolve, reject) => {
            try {
                const wsUrl = `${config.url}?token=${config.apiKey}`;
                const ws = new WebSocket(wsUrl);
                
                // Set connection timeout
                const timeout = setTimeout(() => {
                    if (ws.readyState !== WebSocket.OPEN) {
                        ws.close();
                        reject(new Error(`Connection timeout for ${providerName}`));
                    }
                }, 10000);

                ws.onopen = () => {
                    clearTimeout(timeout);
                    console.log(`🔗 ${providerName} WebSocket connected`);
                    
                    this.connections.set(providerName, ws);
                    this.connectionStatus.set(providerName, 'connected');
                    this.reconnectAttempts.set(providerName, 0);
                    
                    // Start heartbeat
                    this.startHeartbeat(providerName);
                    
                    // Process queued messages
                    this.processMessageQueue(providerName);
                    
                    // Resubscribe to symbols if reconnecting
                    this.resubscribeSymbols(providerName);
                    
                    this.notifyStatusChange('connected', providerName);
                    resolve();
                };

                ws.onmessage = (event) => {
                    this.handleMessage(providerName, event.data);
                };

                ws.onclose = (event) => {
                    clearTimeout(timeout);
                    console.log(`🔌 ${providerName} WebSocket disconnected:`, event.code, event.reason);
                    
                    this.connectionStatus.set(providerName, 'disconnected');
                    this.stopHeartbeat(providerName);
                    
                    this.notifyStatusChange('disconnected', providerName);
                    
                    // Attempt reconnection
                    this.scheduleReconnect(providerName);
                };

                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error(`❌ ${providerName} WebSocket error:`, error);
                    
                    this.connectionStatus.set(providerName, 'error');
                    this.notifyStatusChange('error', `${providerName}: ${error.message}`);
                    
                    reject(error);
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    // Handle incoming messages
    handleMessage(providerName, data) {
        try {
            const message = JSON.parse(data);
            
            // Handle different provider message formats
            switch (providerName) {
                case 'finnhub':
                    this.handleFinnhubMessage(message);
                    break;
                case 'polygon':
                    this.handlePolygonMessage(message);
                    break;
                default:
                    console.warn(`Unknown provider message: ${providerName}`);
            }
        } catch (error) {
            console.error(`Error parsing ${providerName} message:`, error);
        }
    }

    // Handle Finnhub messages
    handleFinnhubMessage(message) {
        if (message.type === 'trade' && message.data) {
            message.data.forEach(trade => {
                const symbol = this.mapSymbolFromProvider('finnhub', trade.s);
                if (symbol) {
                    const marketData = {
                        symbol: symbol,
                        price: trade.p,
                        volume: trade.v,
                        timestamp: new Date(trade.t),
                        provider: 'finnhub',
                        type: 'trade'
                    };
                    
                    this.notifySubscribers(symbol, marketData);
                }
            });
        }
    }

    // Handle Polygon messages
    handlePolygonMessage(message) {
        if (message.ev === 'T') { // Trade event
            const symbol = message.sym;
            const marketData = {
                symbol: symbol,
                price: message.p,
                volume: message.s,
                timestamp: new Date(message.t),
                provider: 'polygon',
                type: 'trade'
            };
            
            this.notifySubscribers(symbol, marketData);
        }
    }

    // Subscribe to symbol updates
    subscribe(symbol, callback) {
        if (!this.subscribers.has(symbol)) {
            this.subscribers.set(symbol, new Set());
        }
        
        this.subscribers.get(symbol).add(callback);
        this.subscribedSymbols.add(symbol);
        
        // Subscribe on all available providers
        this.subscribeOnProviders(symbol);
        
        console.log(`📡 Subscribed to ${symbol}`);
    }

    // Unsubscribe from symbol updates
    unsubscribe(symbol, callback) {
        if (this.subscribers.has(symbol)) {
            this.subscribers.get(symbol).delete(callback);
            
            if (this.subscribers.get(symbol).size === 0) {
                this.subscribers.delete(symbol);
                this.subscribedSymbols.delete(symbol);
                
                // Unsubscribe from all providers
                this.unsubscribeFromProviders(symbol);
                
                console.log(`📡 Unsubscribed from ${symbol}`);
            }
        }
    }

    // Subscribe to symbol on all connected providers
    subscribeOnProviders(symbol) {
        for (const [providerName, ws] of this.connections) {
            if (ws.readyState === WebSocket.OPEN) {
                this.subscribeOnProvider(providerName, symbol);
            } else {
                // Queue the subscription for when connection is restored
                this.queueMessage(providerName, 'subscribe', symbol);
            }
        }
    }

    // Subscribe to symbol on specific provider
    subscribeOnProvider(providerName, symbol) {
        const ws = this.connections.get(providerName);
        const config = this.providers[providerName];
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            this.queueMessage(providerName, 'subscribe', symbol);
            return;
        }

        const mappedSymbol = config.symbolMapping[symbol] || symbol;
        let subscribeMessage;

        switch (providerName) {
            case 'finnhub':
                subscribeMessage = {
                    type: 'subscribe',
                    symbol: mappedSymbol
                };
                break;
            case 'polygon':
                subscribeMessage = {
                    action: 'subscribe',
                    params: `T.${mappedSymbol}`
                };
                break;
        }

        if (subscribeMessage) {
            ws.send(JSON.stringify(subscribeMessage));
            console.log(`📡 Subscribed to ${symbol} on ${providerName}`);
        }
    }

    // Unsubscribe from symbol on all providers
    unsubscribeFromProviders(symbol) {
        for (const [providerName, ws] of this.connections) {
            if (ws.readyState === WebSocket.OPEN) {
                this.unsubscribeFromProvider(providerName, symbol);
            }
        }
    }

    // Unsubscribe from symbol on specific provider
    unsubscribeFromProvider(providerName, symbol) {
        const ws = this.connections.get(providerName);
        const config = this.providers[providerName];
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const mappedSymbol = config.symbolMapping[symbol] || symbol;
        let unsubscribeMessage;

        switch (providerName) {
            case 'finnhub':
                unsubscribeMessage = {
                    type: 'unsubscribe',
                    symbol: mappedSymbol
                };
                break;
            case 'polygon':
                unsubscribeMessage = {
                    action: 'unsubscribe',
                    params: `T.${mappedSymbol}`
                };
                break;
        }

        if (unsubscribeMessage) {
            ws.send(JSON.stringify(unsubscribeMessage));
            console.log(`📡 Unsubscribed from ${symbol} on ${providerName}`);
        }
    }

    // Map symbol from provider format to local format
    mapSymbolFromProvider(providerName, providerSymbol) {
        const config = this.providers[providerName];
        if (!config) return providerSymbol;
        
        for (const [localSymbol, mappedSymbol] of Object.entries(config.symbolMapping)) {
            if (mappedSymbol === providerSymbol) {
                return localSymbol;
            }
        }
        
        return providerSymbol;
    }

    // Notify subscribers of new data
    notifySubscribers(symbol, data) {
        if (this.subscribers.has(symbol)) {
            this.subscribers.get(symbol).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in subscriber callback:', error);
                }
            });
        }
    }

    // Start heartbeat for connection
    startHeartbeat(providerName) {
        this.stopHeartbeat(providerName); // Clear existing timer
        
        const timer = setInterval(() => {
            const ws = this.connections.get(providerName);
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Send ping message
                ws.send(JSON.stringify({ type: 'ping' }));
            } else {
                this.stopHeartbeat(providerName);
            }
        }, this.heartbeatInterval);
        
        this.heartbeatTimers.set(providerName, timer);
    }

    // Stop heartbeat for connection
    stopHeartbeat(providerName) {
        const timer = this.heartbeatTimers.get(providerName);
        if (timer) {
            clearInterval(timer);
            this.heartbeatTimers.delete(providerName);
        }
    }

    // Schedule reconnection attempt
    scheduleReconnect(providerName) {
        const attempts = this.reconnectAttempts.get(providerName) || 0;
        
        if (attempts >= this.maxReconnectAttempts) {
            console.error(`❌ Max reconnection attempts reached for ${providerName}`);
            this.connectionStatus.set(providerName, 'failed');
            this.notifyStatusChange('failed', providerName);
            return;
        }

        const delay = this.baseReconnectDelay * Math.pow(2, attempts);
        this.reconnectAttempts.set(providerName, attempts + 1);
        
        console.log(`🔄 Scheduling reconnection for ${providerName} in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.connectProvider(providerName).catch(error => {
                console.error(`Reconnection failed for ${providerName}:`, error);
            });
        }, delay);
    }

    // Queue message for when connection is restored
    queueMessage(providerName, action, symbol) {
        if (!this.messageQueue.has(providerName)) {
            this.messageQueue.set(providerName, []);
        }
        
        this.messageQueue.get(providerName).push({ action, symbol });
    }

    // Process queued messages
    processMessageQueue(providerName) {
        const queue = this.messageQueue.get(providerName);
        if (!queue || queue.length === 0) return;
        
        console.log(`📤 Processing ${queue.length} queued messages for ${providerName}`);
        
        queue.forEach(({ action, symbol }) => {
            if (action === 'subscribe') {
                this.subscribeOnProvider(providerName, symbol);
            }
        });
        
        this.messageQueue.set(providerName, []);
    }

    // Resubscribe to all symbols after reconnection
    resubscribeSymbols(providerName) {
        this.subscribedSymbols.forEach(symbol => {
            this.subscribeOnProvider(providerName, symbol);
        });
    }

    // Subscribe to connection status changes
    onStatusChange(callback) {
        this.statusCallbacks.add(callback);
    }

    // Unsubscribe from connection status changes
    offStatusChange(callback) {
        this.statusCallbacks.delete(callback);
    }

    // Notify status change subscribers
    notifyStatusChange(status, data) {
        this.statusCallbacks.forEach(callback => {
            try {
                callback(status, data);
            } catch (error) {
                console.error('Error in status callback:', error);
            }
        });
    }

    // Get connection status
    getConnectionStatus() {
        const status = {};
        for (const [providerName, connectionStatus] of this.connectionStatus) {
            status[providerName] = {
                status: connectionStatus,
                reconnectAttempts: this.reconnectAttempts.get(providerName) || 0
            };
        }
        return status;
    }

    // Get subscribed symbols
    getSubscribedSymbols() {
        return Array.from(this.subscribedSymbols);
    }

    // Destroy all connections
    destroy() {
        console.log('🔌 Shutting down WebSocket Manager...');
        
        // Stop all heartbeats
        for (const providerName of this.heartbeatTimers.keys()) {
            this.stopHeartbeat(providerName);
        }
        
        // Close all connections
        for (const [providerName, ws] of this.connections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        
        // Clear all data
        this.connections.clear();
        this.subscribers.clear();
        this.connectionStatus.clear();
        this.reconnectAttempts.clear();
        this.messageQueue.clear();
        this.subscribedSymbols.clear();
        this.statusCallbacks.clear();
        
        this.isInitialized = false;
        console.log('✅ WebSocket Manager shut down complete');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
} else {
    window.WebSocketManager = WebSocketManager;
}
