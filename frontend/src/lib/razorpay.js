let loaderPromise = null;

export function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => {
        loaderPromise = null;
        reject(new Error('Failed to load payment gateway. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return loaderPromise;
}
