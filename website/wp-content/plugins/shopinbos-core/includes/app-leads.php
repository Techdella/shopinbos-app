<?php
/**
 * Website leads in the app: every form filled on the site (newsletter, WhatsApp tips, guide downloads, tool
 * results, contact) is sent to the app, where admins see it at /admin/leads.
 *
 * Leads are queued first, then sent after the page has been returned to the visitor, and the queue is retried
 * every hour, so nothing is lost while the app is down. Requests are signed with SIB_LEADS_SECRET (define it in
 * wp-config.php; the app holds the same value as WEBSITE_LEADS_SECRET).
 */

defined( 'ABSPATH' ) || exit;

const SIB_APP_LEADS_QUEUE = 'sib_app_leads_queue';
const SIB_APP_LEADS_MAX   = 500;

function sib_app_leads_secret(): string {
	return (string) ( sib_setting( 'leads_secret' ) ?: getenv( 'SIB_LEADS_SECRET' ) );
}

/** One line for Settings > Shopinbos website. */
function sib_app_leads_status_text(): string {
	$queue = count( (array) get_option( SIB_APP_LEADS_QUEUE, [] ) );
	if ( ! sib_app_leads_secret() ) {
		return sprintf( __( 'not connected: add the website leads secret below. %d waiting.', 'shopinbos' ), $queue );
	}
	$last = (array) get_option( 'sib_app_leads_status', [] );
	if ( ! empty( $last['error'] ) ) {
		return sprintf( __( '%1$d waiting. Last try %2$s failed: %3$s', 'shopinbos' ), $queue, human_time_diff( (int) $last['at'] ) . ' ago', $last['error'] );
	}
	return $queue ? sprintf( __( 'connected, %d waiting to send.', 'shopinbos' ), $queue ) : __( 'connected, nothing waiting.', 'shopinbos' );
}

function sib_app_leads_endpoint(): string {
	$base = untrailingslashit( (string) sib_setting( 'api_base' ) ) ?: 'https://app.shopinbos.com/api/public';
	return (string) apply_filters( 'sib_app_leads_endpoint', $base . '/website-leads' );
}

/** Turn a submitted form into a lead for the app. */
function sib_app_lead_from_form( string $kind, array $in ): void {
	$str     = fn( $k, $max = 300 ) => mb_substr( sanitize_text_field( (string) ( $in[ $k ] ?? '' ) ), 0, $max );
	$email   = sanitize_email( (string) ( $in['email'] ?? '' ) );
	$phone   = preg_replace( '/[^0-9+]/', '', (string) ( $in['phone'] ?? '' ) );
	if ( $phone && function_exists( 'sib_lead_phone' ) ) {
		$phone = sib_lead_phone( $phone ) ?: $phone;
	}
	if ( ! $email && ! $phone && ! empty( $in['contact'] ) ) {
		$contact = trim( (string) $in['contact'] );
		is_email( $contact ) ? $email = sanitize_email( $contact ) : $phone = preg_replace( '/[^0-9+]/', '', $contact );
	}
	$payload = [];
	$source  = $kind;
	if ( 'sunday' === $kind || 'trending' === $kind ) {
		$contact = trim( (string) ( $in['contact'] ?? '' ) );
		if ( is_email( $contact ) ) {
			$email = sanitize_email( $contact );
		} else {
			$phone = preg_replace( '/[^0-9+]/', '', $contact );
		}
		$source = 'trending' === $kind ? 'Trending products every Monday' : 'WhatsApp tips sign-up';
	} elseif ( 'tool' === $kind ) {
		$tool              = sanitize_key( (string) ( $in['tool'] ?? '' ) );
		$source            = function_exists( 'sib_tools_list' ) ? ( sib_tools_list()[ $tool ] ?? $tool ) : $tool;
		$payload['result'] = $str( 'result' );
	} elseif ( 'download' === $kind ) {
		$source           = get_the_title( absint( $in['resource'] ?? 0 ) );
		$payload['sells'] = $str( 'sells', 120 );
	} elseif ( 'newsletter' === $kind ) {
		$source = 'Newsletter';
	} elseif ( 'contact' === $kind ) {
		$source             = 'Contact form';
		$payload['topic']   = $str( 'topic', 80 );
	} elseif ( 'waitlist' === $kind ) {
		$source             = 'Waitlist (coming soon)';
		$payload['as']      = $str( 'as', 40 );
		$payload['sells']   = $str( 'sells', 120 );
		$payload['intent']  = $str( 'intent', 60 );
	} elseif ( 'investor' === $kind ) {
		$source         = 'Investor relations';
		$payload['org'] = $str( 'org', 160 );
	} elseif ( 'app_notify' === $kind ) {
		$source              = 'App launch alert';
		$payload['platform'] = $str( 'platform', 20 );
	}
	sib_app_lead( [
		'kind'    => $kind,
		'name'    => $str( 'name', 120 ),
		'email'   => $email,
		'phone'   => $phone,
		'message' => mb_substr( sanitize_textarea_field( (string) ( $in['message'] ?? '' ) ), 0, 5000 ),
		'source'  => mb_substr( (string) $source, 0, 190 ),
		'pageUrl' => esc_url_raw( (string) ( $in['back'] ?? wp_get_referer() ) ),
		'consent' => ! empty( $in['consent'] ) || in_array( $kind, [ 'sunday', 'trending', 'waitlist', 'app_notify' ], true ),
		'payload' => array_filter( $payload, fn( $v ) => '' !== $v ),
	] );
}

