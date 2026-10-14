#!/bin/sh
set -e

TEMPLATE_FILE="/etc/prometheus/prometheus.yml.template"
OUTPUT_FILE="/tmp/prometheus.yml"

if [ -n "$GRAFANA_CLOUD_PROMETHEUS_URL" ] && [ -n "$GRAFANA_CLOUD_PROMETHEUS_USERNAME" ] && [ -n "$GRAFANA_CLOUD_PROMETHEUS_TOKEN" ]; then
  # Inject Grafana Cloud remote_write credentials into runtime config
  sed \
    -e "s|__GRAFANA_CLOUD_PROMETHEUS_URL__|$GRAFANA_CLOUD_PROMETHEUS_URL|g" \
    -e "s|__GRAFANA_CLOUD_PROMETHEUS_USERNAME__|$GRAFANA_CLOUD_PROMETHEUS_USERNAME|g" \
    -e "s|__GRAFANA_CLOUD_PROMETHEUS_TOKEN__|$GRAFANA_CLOUD_PROMETHEUS_TOKEN|g" \
    "$TEMPLATE_FILE" > "$OUTPUT_FILE"
  echo "[Prometheus Entrypoint] Configured remote_write to Grafana Cloud (${GRAFANA_CLOUD_PROMETHEUS_URL%/*})."
else
  # Omit remote_write if credentials are not configured yet
  sed '/# BEGIN_REMOTE_WRITE/,/# END_REMOTE_WRITE/d' "$TEMPLATE_FILE" > "$OUTPUT_FILE"
  echo "[Prometheus Entrypoint] Grafana Cloud credentials not set. Running with local storage only."
fi

exec /bin/prometheus \
  --config.file="$OUTPUT_FILE" \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=1d \
  --storage.tsdb.retention.size=2GB \
  --web.enable-lifecycle \
  "$@"
