// Error Handler - Comprehensive error handling for trading platform
class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 1000;
        this.retryAttempts = new Map();
        this.maxRetryAttempts = 3;
        this.retryDelay = 1000; // Base delay in milliseconds
        this.circuitBreakers = new Map();
        this.notificationCallbacks = new Set();
        
        // Error types
        this.ERROR_TYPES = {
            NETWORK: 'network',
            API_RATE_LIMIT: 'api_rate_limit',
            API_ERROR: 'api_error',
            VALIDATION: 'validation',
            TRADING: 'trading',
            WEBSOCKET: 'websocket',
            AUTHENTICATION: 'authentication',
            TIMEOUT: 'timeout',
            UNKNOWN: 'unknown'
        };
        
        // Error severity levels
        this.SEVERITY = {
            LOW: 'low',
            MEDIUM: 'medium',
            HIGH: 'high',
            CRITICAL: 'critical'
        };
        
        this.init();
    }

    // Initialize error handler
    init() {
        // Global error handlers
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error, 'Global JavaScript Error');
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError(event.reason, 'Unhandled Promise Rejection');
        });
        
        // Network status monitoring
        window.addEventListener('online', () => {
            this.logError('Network connection restored', this.ERROR_TYPES.NETWORK, this.SEVERITY.LOW);
            this.resetCircuitBreakers();
        });
        
        window.addEventListener('offline', () => {
            this.logError('Network connection lost', this.ERROR_TYPES.NETWORK, this.SEVERITY.HIGH);
        });
        
        console.log('🛡️ Error Handler initialized');
    }

    // Handle API errors with retry logic
    async handleApiError(error, apiName, operation, retryable = true) {
        const errorInfo = this.analyzeError(error);
        const errorKey = `${apiName}_${operation}`;
        
        // Log the error
        this.logError(
            `API Error in ${apiName}.${operation}: ${errorInfo.message}`,
            errorInfo.type,
            errorInfo.severity,
            { apiName, operation, originalError: error }
        );
        
        // Check circuit breaker
        if (this.isCircuitBreakerOpen(apiName)) {
            throw new Error(`Circuit breaker is open for ${apiName}. Service temporarily unavailable.`);
        }
        
        // Handle rate limiting
        if (errorInfo.type === this.ERROR_TYPES.API_RATE_LIMIT) {
            return this.handleRateLimit(apiName, operation, error);
        }
        
        // Retry logic for retryable errors
        if (retryable && this.shouldRetry(errorKey, errorInfo)) {
            return this.retryOperation(errorKey, () => {
                // This should be overridden by the calling code
                throw new Error('Retry function not provided');
            });
        }
        
        // Update circuit breaker
        this.updateCircuitBreaker(apiName, false);
        
        // Re-throw the error if not handled
        throw this.createEnhancedError(error, errorInfo);
    }

    // Handle rate limiting with exponential backoff
    async handleRateLimit(apiName, operation, error) {
        const retryAfter = this.extractRetryAfter(error) || 60; // Default 60 seconds
        const delay = Math.min(retryAfter * 1000, 300000); // Max 5 minutes
        
        this.logError(
            `Rate limit exceeded for ${apiName}. Waiting ${retryAfter} seconds.`,
            this.ERROR_TYPES.API_RATE_LIMIT,
            this.SEVERITY.MEDIUM,
            { apiName, operation, retryAfter }
        );
        
        // Notify user about rate limiting
        this.notifyUser(
            `Rate limit reached for ${apiName}. Retrying in ${retryAfter} seconds...`,
            'warning'
        );
        
        // Wait and then allow retry
        await this.delay(delay);
        
        return { shouldRetry: true, delay: 0 };
    }

    // Handle WebSocket errors
    handleWebSocketError(error, wsName, reconnectCallback) {
        const errorInfo = this.analyzeError(error);
        
        this.logError(
            `WebSocket error in ${wsName}: ${errorInfo.message}`,
            this.ERROR_TYPES.WEBSOCKET,
            errorInfo.severity,
            { wsName, originalError: error }
        );
        
        // Implement exponential backoff for reconnection
        const reconnectKey = `ws_${wsName}`;
        const attempts = this.retryAttempts.get(reconnectKey) || 0;
        
        if (attempts < this.maxRetryAttempts) {
            const delay = this.calculateBackoffDelay(attempts);
            
            this.logError(
                `Attempting WebSocket reconnection ${attempts + 1}/${this.maxRetryAttempts} in ${delay}ms`,
                this.ERROR_TYPES.WEBSOCKET,
                this.SEVERITY.LOW
            );
            
            setTimeout(() => {
                this.retryAttempts.set(reconnectKey, attempts + 1);
                reconnectCallback();
            }, delay);
        } else {
            this.logError(
                `Max WebSocket reconnection attempts reached for ${wsName}`,
                this.ERROR_TYPES.WEBSOCKET,
                this.SEVERITY.HIGH
            );
            
            this.notifyUser(
                `Unable to reconnect to ${wsName}. Please refresh the page.`,
                'error'
            );
        }
    }

    // Handle trading errors
    handleTradingError(error, operation, orderData = null) {
        const errorInfo = this.analyzeError(error);
        
        this.logError(
            `Trading error in ${operation}: ${errorInfo.message}`,
            this.ERROR_TYPES.TRADING,
            errorInfo.severity,
            { operation, orderData, originalError: error }
        );
        
        // Specific handling for different trading errors
        if (errorInfo.message.includes('insufficient margin')) {
            this.notifyUser(
                'Insufficient margin for this trade. Please check your account balance.',
                'error'
            );
        } else if (errorInfo.message.includes('invalid symbol')) {
            this.notifyUser(
                'Invalid trading symbol. Please select a valid instrument.',
                'error'
            );
        } else if (errorInfo.message.includes('market closed')) {
            this.notifyUser(
                'Market is currently closed. Trading will resume when market opens.',
                'warning'
            );
        } else {
            this.notifyUser(
                `Trading error: ${errorInfo.message}`,
                'error'
            );
        }
        
        return {
            success: false,
            error: errorInfo.message,
            type: errorInfo.type,
            severity: errorInfo.severity
        };
    }

    // Analyze error to determine type and severity
    analyzeError(error) {
        let type = this.ERROR_TYPES.UNKNOWN;
        let severity = this.SEVERITY.MEDIUM;
        let message = error?.message || error?.toString() || 'Unknown error';
        
        // Network errors
        if (error instanceof TypeError && message.includes('fetch')) {
            type = this.ERROR_TYPES.NETWORK;
            severity = this.SEVERITY.HIGH;
        }
        
        // Rate limiting
        if (message.includes('rate limit') || message.includes('429') || error?.status === 429) {
            type = this.ERROR_TYPES.API_RATE_LIMIT;
            severity = this.SEVERITY.MEDIUM;
        }
        
        // API errors
        if (error?.status >= 400 && error?.status < 500) {
            type = this.ERROR_TYPES.API_ERROR;
            severity = error.status === 401 ? this.SEVERITY.HIGH : this.SEVERITY.MEDIUM;
        }
        
        // Server errors
        if (error?.status >= 500) {
            type = this.ERROR_TYPES.API_ERROR;
            severity = this.SEVERITY.HIGH;
        }
        
        // Timeout errors
        if (message.includes('timeout') || message.includes('TIMEOUT')) {
            type = this.ERROR_TYPES.TIMEOUT;
            severity = this.SEVERITY.MEDIUM;
        }
        
        // WebSocket errors
        if (message.includes('WebSocket') || message.includes('websocket')) {
            type = this.ERROR_TYPES.WEBSOCKET;
            severity = this.SEVERITY.MEDIUM;
        }
        
        // Authentication errors
        if (message.includes('unauthorized') || message.includes('authentication') || error?.status === 401) {
            type = this.ERROR_TYPES.AUTHENTICATION;
            severity = this.SEVERITY.HIGH;
        }
        
        // Trading specific errors
        if (message.includes('margin') || message.includes('volume') || message.includes('symbol')) {
            type = this.ERROR_TYPES.TRADING;
            severity = this.SEVERITY.MEDIUM;
        }
        
        return { type, severity, message };
    }

    // Circuit breaker implementation
    updateCircuitBreaker(serviceName, success) {
        if (!this.circuitBreakers.has(serviceName)) {
            this.circuitBreakers.set(serviceName, {
                failures: 0,
                lastFailure: null,
                state: 'closed' // closed, open, half-open
            });
        }
        
        const breaker = this.circuitBreakers.get(serviceName);
        
        if (success) {
            breaker.failures = 0;
            breaker.state = 'closed';
        } else {
            breaker.failures++;
            breaker.lastFailure = Date.now();
            
            if (breaker.failures >= 5) { // Open circuit after 5 failures
                breaker.state = 'open';
                this.logError(
                    `Circuit breaker opened for ${serviceName}`,
                    this.ERROR_TYPES.API_ERROR,
                    this.SEVERITY.HIGH
                );
            }
        }
    }

    // Check if circuit breaker is open
    isCircuitBreakerOpen(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker || breaker.state === 'closed') return false;
        
        // Auto-recovery after 5 minutes
        if (breaker.state === 'open' && Date.now() - breaker.lastFailure > 300000) {
            breaker.state = 'half-open';
            return false;
        }
        
        return breaker.state === 'open';
    }

    // Reset all circuit breakers
    resetCircuitBreakers() {
        for (const [serviceName, breaker] of this.circuitBreakers) {
            breaker.failures = 0;
            breaker.state = 'closed';
            breaker.lastFailure = null;
        }
        console.log('🔄 All circuit breakers reset');
    }

    // Retry logic with exponential backoff
    async retryOperation(operationKey, operation) {
        const attempts = this.retryAttempts.get(operationKey) || 0;
        
        if (attempts >= this.maxRetryAttempts) {
            this.retryAttempts.delete(operationKey);
            throw new Error(`Max retry attempts (${this.maxRetryAttempts}) exceeded for ${operationKey}`);
        }
        
        const delay = this.calculateBackoffDelay(attempts);
        
        this.logError(
            `Retrying operation ${operationKey} (attempt ${attempts + 1}/${this.maxRetryAttempts}) in ${delay}ms`,
            this.ERROR_TYPES.API_ERROR,
            this.SEVERITY.LOW
        );
        
        await this.delay(delay);
        
        try {
            this.retryAttempts.set(operationKey, attempts + 1);
            const result = await operation();
            this.retryAttempts.delete(operationKey); // Success, clear retry count
            return result;
        } catch (error) {
            // Will be handled by the calling code
            throw error;
        }
    }

    // Calculate exponential backoff delay
    calculateBackoffDelay(attempts) {
        return Math.min(this.retryDelay * Math.pow(2, attempts), 30000); // Max 30 seconds
    }

    // Check if operation should be retried
    shouldRetry(operationKey, errorInfo) {
        const attempts = this.retryAttempts.get(operationKey) || 0;
        
        if (attempts >= this.maxRetryAttempts) return false;
        
        // Don't retry certain error types
        const nonRetryableTypes = [
            this.ERROR_TYPES.AUTHENTICATION,
            this.ERROR_TYPES.VALIDATION
        ];
        
        return !nonRetryableTypes.includes(errorInfo.type);
    }

    // Extract retry-after header from error
    extractRetryAfter(error) {
        if (error?.headers && error.headers['retry-after']) {
            return parseInt(error.headers['retry-after']);
        }
        
        if (error?.response?.headers && error.response.headers['retry-after']) {
            return parseInt(error.response.headers['retry-after']);
        }
        
        return null;
    }

    // Log error with context
    logError(message, type = this.ERROR_TYPES.UNKNOWN, severity = this.SEVERITY.MEDIUM, context = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message,
            type,
            severity,
            context,
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        // Add to error log
        this.errorLog.unshift(errorEntry);
        
        // Maintain log size
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog = this.errorLog.slice(0, this.maxLogSize);
        }
        
        // Console logging based on severity
        const logMethod = this.getLogMethod(severity);
        logMethod(`[${type.toUpperCase()}] ${message}`, context);
        
        // Save to localStorage for persistence
        this.saveErrorLog();
        
        // Send to monitoring service (if configured)
        this.sendToMonitoring(errorEntry);
    }

    // Get appropriate console log method
    getLogMethod(severity) {
        switch (severity) {
            case this.SEVERITY.CRITICAL:
            case this.SEVERITY.HIGH:
                return console.error;
            case this.SEVERITY.MEDIUM:
                return console.warn;
            case this.SEVERITY.LOW:
            default:
                return console.log;
        }
    }

    // Handle global errors
    handleGlobalError(error, source) {
        this.logError(
            `${source}: ${error?.message || error}`,
            this.ERROR_TYPES.UNKNOWN,
            this.SEVERITY.HIGH,
            { source, stack: error?.stack }
        );
    }

    // Create enhanced error with additional context
    createEnhancedError(originalError, errorInfo) {
        const enhancedError = new Error(errorInfo.message);
        enhancedError.type = errorInfo.type;
        enhancedError.severity = errorInfo.severity;
        enhancedError.originalError = originalError;
        enhancedError.timestamp = new Date().toISOString();
        
        return enhancedError;
    }

    // Notify user about errors
    notifyUser(message, type = 'error') {
        this.notificationCallbacks.forEach(callback => {
            try {
                callback(message, type);
            } catch (error) {
                console.error('Error in notification callback:', error);
            }
        });
    }

    // Subscribe to error notifications
    onNotification(callback) {
        this.notificationCallbacks.add(callback);
    }

    // Unsubscribe from error notifications
    offNotification(callback) {
        this.notificationCallbacks.delete(callback);
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Save error log to localStorage
    saveErrorLog() {
        try {
            const recentErrors = this.errorLog.slice(0, 100); // Save only recent 100 errors
            localStorage.setItem('trading_error_log', JSON.stringify(recentErrors));
        } catch (error) {
            console.error('Failed to save error log:', error);
        }
    }

    // Load error log from localStorage
    loadErrorLog() {
        try {
            const saved = localStorage.getItem('trading_error_log');
            if (saved) {
                this.errorLog = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load error log:', error);
        }
    }

    // Send error to monitoring service
    sendToMonitoring(errorEntry) {
        // Only send critical and high severity errors
        if (errorEntry.severity === this.SEVERITY.CRITICAL || errorEntry.severity === this.SEVERITY.HIGH) {
            // This would integrate with a monitoring service like Sentry, LogRocket, etc.
            // For now, just log to console
            console.log('📊 Sending to monitoring service:', errorEntry);
        }
    }

    // Get error statistics
    getErrorStats() {
        const stats = {
            total: this.errorLog.length,
            byType: {},
            bySeverity: {},
            recent: this.errorLog.slice(0, 10)
        };
        
        this.errorLog.forEach(error => {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
            stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
        });
        
        return stats;
    }

    // Clear error log
    clearErrorLog() {
        this.errorLog = [];
        localStorage.removeItem('trading_error_log');
        console.log('🧹 Error log cleared');
    }

    // Get health status
    getHealthStatus() {
        const recentErrors = this.errorLog.filter(error => 
            Date.now() - new Date(error.timestamp).getTime() < 300000 // Last 5 minutes
        );
        
        const criticalErrors = recentErrors.filter(error => 
            error.severity === this.SEVERITY.CRITICAL
        );
        
        const highErrors = recentErrors.filter(error => 
            error.severity === this.SEVERITY.HIGH
        );
        
        let status = 'healthy';
        if (criticalErrors.length > 0) {
            status = 'critical';
        } else if (highErrors.length > 3) {
            status = 'degraded';
        } else if (recentErrors.length > 10) {
            status = 'warning';
        }
        
        return {
            status,
            recentErrorCount: recentErrors.length,
            criticalErrorCount: criticalErrors.length,
            highErrorCount: highErrors.length,
            circuitBreakers: Object.fromEntries(this.circuitBreakers)
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
} else {
    window.ErrorHandler = ErrorHandler;
}
class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 100;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    async handleApiError(error, context = '') {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            context,
            message: error.message,
            stack: error.stack,
            type: this.categorizeError(error)
        };

        this.logError(errorInfo);
        
        switch (errorInfo.type) {
            case 'RATE_LIMIT':
                return this.handleRateLimit(error, context);
            case 'NETWORK':
                return this.handleNetworkError(error, context);
            case 'AUTH':
                return this.handleAuthError(error, context);
            case 'API':
                return this.handleApiResponseError(error, context);
            default:
                return this.handleGenericError(error, context);
        }
    }

    categorizeError(error) {
        if (error.status === 429) return 'RATE_LIMIT';
        if (error.status === 401 || error.status === 403) return 'AUTH';
        if (!navigator.onLine || error.code === 'NETWORK_ERROR') return 'NETWORK';
        if (error.status >= 400 && error.status < 500) return 'API';
        return 'GENERIC';
    }

    async handleRateLimit(error, context) {
        const retryAfter = error.headers?.['retry-after'] || 60;
        this.showUserNotification(
            `Rate limit exceeded. Retrying in ${retryAfter} seconds...`,
            'warning'
        );
        
        await this.delay(retryAfter * 1000);
        return { retry: true, delay: retryAfter * 1000 };
    }

    async handleNetworkError(error, context) {
        if (!navigator.onLine) {
            this.showUserNotification(
                'No internet connection. Please check your network.',
                'error'
            );
            return { retry: false };
        }

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            await this.delay(this.retryDelay * attempt);
            try {
                // Retry the operation
                return { retry: true, attempt };
            } catch (retryError) {
                if (attempt === this.retryAttempts) {
                    this.showUserNotification(
                        'Connection failed after multiple attempts.',
                        'error'
                    );
                    return { retry: false };
                }
            }
        }
    }

    handleAuthError(error, context = '') {
        console.error('Authentication error:', error);
        
        // Special handling for funding page - don't redirect, just show warning
        if (window.location.pathname.includes('funding.html')) {
            this.showNotification('Please ensure you are logged in to access funding features', 'warning');
            return;
        }
        
        // For other pages, redirect to login after showing error
        this.showNotification('Session expired. Redirecting to login...', 'error');
        setTimeout(() => {
            window.location.href = 'login';
        }, 2000);
    }

    handleApiResponseError(error, context) {
        const message = error.response?.data?.message || 'API request failed';
        this.showUserNotification(message, 'error');
        return { retry: false };
    }

    handleGenericError(error, context) {
        console.error('Unexpected error:', error);
        this.showUserNotification(
            'An unexpected error occurred. Please try again.',
            'error'
        );
        return { retry: false };
    }

    logError(errorInfo) {
        this.errorLog.unshift(errorInfo);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog = this.errorLog.slice(0, this.maxLogSize);
        }
        
        // Send to analytics service
        this.sendToAnalytics(errorInfo);
    }

    showUserNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
        // Manual close
        notification.querySelector('.notification-close').onclick = () => {
            notification.remove();
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    sendToAnalytics(errorInfo) {
        // Implementation for sending error data to analytics service
        if (window.gtag) {
            window.gtag('event', 'exception', {
                description: errorInfo.message,
                fatal: false
            });
        }
    }

    getErrorLog() {
        return this.errorLog;
    }

    clearErrorLog() {
        this.errorLog = [];
    }
}

// Global error handler instance
window.errorHandler = new ErrorHandler();

// Global error event listeners
window.addEventListener('error', (event) => {
    window.errorHandler.handleApiError(event.error, 'Global Error');
});

window.addEventListener('unhandledrejection', (event) => {
    window.errorHandler.handleApiError(event.reason, 'Unhandled Promise Rejection');
});