// AI Support Chat System - Standalone Version (No ES6 Modules)
class AISupportChat {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.isTyping = false;
        this.currentUser = null;
        this.conversationId = null;
        this.messageListener = null;
        this.init();
    }

    init() {
        // Wait for Firebase to be available
        if (typeof firebase === 'undefined') {
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.createChatElements();
        this.bindEvents();
        this.setupAuthListener();
        this.addWelcomeMessage();
    }

    setupAuthListener() {
        if (firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                this.currentUser = user;
                if (user && this.conversationId) {
                    this.setupMessageListener();
                }
            });
        }
    }

    async setupMessageListener() {
        if (!this.currentUser || !this.conversationId) return;
        
        // Stop existing listener
        if (this.messageListener) {
            this.messageListener();
        }
        
        // Start new listener
        const messagesRef = firebase.firestore()
            .collection('conversations')
            .doc(this.conversationId)
            .collection('messages')
            .orderBy('timestamp', 'asc');
            
        this.messageListener = messagesRef.onSnapshot((snapshot) => {
            const messages = [];
            snapshot.forEach((doc) => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            this.displayMessages(messages);
        });
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
            this.markMessagesAsRead(this.conversationId, 'user');
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
                    <textarea id="chatInput" placeholder="Type your message..." rows="1"></textarea>
                    <button id="sendBtn" class="send-btn">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(chatContainer);
    }

    bindEvents() {
        // Chat button click
        document.getElementById('aiChatButton').addEventListener('click', () => {
            this.toggleChat();
        });

        // Close button click
        document.getElementById('chatCloseBtn').addEventListener('click', () => {
            this.closeChat();
        });

        // Send button click
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter key press
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Quick action buttons
        document.getElementById('quickActions').addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-action')) {
                const message = e.target.getAttribute('data-message');
                this.sendMessage(message);
            }
        });

        // Auto-resize textarea
        document.getElementById('chatInput').addEventListener('input', (e) => {
            this.autoResize(e.target);
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
        
        chatContainer.classList.add('open');
        chatButton.style.display = 'none';
        this.isOpen = true;
        
        // Focus on input
        setTimeout(() => {
            document.getElementById('chatInput').focus();
        }, 300);
    }

    closeChat() {
        const chatContainer = document.getElementById('aiChatContainer');
        const chatButton = document.getElementById('aiChatButton');
        
        chatContainer.classList.remove('open');
        setTimeout(() => {
            chatButton.style.display = 'flex';
        }, 300);
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
                    const aiResponse = this.getAIResponse(messageText);
                    this.addMessageToUI(aiResponse, 'ai');
                }, 1500);
                return;
            }
            
            // Get or create conversation
            if (!this.conversationId) {
                const conversation = await this.getOrCreateConversation(
                    this.currentUser.uid,
                    this.currentUser.email
                );
                this.conversationId = conversation.id;
                this.setupMessageListener();
            }
            
            // Send message through Firestore
            await this.sendMessageToFirestore(
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

    async getOrCreateConversation(userId, userEmail) {
        try {
            const conversationsRef = firebase.firestore().collection('conversations');
            const q = conversationsRef.where('userId', '==', userId);
            const querySnapshot = await q.get();
            
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            
            // Create new conversation
            const newConversation = {
                userId: userId,
                userEmail: userEmail,
                status: 'active',
                lastMessage: null,
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
                unreadByAdmin: 0,
                unreadByUser: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = await conversationsRef.add(newConversation);
            return { id: docRef.id, ...newConversation };
        } catch (error) {
            console.error('Error creating conversation:', error);
            throw error;
        }
    }

    async sendMessageToFirestore(conversationId, message, senderType, senderId, senderName) {
        try {
            const messagesRef = firebase.firestore()
                .collection('conversations')
                .doc(conversationId)
                .collection('messages');
                
            const messageData = {
                text: message,
                senderType: senderType,
                senderId: senderId,
                senderName: senderName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            };
            
            await messagesRef.add(messageData);
            
            // Update conversation last message
            const conversationRef = firebase.firestore().collection('conversations').doc(conversationId);
            const updateData = {
                lastMessage: message,
                lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (senderType === 'user') {
                updateData.unreadByAdmin = 1;
            } else if (senderType === 'admin') {
                updateData.unreadByUser = 1;
            }
            
            await conversationRef.update(updateData);
            
            return messageData;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async markMessagesAsRead(conversationId, userType) {
        try {
            const conversationRef = firebase.firestore().collection('conversations').doc(conversationId);
            const updateData = {};
            
            if (userType === 'admin') {
                updateData.unreadByAdmin = 0;
            } else {
                updateData.unreadByUser = 0;
            }
            
            await conversationRef.update(updateData);
        } catch (error) {
            console.error('Error marking messages as read:', error);
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

    getAIResponse(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('register') || lowerMessage.includes('sign up')) {
            return "To register an account, click the 'Sign Up' button and fill in your details. You'll need a valid email address and strong password.";
        }
        
        if (lowerMessage.includes('login') || lowerMessage.includes('sign in')) {
            return "For login issues, check your email and password. Use 'Forgot Password' if needed, or clear your browser cache.";
        }
        
        if (lowerMessage.includes('wallet') || lowerMessage.includes('deposit')) {
            return "For wallet connection, go to your dashboard and click 'Connect Wallet'. Make sure you have MetaMask or another supported wallet installed.";
        }
        
        if (lowerMessage.includes('trading') || lowerMessage.includes('trade')) {
            return "To start trading, complete your KYC verification, fund your account, and explore our trading platform. Need help with any specific step?";
        }
        
        return "Thank you for your message! An admin will respond shortly. In the meantime, you can check our FAQ section for common questions.";
    }

    addWelcomeMessage() {
        setTimeout(() => {
            const welcomeMessage = "👋 Hello! I'm your AI assistant. How can I help you today?";
            this.addMessage(welcomeMessage, 'ai');
            
            // Mark the welcome message
            const messages = document.querySelectorAll('.chat-message');
            if (messages.length > 0) {
                messages[0].classList.add('welcome-message');
            }
        }, 1000);
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aiSupportChat = new AISupportChat();
});