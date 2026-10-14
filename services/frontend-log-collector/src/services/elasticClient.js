const { Client } = require('@elastic/elasticsearch');
const config = require('../config/env');

let clientInstance = null;
let ClientConstructor = Client;

function isMockConstructor(ctor) {
  if (!ctor) return false;
  return (
    ctor._isMockFunction === true ||
    typeof ctor.mockImplementation === 'function' ||
    typeof ctor.mockReturnValue === 'function' ||
    ctor.name === 'mockConstructor' ||
    ctor.__isMock === true
  );
}

function getClient() {
  if (!clientInstance) {
    if (!config.elasticsearchUrl || !config.elasticApiKey) {
      return null;
    }

    // Hard safeguard: Prevent unintended real network connections in test mode
    if (process.env.NODE_ENV === 'test' && !isMockConstructor(ClientConstructor)) {
      const safeguardError = new Error(
        '[SAFEGUARD] Unintended real Elasticsearch connection prevented during automated tests. Mock @elastic/elasticsearch or provide a test client via setClient().'
      );
      safeguardError.code = 'ES_TEST_SAFEGUARD';
      throw safeguardError;
    }

    clientInstance = new ClientConstructor({
      node: config.elasticsearchUrl,
      auth: {
        apiKey: config.elasticApiKey
      }
    });
  }
  return clientInstance;
}

function setClient(mockClient) {
  clientInstance = mockClient;
}

function setClientConstructor(customCtor) {
  ClientConstructor = customCtor;
}

function resetClient() {
  clientInstance = null;
  ClientConstructor = Client;
}

async function indexLog(event) {
  const client = getClient();
  if (!client) {
    const error = new Error('Elasticsearch storage is not configured');
    error.code = 'ES_NOT_CONFIGURED';
    throw error;
  }

  const document = {
    ...event,
    ingestedAt: new Date().toISOString()
  };

  return client.index({
    index: config.logIndex,
    document
  });
}

async function indexLogsBulk(events) {
  const client = getClient();
  if (!client) {
    const error = new Error('Elasticsearch storage is not configured');
    error.code = 'ES_NOT_CONFIGURED';
    throw error;
  }

  const ingestedAt = new Date().toISOString();
  const operations = events.flatMap((event) => [
    { index: { _index: config.logIndex } },
    { ...event, ingestedAt }
  ]);

  const response = await client.bulk({ operations });
  if (response && response.errors) {
    const erroredItem = response.items && response.items.find((item) => item.index && item.index.error);
    const reason = (erroredItem && erroredItem.index && erroredItem.index.error && erroredItem.index.error.reason)
      ? erroredItem.index.error.reason
      : 'Elasticsearch bulk indexing encountered errors';
    const error = new Error(reason);
    error.code = 'ES_BULK_ERROR';
    throw error;
  }

  return response;
}

async function checkHealth() {
  const client = getClient();
  if (!client) {
    return {
      configured: false,
      status: 'unconfigured'
    };
  }

  try {
    const pingResult = await client.ping();
    return {
      configured: true,
      status: pingResult ? 'connected' : 'unreachable'
    };
  } catch (error) {
    // If the test safeguard triggered, rethrow to alert the test runner immediately
    if (error && error.code === 'ES_TEST_SAFEGUARD') {
      throw error;
    }
    return {
      configured: true,
      status: 'disconnected'
    };
  }
}

module.exports = {
  getClient,
  setClient,
  setClientConstructor,
  resetClient,
  indexLog,
  indexLogsBulk,
  checkHealth,
  isMockConstructor
};
