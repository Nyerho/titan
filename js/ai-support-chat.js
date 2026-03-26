// AI Support Chat System
import ChatService from './chat-service.js';
import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

class AISupportChat {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.isTyping = false;
        this.chatService = new ChatService();
        this.currentUser = null;
        this.conversationId = null;
        this.messageListener = null;
        this.init();
    }

    init() {
        this.createChatElements();
        this.bindEvents();
        this.setupAuthListener();
        this.addWelcomeMessage();
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            if (user && this.conversationId) {
                this.setupMessageListener();
            }
        });
    }

    async setupMessageListener() {
        if (!this.currentUser || !this.conversationId) return;
        
        // Stop existing listener
        if (this.messageListener) {
            this.messageListener();
        }
        
        // Start new listener
        this.messageListener = this.chatService.listenToMessages(
            this.conversationId,
            (messages) => {
                this.displayMessages(messages);
            }
        );
    }

    displayMessages(messages) {
        const messagesContainer = document.getElementById('chatMessages');
        // Clear existing messages except welcome message
        const welcomeMsg = messagesContainer.querySelector('.welcome-message');
        messagesContainer.innerHTML = '';
        if (welcomeMsg) {
            messagesContainer.appendChild(welcomeMsg);
        }
        
        messages.forEach(message => {
            this.addMessageToUI(message.text, message.senderType, message.senderName, message.timestamp);
        });
        
        // Mark messages as read
        if (this.conversationId) {
            this.chatService.markMessagesAsRead(this.conversationId, 'user');
        }
    }

    createChatElements() {
        // Create chat button
        const chatButton = document.createElement('button');
        chatButton.className = 'ai-chat-button';
        chatButton.innerHTML = '<i class="fas fa-comments"></i>';
        chatButton.id = 'aiChatButton';
        document.body.appendChild(chatButton);

        // Create chat container
        const chatContainer = document.createElement('div');
        chatContainer.className = 'ai-chat-container';
        chatContainer.id = 'aiChatContainer';
        chatContainer.innerHTML = `
            <div class="ai-chat-header">
                <button class="chat-close-btn" id="chatCloseBtn">
                    <i class="fas fa-times"></i>
                </button>
                <h3>
                    <i class="fas fa-robot"></i>
                    AI Support Assistant
                </h3>
                <p>How can I help you today?</p>
                <div class="ai-status">AI Online</div>
            </div>
            <div class="ai-chat-messages" id="chatMessages">
                <!-- Messages will be added here -->
            </div>
            <div class="ai-chat-input">
                <div class="quick-actions" id="quickActions">
                    <button class="quick-action" data-message="How do I register an account?">Registration Help</button>
                    <button class="quick-action" data-message="I'm having trouble logging in">Login Issues</button>
                    <button class="quick-action" data-message="How do I connect my wallet?">Wallet Connection</button>
                    <button class="quick-action" data-message="How do I make a deposit?">Deposit Help</button>
                </div>
                <div class="chat-input-container">
                    <textarea class="chat-input" id="chatInput" placeholder="Type your message..." rows="1"></textarea>
                    <button class="chat-send-btn" id="chatSendBtn">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(chatContainer);
    }

    bindEvents() {
        const chatButton = document.getElementById('aiChatButton');
        const chatContainer = document.getElementById('aiChatContainer');
        const closeBtn = document.getElementById('chatCloseBtn');
        const sendBtn = document.getElementById('chatSendBtn');
        const chatInput = document.getElementById('chatInput');
        const quickActions = document.getElementById('quickActions');

        chatButton.addEventListener('click', () => this.toggleChat());
        closeBtn.addEventListener('click', () => this.closeChat());
        sendBtn.addEventListener('click', () => this.sendMessage());
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        chatInput.addEventListener('input', () => {
            this.autoResize(chatInput);
        });

        // Quick actions
        quickActions.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-action')) {
                const message = e.target.dataset.message;
                this.sendMessage(message);
            }
        });

        // Close chat when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !chatContainer.contains(e.target) && !chatButton.contains(e.target)) {
                this.closeChat();
            }
        });
    }

    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    openChat() {
        const chatContainer = document.getElementById('aiChatContainer');
        const chatButton = document.getElementById('aiChatButton');
        
        // Enhanced mobile-specific fixes
        if (window.innerWidth <= 768) {
            // Prevent body scroll when chat is open
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            
            // Force visibility and positioning
            chatContainer.style.display = 'flex';
            chatContainer.style.visibility = 'visible';
            chatContainer.style.opacity = '1';
            chatContainer.style.pointerEvents = 'auto';
            chatContainer.style.position = 'fixed';
            chatContainer.style.top = '0';
            chatContainer.style.left = '0';
            chatContainer.style.right = '0';
            chatContainer.style.bottom = '0';
            chatContainer.style.width = '100vw';
            chatContainer.style.height = '100vh';
            
            // Ensure highest z-index
            chatContainer.style.zIndex = '1020';
            chatButton.style.zIndex = '1021';
        }
        
        chatContainer.classList.add('open');
        chatButton.classList.add('active');
        chatButton.innerHTML = '<i class="fas fa-times"></i>';
        this.isOpen = true;
        
        // Focus on input
        setTimeout(() => {
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.focus();
            }
        }, 300);
    }

    closeChat() {
        const chatContainer = document.getElementById('aiChatContainer');
        const chatButton = document.getElementById('aiChatButton');
        
        // Enhanced mobile-specific fixes
        if (window.innerWidth <= 768) {
            // Restore body scroll and positioning
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            
            // Clear inline styles applied during open
            chatContainer.style.display = '';
            chatContainer.style.visibility = '';
            chatContainer.style.opacity = '';
            chatContainer.style.pointerEvents = '';
            chatContainer.style.position = '';
            chatContainer.style.top = '';
            chatContainer.style.left = '';
            chatContainer.style.right = '';
            chatContainer.style.bottom = '';
            chatContainer.style.width = '';
            chatContainer.style.height = '';
            chatContainer.style.zIndex = '';
            chatButton.style.zIndex = '';
        }
        
        chatContainer.classList.remove('open');
        chatButton.classList.remove('active');
        chatButton.innerHTML = '<i class="fas fa-comments"></i>';
        this.isOpen = false;
    }

    async sendMessage(message = null) {
        const chatInput = document.getElementById('chatInput');
        const messageText = message || chatInput.value.trim();
        
        if (!messageText) return;
        
        // Clear input
        if (!message) {
            chatInput.value = '';
            this.autoResize(chatInput);
        }
        
        try {
            if (!this.currentUser) {
                // If user not logged in, show AI response
                this.addMessageToUI(messageText, 'user');
                this.showTypingIndicator();
                setTimeout(() => {
                    this.hideTypingIndicator();
                    const aiResponse = this.chatService.getAIResponse(messageText);
                    this.addMessageToUI(aiResponse, 'ai');
                }, 1500);
                return;
            }
            
            // Get or create conversation
            if (!this.conversationId) {
                const conversation = await this.chatService.getOrCreateConversation(
                    this.currentUser.uid,
                    this.currentUser.email
                );
                this.conversationId = conversation.id;
                this.setupMessageListener();
            }
            
            // Send message through chat service
            await this.chatService.sendMessage(
                this.conversationId,
                messageText,
                'user',
                this.currentUser.uid,
                this.currentUser.displayName || this.currentUser.email
            );
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessageToUI('Sorry, there was an error sending your message. Please try again.', 'ai');
        }
    }

    addMessageToUI(text, senderType, senderName = null, timestamp = null) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${senderType}`;
        
        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${senderType}`;
        
        if (senderType === 'ai') {
            avatar.innerHTML = '<i class="fas fa-robot"></i>';
        } else if (senderType === 'admin') {
            avatar.innerHTML = '<i class="fas fa-user-tie"></i>';
        } else {
            avatar.innerHTML = '<i class="fas fa-user"></i>';
        }
        
        const content = document.createElement('div');
        content.className = `message-content ${senderType}`;
        
        if (senderType === 'admin' && senderName) {
            const adminLabel = document.createElement('div');
            adminLabel.className = 'admin-label';
            adminLabel.textContent = `${senderName} (Support)`;
            content.appendChild(adminLabel);
        }
        
        const messageText = document.createElement('div');
        messageText.innerHTML = text;
        content.appendChild(messageText);
        
        const time = document.createElement('div');
        time.className = 'message-time';
        if (timestamp && timestamp.toDate) {
            time.textContent = timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } else {
            time.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        content.appendChild(time);
        
        messageElement.appendChild(avatar);
        messageElement.appendChild(content);
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Update the existing addMessage method to use addMessageToUI
    addMessage(text, sender) {
        this.addMessageToUI(text, sender);
        this.messages.push({ text, sender, timestamp: new Date() });
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatMessages');
        const typingElement = document.createElement('div');
        typingElement.className = 'chat-message ai';
        typingElement.id = 'typingIndicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar ai';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
        
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        
        typingElement.appendChild(avatar);
        typingElement.appendChild(indicator);
        messagesContainer.appendChild(typingElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        this.isTyping = true;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        this.isTyping = false;
    }

    generateAIResponse(userMessage) {
        this.hideTypingIndicator();
        
        const responses = this.getAIResponse(userMessage.toLowerCase());
        const response = responses[Math.floor(Math.random() * responses.length)];
        
        this.addMessage(response, 'ai');
    }

    getAIResponse(message) {
        // Registration related
        if (message.includes('register') || message.includes('sign up') || message.includes('account')) {
            return [
                "To register an account, click the 'Sign Up' button on the homepage and fill in your details. You'll need a valid email address and a strong password. After registration, check your email for verification.",
                "Registration is simple! Visit our sign-up page, enter your email, create a secure password, and verify your email. If you need help with any step, I'm here to assist!",
                "Creating an account takes just a few minutes. Go to the registration page, provide your information, and follow the email verification process. Need help with a specific step?"
            ];
        }
        
        // Login issues
        if (message.includes('login') || message.includes('log in') || message.includes('sign in')) {
            return [
                "Having trouble logging in? First, make sure you're using the correct email and password. If you forgot your password, use the 'Forgot Password' link. Clear your browser cache if the issue persists.",
                "Login issues can be frustrating! Try resetting your password, checking for typos, or using a different browser. Make sure your account is verified via email too.",
                "For login problems, verify your credentials, check your internet connection, and ensure your account is activated. Still having trouble? Try the password reset option."
            ];
        }
        
        // Wallet connection
        if (message.includes('wallet') || message.includes('connect') || message.includes('metamask') || message.includes('keplr')) {
            return [
                "To connect your wallet, go to the Wallet Portal and choose your preferred wallet (MetaMask, WalletConnect, Coinbase, or Keplr). Make sure your wallet extension is installed and unlocked.",
                "Wallet connection is easy! Visit our Wallet Portal, select your wallet type, and follow the prompts. Ensure your wallet extension is active and you have sufficient funds for transactions.",
                "Connect your wallet through our dedicated Wallet Portal. We support MetaMask, WalletConnect, Coinbase Wallet, and Keplr. Need help with a specific wallet?"
            ];
        }
        
        // Deposit help
        if (message.includes('deposit') || message.includes('fund') || message.includes('money')) {
            return [
                "To make a deposit, go to the Funding page and choose your preferred method (crypto, bank transfer, or card). Follow the instructions for your selected payment method.",
                "Deposits are processed through our secure Funding portal. Select your deposit method, enter the amount, and follow the verification steps. Processing times vary by method.",
                "You can deposit funds via cryptocurrency, bank transfer, or credit/debit card. Visit the Funding section and select your preferred option for detailed instructions."
            ];
        }
        
        // Trading help
        if (message.includes('trade') || message.includes('trading') || message.includes('buy') || message.includes('sell')) {
            return [
                "Our trading platform offers various instruments including forex, crypto, and indices. Start by funding your account, then navigate to the Platform section to begin trading.",
                "Trading is available 24/7 on our platform. Ensure you have funds in your account, understand the risks, and start with small positions if you're new to trading.",
                "Access our trading platform through the Platform menu. You can trade forex, cryptocurrencies, and indices with competitive spreads and advanced tools."
            ];
        }
        
        // KYC verification
        if (message.includes('kyc') || message.includes('verification') || message.includes('verify') || message.includes('identity')) {
            return [
                "KYC verification helps secure your account. Upload a government-issued ID and proof of address through the KYC Portal. Verification typically takes 1-3 business days.",
                "To complete KYC verification, visit the KYC Portal and submit your identification documents. This process ensures account security and regulatory compliance.",
                "Identity verification is required for higher withdrawal limits. Use our KYC Portal to upload your documents securely. The process is usually completed within 24-72 hours."
            ];
        }
        
        // General help
        return [
            "I'm here to help! Could you please provide more details about what you need assistance with? I can help with registration, login issues, wallet connections, deposits, trading, and more.",
            "Thanks for reaching out! I can assist with account setup, technical issues, trading questions, and general platform navigation. What specific area would you like help with?",
            "I'm your AI support assistant! I can help with various topics including account management, deposits/withdrawals, trading, and technical support. How can I assist you today?",
            "Hello! I'm here to provide instant support. Whether you need help with registration, wallet connections, trading, or any other platform features, just let me know!"
        ];
    }

    addWelcomeMessage() {
        setTimeout(() => {
            this.addMessage(
                "Welcome to TitanTrades! I'm your AI support assistant. I can help you with registration, login issues, wallet connections, deposits, trading, and more. How can I assist you today?",
                'ai'
            );
        }, 500);
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }
}

// Initialize AI Support Chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AISupportChat();
});
