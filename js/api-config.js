// API Configuration and Credentials Management
class APIConfig {
    constructor() {
        this.apis = {
            alphaVantage: {
                baseUrl: 'https://www.alphavantage.co/query',
                apiKey: this.getApiKey('ALPHA_VANTAGE_API_KEY'),
                rateLimit: 5, // requests per minute for free tier
                endpoints: {
                    quote: 'GLOBAL_QUOTE',
                    intraday: 'TIME_SERIES_INTRADAY',
                    forex: 'FX_INTRADAY',
                    crypto: 'DIGITAL_CURRENCY_INTRADAY'
                }
            },
            polygon: {
                baseUrl: 'https://api.polygon.io',
                apiKey: this.getApiKey('POLYGON_API_KEY'),
                rateLimit: 1000, // requests per minute
                endpoints: {
                    quote: '/v2/last/trade',
                    aggregates: '/v2/aggs/ticker',
                    forex: '/v1/last_quote/currencies',
                    crypto: '/v1/last/crypto'
                }
            },
            finnhub: {
                baseUrl: 'https://finnhub.io/api/v1',
                wsUrl: 'wss://ws.finnhub.io',
                apiKey: this.getApiKey('FINNHUB_API_KEY'),
                rateLimit: 60, // requests per minute for free tier
                endpoints: {
                    quote: '/quote',
                    candles: '/stock/candle',
                    forex: '/forex/rates',
                    crypto: '/crypto/candle'
                }
            },
            sendgrid: {
                baseUrl: 'https://api.sendgrid.com/v3',
                apiKey: this.getApiKey('SENDGRID_API_KEY'),
                endpoints: {
                    send: '/mail/send',
                    templates: '/templates'
                }
            },
            newsapi: {
                baseUrl: 'https://newsapi.org/v2',
                apiKey: this.getApiKey('NEWS_API_KEY'),
                rateLimit: 1000,
                endpoints: {
                    topHeadlines: '/top-headlines',
                    everything: '/everything'
                }
            },
            metaApi: {
                baseUrl: 'https://mt-client-api-v1.london.agiliumtrade.ai',
                wsUrl: 'wss://mt-client-api-v1.london.agiliumtrade.ai',
                apiKey: this.getApiKey('METAAPI_TOKEN') || null,
                accountId: this.getApiKey('METAAPI_ACCOUNT_ID') || null
            }
        };
        
        this.rateLimiters = new Map();
        this.initRateLimiters();
    }

    // Secure API key retrieval
    getApiKey(keyName) {
        // Updated API key mappings
        const keyMappings = {
            'ALPHA_VANTAGE_API_KEY': null,
            'FINNHUB_API_KEY': null,
            'POLYGON_API_KEY': null,
            'SENDGRID_API_KEY': null,
            'NEWS_API_KEY': null,
            'METAAPI_TOKEN': null, // Add your MetaAPI token here or set to null to disable
            'METAAPI_ACCOUNT_ID': null // Add your MetaAPI account ID here or set to null to disable
        };
        
        if (keyMappings[keyName]) {
            return keyMappings[keyName];
        }
        
        // In production, use environment variables or secure storage
        if (typeof process !== 'undefined' && process.env) {
            return process.env[keyName];
        }
        
        // Development fallback - store in localStorage
        const stored = localStorage.getItem(`api_${keyName}`);
        if (!stored) {
            console.warn(`API key ${keyName} not found. Please configure in settings.`);
            return null;
        }
        
        try {
            return this.decrypt(stored);
        } catch (error) {
            console.error('Failed to decrypt API key:', error);
            return null;
        }
    }

    // Simple encryption for development (use proper encryption in production)
    encrypt(text) {
        return btoa(text); // Base64 encoding
    }

    decrypt(encryptedText) {
        return atob(encryptedText); // Base64 decoding
    }

    // Store API key securely
    setApiKey(keyName, value) {
        if (typeof process !== 'undefined' && process.env) {
            process.env[keyName] = value;
        } else {
            localStorage.setItem(`api_${keyName}`, this.encrypt(value));
        }
    }

    // Initialize rate limiters for each API
    initRateLimiters() {
        Object.keys(this.apis).forEach(apiName => {
            const api = this.apis[apiName];
            if (api.rateLimit) {
                this.rateLimiters.set(apiName, {
                    requests: [],
                    limit: api.rateLimit,
                    window: 60000 // 1 minute
                });
            }
        });
    }

    // Check if API request is within rate limit
    checkRateLimit(apiName) {
        const limiter = this.rateLimiters.get(apiName);
        if (!limiter) return true;

        const now = Date.now();
        limiter.requests = limiter.requests.filter(time => now - time < limiter.window);
        
        if (limiter.requests.length >= limiter.limit) {
            return false;
        }
        
        limiter.requests.push(now);
        return true;
    }

    // Get API configuration
    getApiConfig(apiName) {
        return this.apis[apiName] || null;
    }

    // Validate API configuration
    validateConfig(apiName) {
        const config = this.apis[apiName];
        if (!config) {
            throw new Error(`API configuration not found: ${apiName}`);
        }
        
        if (!config.apiKey) {
            throw new Error(`API key not configured for: ${apiName}`);
        }
        
        return true;
    }
}

// Create instance and export it
const API_CONFIG = new APIConfig();

// Export for ES6 modules
export { API_CONFIG };
export default API_CONFIG;

// Export for CommonJS (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIConfig, API_CONFIG };
} else {
    window.APIConfig = APIConfig;
    window.API_CONFIG = API_CONFIG;
}

// Admin API Configuration
export const adminApiConfig = {
    baseUrl: (() => {
        // Force localhost for development - more reliable detection
        const isLocal = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' || 
                       window.location.port === '5500' || // Live Server
                       window.location.port === '3000' || // React dev server
                       window.location.protocol === 'file:' || // Local file
                       window.location.href.includes('localhost');
        
        const storedBaseUrl = localStorage.getItem('admin_api_baseUrl');
        if (storedBaseUrl) return storedBaseUrl;
        return isLocal ? 'http://localhost:3001' : window.location.origin;
    })(),
    endpoints: {
        deleteUser: '/api/users',
        getUsers: '/api/users',
        updateUser: '/api/users'
    }
};
