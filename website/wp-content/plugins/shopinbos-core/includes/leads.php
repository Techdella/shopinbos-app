<?php
/**
 * Lead forms: newsletter (double opt-in), "email me this result" on tools, gated guide downloads
 * and the contact form.
 *
 * What we keep: a consent log row (email or phone, what they agreed to, when, from which IP) so we
 * can show NDPA consent. Everything else goes to the email list (Resend) and nowhere else.
 * Gated PDFs live in uploads/sib-private and are only served through signed, expiring links.
 */

defined( 'ABSPATH' ) || exit;

const SIB_CONSENT_TEXT = 'I agree to get emails from Shopinbos with selling tips and offers. I can unsubscribe any time.';
const SIB_SUNDAY_CONSENT = 'By sending, you agree to one tip a week from Shopinbos on WhatsApp or email. Reply STOP or unsubscribe any time.';

/* ---------- Storage ---------- */

function sib_consent_table(): string {
	global $wpdb;
	return $wpdb->prefix . 'sib_consent';
}

function sib_install_consent_table(): void {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta( 'CREATE TABLE ' . sib_consent_table() . " (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		contact varchar(190) NOT NULL,
		kind varchar(20) NOT NULL,
		source varchar(190) NOT NULL DEFAULT '',
		consent_text text NOT NULL,
		ip varchar(45) NOT NULL DEFAULT '',
		created_at datetime NOT NULL,
		confirmed_at datetime NULL,
		PRIMARY KEY  (id),
		KEY contact (contact)
	) " . $wpdb->get_charset_collate() . ';' );
	update_option( 'sib_db_version', 1, false );
}
add_action( 'plugins_loaded', function () {
	if ( (int) get_option( 'sib_db_version' ) < 1 ) {
		sib_install_consent_table();
	}
} );

/** Folder for gated files. Denied to the web; files only go out through sib_download_url(). */
function sib_private_dir(): string {
	$dir = trailingslashit( wp_upload_dir( null, false )['basedir'] ) . 'sib-private';
	if ( ! is_dir( $dir ) ) {
		wp_mkdir_p( $dir );
	}
	if ( ! file_exists( $dir . '/.htaccess' ) ) {
		file_put_contents( $dir . '/.htaccess', "Require all denied\nDeny from all\n" ); // Apache 2.4 + LiteSpeed, and 2.2
		file_put_contents( $dir . '/index.php', "<?php // Silence.\n" );
	}
	return $dir;
}

