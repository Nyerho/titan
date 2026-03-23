class ApiTestFramework {
    constructor() {
        this.testResults = [];
        this.sandboxMode = true;
        this.testEndpoints = {
            marketData: '/api/v1/market-data/test',
            trading: '/api/v1/trading/test',
            account: '/api/v1/account/test'
        };
    }

    async runAllTests() {
        console.log('🧪 Starting API Integration Tests...');
        
        const tests = [
            this.testMarketDataConnection(),
            this.testTradingApiConnection(),
            this.testAccountApiConnection(),
            this.testWebSocketConnection(),
            this.testErrorHandling(),
            this.testRateLimiting()
        ];

        const results = await Promise.allSettled(tests);
        this.generateTestReport(results);
        return results;
    }

    async testMarketDataConnection() {
        const testName = 'Market Data API Connection';
        try {
            const response = await fetch('/api/v1/market-data/symbols', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getTestToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            this.logTestResult(testName, 'PASS', {
                status: response.status,
                dataReceived: Array.isArray(data.symbols),
                symbolCount: data.symbols?.length || 0
            });

            return { test: testName, status: 'PASS', data };
        } catch (error) {
            this.logTestResult(testName, 'FAIL', { error: error.message });
            return { test: testName, status: 'FAIL', error };
        }
    }

    async testTradingApiConnection() {
        const testName = 'Trading API Connection';
        try {
            // Test order validation (should not place real order)
            const testOrder = {
                symbol: 'EURUSD',
                side: 'buy',
                quantity: 0.01,
                type: 'market',
                test: true
            };

            const response = await fetch('/api/v1/trading/validate-order', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.getTestToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testOrder)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            this.logTestResult(testName, 'PASS', {
                orderValidation: result.valid,
                estimatedCost: result.estimatedCost
            });

            return { test: testName, status: 'PASS', result };
        } catch (error) {
            this.logTestResult(testName, 'FAIL', { error: error.message });
            return { test: testName, status: 'FAIL', error };
        }
    }

    async testAccountApiConnection() {
        const testName = 'Account API Connection';
        try {
            const response = await fetch('/api/v1/account/balance', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getTestToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const balance = await response.json();
            
            this.logTestResult(testName, 'PASS', {
                balanceReceived: typeof balance.total === 'number',
                currency: balance.currency
            });

            return { test: testName, status: 'PASS', balance };
        } catch (error) {
            this.logTestResult(testName, 'FAIL', { error: error.message });
            return { test: testName, status: 'FAIL', error };
        }
    }

    async testWebSocketConnection() {
        const testName = 'WebSocket Connection';
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket('wss://api.example.com/ws/test');
                let connectionEstablished = false;

                const timeout = setTimeout(() => {
                    if (!connectionEstablished) {
                        ws.close();
                        this.logTestResult(testName, 'FAIL', { error: 'Connection timeout' });
                        resolve({ test: testName, status: 'FAIL', error: 'Timeout' });
                    }
                }, 5000);

                ws.onopen = () => {
                    connectionEstablished = true;
                    clearTimeout(timeout);
                    
                    // Send test message
                    ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                };

                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'pong') {
                        ws.close();
                        this.logTestResult(testName, 'PASS', { latency: Date.now() - data.timestamp });
                        resolve({ test: testName, status: 'PASS', data });
                    }
                };

                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    this.logTestResult(testName, 'FAIL', { error: 'WebSocket error' });
                    resolve({ test: testName, status: 'FAIL', error });
                };
            } catch (error) {
                this.logTestResult(testName, 'FAIL', { error: error.message });
                resolve({ test: testName, status: 'FAIL', error });
            }
        });
    }

    async testErrorHandling() {
        const testName = 'Error Handling';
        try {
            // Intentionally trigger a 404 error
            const response = await fetch('/api/v1/nonexistent-endpoint', {
                headers: {
                    'Authorization': `Bearer ${this.getTestToken()}`
                }
            });

            if (response.status === 404) {
                this.logTestResult(testName, 'PASS', { 
                    errorHandled: true,
                    statusCode: response.status 
                });
                return { test: testName, status: 'PASS' };
            } else {
                throw new Error('Expected 404 error not received');
            }
        } catch (error) {
            this.logTestResult(testName, 'FAIL', { error: error.message });
            return { test: testName, status: 'FAIL', error };
        }
    }

    async testRateLimiting() {
        const testName = 'Rate Limiting';
        try {
            const requests = [];
            // Send multiple rapid requests to test rate limiting
            for (let i = 0; i < 10; i++) {
                requests.push(
                    fetch('/api/v1/market-data/price/EURUSD', {
                        headers: {
                            'Authorization': `Bearer ${this.getTestToken()}`
                        }
                    })
                );
            }

            const responses = await Promise.all(requests);
            const rateLimited = responses.some(r => r.status === 429);

            this.logTestResult(testName, rateLimited ? 'PASS' : 'WARN', {
                rateLimitingActive: rateLimited,
                totalRequests: requests.length
            });

            return { test: testName, status: rateLimited ? 'PASS' : 'WARN' };
        } catch (error) {
            this.logTestResult(testName, 'FAIL', { error: error.message });
            return { test: testName, status: 'FAIL', error };
        }
    }

    logTestResult(testName, status, details = {}) {
        const result = {
            timestamp: new Date().toISOString(),
            test: testName,
            status,
            details
        };
        
        this.testResults.push(result);
        
        const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${emoji} ${testName}: ${status}`, details);
    }

    generateTestReport(results) {
        const passed = results.filter(r => r.value?.status === 'PASS').length;
        const failed = results.filter(r => r.value?.status === 'FAIL').length;
        const warnings = results.filter(r => r.value?.status === 'WARN').length;

        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: results.length,
                passed,
                failed,
                warnings,
                successRate: `${((passed / results.length) * 100).toFixed(1)}%`
            },
            details: this.testResults
        };

        console.log('📊 API Test Report:', report);
        
        // Store report for later analysis
        localStorage.setItem('apiTestReport', JSON.stringify(report));
        
        return report;
    }

    getTestToken() {
        // Return sandbox/test API token
        return 'test_token_' + Date.now();
    }

    displayTestResults() {
        const modal = document.createElement('div');
        modal.className = 'test-results-modal';
        modal.innerHTML = `
            <div class="test-results-content">
                <h3>API Test Results</h3>
                <div class="test-summary">
                    ${this.testResults.map(result => `
                        <div class="test-item ${result.status.toLowerCase()}">
                            <span class="test-name">${result.test}</span>
                            <span class="test-status">${result.status}</span>
                        </div>
                    `).join('')}
                </div>
                <button onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
}

// Initialize API testing framework
window.apiTester = new ApiTestFramework();