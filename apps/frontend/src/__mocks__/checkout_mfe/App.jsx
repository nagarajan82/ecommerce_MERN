import React from 'react';

export default function MockCheckoutApp(props) {
  return (
    <div data-testid="mock-checkout-mfe">
      Mock Checkout MFE (apiBaseUrl: {props.apiBaseUrl})
    </div>
  );
}
