#!/bin/sh
set -eu

wp() {
    WP_CLI_CONFIG_PATH=/opt/orderflow/wp-cli.yml command wp --path=/var/www/html --skip-themes "$@"
}

for attempt in $(seq 1 30); do
    if [ -s /var/www/html/wp-config.php ]; then
        break
    fi
    sleep 2
done
if [ ! -s /var/www/html/wp-config.php ]; then
    echo "WordPress did not finish preparing wp-config.php." >&2
    exit 1
fi

if ! wp core is-installed --skip-plugins; then
    printf '%s\n' "${WC_ADMIN_PASSWORD:?Set WC_ADMIN_PASSWORD}" |
        wp core install --skip-plugins --url=http://localhost:8080 \
            --title='OrderFlow Demo Store' --admin_user=orderflow-admin \
            --admin_email=shop-admin@example.test --skip-email --prompt=admin_password >&2
    wp option add orderflow_managed_shop 1 >&2
fi

if ! wp plugin is-installed woocommerce --skip-plugins; then
    wp plugin install woocommerce --activate >&2
elif ! wp plugin is-active woocommerce; then
    wp plugin activate woocommerce >&2
fi

if [ -z "$(wp option get permalink_structure)" ]; then
    wp rewrite structure '/%postname%/' --hard >&2
fi

wp eval-file /opt/orderflow/bootstrap.php "$1"