/** Move a resource's chosen PDF out of the public uploads folder. */
function sib_secure_resource_file( int $post_id ): void {
	$att = (int) get_post_meta( $post_id, 'sib_file_id', true );
	if ( ! $att ) {
		return;
	}
	$file = get_attached_file( $att );
	if ( ! $file || ! file_exists( $file ) ) {
		return;
	}
	$dir = sib_private_dir();
	if ( ! str_starts_with( wp_normalize_path( $file ), wp_normalize_path( $dir ) ) ) {
		$target = $dir . '/' . wp_generate_password( 12, false ) . '-' . sanitize_file_name( basename( $file ) );
		if ( ! @rename( $file, $target ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
			return;
		}
		update_attached_file( $att, $target );
		$file = $target;
	}
	update_post_meta( $post_id, 'sib_file_path', basename( $file ) );
}

/* ---------- Signed tokens (download and confirm links) ---------- */

function sib_token( array $payload, int $ttl ): string {
	$payload['x'] = time() + $ttl;
	$data         = rtrim( strtr( base64_encode( wp_json_encode( $payload ) ), '+/', '-_' ), '=' );
	return $data . '.' . substr( sib_sign( $data ), 0, 32 );
}

function sib_token_read( string $token ): ?array {
	if ( ! preg_match( '/^([A-Za-z0-9_-]+)\.([a-f0-9]{32})$/', $token, $m ) || ! hash_equals( substr( sib_sign( $m[1] ), 0, 32 ), $m[2] ) ) {
		return null;
	}
	$p = json_decode( (string) base64_decode( strtr( $m[1], '-_', '+/' ) ), true );
	return is_array( $p ) && ( $p['x'] ?? 0 ) >= time() ? $p : null;
}

function sib_download_url( int $resource_id ): string {
	return home_url( '/download/' . sib_token( [ 'r' => $resource_id ], 7 * DAY_IN_SECONDS ) . '/' );
}

function sib_leads_rewrite_rules(): void {
	add_rewrite_rule( '^download/([A-Za-z0-9_.-]+)/?$', 'index.php?sib_dl=$matches[1]', 'top' );
	add_rewrite_rule( '^confirm/([A-Za-z0-9_.-]+)/?$', 'index.php?sib_confirm=$matches[1]', 'top' );
}
add_action( 'init', 'sib_leads_rewrite_rules' );
add_filter( 'query_vars', fn( $v ) => array_merge( $v, [ 'sib_dl', 'sib_confirm' ] ) );

add_action( 'template_redirect', function () {
	if ( $t = get_query_var( 'sib_dl' ) ) {
		nocache_headers();
		header( 'X-Robots-Tag: noindex, nofollow' );
		$p    = sib_token_read( (string) $t );
		$name = $p ? (string) get_post_meta( (int) $p['r'], 'sib_file_path', true ) : '';
		$file = $name ? sib_private_dir() . '/' . basename( $name ) : '';
		if ( ! $file || ! is_readable( $file ) ) {
			wp_die( esc_html__( 'This download link has expired. Ask for the guide again and we’ll send a fresh one.', 'shopinbos' ), esc_html__( 'Link expired', 'shopinbos' ), [ 'response' => 410, 'link_url' => esc_url( get_permalink( (int) ( $p['r'] ?? 0 ) ) ?: home_url( '/resources/' ) ), 'link_text' => esc_html__( 'Back to the guide', 'shopinbos' ) ] );
		}
		$pretty = sanitize_file_name( get_post_field( 'post_name', (int) $p['r'] ) . '.pdf' );
		header( 'Content-Type: application/pdf' );
		header( 'Content-Disposition: attachment; filename="' . $pretty . '"' );
		header( 'Content-Length: ' . filesize( $file ) );
		readfile( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		exit;
	}
	if ( $t = get_query_var( 'sib_confirm' ) ) {
		nocache_headers();
		$p = sib_token_read( (string) $t );
		if ( ! $p || empty( $p['e'] ) ) {
			wp_die( esc_html__( 'This confirmation link has expired. Sign up again and we’ll send a new one.', 'shopinbos' ), '', [ 'response' => 410 ] );
		}
		sib_list_add( (string) $p['e'], (string) ( $p['n'] ?? '' ), (string) ( $p['t'] ?? '' ) );
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'UPDATE ' . sib_consent_table() . ' SET confirmed_at = %s WHERE contact = %s AND confirmed_at IS NULL', current_time( 'mysql', true ), (string) $p['e'] ) ); // phpcs:ignore
		wp_safe_redirect( add_query_arg( 'subscribed', '1', home_url( '/thanks/' ) ) );
		exit;
	}
} );

/* ---------- Email ---------- */

function sib_send_email( string $to, string $subject, string $html ): bool {
	$key = (string) sib_setting( 'resend_api_key' );
	if ( $key ) {
		$res = wp_remote_post( 'https://api.resend.com/emails', [
			'timeout' => 8,
			'headers' => [ 'Authorization' => 'Bearer ' . $key, 'Content-Type' => 'application/json' ],
			'body'    => wp_json_encode( [ 'from' => sib_setting( 'email_from' ), 'to' => [ $to ], 'subject' => $subject, 'html' => $html ] ),
		] );
		return ! is_wp_error( $res ) && wp_remote_retrieve_response_code( $res ) < 300;
	}
	return wp_mail( $to, $subject, $html, [ 'Content-Type: text/html; charset=UTF-8' ] );
}

/** Add a confirmed contact to the Resend audience. Other lists can hook sib_list_added. */
function sib_list_add( string $email, string $name, string $tag ): void {
	$key = (string) sib_setting( 'resend_api_key' );
	$aud = (string) sib_setting( 'resend_audience_id' );
	if ( $key && $aud ) {
		wp_remote_post( 'https://api.resend.com/audiences/' . rawurlencode( $aud ) . '/contacts', [
			'timeout' => 8,
			'headers' => [ 'Authorization' => 'Bearer ' . $key, 'Content-Type' => 'application/json' ],
			'body'    => wp_json_encode( [ 'email' => $email, 'first_name' => $name, 'unsubscribed' => false ] ),
		] );
	}
	do_action( 'sib_list_added', $email, $name, $tag );
}

