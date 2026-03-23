// Trading Service - Handles order placement, position management, and account information
class TradingService {
    constructor() {
        this.config = new APIConfig();
        this.marketDataService = null;
        this.positions = new Map();
        this.orders = new Map();
        this.accountInfo = {
            balance: 100000, // Demo account balance
            equity: 100000,
            margin: 0,
            freeMargin: 100000,
            marginLevel: 0,
            currency: 'USD'
        };
        this.orderIdCounter = 1;
        this.positionIdCounter = 1;
        this.isDemo = true; // Demo mode by default
        this.subscribers = new Map();
        this.errorHandler = new ErrorHandler();
        
        // Subscribe to error notifications
        this.errorHandler.onNotification((message, type) => {
            this.notifySubscribers('error', { message, type });
        });
    }

    // Initialize the trading service
    async init(marketDataService) {
        this.marketDataService = marketDataService;
        console.log('🚀 Trading Service initialized in demo mode');
        
        // Load saved positions and orders from localStorage
        this.loadFromStorage();
        
        // Start position monitoring
        this.startPositionMonitoring();
    }

    // Place a new order
    // Enhanced placeOrder with error handling
    async placeOrder(orderData) {
        try {
            const order = {
                id: `ORDER_${this.orderIdCounter++}`,
                symbol: orderData.symbol,
                type: orderData.type, // 'market', 'limit', 'stop'
                side: orderData.side, // 'buy', 'sell'
                volume: parseFloat(orderData.volume),
                price: orderData.price ? parseFloat(orderData.price) : null,
                stopLoss: orderData.stopLoss ? parseFloat(orderData.stopLoss) : null,
                takeProfit: orderData.takeProfit ? parseFloat(orderData.takeProfit) : null,
                status: 'pending',
                timestamp: new Date(),
                comment: orderData.comment || ''
            };

            // Validate order
            const validation = this.validateOrder(order);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            // Check margin requirements
            const marginCheck = this.checkMarginRequirement(order);
            if (!marginCheck.sufficient) {
                throw new Error(`Insufficient margin. Required: ${marginCheck.required}, Available: ${marginCheck.available}`);
            }

            // Execute order based on type
            if (order.type === 'market') {
                await this.executeMarketOrder(order);
            } else {
                this.orders.set(order.id, order);
                console.log(`📋 ${order.type.toUpperCase()} order placed:`, order);
            }

            // Save to storage
            this.saveToStorage();
            
            // Notify subscribers
            this.notifySubscribers('orderPlaced', order);
            
            return {
                success: true,
                orderId: order.id,
                message: `Order placed successfully`
            };
            
        } catch (error) {
            console.error('❌ Error placing order:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Execute market order immediately
    async executeMarketOrder(order) {
        try {
            // Get current market price
            const quote = await this.marketDataService.getQuote(order.symbol);
            if (!quote) {
                throw new Error(`Unable to get market price for ${order.symbol}`);
            }

            const executionPrice = order.side === 'buy' ? quote.ask || quote.price : quote.bid || quote.price;
            
            // Create position
            const position = {
                id: `POS_${this.positionIdCounter++}`,
                orderId: order.id,
                symbol: order.symbol,
                side: order.side,
                volume: order.volume,
                openPrice: executionPrice,
                currentPrice: executionPrice,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                profit: 0,
                profitPercent: 0,
                openTime: new Date(),
                status: 'open',
                comment: order.comment
            };

            // Update order status
            order.status = 'filled';
            order.executionPrice = executionPrice;
            order.executionTime = new Date();
            
            // Add to positions
            this.positions.set(position.id, position);
            this.orders.set(order.id, order);
            
            // Update account balance
            this.updateAccountInfo();
            
            console.log(`✅ Market order executed:`, position);
            
            // Notify subscribers
            this.notifySubscribers('positionOpened', position);
            
            return position;
            
        } catch (error) {
            order.status = 'rejected';
            order.rejectionReason = error.message;
            throw error;
        }
    }

    // Close position
    async closePosition(positionId, volume = null) {
        try {
            const position = this.positions.get(positionId);
            if (!position) {
                throw new Error('Position not found');
            }

            if (position.status !== 'open') {
                throw new Error('Position is not open');
            }

            // Get current market price
            const quote = await this.marketDataService.getQuote(position.symbol);
            if (!quote) {
                throw new Error(`Unable to get market price for ${position.symbol}`);
            }

            const closePrice = position.side === 'buy' ? quote.bid || quote.price : quote.ask || quote.price;
            const closeVolume = volume || position.volume;
            
            // Calculate profit
            const profit = this.calculateProfit(position, closePrice, closeVolume);
            
            // Update position
            position.status = 'closed';
            position.closePrice = closePrice;
            position.closeTime = new Date();
            position.profit = profit;
            position.closedVolume = closeVolume;
            
            // Update account balance
            this.accountInfo.balance += profit;
            this.updateAccountInfo();
            
            // Save to storage
            this.saveToStorage();
            
            console.log(`🔒 Position closed:`, position);
            
            // Notify subscribers
            this.notifySubscribers('positionClosed', position);
            
            return {
                success: true,
                profit: profit,
                message: `Position closed with ${profit >= 0 ? 'profit' : 'loss'}: $${profit.toFixed(2)}`
            };
            
        } catch (error) {
            console.error('❌ Error closing position:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Cancel pending order
    cancelOrder(orderId) {
        try {
            const order = this.orders.get(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            if (order.status !== 'pending') {
                throw new Error('Order cannot be cancelled');
            }

            order.status = 'cancelled';
            order.cancelTime = new Date();
            
            // Save to storage
            this.saveToStorage();
            
            console.log(`❌ Order cancelled:`, order);
            
            // Notify subscribers
            this.notifySubscribers('orderCancelled', order);
            
            return {
                success: true,
                message: 'Order cancelled successfully'
            };
            
        } catch (error) {
            console.error('❌ Error cancelling order:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Modify position (stop loss, take profit)
    modifyPosition(positionId, modifications) {
        try {
            const position = this.positions.get(positionId);
            if (!position) {
                throw new Error('Position not found');
            }

            if (position.status !== 'open') {
                throw new Error('Position is not open');
            }

            // Update modifications
            if (modifications.stopLoss !== undefined) {
                position.stopLoss = modifications.stopLoss;
            }
            if (modifications.takeProfit !== undefined) {
                position.takeProfit = modifications.takeProfit;
            }
            
            // Save to storage
            this.saveToStorage();
            
            console.log(`📝 Position modified:`, position);
            
            // Notify subscribers
            this.notifySubscribers('positionModified', position);
            
            return {
                success: true,
                message: 'Position modified successfully'
            };
            
        } catch (error) {
            console.error('❌ Error modifying position:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Validate order parameters
    validateOrder(order) {
        if (!order.symbol) {
            return { valid: false, error: 'Symbol is required' };
        }
        
        if (!order.volume || order.volume <= 0) {
            return { valid: false, error: 'Volume must be greater than 0' };
        }
        
        if (order.type === 'limit' && !order.price) {
            return { valid: false, error: 'Price is required for limit orders' };
        }
        
        if (order.volume > 100) { // Demo limit
            return { valid: false, error: 'Maximum volume is 100 lots in demo mode' };
        }
        
        return { valid: true };
    }

    // Check margin requirement
    checkMarginRequirement(order) {
        // Simplified margin calculation for demo
        const leverage = 100; // 1:100 leverage
        const marginRequired = (order.volume * 100000) / leverage; // Assuming standard lot size
        
        return {
            sufficient: this.accountInfo.freeMargin >= marginRequired,
            required: marginRequired,
            available: this.accountInfo.freeMargin
        };
    }

    // Calculate profit for position
    calculateProfit(position, currentPrice, volume = null) {
        const vol = volume || position.volume;
        const priceDiff = position.side === 'buy' 
            ? currentPrice - position.openPrice 
            : position.openPrice - currentPrice;
        
        // Simplified profit calculation (assuming 1 pip = $10 for major pairs)
        const pipValue = this.getPipValue(position.symbol);
        return priceDiff * vol * pipValue;
    }

    // Get pip value for symbol
    getPipValue(symbol) {
        // Simplified pip values
        if (symbol.includes('JPY')) return 1000;
        if (symbol.includes('/')) return 10000; // Forex pairs
        return 1; // Stocks
    }

    // Start monitoring positions for stop loss/take profit
    startPositionMonitoring() {
        setInterval(() => {
            this.checkPositions();
        }, 1000); // Check every second
    }

    // Check positions for stop loss/take profit triggers
    async checkPositions() {
        for (const [id, position] of this.positions) {
            if (position.status !== 'open') continue;
            
            try {
                const quote = await this.marketDataService.getQuote(position.symbol);
                if (!quote) continue;
                
                const currentPrice = position.side === 'buy' ? quote.bid || quote.price : quote.ask || quote.price;
                
                // Update current price and profit
                position.currentPrice = currentPrice;
                position.profit = this.calculateProfit(position, currentPrice);
                position.profitPercent = (position.profit / (position.volume * 100000)) * 100;
                
                // Check stop loss
                if (position.stopLoss) {
                    const stopTriggered = position.side === 'buy' 
                        ? currentPrice <= position.stopLoss
                        : currentPrice >= position.stopLoss;
                    
                    if (stopTriggered) {
                        await this.closePosition(id);
                        console.log(`🛑 Stop loss triggered for position ${id}`);
                        continue;
                    }
                }
                
                // Check take profit
                if (position.takeProfit) {
                    const profitTriggered = position.side === 'buy'
                        ? currentPrice >= position.takeProfit
                        : currentPrice <= position.takeProfit;
                    
                    if (profitTriggered) {
                        await this.closePosition(id);
                        console.log(`💰 Take profit triggered for position ${id}`);
                        continue;
                    }
                }
                
            } catch (error) {
                console.error(`Error monitoring position ${id}:`, error);
            }
        }
        
        // Update account info
        this.updateAccountInfo();
        
        // Notify subscribers of position updates
        this.notifySubscribers('positionsUpdated', Array.from(this.positions.values()));
    }

    // Update account information
    updateAccountInfo() {
        let totalProfit = 0;
        let usedMargin = 0;
        
        for (const position of this.positions.values()) {
            if (position.status === 'open') {
                totalProfit += position.profit || 0;
                usedMargin += (position.volume * 100000) / 100; // 1:100 leverage
            }
        }
        
        this.accountInfo.equity = this.accountInfo.balance + totalProfit;
        this.accountInfo.margin = usedMargin;
        this.accountInfo.freeMargin = this.accountInfo.equity - usedMargin;
        this.accountInfo.marginLevel = usedMargin > 0 ? (this.accountInfo.equity / usedMargin) * 100 : 0;
    }

    // Subscribe to trading events
    subscribe(event, callback) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, new Set());
        }
        this.subscribers.get(event).add(callback);
    }

    // Unsubscribe from trading events
    unsubscribe(event, callback) {
        if (this.subscribers.has(event)) {
            this.subscribers.get(event).delete(callback);
        }
    }

    // Notify subscribers
    notifySubscribers(event, data) {
        if (this.subscribers.has(event)) {
            this.subscribers.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in subscriber callback:', error);
                }
            });
        }
    }

    // Get all positions
    getPositions() {
        return Array.from(this.positions.values());
    }

    // Get all orders
    getOrders() {
        return Array.from(this.orders.values());
    }

    // Get account information
    getAccountInfo() {
        return { ...this.accountInfo };
    }

    // Save data to localStorage
    saveToStorage() {
        try {
            localStorage.setItem('trading_positions', JSON.stringify(Array.from(this.positions.entries())));
            localStorage.setItem('trading_orders', JSON.stringify(Array.from(this.orders.entries())));
            localStorage.setItem('trading_account', JSON.stringify(this.accountInfo));
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }

    // Load data from localStorage
    loadFromStorage() {
        try {
            const positions = localStorage.getItem('trading_positions');
            if (positions) {
                this.positions = new Map(JSON.parse(positions));
            }
            
            const orders = localStorage.getItem('trading_orders');
            if (orders) {
                this.orders = new Map(JSON.parse(orders));
            }
            
            const account = localStorage.getItem('trading_account');
            if (account) {
                this.accountInfo = { ...this.accountInfo, ...JSON.parse(account) };
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
        }
    }

    // Reset demo account
    resetDemoAccount() {
        this.positions.clear();
        this.orders.clear();
        this.accountInfo = {
            balance: 100000,
            equity: 100000,
            margin: 0,
            freeMargin: 100000,
            marginLevel: 0,
            currency: 'USD'
        };
        
        // Clear storage
        localStorage.removeItem('trading_positions');
        localStorage.removeItem('trading_orders');
        localStorage.removeItem('trading_account');
        
        console.log('🔄 Demo account reset');
        
        // Notify subscribers
        this.notifySubscribers('accountReset', this.accountInfo);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TradingService;
} else {
    window.TradingService = TradingService;
}