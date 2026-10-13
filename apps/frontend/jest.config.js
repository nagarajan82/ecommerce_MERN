module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^auth_mfe/App$': '<rootDir>/src/__mocks__/auth_mfe/App.jsx',
    '^catalog_mfe/App$': '<rootDir>/src/__mocks__/catalog_mfe/App.jsx',
    '^checkout_mfe/App$': '<rootDir>/src/__mocks__/checkout_mfe/App.jsx',
    '^orders_mfe/App$': '<rootDir>/src/__mocks__/orders_mfe/App.jsx'
  },
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/bootstrap.js',
    '!src/__mocks__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
