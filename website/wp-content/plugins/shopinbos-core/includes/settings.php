<?php
/**
 * Settings > Shopinbos website. Every value can also be set as a constant in wp-config.php
 * (SIB_ + upper-case key, e.g. SIB_RESEND_API_KEY), which wins over the database and keeps
 * secrets out of backups and the admin screen.
 */

defined( 'ABSPATH' ) || exit;

function sib_settings_fields(): array {
	return [
		'app' => [
			'title'  => __( 'App connection', 'shopinbos' ),
			'fields' => [
				'app_url'   => [ __( 'App URL', 'shopinbos' ), 'https://app.shopinbos.com', 'url', __( 'Sign-up and log-in links go here.', 'shopinbos' ) ],
				'api_base'  => [ __( 'Public API base', 'shopinbos' ), 'https://app.shopinbos.com/api/public', 'url', __( 'Marketplace pages read products, suppliers and delivery partners from here. Responses are cached for 15 minutes.', 'shopinbos' ) ],
				'leads_secret' => [ __( 'Website leads secret', 'shopinbos' ), '', 'password', __( 'Form sign-ups are sent to the app’s admin (Website leads). Use the same value as WEBSITE_LEADS_SECRET in the app, or define SIB_LEADS_SECRET in wp-config.php.', 'shopinbos' ) ],
				'demo_mode' => [ __( 'Use sample marketplace data', 'shopinbos' ), '0', 'checkbox', __( 'For staging without the app. Shows the prototype products and never calls the API.', 'shopinbos' ) ],
			],
		],
		'launch' => [
			'title'  => __( 'Launch', 'shopinbos' ),
			'fields' => [
				'launch_date'   => [ __( 'Launch date', 'shopinbos' ), '2026-11-01', 'text', __( 'YYYY-MM-DD. Until midnight (Lagos time) on this date, sign-up buttons open the waitlist pop-up and /go/ links land on /waitlist/. From then on they go straight to the app, automatically. Log-in links always go to the app.', 'shopinbos' ) ],
				'app_live'      => [ __( 'Go live now', 'shopinbos' ), '0', 'checkbox', __( 'Switch to the app before the launch date. Leave unticked to switch automatically on the launch date.', 'shopinbos' ) ],
			],
		],
		'popups' => [
			'title'  => __( 'Pop-ups', 'shopinbos' ),
			'fields' => [
				'popup_collect' => [ __( 'Pop-up forms ask for', 'shopinbos' ), 'email', 'select', __( 'What the pop-ups (free PDF, exit, trending products, app launch alert) ask visitors for. The words on the pop-ups change to match.', 'shopinbos' ), [ 'email' => __( 'Email address', 'shopinbos' ), 'whatsapp' => __( 'WhatsApp number', 'shopinbos' ), 'either' => __( 'WhatsApp number or email', 'shopinbos' ) ] ],
			],
		],
		'contact' => [
			'title'  => __( 'Contact and apps', 'shopinbos' ),
			'fields' => [
				'whatsapp_support'     => [ __( 'Support WhatsApp number', 'shopinbos' ), '17116951381', 'text', __( 'International format without +, e.g. 2348012345678. Used by "Chat with us" buttons.', 'shopinbos' ) ],
				'ios_url'              => [ __( 'Shopinbos app: App Store link', 'shopinbos' ), '', 'url', __( 'Empty: the App Store badge shows “Coming soon” and opens a “tell me when it’s live” form.', 'shopinbos' ) ],
				'android_url'          => [ __( 'Shopinbos app: Google Play link', 'shopinbos' ), '', 'url', __( 'Empty: the Google Play badge shows “Coming soon” and opens the same form.', 'shopinbos' ) ],
				'riders_android_url'   => [ __( 'Riders app: Google Play link', 'shopinbos' ), '', 'url', '' ],
				'riders_ios_url'       => [ __( 'Riders app: App Store link', 'shopinbos' ), '', 'url', '' ],
				'partner_api_docs_url' => [ __( 'Delivery partner API docs link', 'shopinbos' ), '', 'url', '' ],
			],
		],
		'pricing' => [
			'title'  => __( 'Plan prices', 'shopinbos' ),
			'fields' => [
				'price_start_month' => [ __( 'Starter, monthly', 'shopinbos' ), '₦6,000', 'text', __( 'Shown as typed, e.g. ₦6,000. Use [sib_price key="price_grow_month"] in any text to show it.', 'shopinbos' ) ],
				'price_start_year'  => [ __( 'Starter, yearly', 'shopinbos' ), '₦60,000', 'text', '' ],
				'price_grow_month'  => [ __( 'Growth, monthly', 'shopinbos' ), '₦18,000', 'text', '' ],
				'price_grow_year'   => [ __( 'Growth, yearly', 'shopinbos' ), '₦180,000', 'text', '' ],
				'price_pro_month'   => [ __( 'Pro, monthly', 'shopinbos' ), '₦40,000', 'text', '' ],
				'price_pro_year'    => [ __( 'Pro, yearly', 'shopinbos' ), '₦400,000', 'text', '' ],
				'starter_products'  => [ __( 'Free plan product limit', 'shopinbos' ), '20', 'text', '' ],
				'fee_commission'    => [ __( 'Fee on Free plan sales', 'shopinbos' ), '3%', 'text', __( 'Starter 2%, Growth 1%, Pro 0.5%.', 'shopinbos' ) ],
				'fee_supplier'      => [ __( 'Supplier commission (free plan)', 'shopinbos' ), '6%', 'text', '' ],
				'fee_partner'       => [ __( 'Delivery partner fee (free plan)', 'shopinbos' ), '5%', 'text', '' ],
				'fee_broadcast'     => [ __( 'Broadcast fee per message', 'shopinbos' ), '₦3', 'text', __( 'On top of Meta’s message price.', 'shopinbos' ) ],
				'fee_video'         => [ __( 'Product video price', 'shopinbos' ), '₦1,000', 'text', '' ],
			],
		],
		'email' => [
			'title'  => __( 'Email list (Resend)', 'shopinbos' ),
			'fields' => [
				'resend_api_key'     => [ __( 'Resend API key', 'shopinbos' ), '', 'password', __( 'Better: define SIB_RESEND_API_KEY in wp-config.php.', 'shopinbos' ) ],
				'resend_audience_id' => [ __( 'Resend audience ID', 'shopinbos' ), '', 'text', __( 'Confirmed subscribers are added here.', 'shopinbos' ) ],
				'email_from'         => [ __( 'From address', 'shopinbos' ), 'Shopinbos <hello@shopinbos.com>', 'text', '' ],
			],
		],
		'tracking' => [
			'title'  => __( 'Analytics', 'shopinbos' ),
			'fields' => [
				'posthog_key'     => [ __( 'PostHog project key', 'shopinbos' ), '', 'text', __( 'Use the same project as the app so a visitor can be followed from blog post to first sale.', 'shopinbos' ) ],
				'posthog_host'    => [ __( 'PostHog host', 'shopinbos' ), 'https://eu.i.posthog.com', 'url', '' ],
				'meta_pixel_id'   => [ __( 'Meta pixel ID', 'shopinbos' ), '', 'text', __( 'Only loads on /lp/ campaign pages, after cookie consent.', 'shopinbos' ) ],
				'tiktok_pixel_id' => [ __( 'TikTok pixel ID', 'shopinbos' ), '', 'text', __( 'Only loads on /lp/ campaign pages, after cookie consent.', 'shopinbos' ) ],
				'trust_proxy'     => [ __( 'Behind a proxy or CDN', 'shopinbos' ), '0', 'checkbox', __( 'Read the visitor IP from X-Forwarded-For (for rate limits).', 'shopinbos' ) ],
			],
		],
	];
}

