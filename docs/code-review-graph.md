# Code review graph snapshots

This repository checks in generated code-review-graph data as a learning aid and as a review snapshot. The root graph spans the application; each component graph focuses on one microfrontend or backend service.

## Snapshot contents

- `.code-review-graph/graph.db` — repository-wide graph database.
- `.code-review-graph/graph.html` and `.code-review-graph/d3.v7.min.js` — interactive repository graph visualization and its local runtime.
- `auth-mfe/.code-review-graph/graph.db`
- `catalog-mfe/.code-review-graph/graph.db`
- `checkout-mfe/.code-review-graph/graph.db`
- `orders-mfe/.code-review-graph/graph.db`
- `services/user-service/.code-review-graph/graph.db`
- `services/product-service/.code-review-graph/graph.db`
- `services/order-service/.code-review-graph/graph.db`
- `services/payment-service/.code-review-graph/graph.db`
- `services/notification-service/.code-review-graph/graph.db`

The graph databases store source paths and structural metadata. A snapshot built on one machine may contain that checkout's absolute paths. Rebuild the graph on another machine before relying on path-sensitive queries.

## Refresh snapshots

After source changes, update the repository graph and the graph for each changed component:

```powershell
code-review-graph update --repo "D:\path\to\ecommerce_MERN"
code-review-graph update --repo "D:\path\to\ecommerce_MERN\auth-mfe"
code-review-graph update --repo "D:\path\to\ecommerce_MERN\services\user-service"
```

Replace the component examples with the directories affected by the change. Use `code-review-graph status --repo <path>` to inspect freshness and graph size. For a new checkout without graph data, use `code-review-graph build --repo <path>` instead of `update`.

## Query examples

```powershell
code-review-graph architecture --repo "D:\path\to\ecommerce_MERN"
code-review-graph search "registration" --repo "D:\path\to\ecommerce_MERN"
code-review-graph impact --repo "D:\path\to\ecommerce_MERN" --files services/user-service/src/controllers/authController.js
```

Use the root graph for cross-component relationships and impact. Use a component path for focused queries. Always verify graph-derived findings against the current source code.

## Codex MCP setup

The Codex MCP configuration is local to each developer because it uses local executable paths and may coexist with personal integrations. Install/register the server in Codex with:

```powershell
code-review-graph install --platform codex --repo "D:\path\to\ecommerce_MERN"
```

Trust the repository in Codex and reload Codex after configuration so the graph tools are loaded. Do not commit a developer's full `.codex/config.toml` into the project.
