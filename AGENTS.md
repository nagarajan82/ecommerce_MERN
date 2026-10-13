<!-- code-review-graph guidance -->
## Code review graph

Use the `code-review-graph` MCP tools to navigate code, trace relationships, and estimate change impact when relevant. Treat graph results as navigation context: confirm behavior in source code and tests before drawing conclusions or changing code. Source code takes precedence if a graph is stale or conflicts with the implementation.

Useful tools include `semantic_search_nodes_tool`, `query_graph_tool`, `get_impact_radius_tool`, `detect_changes_tool`, `get_review_context_tool`, `get_architecture_overview_tool`, and `list_communities_tool`.

The checked-in repository-wide graph is in `.code-review-graph/` and its interactive visualization is `graph.html`. Component graphs are in `auth-mfe/.code-review-graph/`, `catalog-mfe/.code-review-graph/`, `checkout-mfe/.code-review-graph/`, `orders-mfe/.code-review-graph/`, and each backend service's `.code-review-graph/` directory. Use the root graph for cross-component flow and impact; use the component graph for focused exploration.

These are generated snapshots for learning and review. After source changes, update the root graph and each affected component graph with `code-review-graph update --repo <absolute-repo-or-component-path>`, then include the updated graph snapshot in the same review/commit as appropriate. Check freshness with `code-review-graph status --repo <absolute-repo-or-component-path>`. The databases record source paths; on a different checkout or machine, rebuild the required graph with `code-review-graph build --repo <absolute-path>` before relying on path-sensitive results.

The project-scoped MCP configuration is machine-local and is intentionally not checked in because its executable paths and other MCP integrations vary by developer. Register the server with `code-review-graph install --platform codex --repo <absolute-repo-path>`, trust the repository in Codex, and reload Codex so the MCP tools are available.
<!-- /code-review-graph guidance -->
