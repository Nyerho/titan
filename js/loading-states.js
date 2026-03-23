// Loading skeleton for dashboard
function showLoadingSkeleton() {
  const balanceElement = document.getElementById('accountBalance');
  if (balanceElement) {
    balanceElement.innerHTML = '<div class="skeleton-loader"></div>';
  }
}

// Error boundary for failed API calls
function handleApiError(error, fallbackMessage = 'Something went wrong') {
  console.error('API Error:', error);
  showNotification(fallbackMessage, 'error');
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showNotification('An unexpected error occurred', 'error');
});