function sib_setting( string $key ) {
	$const = 'SIB_' . strtoupper( $key );
	if ( defined( $const ) ) {
		return constant( $const );
	}
	static $opts = null;
	if ( null === $opts ) {
		$opts = (array) get_option( 'sib_settings', [] );
	}
	if ( array_key_exists( $key, $opts ) && '' !== $opts[ $key ] ) {
		return $opts[ $key ];
	}
	foreach ( sib_settings_fields() as $section ) {
		if ( isset( $section['fields'][ $key ] ) ) {
			return $section['fields'][ $key ][1];
		}
	}
	return '';
}

add_action( 'admin_menu', function () {
	add_options_page( 'Shopinbos website', 'Shopinbos website', 'manage_options', 'shopinbos', 'sib_settings_page' );
} );

add_action( 'admin_init', function () {
	register_setting( 'sib_settings', 'sib_settings', [
		'type'              => 'array',
		'sanitize_callback' => 'sib_sanitize_settings',
		'default'           => [],
	] );
} );

function sib_sanitize_settings( $input ): array {
	$out = [];
	foreach ( sib_settings_fields() as $section ) {
		foreach ( $section['fields'] as $key => [ , , $type ] ) {
			$v = $input[ $key ] ?? '';
			if ( 'checkbox' === $type ) {
				$out[ $key ] = empty( $v ) ? '0' : '1';
			} elseif ( 'url' === $type ) {
				$out[ $key ] = esc_url_raw( trim( (string) $v ) );
			} elseif ( 'select' === $type ) {
				$options     = $section['fields'][ $key ][4] ?? [];
				$out[ $key ] = isset( $options[ (string) $v ] ) ? (string) $v : (string) $section['fields'][ $key ][1];
			} elseif ( 'password' === $type && '' === $v ) {
				$prev        = (array) get_option( 'sib_settings', [] );
				$out[ $key ] = $prev[ $key ] ?? ''; // empty field keeps the saved secret
			} else {
				$out[ $key ] = sanitize_text_field( (string) $v );
			}
		}
	}
	// Marketplace answers depend on these; start fresh.
	sib_api_flush_cache();
	return $out;
}

