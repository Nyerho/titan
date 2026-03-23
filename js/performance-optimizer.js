// Mobile Performance Optimizer
(function() {
    // Detect if device is low-performance
    const isLowPerformance = () => {
        const ua = navigator.userAgent;
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const isOldAndroid = /Android [1-4]\./i.test(ua);
        const isLowRAM = navigator.deviceMemory && navigator.deviceMemory < 4;
        
        return isOldAndroid || isLowRAM; // Removed general mobile detection
    };
    
    // Apply performance optimizations only for truly low-performance devices
    if (isLowPerformance()) {
        document.documentElement.classList.add('low-performance');
        
        // Don't disable smooth scrolling on mobile
        // document.documentElement.style.scrollBehavior = 'auto';
        
        // Reduce animation frame rate only for very low-end devices
        const style = document.createElement('style');
        style.textContent = `
            .low-performance * {
                animation-duration: 0.2s !important;
                transition-duration: 0.2s !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Ensure layout stability after DOM load
    document.addEventListener('DOMContentLoaded', function() {
        // Force layout recalculation to prevent reversion
        setTimeout(() => {
            const sections = document.querySelectorAll('section');
            sections.forEach(section => {
                section.style.width = '100vw';
                section.style.marginLeft = 'calc(-50vw + 50%)';
            });
        }, 100);
    });
})();