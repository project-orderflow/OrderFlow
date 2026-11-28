FROM wordpress:cli AS wp_cli
FROM wordpress:latest

COPY --from=wp_cli /usr/local/bin/wp /usr/local/bin/wp
COPY bootstrap.sh bootstrap.php wp-cli.yml /opt/orderflow/
