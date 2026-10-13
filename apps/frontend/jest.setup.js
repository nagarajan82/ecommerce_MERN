require('@testing-library/jest-dom');

// Clear localStorage between tests
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});
