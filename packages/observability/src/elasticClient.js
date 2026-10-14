const { Client } = require('@elastic/elasticsearch');
const { getConfig } = require('./config');

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
    const config = getConfig();
    if (!config.elasticsearchUrl || !config.elasticApiKey) {
      return null;
    }

    if (process.env.NODE_ENV === 'test' && !isMockConstructor(ClientConstructor)) {
      const safeguardError = new Error(
        '[SAFEGUARD] Unintended real Elasticsearch connection prevented during automated tests.'
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

async function bulkIndex(indexName, documents) {
  if (!documents || documents.length === 0) return { count: 0 };
  const client = getClient();
  if (!client) {
    const err = new Error('Elasticsearch storage is not configured');
    err.code = 'ES_NOT_CONFIGURED';
    throw err;
  }

  const operations = documents.flatMap((doc) => [
    { index: { _index: indexName } },
    doc
  ]);

  const response = await client.bulk({ operations });
  if (response && response.errors) {
    const erroredItem = response.items && response.items.find((item) => item.index && item.index.error);
    const reason = (erroredItem && erroredItem.index && erroredItem.index.error && erroredItem.index.error.reason)
      ? erroredItem.index.error.reason
      : 'Bulk indexing encountered errors';
    const err = new Error(reason);
    err.code = 'ES_BULK_ERROR';
    throw err;
  }

  return response;
}

async function indexDocument(indexName, document) {
  const client = getClient();
  if (!client) {
    const err = new Error('Elasticsearch storage is not configured');
    err.code = 'ES_NOT_CONFIGURED';
    throw err;
  }

  return client.index({
    index: indexName,
    document
  });
}

async function checkHealth() {
  const config = getConfig();
  if (!config.elasticsearchUrl || !config.elasticApiKey) {
    return { configured: false, status: 'unconfigured' };
  }

  try {
    const client = getClient();
    if (!client) {
      return { configured: false, status: 'unconfigured' };
    }
    await client.ping();
    return { configured: true, status: 'connected' };
  } catch (err) {
    return {
      configured: true,
      status: 'error',
      message: err && err.message ? err.message : 'Ping failed'
    };
  }
}

module.exports = {
  getClient,
  setClient,
  setClientConstructor,
  resetClient,
  bulkIndex,
  indexDocument,
  checkHealth
};