function sib_settings_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$opts = (array) get_option( 'sib_settings', [] );
	?>
	<div class="wrap">
		<h1>Shopinbos</h1>
		<?php
		$status = sib_api_status();
		printf( '<p><strong>%s</strong> %s</p>', esc_html__( 'Marketplace API:', 'shopinbos' ), esc_html( $status ) );
		if ( function_exists( 'sib_app_leads_status_text' ) ) {
			printf( '<p><strong>%s</strong> %s</p>', esc_html__( 'Website leads to the app:', 'shopinbos' ), esc_html( sib_app_leads_status_text() ) );
		}
		?>
		<form method="post" action="options.php">
			<?php settings_fields( 'sib_settings' ); ?>
			<?php foreach ( sib_settings_fields() as $section ) : ?>
				<h2><?php echo esc_html( $section['title'] ); ?></h2>
				<table class="form-table" role="presentation">
					<?php foreach ( $section['fields'] as $key => [ $label, $default, $type, $help ] ) :
						$const = 'SIB_' . strtoupper( $key );
						$value = $opts[ $key ] ?? '';
						?>
						<tr>
							<th scope="row"><label for="sib-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label></th>
							<td>
								<?php if ( defined( $const ) ) : ?>
									<code><?php echo esc_html( $const ); ?></code> <?php esc_html_e( 'is set in wp-config.php.', 'shopinbos' ); ?>
								<?php elseif ( 'select' === $type ) : ?>
									<select id="sib-<?php echo esc_attr( $key ); ?>" name="sib_settings[<?php echo esc_attr( $key ); ?>]">
										<?php foreach ( $section['fields'][ $key ][4] ?? [] as $opt => $opt_label ) : ?>
											<option value="<?php echo esc_attr( $opt ); ?>" <?php selected( $value ?: $default, $opt ); ?>><?php echo esc_html( $opt_label ); ?></option>
										<?php endforeach; ?>
									</select>
								<?php elseif ( 'checkbox' === $type ) : ?>
									<input type="checkbox" id="sib-<?php echo esc_attr( $key ); ?>" name="sib_settings[<?php echo esc_attr( $key ); ?>]" value="1" <?php checked( '1', $value ?: $default ); ?>>
								<?php else : ?>
									<input class="regular-text" type="<?php echo 'password' === $type ? 'password' : 'text'; ?>" id="sib-<?php echo esc_attr( $key ); ?>" name="sib_settings[<?php echo esc_attr( $key ); ?>]" value="<?php echo 'password' === $type ? '' : esc_attr( $value ); ?>" placeholder="<?php echo esc_attr( 'password' === $type && $value ? '••••••••' : $default ); ?>" autocomplete="off">
								<?php endif; ?>
								<?php if ( $help ) : ?><p class="description"><?php echo esc_html( $help ); ?></p><?php endif; ?>
							</td>
						</tr>
					<?php endforeach; ?>
				</table>
			<?php endforeach; ?>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* Remind admins when the marketplace is showing sample data. */
add_action( 'admin_notices', function () {
	if ( current_user_can( 'manage_options' ) && sib_demo_mode() ) {
		echo '<div class="notice notice-warning"><p>' . esc_html__( 'Shopinbos: the marketplace is showing sample products. Turn off "Use sample marketplace data" in Settings > Shopinbos website before launch.', 'shopinbos' ) . '</p></div>';
	}
} );

/* [sib_price key="price_grow_month"] prints a price or fee from Settings > Shopinbos website, so one change updates every page. */
add_shortcode( 'sib_price', function ( $atts ) {
	$a   = shortcode_atts( [ 'key' => '', 'plan' => '', 'period' => 'month' ], $atts );
	$key = $a['key'] ?: ( $a['plan'] ? 'price_' . ( 'growth' === $a['plan'] ? 'grow' : ( 'starter' === $a['plan'] ? 'start' : $a['plan'] ) ) . '_' . ( 'year' === $a['period'] ? 'year' : 'month' ) : '' );
	if ( ! preg_match( '/^(price|fee)_[a-z_]+$|^starter_products$/', $key ) ) {
		return '';
	}
	return esc_html( (string) sib_setting( $key ) );
} );
