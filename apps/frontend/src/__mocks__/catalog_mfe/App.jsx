import React from 'react';

export default function MockCatalogApp(props) {
  return (
    <div data-testid="mock-catalog-mfe">
      Mock Catalog MFE (apiBaseUrl: {props.apiBaseUrl})
    </div>
  );
}
