const fs = require('fs');
const path = require('path');

const packages = [
  { package: 'apps/frontend', name: 'apps-frontend' },
  { package: 'auth-mfe', name: 'auth-mfe' },
  { package: 'catalog-mfe', name: 'catalog-mfe' },
  { package: 'checkout-mfe', name: 'checkout-mfe' },
  { package: 'orders-mfe', name: 'orders-mfe' },
  { package: 'gateway', name: 'gateway' },
  { package: 'services/user-service', name: 'services-user-service' },
  { package: 'services/product-service', name: 'services-product-service' },
  { package: 'services/order-service', name: 'services-order-service' },
  { package: 'services/payment-service', name: 'services-payment-service' },
  { package: 'services/notification-service', name: 'services-notification-service' },
  { package: 'services/frontend-log-collector', name: 'services-frontend-log-collector' },
  { package: 'packages/observability', name: 'packages-observability' }
];

let mappedCount = 0;
packages.forEach(pkg => {
  const artifactFile = path.join('coverage-artifacts', 'coverage-' + pkg.name, 'lcov.info');
  if (fs.existsSync(artifactFile)) {
    const content = fs.readFileSync(artifactFile, 'utf8');
    const targetDir = path.join(pkg.package, 'coverage');
    fs.mkdirSync(targetDir, { recursive: true });

    const prefix = pkg.package + '/';
    const normalized = content.replace(/^SF:(?:\.\\|\.\/)?(.*)$/gm, (match, p1) => {
      const posixPath = p1.replaceAll('\\', '/');
      if (posixPath.startsWith(prefix)) return 'SF:' + posixPath;
      return 'SF:' + prefix + posixPath;
    });

    const targetFile = path.join(targetDir, 'lcov.info');
    fs.writeFileSync(targetFile, normalized, 'utf8');
    mappedCount++;
    console.log(`Processed coverage for ${pkg.package} -> ${targetFile}`);
  } else {
    console.warn(`Coverage artifact missing for: ${pkg.name}`);
  }
});

console.log(`Total coverage reports mapped: ${mappedCount} of ${packages.length}`);
