import React from 'react';

export default function MockAuthApp(props) {
  return (
    <div data-testid="mock-auth-mfe" data-mode={props.mode}>
      Mock Auth MFE ({props.mode})
    </div>
  );
}