function sib_email_html( string $title, string $body, string $button_label = '', string $button_url = '' ): string {
	$btn = $button_url ? '<p style="margin:28px 0"><a href="' . esc_url( $button_url ) . '" style="background:#FF6A2B;color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">' . esc_html( $button_label ) . '</a></p>' : '';
	return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#16141F;line-height:1.6">'
		. '<h1 style="font-size:24px">' . esc_html( $title ) . '</h1>' . $body . $btn
		. '<p style="color:#6B6779;font-size:13px">Shopinbos · Made in Lagos. You got this email because you asked for it on shopinbos.com.</p></div>';
}

/* ---------- Form rendering ---------- */

function sib_render_lead_form( array $a ): string {
	$kind     = in_array( $a['kind'] ?? '', [ 'newsletter', 'contact', 'tool', 'download', 'sunday' ], true ) ? $a['kind'] : 'newsletter';
	$id       = wp_unique_id( 'sib-lead-' );
	$heading  = $a['heading'] ?? '';
	$resource = (int) ( $a['resource'] ?? 0 );
	$status   = isset( $_GET['sib_lead'] ) ? sanitize_key( $_GET['sib_lead'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	$field    = fn( $name, $label, $type = 'text', $extra = '' ) => '<label class="field" for="' . $id . '-' . $name . '">' . esc_html( $label ) . '<input class="input" id="' . $id . '-' . $name . '" name="' . $name . '" type="' . $type . '"' . $extra . '></label>';

	if ( 'sunday' === $kind ) {
		return '<form class="sib-lead nl-form" id="' . esc_attr( $id ) . '" data-sib-lead method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">'
			. '<div class="heroform nl-input"><label class="screen-reader-text" for="' . $id . '-c">' . esc_html__( 'WhatsApp number or email', 'shopinbos' ) . '</label>'
			. '<input class="input" id="' . $id . '-c" name="contact" required autocomplete="email" placeholder="' . esc_attr__( 'WhatsApp number or email', 'shopinbos' ) . '">'
			. '<button class="btn btn-ink" type="submit">' . esc_html__( 'Send it to me', 'shopinbos' ) . sib_icon( 'arrow', 16 ) . '</button></div>'
			. '<p class="nl-consent">' . esc_html( SIB_SUNDAY_CONSENT ) . ' <a href="' . esc_url( home_url( '/legal/privacy/' ) ) . '">' . esc_html__( 'Privacy policy', 'shopinbos' ) . '</a></p>'
			. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="sunday"><input type="hidden" name="back" value="' . esc_url( get_permalink() ?: home_url( add_query_arg( [] ) ) ) . '">'
			. '<label class="hp" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>'
			. '<div data-sib-lead-out aria-live="polite"></div></form>';
	}

	$body = '';
	if ( 'newsletter' === $kind ) {
		$heading = $heading ?: __( 'Get one selling tip a week', 'shopinbos' );
		$body   .= '<p class="p">' . esc_html__( 'Short, useful, no spam. From the Shopinbos team in Lagos.', 'shopinbos' ) . '</p>'
			. $field( 'email', __( 'Email', 'shopinbos' ), 'email', ' required autocomplete="email"' );
	} elseif ( 'tool' === $kind ) {
		$body .= $field( 'email', __( 'Email', 'shopinbos' ), 'email', ' required autocomplete="email"' )
			. '<input type="hidden" name="tool" value="' . esc_attr( (string) ( $a['tool'] ?? '' ) ) . '"><input type="hidden" name="result" value="">';
	} elseif ( 'download' === $kind ) {
		$body .= $field( 'name', __( 'Your name', 'shopinbos' ), 'text', ' required autocomplete="given-name"' )
			. $field( 'email', __( 'Email', 'shopinbos' ), 'email', ' autocomplete="email"' )
			. $field( 'phone', __( 'Or WhatsApp number', 'shopinbos' ), 'tel', ' autocomplete="tel" placeholder="0803 412 7790"' )
			. '<label class="field" for="' . $id . '-sells">' . esc_html__( 'What do you sell?', 'shopinbos' ) . '<select class="input" id="' . $id . '-sells" name="sells"><option value="">' . esc_html__( 'Choose one', 'shopinbos' ) . '</option>'
			. implode( '', array_map( fn( $o ) => '<option>' . esc_html( $o ) . '</option>', [ __( 'Clothes and fashion', 'shopinbos' ), __( 'Shoes and bags', 'shopinbos' ), __( 'Beauty and skincare', 'shopinbos' ), __( 'Hair and wigs', 'shopinbos' ), __( 'Food and drinks', 'shopinbos' ), __( 'Gadgets', 'shopinbos' ), __( 'Home and furniture', 'shopinbos' ), __( 'Something else', 'shopinbos' ), __( 'Not selling yet', 'shopinbos' ) ] ) ) . '</select></label>'
			. '<input type="hidden" name="resource" value="' . $resource . '">';
	} else { // contact
		$heading = $heading ?: __( 'Send us a message', 'shopinbos' );
		$body   .= $field( 'name', __( 'Your name', 'shopinbos' ), 'text', ' required autocomplete="name"' )
			. $field( 'email', __( 'Email', 'shopinbos' ), 'email', ' required autocomplete="email"' )
			. '<label class="field" for="' . $id . '-message">' . esc_html__( 'Message', 'shopinbos' ) . '<textarea class="input" id="' . $id . '-message" name="message" required maxlength="3000"></textarea></label>';
	}
	if ( 'contact' !== $kind ) {
		$checked = 'newsletter' === $kind ? ' required' : '';
		$body   .= '<label class="check"><input type="checkbox" name="consent" value="1"' . $checked . '><span>' . esc_html( SIB_CONSENT_TEXT ) . ' <a href="' . esc_url( home_url( '/legal/privacy/' ) ) . '">' . esc_html__( 'Privacy policy', 'shopinbos' ) . '</a></span></label>';
	}
	$labels = [ 'newsletter' => __( 'Subscribe', 'shopinbos' ), 'tool' => __( 'Email it to me', 'shopinbos' ), 'download' => __( 'Get the guide', 'shopinbos' ), 'contact' => __( 'Send', 'shopinbos' ) ];
	$notice = '';
	if ( $status && ( $_GET['sib_form'] ?? '' ) === $kind ) { // phpcs:ignore
		$notice = 'ok' === $status ? '<p class="notice notice-ok" role="status">' . esc_html( sib_lead_message( $kind ) ) . '</p>' : '<p class="notice notice-err" role="alert">' . esc_html__( 'That didn’t go through. Check the details and try again.', 'shopinbos' ) . '</p>';
	}
	$card = 'tool' === $kind ? '' : ' card';
	return '<form class="sib-lead col' . $card . '" id="' . esc_attr( $id ) . '" data-sib-lead method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="' . ( 'tool' === $kind ? 'gap:10px' : 'padding:24px' ) . '">'
		. ( $heading ? '<h2 class="disp h3" style="font-size:' . ( 'tool' === $kind ? '16px;font-family:inherit' : '24px' ) . '">' . esc_html( $heading ) . '</h2>' : '' )
		. $notice . $body
		. '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="' . esc_attr( $kind ) . '"><input type="hidden" name="back" value="' . esc_url( get_permalink() ?: home_url( add_query_arg( [] ) ) ) . '">'
		. '<label class="hp" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>'
		. '<button class="btn ' . ( 'tool' === $kind ? 'btn-ghost' : 'btn-acc' ) . ' btn-block" type="submit">' . esc_html( $labels[ $kind ] ) . '</button>'
		. '<div data-sib-lead-out aria-live="polite"></div></form>';
}

function sib_render_download_form( array $a ): string {
	$id = (int) ( $a['resource'] ?: get_the_ID() );
	if ( ! $id || 'sib_resource' !== get_post_type( $id ) ) {
		return '';
	}
	if ( ! get_post_meta( $id, 'sib_gated', true ) ) {
		$has = (string) get_post_meta( $id, 'sib_file_path', true );
		return $has ? '<div class="card col" style="padding:24px"><a class="btn btn-acc btn-block" href="' . esc_url( sib_download_url( $id ) ) . '" rel="nofollow">' . esc_html__( 'Download the PDF', 'shopinbos' ) . '</a></div>' : '';
	}
	return sib_render_lead_form( [ 'kind' => 'download', 'resource' => $id, 'heading' => __( 'Get the free guide', 'shopinbos' ) ] );
}

function sib_lead_message( string $kind ): string {
	return [
		'newsletter' => __( 'Check your email and tap the link to confirm. Then you’re in.', 'shopinbos' ),
		'tool'       => __( 'Sent. Check your inbox.', 'shopinbos' ),
		'download'   => __( 'Your guide is ready. We’ve also sent the link to your email.', 'shopinbos' ),
		'contact'    => __( 'Thanks. A person will reply within one working day.', 'shopinbos' ),
		'sunday'     => __( 'You’re in. Your first idea arrives on Sunday morning.', 'shopinbos' ),
	][ $kind ] ?? '';
}

/* Small enhancement: submit with fetch and show the answer in place. */
add_action( 'wp_footer', function () {
	?>
	<script>
	document.addEventListener('submit', function (e) {
		var f = e.target.closest && e.target.closest('form[data-sib-lead]');
		if (!f || !window.fetch) return;
		e.preventDefault();
		var out = f.querySelector('[data-sib-lead-out]'), btn = f.querySelector('button[type=submit]');
		btn.disabled = true;
		fetch(f.getAttribute('action'), { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' }, credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (j) {
				out.innerHTML = '';
				var p = document.createElement('p'); p.className = 'notice ' + (j.ok ? 'notice-ok' : 'notice-err'); p.textContent = j.message; out.appendChild(p);
				if (j.download) { var a = document.createElement('a'); a.className = 'btn btn-ink btn-block'; a.href = j.download; a.rel = 'nofollow'; a.textContent = 'Download the PDF'; out.appendChild(a); }
				if (j.ok) { Array.prototype.forEach.call(f.querySelectorAll('input:not([type=hidden]),select,textarea'), function (el) { if (el.type === 'checkbox') el.checked = false; else if (el.name !== 'website') el.value = ''; }); if (window.SIB && SIB.track) SIB.track('lead', { kind: f.querySelector('[name=kind]').value, path: location.pathname }); }
			})
			.catch(function () { out.innerHTML = '<p class="notice notice-err">Network problem. Try again.</p>'; })
			.finally(function () { btn.disabled = false; });
	});
	</script>
	<?php
}, 30 );

/* ---------- Form handling ---------- */

add_action( 'admin_post_nopriv_sib_lead', 'sib_handle_lead' );
add_action( 'admin_post_sib_lead', 'sib_handle_lead' );

function sib_handle_lead(): void {
	$json   = str_contains( (string) ( $_SERVER['HTTP_ACCEPT'] ?? '' ), 'application/json' );
	$kind   = sanitize_key( wp_unslash( $_POST['kind'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification -- public form, protected by honeypot + rate limit + origin check
	$back   = wp_validate_redirect( esc_url_raw( wp_unslash( $_POST['back'] ?? '' ) ), home_url( '/' ) ); // phpcs:ignore
	$result = sib_process_lead( $kind, wp_unslash( $_POST ) ); // phpcs:ignore
	if ( $json ) {
		wp_send_json( $result, $result['ok'] ? 200 : 400 );
	}
	wp_safe_redirect( add_query_arg( [ 'sib_lead' => $result['ok'] ? 'ok' : 'error', 'sib_form' => $kind ], $back ) . '#' );
	exit;
}

/**
 * Validate and act on a submitted lead form, then pass it to the app's admin (app-leads.php).
 * Returns ['ok' => bool, 'message' => string, 'download' => ?string].
 */
function sib_process_lead( string $kind, array $in ): array {
	$result = sib_process_lead_form( $kind, $in );
	if ( $result['ok'] && empty( $in['website'] ) && function_exists( 'sib_app_lead_from_form' ) ) {
		sib_app_lead_from_form( $kind, $in );
	}
	return $result;
}

function sib_process_lead_form( string $kind, array $in ): array {
	$fail = fn( $m ) => [ 'ok' => false, 'message' => $m ];
	if ( ! in_array( $kind, [ 'newsletter', 'contact', 'tool', 'download', 'sunday' ], true ) ) {
		return $fail( __( 'Unknown form.', 'shopinbos' ) );
	}
	if ( ! empty( $in['website'] ) ) { // honeypot: pretend it worked
		return [ 'ok' => true, 'message' => sib_lead_message( $kind ) ];
	}
	$origin = (string) ( $_SERVER['HTTP_ORIGIN'] ?? '' );
	if ( $origin && wp_parse_url( $origin, PHP_URL_HOST ) !== wp_parse_url( home_url(), PHP_URL_HOST ) ) {
		return $fail( __( 'Please use the form on shopinbos.com.', 'shopinbos' ) );
	}
	if ( ! sib_rate_limit( 'lead', 6, 10 * MINUTE_IN_SECONDS ) ) {
		return $fail( __( 'Too many tries. Wait a few minutes and try again.', 'shopinbos' ) );
	}
	$email   = sanitize_email( (string) ( $in['email'] ?? '' ) );
	$phone   = preg_replace( '/[^0-9+]/', '', (string) ( $in['phone'] ?? '' ) );
	$name    = sanitize_text_field( mb_substr( (string) ( $in['name'] ?? '' ), 0, 80 ) );
	$consent = ! empty( $in['consent'] );
	if ( $email && ! is_email( $email ) ) {
		return $fail( __( 'That email doesn’t look right.', 'shopinbos' ) );
	}

	switch ( $kind ) {
		case 'newsletter':
			if ( ! $email || ! $consent ) {
				return $fail( __( 'Add your email and tick the box to agree.', 'shopinbos' ) );
			}
			sib_log_consent( $email, 'newsletter', 'newsletter' );
			sib_send_confirm( $email, $name, 'newsletter' );
			return [ 'ok' => true, 'message' => sib_lead_message( 'newsletter' ) ];

		case 'sunday':
			$contact = trim( (string) ( $in['contact'] ?? '' ) );
			if ( is_email( $contact ) ) {
				sib_log_consent( $contact, 'sunday', 'newsletter_sunday', SIB_SUNDAY_CONSENT );
				sib_send_confirm( sanitize_email( $contact ), '', 'newsletter_sunday' );
				return [ 'ok' => true, 'message' => __( 'Check your email and tap the link to confirm. Then you’re in.', 'shopinbos' ) ];
			}
			$digits = preg_replace( '/\D/', '', $contact );
			$digits = preg_replace( '/^(234|0)/', '', $digits );
			if ( strlen( $digits ) < 10 || strlen( $digits ) > 11 ) {
				return $fail( __( 'Type a WhatsApp number like 0803 412 7790, or an email.', 'shopinbos' ) );
			}
			$phone = '+234' . substr( $digits, -10 );
			sib_log_consent( $phone, 'sunday', 'newsletter_sunday', SIB_SUNDAY_CONSENT );
			do_action( 'sib_lead_whatsapp', $phone, 'newsletter_sunday' );
			return [ 'ok' => true, 'message' => sib_lead_message( 'sunday' ) ];

		case 'tool':
			if ( ! $email ) {
				return $fail( __( 'Add your email.', 'shopinbos' ) );
			}
			$tool    = sanitize_key( (string) ( $in['tool'] ?? '' ) );
			$summary = sanitize_text_field( mb_substr( (string) ( $in['result'] ?? '' ), 0, 300 ) );
			$label   = sib_tools_list()[ $tool ] ?? __( 'Your result', 'shopinbos' );
			sib_send_email( $email, $label, sib_email_html( $label, '<p>' . esc_html( $summary ?: __( 'Open the tool again to see your numbers.', 'shopinbos' ) ) . '</p><p>' . esc_html__( 'Want Shopinbos to do this maths on every order? Your store works it out for you.', 'shopinbos' ) . '</p>', __( 'Start your shop', 'shopinbos' ), sib_absolute( sib_go_url( 'tool_result', [ 'tool' => $tool ] ) ) ) );
			if ( $consent ) {
				sib_log_consent( $email, 'tool', $tool );
				sib_send_confirm( $email, '', 'tool-' . $tool );
			}
			return [ 'ok' => true, 'message' => sib_lead_message( 'tool' ) ];

		case 'download':
			$rid = absint( $in['resource'] ?? 0 );
			if ( 'sib_resource' !== get_post_type( $rid ) || 'publish' !== get_post_status( $rid ) ) {
				return $fail( __( 'That guide isn’t available.', 'shopinbos' ) );
			}
			if ( ! $name || ( ! $email && strlen( $phone ) < 10 ) ) {
				return $fail( __( 'Add your name and an email or WhatsApp number.', 'shopinbos' ) );
			}
			$url   = get_post_meta( $rid, 'sib_file_path', true ) ? sib_download_url( $rid ) : '';
			$title = get_the_title( $rid );
			if ( $email ) {
				sib_send_email( $email, $title, sib_email_html( $title, '<p>' . esc_html( sprintf( __( 'Hi %s, here’s your guide. The link works for 7 days.', 'shopinbos' ), $name ) ) . '</p>', __( 'Download the PDF', 'shopinbos' ), $url ?: get_permalink( $rid ) ) );
			}
			if ( $consent ) {
				$tag = (string) get_post_meta( $rid, 'sib_list_tag', true ) ?: get_post_field( 'post_name', $rid );
				sib_log_consent( $email ?: $phone, 'download', $tag );
				if ( $email ) {
					sib_send_confirm( $email, $name, $tag );
				}
			}
			do_action( 'sib_lead_download', [ 'resource' => $rid, 'name' => $name, 'email' => $email, 'phone' => $phone, 'sells' => sanitize_text_field( (string) ( $in['sells'] ?? '' ) ), 'consent' => $consent ] );
			return [ 'ok' => true, 'message' => $url ? sib_lead_message( 'download' ) : __( 'Thanks! The guide is almost ready; we’ll email it to you.', 'shopinbos' ), 'download' => $url ?: null ];

		case 'contact':
			$message = sanitize_textarea_field( mb_substr( (string) ( $in['message'] ?? '' ), 0, 3000 ) );
			if ( ! $name || ! $email || ! $message ) {
				return $fail( __( 'Add your name, email and message.', 'shopinbos' ) );
			}
			$to = (string) apply_filters( 'sib_contact_to', get_option( 'admin_email' ) );
			sib_send_email( $to, 'Website message from ' . $name, sib_email_html( 'New message', '<p><b>' . esc_html( $name ) . '</b> (' . esc_html( $email ) . ')</p><p>' . nl2br( esc_html( $message ) ) . '</p>' ) );
			return [ 'ok' => true, 'message' => sib_lead_message( 'contact' ) ];
	}
	return $fail( '' );
}

function sib_log_consent( string $contact, string $kind, string $source, string $text = SIB_CONSENT_TEXT ): void {
	global $wpdb;
	$wpdb->insert( sib_consent_table(), [
		'contact'      => mb_substr( $contact, 0, 190 ),
		'kind'         => $kind,
		'source'       => mb_substr( $source, 0, 190 ),
		'consent_text' => $text,
		'ip'           => sib_client_ip(),
		'created_at'   => current_time( 'mysql', true ),
	] );
}

function sib_send_confirm( string $email, string $name, string $tag ): void {
	$url = home_url( '/confirm/' . sib_token( [ 'e' => $email, 'n' => $name, 't' => $tag ], 3 * DAY_IN_SECONDS ) . '/' );
	sib_send_email( $email, __( 'Confirm your email for Shopinbos', 'shopinbos' ), sib_email_html( __( 'One tap to confirm', 'shopinbos' ), '<p>' . esc_html__( 'Tap the button to start getting selling tips from Shopinbos. If you didn’t ask for this, ignore this email.', 'shopinbos' ) . '</p>', __( 'Yes, sign me up', 'shopinbos' ), $url ) );
}
