import React from 'react';

export default function MockOrdersApp(props) {
  return (
    <div data-testid="mock-orders-mfe">
      Mock Orders MFE (apiBaseUrl: {props.apiBaseUrl})
    </div>
  );
}