/** Queue a lead for the app and send the queue once the visitor has their page. */
function sib_app_lead( array $lead ): void {
	$lead += [ 'name' => '', 'email' => '', 'phone' => '', 'message' => '', 'source' => '', 'pageUrl' => '', 'consent' => false, 'payload' => [] ];
	$lead['id']        = 'wp-' . wp_generate_uuid4();
	$lead['createdAt'] = gmdate( 'Y-m-d\TH:i:s\Z' );
	$lead['payload']   = (object) $lead['payload'];
	$queue             = (array) get_option( SIB_APP_LEADS_QUEUE, [] );
	$queue[]           = $lead;
	update_option( SIB_APP_LEADS_QUEUE, array_slice( $queue, -SIB_APP_LEADS_MAX ), false );
	static $hooked = false;
	if ( ! $hooked ) {
		$hooked = true;
		add_action( 'shutdown', function () {
			if ( function_exists( 'fastcgi_finish_request' ) ) {
				fastcgi_finish_request();
			}
			sib_app_leads_flush( 10 );
		} );
	}
}

/** Send queued leads. Keeps the ones the app didn't accept (down, not set up) for the next try. */
function sib_app_leads_flush( int $max = 100 ): array {
	$secret = sib_app_leads_secret();
	$queue  = array_values( (array) get_option( SIB_APP_LEADS_QUEUE, [] ) );
	if ( ! $queue || ! $secret ) {
		return [ 'sent' => 0, 'left' => count( $queue ) ];
	}
	$sent = [];
	$fail = '';
	foreach ( array_slice( $queue, 0, $max ) as $lead ) {
		$body = wp_json_encode( $lead );
		$ts   = (string) time();
		$res  = wp_remote_post( sib_app_leads_endpoint(), [
			'timeout' => 6,
			'headers' => [
				'Content-Type'          => 'application/json',
				'X-Shopinbos-Timestamp' => $ts,
				'X-Shopinbos-Signature' => hash_hmac( 'sha256', $ts . '.' . $body, $secret ),
			],
			'body'    => $body,
		] );
		$code = is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
		if ( $code >= 200 && $code < 300 || 422 === $code ) {
			$sent[] = $lead['id']; // 422: the app will never take this one; don't retry it forever
			continue;
		}
		$fail = is_wp_error( $res ) ? $res->get_error_message() : 'HTTP ' . $code . ' ' . mb_substr( (string) wp_remote_retrieve_body( $res ), 0, 200 );
		break; // app down or not set up: stop and keep the rest
	}
	// Re-read in case another request queued a lead meanwhile.
	$now  = array_values( (array) get_option( SIB_APP_LEADS_QUEUE, [] ) );
	$left = array_values( array_filter( $now, fn( $l ) => ! in_array( $l['id'] ?? '', $sent, true ) ) );
	update_option( SIB_APP_LEADS_QUEUE, $left, false );
	update_option( 'sib_app_leads_status', [ 'at' => time(), 'sent' => count( $sent ), 'left' => count( $left ), 'error' => $fail ], false );
	return [ 'sent' => count( $sent ), 'left' => count( $left ), 'error' => $fail ];
}

add_action( 'init', function () {
	if ( ! wp_next_scheduled( 'sib_app_leads_retry' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', 'sib_app_leads_retry' );
	}
} );
add_action( 'sib_app_leads_retry', fn() => sib_app_leads_flush( 200 ) );
