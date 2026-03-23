class MarketNewsService {
    constructor() {
        this.baseUrl = 'https://news-headlines.tradingview.com/headlines';
        this.newsCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.proxyUrl = 'https://api.allorigins.win/raw?url='; // CORS proxy
    }

    async fetchMarketNews(topic = 'general', limit = 10) {
        const cacheKey = `${topic}_${limit}`;
        const cached = this.newsCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            // Map topics to TradingView categories
            const categoryMap = {
                'general': 'base',
                'forex': 'forex',
                'crypto': 'crypto',
                'earnings': 'earnings',
                'ipo': 'ipo',
                'mergers_and_acquisitions': 'ma'
            };

            const category = categoryMap[topic] || 'base';
            
            // TradingView news API endpoint
            const newsUrl = `${this.baseUrl}/${category}`;
            const proxiedUrl = `${this.proxyUrl}${encodeURIComponent(newsUrl)}`;
            
            console.log('Fetching TradingView news from:', category);
            
            const response = await fetch(proxiedUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Process TradingView news data
            const processedNews = this.processTradingViewNews(data, limit);
            
            const newsData = {
                feed: processedNews,
                sentiment: 'TradingView Market News'
            };

            // Cache the result
            this.newsCache.set(cacheKey, {
                data: newsData,
                timestamp: Date.now()
            });

            return newsData;
        } catch (error) {
            console.error('Error fetching TradingView news:', error);
            // Fallback to alternative news source or demo data
            return this.getAlternativeNewsData(topic, limit);
        }
    }

    processTradingViewNews(data, limit) {
        try {
            // TradingView news structure may vary, handle different formats
            let newsItems = [];
            
            if (data && Array.isArray(data.items)) {
                newsItems = data.items;
            } else if (data && Array.isArray(data)) {
                newsItems = data;
            } else if (data && data.news && Array.isArray(data.news)) {
                newsItems = data.news;
            }

            return newsItems.slice(0, limit).map(item => {
                // Normalize TradingView news format to our expected format
                return {
                    title: item.title || item.headline || 'Market Update',
                    summary: item.description || item.summary || item.content || 'Market news update from TradingView',
                    source: item.provider || item.source || 'TradingView',
                    url: item.url || item.link || '#',
                    time_published: item.published || item.timestamp || new Date().toISOString(),
                    overall_sentiment_score: this.calculateSentiment(item.title || item.headline || '')
                };
            });
        } catch (error) {
            console.error('Error processing TradingView news:', error);
            return [];
        }
    }

    calculateSentiment(title) {
        // Simple sentiment analysis based on keywords
        const bullishWords = ['surge', 'rally', 'gains', 'up', 'rise', 'bullish', 'positive', 'growth', 'increase'];
        const bearishWords = ['decline', 'drop', 'fall', 'down', 'bearish', 'negative', 'crash', 'plunge', 'decrease'];
        
        const titleLower = title.toLowerCase();
        let score = 0;
        
        bullishWords.forEach(word => {
            if (titleLower.includes(word)) score += 0.1;
        });
        
        bearishWords.forEach(word => {
            if (titleLower.includes(word)) score -= 0.1;
        });
        
        return Math.max(-0.5, Math.min(0.5, score)).toString();
    }

    async getAlternativeNewsData(topic, limit) {
        try {
            // Alternative: Use a different news API as fallback
            const alternativeNews = await this.fetchFromAlternativeSource(topic, limit);
            if (alternativeNews && alternativeNews.length > 0) {
                return {
                    feed: alternativeNews,
                    sentiment: 'Alternative news source'
                };
            }
        } catch (error) {
            console.error('Alternative news source failed:', error);
        }
        
        // Final fallback to enhanced demo data
        return this.getEnhancedDemoData(topic, limit);
    }

    async fetchFromAlternativeSource(topic, limit) {
        try {
            // Import API config
            const { default: APIConfig } = await import('./api-config.js');
            const apiConfig = new APIConfig();
            const newsApiKey = apiConfig.getApiKey('newsapi');
            
            if (!newsApiKey || newsApiKey === 'YOUR_NEWS_API_KEY') {
                throw new Error('No alternative API key configured');
            }
            
            const topicMap = {
                'general': 'business',
                'forex': 'business',
                'crypto': 'technology',
                'earnings': 'business',
                'ipo': 'business',
                'mergers_and_acquisitions': 'business'
            };
            
            const category = topicMap[topic] || 'business';
            const url = `https://newsapi.org/v2/top-headlines?category=${category}&pageSize=${limit}&apiKey=${newsApiKey}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.articles) {
                return data.articles.map(article => ({
                    title: article.title,
                    summary: article.description || 'No description available',
                    source: article.source.name,
                    url: article.url,
                    time_published: article.publishedAt,
                    overall_sentiment_score: this.calculateSentiment(article.title)
                }));
            }
        } catch (error) {
            console.error('Alternative news fetch failed:', error);
        }
        return [];
    }

    getEnhancedDemoData(topic, limit) {
        const topicNews = {
            general: [
                {
                    title: "Global Markets Show Mixed Signals Amid Economic Uncertainty",
                    summary: "Major indices display varied performance as investors weigh inflation concerns against growth prospects in key economies worldwide.",
                    source: "TradingView",
                    url: "#",
                    time_published: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                    overall_sentiment_score: "0.05"
                },
                {
                    title: "Central Bank Policies Drive Currency Volatility",
                    summary: "Recent monetary policy decisions from major central banks continue to influence foreign exchange markets and cross-currency trading patterns.",
                    source: "TradingView",
                    url: "#",
                    time_published: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                    overall_sentiment_score: "-0.1"
                }
            ],
            forex: [
                {
                    title: "EUR/USD Reaches Key Resistance Level",
                    summary: "The euro-dollar pair approaches critical technical resistance as European economic data shows signs of stabilization.",
                    source: "TradingView",
                    url: "#",
                    time_published: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    overall_sentiment_score: "0.15"
                },
                {
                    title: "GBP Strengthens on Positive Economic Outlook",
                    summary: "British pound gains momentum following encouraging employment figures and revised GDP growth estimates.",
                    source: "TradingView",
                    url: "#",
                    time_published: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                    overall_sentiment_score: "0.2"
                }
            ],
            crypto: [
                {
                    title: "Bitcoin Consolidates Above $40,000 Support",
                    summary: "Leading cryptocurrency maintains stability above key psychological level as institutional adoption continues to grow.",
                    source: "TradingView",
                    url: "#",
                    time_published: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
                    overall_sentiment_score: "0.18"
                },
                {
                    title: "Ethereum Network Upgrade Boosts Market Confidence",
                    summary: "Recent protocol improvements and reduced transaction fees drive positive sentiment in the Ethereum ecosystem.",
                    source: "TradingView",
                    url: "#",
                    time_published: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
                    overall_sentiment_score: "0.25"
                }
            ]
        };

        const newsForTopic = topicNews[topic] || topicNews.general;
        return {
            feed: newsForTopic.slice(0, limit),
            sentiment: "Enhanced demo data with TradingView integration"
        };
    }

    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) {
            return 'Just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }
    }

    getSentimentIcon(score) {
        if (score > 0.1) return 'fas fa-arrow-up';
        if (score < -0.1) return 'fas fa-arrow-down';
        return 'fas fa-minus';
    }

    getSentimentClass(score) {
        if (score > 0.1) return 'positive';
        if (score < -0.1) return 'negative';
        return 'neutral';
    }

    getSentimentText(score) {
        if (score > 0.1) return 'Bullish';
        if (score < -0.1) return 'Bearish';
        return 'Neutral';
    }
}

class MarketNewsUI {
    constructor() {
        this.newsService = new MarketNewsService();
        this.currentTopic = 'general';
        this.isLoading = false;
        this.initializeEventListeners();
        this.loadInitialNews();
    }

    initializeEventListeners() {
        const refreshBtn = document.getElementById('refreshNewsBtn');
        const topicFilter = document.getElementById('newsTopicFilter');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshNews());
        }

        if (topicFilter) {
            topicFilter.addEventListener('change', (e) => {
                this.currentTopic = e.target.value;
                this.loadNews();
            });
        }
    }

    async loadInitialNews() {
        await this.loadNews();
        // Auto-refresh every 10 minutes
        setInterval(() => this.loadNews(), 10 * 60 * 1000);
    }

    async loadNews() {
        if (this.isLoading) return;

        this.showLoading();
        
        try {
            const newsData = await this.newsService.fetchMarketNews(this.currentTopic, 8);
            this.displayNews(newsData.feed);
            this.hideError();
        } catch (error) {
            console.error('Error loading news:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    async refreshNews() {
        // Clear cache for current topic
        this.newsService.newsCache.clear();
        await this.loadNews();
    }

    showLoading() {
        this.isLoading = true;
        const loadingEl = document.getElementById('newsLoading');
        const refreshBtn = document.getElementById('refreshNewsBtn');
        
        if (loadingEl) loadingEl.style.display = 'flex';
        if (refreshBtn) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
        }
    }

    hideLoading() {
        this.isLoading = false;
        const loadingEl = document.getElementById('newsLoading');
        const refreshBtn = document.getElementById('refreshNewsBtn');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (refreshBtn) {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }

    showError(message) {
        const errorEl = document.getElementById('newsError');
        const newsListEl = document.getElementById('marketNewsList');
        
        if (errorEl) {
            errorEl.style.display = 'flex';
            errorEl.querySelector('span').textContent = message;
        }
        if (newsListEl) newsListEl.innerHTML = '';
    }

    hideError() {
        const errorEl = document.getElementById('newsError');
        if (errorEl) errorEl.style.display = 'none';
    }

    displayNews(newsItems) {
        const newsListEl = document.getElementById('marketNewsList');
        if (!newsListEl) return;

        if (!newsItems || newsItems.length === 0) {
            newsListEl.innerHTML = `
                <div class="no-news">
                    <i class="fas fa-newspaper"></i>
                    <span>No news available for this topic.</span>
                </div>
            `;
            return;
        }

        newsListEl.innerHTML = newsItems.map(item => {
            const sentimentScore = parseFloat(item.overall_sentiment_score || 0);
            const sentimentClass = this.newsService.getSentimentClass(sentimentScore);
            const sentimentIcon = this.newsService.getSentimentIcon(sentimentScore);
            const sentimentText = this.newsService.getSentimentText(sentimentScore);
            const timeAgo = this.newsService.formatTimeAgo(item.time_published);

            return `
                <div class="news-item" onclick="window.open('${item.url}', '_blank')">
                    <div class="news-item-header">
                        <h4 class="news-title">${item.title}</h4>
                        <span class="news-source">${item.source}</span>
                    </div>
                    <p class="news-summary">${item.summary}</p>
                    <div class="news-meta">
                        <div class="news-time">
                            <i class="fas fa-clock"></i>
                            <span>${timeAgo}</span>
                        </div>
                        <div class="news-sentiment ${sentimentClass}">
                            <i class="${sentimentIcon}"></i>
                            <span>${sentimentText}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Initialize market news when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.marketNewsUI = new MarketNewsUI();
    });
} else {
    window.marketNewsUI = new MarketNewsUI();
}

export { MarketNewsService, MarketNewsUI };