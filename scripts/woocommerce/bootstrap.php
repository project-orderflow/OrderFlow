<?php

function orderflow_import_sample_catalog(): void {
    require_once WC_ABSPATH . 'includes/import/class-wc-product-csv-importer.php';
    require_once WC_ABSPATH . 'includes/admin/importers/class-wc-product-csv-importer-controller.php';

    $file = '/opt/orderflow/sample_products.csv';
    $csv = new WC_Product_CSV_Importer($file, ['lines' => 1]);
    $headers = $csv->get_raw_keys();
    if (!in_array('SKU', $headers, true)) {
        WP_CLI::error('sample_products.csv must contain a SKU column.');
    }

    $mapper = new class extends WC_Product_CSV_Importer_Controller {
        public function mapping(array $headers): array {
            return $this->auto_map_columns($headers);
        }
    };
    $columns = $mapper->mapping($headers);
    foreach ($columns as &$column) {
        if ($column === 'images') {
            // Keep the first startup independent of the sample image host.
            $column = '';
        }
    }
    unset($column);

    $importer = new WC_Product_CSV_Importer($file, [
        'parse' => true,
        'prevent_timeouts' => false,
        'update_existing' => false,
        'mapping' => ['from' => $headers, 'to' => array_values($columns)],
    ]);
    $result = $importer->import();
    if (!empty($result['failed']) || !empty($result['errors'])) {
        WP_CLI::error('WooCommerce did not finish importing the sample catalog.');
    }
    update_option('orderflow_sample_catalog_imported', 1, false);
}

function orderflow_ensure_rest_credentials(int $admin_id): array {
    global $wpdb;

    $table = $wpdb->prefix . 'woocommerce_api_keys';
    $credentials = get_option('orderflow_rest_credentials');
    if (is_array($credentials)) {
        $stored = $wpdb->get_var($wpdb->prepare(
            "SELECT consumer_secret FROM {$table} WHERE consumer_key = %s AND permissions = 'read'",
            wc_api_hash($credentials['key'])
        ));
        if (is_string($stored) && hash_equals($credentials['secret'], $stored)) {
            return $credentials;
        }
        WP_CLI::error('The generated WooCommerce key was changed. Configure a new read-only key in .env.');
    }

    $credentials = [
        'key' => 'ck_' . bin2hex(random_bytes(20)),
        'secret' => 'cs_' . bin2hex(random_bytes(20)),
    ];
    if (!$wpdb->insert($table, [
        'user_id' => $admin_id,
        'description' => 'OrderFlow Integration',
        'permissions' => 'read',
        'consumer_key' => wc_api_hash($credentials['key']),
        'consumer_secret' => $credentials['secret'],
        'truncated_key' => substr($credentials['key'], -7),
    ])) {
        WP_CLI::error('Could not create the WooCommerce API key.');
    }
    if (!add_option('orderflow_rest_credentials', $credentials, '', false)) {
        $wpdb->delete($table, ['consumer_key' => wc_api_hash($credentials['key'])]);
        WP_CLI::error('Could not save the WooCommerce API key.');
    }
    return $credentials;
}

$managed = (bool) get_option('orderflow_managed_shop');
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
if (!$admins) {
    WP_CLI::error('WordPress has no administrator for the WooCommerce integration.');
}
$admin_id = (int) $admins[0];
wp_set_current_user($admin_id);

if ($managed && !get_option('orderflow_sample_catalog_imported')) {
    orderflow_import_sample_catalog();
    update_option('woocommerce_coming_soon', 'no');
}

echo wp_json_encode([
    'credentials' => ($args[0] ?? '') === 'generate' ? orderflow_ensure_rest_credentials($admin_id) : null,
    'sync_catalog' => $managed && !get_option('orderflow_catalog_synced'),
]);
