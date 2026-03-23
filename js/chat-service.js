import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    updateDoc, 
    doc, 
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class ChatService {
    constructor() {
        this.db = db;
        this.auth = auth;
        this.conversations = new Map();
        this.messageListeners = new Map();
    }

    // Create or get existing conversation
    async getOrCreateConversation(userId, userEmail) {
        try {
            const conversationsRef = collection(this.db, 'conversations');
            const q = query(conversationsRef, where('userId', '==', userId));
            const querySnapshot = await getDocs(q);
            
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
                lastMessageTime: serverTimestamp(),
                unreadByAdmin: 0,
                unreadByUser: 0,
                createdAt: serverTimestamp()
            };
            
            const docRef = await addDoc(conversationsRef, newConversation);
            return { id: docRef.id, ...newConversation };
        } catch (error) {
            console.error('Error creating conversation:', error);
            throw error;
        }
    }

    // Send message
    async sendMessage(conversationId, message, senderType, senderId, senderName) {
        try {
            const messagesRef = collection(this.db, 'conversations', conversationId, 'messages');
            const messageData = {
                text: message,
                senderType: senderType, // 'user', 'admin', or 'ai'
                senderId: senderId,
                senderName: senderName,
                timestamp: serverTimestamp(),
                read: false
            };
            
            await addDoc(messagesRef, messageData);
            
            // Update conversation last message
            const conversationRef = doc(this.db, 'conversations', conversationId);
            const updateData = {
                lastMessage: message,
                lastMessageTime: serverTimestamp()
            };
            
            if (senderType === 'user') {
                updateData.unreadByAdmin = 1;
            } else if (senderType === 'admin') {
                updateData.unreadByUser = 1;
            }
            
            await updateDoc(conversationRef, updateData);
            
            return messageData;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    // Listen to messages in a conversation
    listenToMessages(conversationId, callback) {
        const messagesRef = collection(this.db, 'conversations', conversationId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = [];
            snapshot.forEach((doc) => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            callback(messages);
        });
        
        this.messageListeners.set(conversationId, unsubscribe);
        return unsubscribe;
    }

    // Listen to all conversations (for admin)
    listenToConversations(callback) {
        const conversationsRef = collection(this.db, 'conversations');
        const q = query(conversationsRef, orderBy('lastMessageTime', 'desc'));
        
        return onSnapshot(q, (snapshot) => {
            const conversations = [];
            snapshot.forEach((doc) => {
                conversations.push({ id: doc.id, ...doc.data() });
            });
            callback(conversations);
        });
    }

    // Mark messages as read
    async markMessagesAsRead(conversationId, userType) {
        try {
            const conversationRef = doc(this.db, 'conversations', conversationId);
            const updateData = {};
            
            if (userType === 'admin') {
                updateData.unreadByAdmin = 0;
            } else {
                updateData.unreadByUser = 0;
            }
            
            await updateDoc(conversationRef, updateData);
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }

    // Stop listening to messages
    stopListening(conversationId) {
        const unsubscribe = this.messageListeners.get(conversationId);
        if (unsubscribe) {
            unsubscribe();
            this.messageListeners.delete(conversationId);
        }
    }

    // Generate AI response (fallback when no admin is available)
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
}

export default ChatService;